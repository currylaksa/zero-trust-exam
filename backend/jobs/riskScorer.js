const cron = require('node-cron');
const axios = require('axios');
const db = require('../config/db');

// Localhost-only Python scorer (control #26). Bound to 127.0.0.1:8001 by
// the Flask service; UFW deny on 8001 at the OS layer; in-app guard rejects
// any non-loopback request. URL is overridable via env strictly for local
// integration testing.
const SCORER_URL = process.env.RISK_SCORER_URL || 'http://127.0.0.1:8001';
const SCORER = axios.create({
  baseURL: SCORER_URL,
  timeout: 2000,
});

// Module-scoped lock prevents overlapping runs at the 30s cadence. One Node
// process / one event loop, so a plain boolean is sufficient — no Redis
// lock needed. Deliberate enhancement over jobs/sessionSweeper.js, which
// can tolerate overlap at its 5-minute cadence.
let inFlight = false;

// Extract the five behavioural features for one session from the existing
// audit tables. tab_switches uses ActivityLog COUNT (append-only, race-safe)
// rather than ExamSession.tab_switch_count — the in-place increment in
// sessionController has a documented race condition.
async function extractFeatures(sessionId) {
  // Query B — grouped activity counts (covers tab_switches, mfa_reprompts,
  // heartbeat_count, session_resumes from a single ActivityLog scan).
  const [counts] = await db.execute(
    `SELECT activity_type, COUNT(*) AS c
       FROM ActivityLog
      WHERE session_id = ?
        AND activity_type IN ('TAB_SWITCH','HEARTBEAT','RESUME_INITIATED','RESUME_VERIFIED')
      GROUP BY activity_type`,
    [sessionId]
  );
  const byType = {};
  for (const row of counts) {
    byType[row.activity_type] = Number(row.c);
  }

  // Query C — sum of duration_away_seconds for this session's TAB_SWITCH-
  // linked flagged activities. Mirrors monitoringController.js:34-40.
  const [durRows] = await db.execute(
    `SELECT COALESCE(SUM(fa.duration_away_seconds), 0) AS total_away_seconds
       FROM FlaggedActivity fa
       JOIN ActivityLog al ON fa.log_id = al.log_id
      WHERE fa.session_id = ?
        AND al.activity_type = 'TAB_SWITCH'`,
    [sessionId]
  );

  return {
    session_id: sessionId,
    tab_switches: byType.TAB_SWITCH || 0,
    total_tab_duration_sec: Number(durRows[0]?.total_away_seconds || 0),
    mfa_reprompts: (byType.RESUME_INITIATED || 0) + (byType.RESUME_VERIFIED || 0),
    heartbeat_count: byType.HEARTBEAT || 0,
    session_resumes: byType.RESUME_VERIFIED || 0,
  };
}

async function scoreOne(session) {
  const features = await extractFeatures(session.session_id);
  const { data } = await SCORER.post('/score', features);

  await db.execute(
    `INSERT INTO SessionRiskScore
       (session_id, risk_score, risk_level, contributing_factors, features_snapshot)
     VALUES (?, ?, ?, ?, ?)`,
    [
      session.session_id,
      data.risk_score,
      data.risk_level,
      JSON.stringify(data.contributing_factors || []),
      JSON.stringify(features),
    ]
  );
}

function startRiskScorer() {
  const runScore = async () => {
    if (inFlight) {
      console.warn('[riskScorer] previous run still in flight; skipping this tick');
      return;
    }
    inFlight = true;
    try {
      const [sessions] = await db.execute(
        `SELECT session_id, exam_id, user_id, status, start_time, last_heartbeat
           FROM ExamSession
          WHERE status IN ('in_progress', 'flagged')`
      );

      let scored = 0;
      let skipped = 0;

      for (const session of sessions) {
        try {
          await scoreOne(session);
          scored += 1;
        } catch (err) {
          // Per-session catch: Python service down, timeout, 5xx, malformed
          // response, DB write failure — all caught, all warned, all skipped.
          // Do not throw. Do not retry within the same cycle. The next 30s
          // tick will try again.
          const reason = err.code
            || (err.response && err.response.status ? `http ${err.response.status}` : err.message);
          console.warn(`[riskScorer] session ${session.session_id} skipped: ${reason}`);
          skipped += 1;
        }
      }

      const timestamp = new Date().toISOString();
      console.log(
        `[${timestamp}] Risk scorer: scored ${scored}, skipped ${skipped} of ${sessions.length} active session(s)`
      );
    } catch (err) {
      console.error('Error in Risk Scorer cron job:', err);
    } finally {
      inFlight = false;
    }
  };

  // Run immediately on start so the first scoring tick happens before the
  // first 30s window elapses (matches sessionSweeper boot pattern).
  runScore();

  // 6-field cron expression: every 30 seconds. node-cron 4.2.1 treats the
  // first field as seconds (verified in Stage 0 against
  // node_modules/node-cron/dist/cjs/time/time-matcher.js).
  cron.schedule('*/30 * * * * *', runScore);
}

module.exports = startRiskScorer;
