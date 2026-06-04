/* ============================================================================
 * demo_seed.js — Repeatable demo-data seeder for the invigilator dashboard
 * ============================================================================
 * Populates the monitoring dashboard with a realistic SPREAD of demo exam
 * sessions (2 low / 2 medium / 1 high) so it looks active for booth demos and
 * screenshots. All accounts and exam names are obviously demo-flavoured.
 *
 * AUTHENTIC SCORING — NO HARDCODED SCORES
 *   Only the upstream behavioural signals (ActivityLog + FlaggedActivity) are
 *   seeded. The script then calls the SAME real scoring path the cron uses:
 *   it extracts the five features with the same SQL as jobs/riskScorer.js and
 *   POSTs them to the live Python scorer (127.0.0.1:8001), writing genuine
 *   SessionRiskScore rows. Signals are added in ~3 incremental "ticks" per
 *   session and scored after each, so each session also gets a real, climbing
 *   risk-history sparkline (low→medium→high for the red one).
 *
 *   If the scorer is unreachable the data is still seeded and the running
 *   riskScorer cron will score the sessions on its next 30s tick.
 *
 * EVERYTHING IS MARKER-TAGGED AND FULLY REVERSIBLE
 *   Demo users live on the email domain @demoseed.local; the exam, activity
 *   logs and flags carry the DEMOSEED marker. Teardown deletes ONLY rows that
 *   match those markers, in FK-safe order. It never touches real data.
 *
 *   NOTE: ActivityLog.session_id is ON DELETE SET NULL (not CASCADE), so
 *   deleting the session does NOT remove its ActivityLog rows. Teardown
 *   therefore deletes ActivityLog explicitly.
 *
 * ----------------------------------------------------------------------------
 * USAGE
 * ----------------------------------------------------------------------------
 *   cd backend/risk-scoring
 *
 *   # Seed (idempotent — clears any previous demo data first, then re-seeds):
 *   node demo_seed.js seed
 *
 *   # Remove all demo data and nothing else:
 *   node demo_seed.js teardown
 *
 *   # Both commands print the target DB and ask for confirmation. To skip the
 *   # prompt (e.g. in a script), pass --yes:
 *   node demo_seed.js seed --yes
 *
 * Reads DB credentials from backend/.env via ../config/db. The Python scorer
 * URL is overridable with RISK_SCORER_URL (defaults to http://127.0.0.1:8001).
 * ==========================================================================*/

'use strict';

const path = require('path');
// Load backend/.env explicitly so the script works from any CWD (config/db.js
// otherwise reads .env from process.cwd()). Must run before requiring db.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const readline = require('readline');
const axios = require('axios');
const db = require('../config/db');

// ---------------------------------------------------------------------------
// Markers — the ONLY thing teardown keys off. Keep these stable.
// ---------------------------------------------------------------------------
const EMAIL_DOMAIN = 'demoseed.local';        // every demo user's email host
const MARKER = 'DEMOSEED';                     // tag in exam/log/flag text
const EXAM_TITLE = 'Sample Midterm (DEMO)';

const SCORER_URL = process.env.RISK_SCORER_URL || 'http://127.0.0.1:8001';
const SCORER = axios.create({ baseURL: SCORER_URL, timeout: 2000 });

// ---------------------------------------------------------------------------
// Session profiles. Each profile is a list of "ticks"; a tick is a batch of
// behavioural signals added ~30s apart. Features are cumulative, so the score
// is re-derived after every tick to build a real sparkline.
//
//   tabs    : # TAB_SWITCH events this tick
//   away    : duration_away_seconds recorded on each of those tab switches
//   init    : # RESUME_INITIATED (step-up MFA reprompt) events this tick
//   verify  : # RESUME_VERIFIED  (verified resume) events this tick
//   hb      : # HEARTBEAT events this tick
//
// End-state feature totals drive the band (service.py: <40 low, 40-70 medium,
// >70 high). The medium/high numbers reuse the calibration already validated
// in demo_seed.sql.
// ---------------------------------------------------------------------------
const PROFILES = [
  {
    name: 'Demo Student A', band: 'low',
    // Clean session: heartbeats only, no anomalies. Stays solidly green.
    ticks: [
      { tabs: 0, away: 0, init: 0, verify: 0, hb: 3 },
      { tabs: 0, away: 0, init: 0, verify: 0, hb: 3 },
      { tabs: 0, away: 0, init: 0, verify: 0, hb: 2 },
    ],
  },
  {
    name: 'Demo Student B', band: 'low',
    // One brief glance away — flagged but well within normal. Still green.
    ticks: [
      { tabs: 0, away: 0,  init: 0, verify: 0, hb: 3 },
      { tabs: 1, away: 6,  init: 0, verify: 0, hb: 3 },
      { tabs: 0, away: 0,  init: 0, verify: 0, hb: 2 },
    ],
  },
  {
    name: 'Demo Student C', band: 'medium',
    // 4 tab switches ≈ 52s away + 1 step-up reprompt → amber. Climbs green→amber.
    ticks: [
      { tabs: 1, away: 12, init: 0, verify: 0, hb: 3 },
      { tabs: 2, away: 13, init: 0, verify: 0, hb: 2 },
      { tabs: 1, away: 14, init: 1, verify: 0, hb: 1 },
    ],
  },
  {
    name: 'Demo Student D', band: 'medium',
    // 5 tab switches = 60s away + 1 step-up reprompt → amber.
    ticks: [
      { tabs: 2, away: 12, init: 0, verify: 0, hb: 2 },
      { tabs: 2, away: 12, init: 1, verify: 0, hb: 2 },
      { tabs: 1, away: 12, init: 0, verify: 0, hb: 1 },
    ],
  },
  {
    name: 'Demo Student E', band: 'high', flagged: true,
    // 12 tab switches ≈ 336s away, 3 MFA reprompts, 1 verified resume, sparse
    // heartbeats → red. Climbs green→amber→red across the three ticks.
    ticks: [
      { tabs: 3, away: 28, init: 0, verify: 0, hb: 1 },
      { tabs: 4, away: 28, init: 1, verify: 0, hb: 1 },
      { tabs: 5, away: 28, init: 1, verify: 1, hb: 1 },
    ],
  },
];

const TICK_GAP_SEC = 30;          // spacing between scoring ticks
const DISABLED_PW = 'DEMOSEED-disabled-no-login';  // not a valid bcrypt hash

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
// MySQL DATETIME in the connection's local time (matches NOW()).
function fmt(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
       + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Same two queries as jobs/riskScorer.js:extractFeatures — the real feature set.
async function extractFeatures(sessionId) {
  const [counts] = await db.execute(
    `SELECT activity_type, COUNT(*) AS c
       FROM ActivityLog
      WHERE session_id = ?
        AND activity_type IN ('TAB_SWITCH','HEARTBEAT','RESUME_INITIATED','RESUME_VERIFIED')
      GROUP BY activity_type`,
    [sessionId]
  );
  const byType = {};
  for (const row of counts) byType[row.activity_type] = Number(row.c);

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

// POST to the live scorer and write one SessionRiskScore row (same as
// riskScorer.scoreOne, plus an explicit scored_at so the sparkline is spaced).
async function scoreSession(sessionId, scoredAt) {
  const features = await extractFeatures(sessionId);
  const { data } = await SCORER.post('/score', features);
  await db.execute(
    `INSERT INTO SessionRiskScore
       (session_id, risk_score, risk_level, contributing_factors, features_snapshot, scored_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      data.risk_score,
      data.risk_level,
      JSON.stringify(data.contributing_factors || []),
      JSON.stringify(features),
      fmt(scoredAt),
    ]
  );
  return data;
}

async function insertActivity(sessionId, userId, type, description, when) {
  const [res] = await db.execute(
    `INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, userId, type, description, fmt(when)]
  );
  return res.insertId;
}

// ---------------------------------------------------------------------------
// Teardown — marker-scoped, FK-safe. Deletes ONLY demo rows.
// ---------------------------------------------------------------------------
async function resolveDemoIds() {
  const [users] = await db.execute(
    `SELECT user_id FROM User WHERE email LIKE ?`,
    [`%@${EMAIL_DOMAIN}`]
  );
  const userIds = users.map((u) => u.user_id);

  const [exams] = await db.execute(
    `SELECT exam_id FROM Exam WHERE title = ? OR description LIKE ?`,
    [EXAM_TITLE, `%${MARKER}%`]
  );
  const examIds = exams.map((e) => e.exam_id);

  let sessionIds = [];
  if (userIds.length || examIds.length) {
    const clauses = [];
    const params = [];
    if (userIds.length) { clauses.push(`user_id IN (${userIds.map(() => '?').join(',')})`); params.push(...userIds); }
    if (examIds.length) { clauses.push(`exam_id IN (${examIds.map(() => '?').join(',')})`); params.push(...examIds); }
    const [sessions] = await db.execute(
      `SELECT session_id FROM ExamSession WHERE ${clauses.join(' OR ')}`,
      params
    );
    sessionIds = sessions.map((s) => s.session_id);
  }

  return { userIds, examIds, sessionIds };
}

async function teardown() {
  const { userIds, examIds, sessionIds } = await resolveDemoIds();

  if (sessionIds.length) {
    const inSess = sessionIds.map(() => '?').join(',');
    // Order matters: child rows first. FlaggedActivity/SessionRiskScore cascade
    // on session delete, but ActivityLog is SET NULL — so delete it explicitly.
    await db.execute(`DELETE FROM FlaggedActivity  WHERE session_id IN (${inSess})`, sessionIds);
    await db.execute(`DELETE FROM SessionRiskScore WHERE session_id IN (${inSess})`, sessionIds);
    await db.execute(`DELETE FROM ActivityLog      WHERE session_id IN (${inSess})`, sessionIds);
    await db.execute(`DELETE FROM ExamSession      WHERE session_id IN (${inSess})`, sessionIds);
  }

  // Sweep any ActivityLog orphaned by a previous run (session_id went NULL).
  await db.execute(`DELETE FROM ActivityLog WHERE session_id IS NULL AND description LIKE ?`, [`${MARKER}%`]);

  if (examIds.length) {
    const inExam = examIds.map(() => '?').join(',');
    await db.execute(`DELETE FROM Exam WHERE exam_id IN (${inExam})`, examIds);
  }
  if (userIds.length) {
    const inUser = userIds.map(() => '?').join(',');
    // Student rows (if any) cascade on user delete.
    await db.execute(`DELETE FROM User WHERE user_id IN (${inUser})`, userIds);
  }

  return {
    users: userIds.length,
    exams: examIds.length,
    sessions: sessionIds.length,
  };
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
async function seed() {
  // Idempotent: start from a clean slate (only ever touches demo markers).
  const removed = await teardown();
  console.log(`[seed] cleared previous demo data (${removed.sessions} sessions, ${removed.users} users)`);

  // 1. Demo lecturer owns the exam — fully self-contained and removable.
  const [lec] = await db.execute(
    `INSERT INTO User (username, password, email, role) VALUES (?, ?, ?, 'lecturer')`,
    ['Demo Lecturer', DISABLED_PW, `demo-lecturer@${EMAIL_DOMAIN}`]
  );
  const lecturerId = lec.insertId;

  // 2. Demo exam.
  const [exam] = await db.execute(
    `INSERT INTO Exam (title, description, duration, created_by, status)
     VALUES (?, ?, ?, ?, 'published')`,
    [EXAM_TITLE, `${MARKER} demo exam — safe to delete`, 90, lecturerId]
  );
  const examId = exam.insertId;

  const now = new Date();
  const summary = [];

  // 3. One demo student + session per profile.
  for (const profile of PROFILES) {
    const [stu] = await db.execute(
      `INSERT INTO User (username, password, email, role) VALUES (?, ?, ?, 'student')`,
      [profile.name, DISABLED_PW, `demo-${slug(profile.name)}@${EMAIL_DOMAIN}`]
    );
    const studentId = stu.insertId;

    const nTicks = profile.ticks.length;
    const startTime = new Date(now.getTime() - (nTicks * TICK_GAP_SEC + 120) * 1000);

    const [sess] = await db.execute(
      `INSERT INTO ExamSession
         (exam_id, user_id, start_time, status, ip_address, device_info,
          tab_switch_count, fullscreen_exit_count, last_heartbeat)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [
        examId, studentId, fmt(startTime),
        profile.flagged ? 'flagged' : 'in_progress',
        '203.0.113.' + (10 + summary.length),          // TEST-NET-3, obviously fake
        'Demo Chrome 124 / Windows 11',
        fmt(now),
      ]
    );
    const sessionId = sess.insertId;

    // Apply ticks, scoring after each so the sparkline climbs authentically.
    let totalTabs = 0;
    let lastScore = null;
    for (let i = 0; i < nTicks; i++) {
      const tick = profile.ticks[i];
      const tickTime = new Date(now.getTime() - (nTicks - 1 - i) * TICK_GAP_SEC * 1000);

      for (let h = 0; h < tick.hb; h++) {
        await insertActivity(sessionId, studentId, 'HEARTBEAT',
          `${MARKER} heartbeat`, new Date(tickTime.getTime() + h * 1000));
      }
      for (let t = 0; t < tick.tabs; t++) {
        const when = new Date(tickTime.getTime() + (5 + t) * 1000);
        const logId = await insertActivity(sessionId, studentId, 'TAB_SWITCH', `${MARKER} tab switch`, when);
        await db.execute(
          `INSERT INTO FlaggedActivity (log_id, session_id, flag_reason, severity, duration_away_seconds)
           VALUES (?, ?, ?, ?, ?)`,
          [logId, sessionId, `${MARKER} time off tab`, profile.band === 'high' ? 'high' : 'low', tick.away]
        );
        totalTabs++;
      }
      for (let m = 0; m < tick.init; m++) {
        await insertActivity(sessionId, studentId, 'RESUME_INITIATED', `${MARKER} step-up reprompt`,
          new Date(tickTime.getTime() + 20000));
      }
      for (let v = 0; v < tick.verify; v++) {
        await insertActivity(sessionId, studentId, 'RESUME_VERIFIED', `${MARKER} verified resume`,
          new Date(tickTime.getTime() + 22000));
      }

      try {
        lastScore = await scoreSession(sessionId, tickTime);
      } catch (err) {
        const reason = err.code || (err.response && `http ${err.response.status}`) || err.message;
        console.warn(`[seed] scorer unreachable for ${profile.name} (${reason}); cron will score it`);
        lastScore = null;
        break;
      }
    }

    // Keep the displayed tab_switch_count consistent with the seeded logs.
    await db.execute(`UPDATE ExamSession SET tab_switch_count = ? WHERE session_id = ?`,
      [totalTabs, sessionId]);

    summary.push({
      student: profile.name,
      expected: profile.band,
      scored: lastScore ? `${lastScore.risk_score} (${lastScore.risk_level})` : 'pending cron',
    });
  }

  console.log(`\n[seed] done — exam "${EXAM_TITLE}" (#${examId}) with ${PROFILES.length} sessions:`);
  console.table(summary);
  console.log('Open the invigilator dashboard as an admin to see the spread.');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  const cmd = process.argv[2];
  const skip = process.argv.includes('--yes');

  if (cmd !== 'seed' && cmd !== 'teardown') {
    console.error('Usage: node demo_seed.js <seed|teardown> [--yes]');
    process.exit(1);
  }

  const host = process.env.DB_HOST || '(unknown)';
  const name = process.env.DB_NAME || '(unknown)';
  console.log(`Target database: ${name} @ ${host}`);
  console.log(`Command: ${cmd}  (affects only @${EMAIL_DOMAIN} / ${MARKER}-tagged demo data)`);

  if (!skip) {
    const a = await confirm(`Type ${MARKER} to continue: `);
    if (a.trim() !== MARKER) {
      console.log('Aborted.');
      await db.end();
      return;
    }
  }

  if (cmd === 'seed') {
    await seed();
  } else {
    const removed = await teardown();
    console.log(`[teardown] removed ${removed.sessions} demo sessions, ${removed.exams} exam(s), ${removed.users} user(s).`);
  }

  await db.end();
}

main().catch(async (err) => {
  console.error('Error:', err.message);
  try { await db.end(); } catch { /* ignore */ }
  process.exit(1);
});
