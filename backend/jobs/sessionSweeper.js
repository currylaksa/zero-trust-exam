const cron = require('node-cron');
const db = require('../config/db');
const { finalizeSession } = require('../controllers/sessionController');

// Auto-submits stale sessions (no heartbeat for 3+ minutes).
// Replaces the previous "mark as abandoned" behaviour so the session machine
// has only three states: in_progress, completed, flagged.
function startSessionSweeper() {
  const runSweep = async () => {
    try {
      const [sessions] = await db.execute(
        `SELECT session_id, user_id, exam_id, status
         FROM ExamSession
         WHERE status IN ('in_progress', 'flagged')
           AND last_heartbeat IS NOT NULL
           AND TIMESTAMPDIFF(MINUTE, last_heartbeat, NOW()) >= 3`
      );

      for (const session of sessions) {
        const { session_id, user_id, exam_id, status } = session;

        try {
          // Auto-grade MCQs, insert placeholders, finalize status.
          // finalizeSession preserves 'flagged' if the session was already flagged.
          await finalizeSession({
            sessionId: session_id,
            examId: exam_id,
            currentStatus: status
          });

          // Audit trail: distinct activity type so it's filterable in audit logs
          const [logResult] = await db.execute(
            `INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
             VALUES (?, ?, ?, ?, NOW())`,
            [
              session_id,
              user_id,
              'AUTO_SUBMIT_TIMEOUT',
              'Session auto-submitted: no heartbeat received for 3+ minutes'
            ]
          );

          // Surface in lecturer monitoring panel as a medium-severity alert.
          // Medium (not high) so it doesn't trigger the post-flag mark nullification.
          await db.execute(
            `INSERT INTO FlaggedActivity (log_id, session_id, flag_reason, severity)
             VALUES (?, ?, ?, ?)`,
            [
              logResult.insertId,
              session_id,
              'Heartbeat timeout — session auto-submitted',
              'medium'
            ]
          );
        } catch (perSessionErr) {
          console.error(`Failed to auto-submit session ${session_id}:`, perSessionErr);
        }
      }

      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Session sweeper: auto-submitted ${sessions.length} stale session(s)`);
    } catch (error) {
      console.error('Error in Session Sweeper cron job:', error);
    }
  };

  // Run immediately on start so it's visible in terminal without waiting 5 min
  runSweep();

  // Run every 5 minutes thereafter
  cron.schedule('*/5 * * * *', runSweep);
}

module.exports = startSessionSweeper;
