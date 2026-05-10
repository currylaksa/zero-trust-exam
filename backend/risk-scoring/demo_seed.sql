-- ============================================================================
-- demo_seed.sql — Behavioural risk-scoring demo & recording script (Control #26)
-- ============================================================================
-- !!  CRITICAL DISCLAIMER — DEMO USE ONLY  !!
-- ============================================================================
--
-- This script writes synthetic ActivityLog + FlaggedActivity rows against
-- ONE dedicated demo session. The risk-scorer cron picks them up on its
-- next 30-second tick via the production code path — no scoring shortcuts,
-- no model fixtures, no hardcoded scores. Only the upstream behavioural
-- signals are seeded.
--
-- !!  NEVER RUN AGAINST PRODUCTION DATA  !!
--
--   * Run only against a dedicated demo session created moments before the
--     demo or recording. Never against a real student's session.
--   * Never run on the production droplet against a database that contains
--     real exam attempts. Use a dedicated demo session, ideally on a
--     non-production environment.
--   * Each block is wrapped in START TRANSACTION / COMMIT so a typo can be
--     undone with ROLLBACK before COMMIT.
--   * After the demo, clean up by deleting the demo session — the FK
--     CASCADE on SessionRiskScore / ActivityLog / FlaggedActivity will
--     wipe all seeded rows automatically.
--
-- Two modes, clearly delimited:
--   LIVE  MODE — Demo 2 panel walkthrough (May 25-28, 2026), ~60s climb
--   VIDEO MODE — DIGITEX video recording, pre-seed + on-camera trigger
--
-- ============================================================================

USE secure_exam_db;

-- ============================================================================
-- TARGET — set this once per mysql client session, before any block below.
-- ============================================================================
SET @session_id := 0;  -- ★ REQUIRED: replace with your demo session_id ★
SET @uid        := (SELECT user_id FROM ExamSession WHERE session_id = @session_id);

-- ============================================================================
-- PRE-FLIGHT — run this first to confirm @session_id is correct.
-- If no row returns, the @session_id is wrong; fix before continuing.
-- ============================================================================
SELECT
  s.session_id,
  s.status,
  s.start_time,
  u.username                                         AS student,
  e.title                                            AS exam,
  COALESCE(
    (SELECT COUNT(*) FROM ActivityLog
       WHERE session_id = @session_id AND activity_type = 'TAB_SWITCH'),
    0
  )                                                  AS tab_switches_now,
  COALESCE(
    (SELECT MAX(risk_score) FROM SessionRiskScore
       WHERE session_id = @session_id),
    -1
  )                                                  AS latest_risk_score
FROM ExamSession s
JOIN User u ON s.user_id = u.user_id
JOIN Exam e ON s.exam_id = e.exam_id
WHERE s.session_id = @session_id;


-- ============================================================================
-- =========== LIVE MODE — green → amber → red in ~60-90s ====================
-- ============================================================================
-- For Demo 2 panel walkthrough (week of 2026-05-25 to 2026-05-28).
-- Two paste-able stages. Wait ~30s between them so the risk-scorer cron
-- fires once per stage. Allow another ~30s after Stage 2 for the final tick.
--
--   Before STAGE 1:  dashboard pill shows "low" (or "scoring…" if the
--                    session is brand new and hasn't yet been scored)
--   ~30s after S1:   dashboard pill flips to "medium" (~50-58)
--   ~30s after S2:   dashboard pill flips to "high"   (~85-92)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- LIVE STAGE 1 — 3 tab switches, ~30s total away time (each switch ~10s)
-- ----------------------------------------------------------------------------
START TRANSACTION;

SET @tag_l1 := CONCAT('demo:live:s1:', UNIX_TIMESTAMP());

INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
VALUES
  (@session_id, @uid, 'TAB_SWITCH', @tag_l1, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_l1, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_l1, NOW());

INSERT INTO FlaggedActivity (log_id, session_id, flag_reason, severity, duration_away_seconds)
SELECT log_id, @session_id, 'demo seed: live stage 1', 'low', 10
  FROM ActivityLog
 WHERE session_id = @session_id AND description = @tag_l1;

COMMIT;

-- ⏱  WAIT ~30 SECONDS for the next risk-scorer tick.
-- Dashboard pill should flip from low (or "scoring…") to medium.

-- ----------------------------------------------------------------------------
-- LIVE STAGE 2 — 7 more tab switches (~300s away total), 2 step-up MFA
--                reprompts, 1 verified resume
-- ----------------------------------------------------------------------------
START TRANSACTION;

SET @tag_l2 := CONCAT('demo:live:s2:', UNIX_TIMESTAMP());

INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
VALUES
  (@session_id, @uid, 'TAB_SWITCH', @tag_l2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_l2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_l2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_l2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_l2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_l2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_l2, NOW());

-- 7 × 43s ≈ 301s additional away time. Stage 1 (30s) + Stage 2 (~301s) ≈ 331s total.
INSERT INTO FlaggedActivity (log_id, session_id, flag_reason, severity, duration_away_seconds)
SELECT log_id, @session_id, 'demo seed: live stage 2', 'high', 43
  FROM ActivityLog
 WHERE session_id = @session_id AND description = @tag_l2;

INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
VALUES
  (@session_id, @uid, 'RESUME_INITIATED', 'demo seed: step-up triggered (live s2)', NOW()),
  (@session_id, @uid, 'RESUME_INITIATED', 'demo seed: step-up triggered (live s2)', NOW()),
  (@session_id, @uid, 'RESUME_VERIFIED',  'demo seed: step-up verified (live s2)',  NOW());

COMMIT;

-- ⏱  WAIT ~30 SECONDS for the next risk-scorer tick.
-- Dashboard pill flips to high. Modal sparkline shows low → medium → high climb.


-- ============================================================================
-- =========== VIDEO MODE — pre-seeded medium → high in ~30s ==================
-- ============================================================================
-- For DIGITEX video recording. Pre-seed brings the session into the medium
-- band so the video opens with visible amber signal but with room to climb.
-- Single TRIGGER block then pushes it past the high threshold on the next
-- ~30s scoring tick.
--
-- Workflow:
--   1. Run SETUP block off-camera.
--   2. Wait ~30s for the cron tick → dashboard pill flips to medium.
--   3. Start screen recording with the dashboard visible.
--   4. Run TRIGGER block on-camera.
--   5. Within ~30s the pill flips to high; sparkline shows the climb.
--   6. Stop recording.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VIDEO SETUP — push session into medium band (~55-62 risk_score)
--   4 tab switches × 12s = ~48s away
--   1 step-up MFA reprompt (RESUME_INITIATED)
-- ----------------------------------------------------------------------------
START TRANSACTION;

SET @tag_v1 := CONCAT('demo:video:setup:', UNIX_TIMESTAMP());

INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
VALUES
  (@session_id, @uid, 'TAB_SWITCH', @tag_v1, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_v1, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_v1, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_v1, NOW());

INSERT INTO FlaggedActivity (log_id, session_id, flag_reason, severity, duration_away_seconds)
SELECT log_id, @session_id, 'demo seed: video setup', 'low', 12
  FROM ActivityLog
 WHERE session_id = @session_id AND description = @tag_v1;

INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
VALUES
  (@session_id, @uid, 'RESUME_INITIATED', 'demo seed: step-up triggered (video setup)', NOW());

COMMIT;

-- ⏱  WAIT ~30 SECONDS. Pill should now read "medium" (amber).
-- Begin screen recording.

-- ----------------------------------------------------------------------------
-- VIDEO TRIGGER — push session past high threshold (~85+ risk_score)
--   8 more tab switches × 32s = ~256s additional away time
--     (cumulative with setup: ~304s away total — solidly past the
--      magnitude bonus's hard limit on total_tab_duration_sec)
--   2 more step-up MFA reprompts (RESUME_INITIATED)
--   1 verified resume (RESUME_VERIFIED) — also counts toward mfa_reprompts
-- ----------------------------------------------------------------------------
START TRANSACTION;

SET @tag_v2 := CONCAT('demo:video:trigger:', UNIX_TIMESTAMP());

INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
VALUES
  (@session_id, @uid, 'TAB_SWITCH', @tag_v2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_v2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_v2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_v2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_v2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_v2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_v2, NOW()),
  (@session_id, @uid, 'TAB_SWITCH', @tag_v2, NOW());

INSERT INTO FlaggedActivity (log_id, session_id, flag_reason, severity, duration_away_seconds)
SELECT log_id, @session_id, 'demo seed: video trigger', 'high', 32
  FROM ActivityLog
 WHERE session_id = @session_id AND description = @tag_v2;

INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
VALUES
  (@session_id, @uid, 'RESUME_INITIATED', 'demo seed: step-up triggered (video trigger)', NOW()),
  (@session_id, @uid, 'RESUME_INITIATED', 'demo seed: step-up triggered (video trigger)', NOW()),
  (@session_id, @uid, 'RESUME_VERIFIED',  'demo seed: step-up verified (video trigger)',  NOW());

COMMIT;

-- ⏱  WAIT UP TO ~30 SECONDS. Pill flips to high (red). Sparkline shows
-- the full setup → trigger climb. Stop recording.


-- ============================================================================
-- ============================ CLEANUP ======================================
-- ============================================================================
-- After demo or recording, delete the demo session. FK CASCADE wipes all
-- seeded ActivityLog, FlaggedActivity, and SessionRiskScore rows
-- automatically. Run this OUTSIDE a transaction (or as the final COMMIT
-- in your client session).
--
--   DELETE FROM ExamSession WHERE session_id = @session_id;
--
-- Confirm cleanup with:
--   SELECT 'check' AS state,
--          (SELECT COUNT(*) FROM ExamSession        WHERE session_id = @session_id) AS sess,
--          (SELECT COUNT(*) FROM ActivityLog        WHERE session_id = @session_id) AS al,
--          (SELECT COUNT(*) FROM FlaggedActivity    WHERE session_id = @session_id) AS fa,
--          (SELECT COUNT(*) FROM SessionRiskScore   WHERE session_id = @session_id) AS srs;
-- All four counts should be 0.
-- ============================================================================
