-- One-off remediation: end the stuck flagged session that keeps generating
-- AUTO_SUBMIT_TIMEOUT alerts, and clear the backlog of unreviewed alerts.
-- Run on the droplet:  mysql -u examapp -p secure_exam_db
-- Run STEP 1 first, confirm it's the right (single) session, then 2 and 3.

-- STEP 1 — Identify the live/active session(s). Should be exactly one row
-- (Chan Qing Qi / Digital Forensics Test 2). Note its session_id.
SELECT s.session_id, u.username, e.title, s.status,
       s.start_time, s.end_time, s.last_heartbeat
FROM ExamSession s
JOIN User u ON s.user_id = u.user_id
JOIN Exam e ON s.exam_id = e.exam_id
WHERE s.status IN ('in_progress', 'flagged');

-- STEP 2 — End that session. Replace <SESSION_ID> with the id from STEP 1.
-- Setting status='completed' removes it from the live list AND (with the
-- code fix) end_time being set stops the sweeper touching it again.
UPDATE ExamSession
SET status = 'completed', end_time = NOW()
WHERE session_id = <SESSION_ID>;

-- STEP 3 — Mark ALL currently unreviewed alerts as reviewed (clears the 1883).
UPDATE FlaggedActivity
SET reviewed = 1
WHERE reviewed = 0;

-- VERIFY — both should return 0.
SELECT COUNT(*) AS active_sessions
FROM ExamSession WHERE status IN ('in_progress', 'flagged');
SELECT COUNT(*) AS unreviewed_alerts
FROM FlaggedActivity WHERE reviewed = 0;
