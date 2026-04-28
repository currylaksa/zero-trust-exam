const fs = require('fs');
const path = require('path');

const sweeperFile = path.join(__dirname, 'backend', 'jobs', 'sessionSweeper.js');
let content = fs.readFileSync(sweeperFile, 'utf8');

// Check if we already have the startup log
if (!content.includes('first manual sweep')) {
  // Replace the start of cron.schedule with immediate execution wrapping
  const newLogic = `
  const runSweep = async () => {
    try {
      // 1. Query ExamSession for abandoned sessions
      const query = \`
        SELECT session_id, user_id
        FROM ExamSession
        WHERE status = 'in_progress'
          AND last_heartbeat IS NOT NULL
          AND TIMESTAMPDIFF(MINUTE, last_heartbeat, NOW()) >= 3
      \`;
      
      const [sessions] = await db.execute(query);

      for (const session of sessions) {
        const { session_id, user_id } = session;

        // 2. Update status to 'abandoned'
        await db.execute(
          \`UPDATE ExamSession SET status = 'abandoned' WHERE session_id = ?\`,
          [session_id]
        );

        // 3. Insert into ActivityLog
        const [logResult] = await db.execute(
          \`INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
           VALUES (?, ?, ?, ?, NOW())\`,
          [
            session_id, 
            user_id, 
            'SESSION_ABANDONED', 
            'Session auto-flagged: no heartbeat received for 3+ minutes'
          ]
        );

        // 4. Insert into FlaggedActivity
        await db.execute(
          \`INSERT INTO FlaggedActivity (log_id, session_id, flag_reason, severity)
           VALUES (?, ?, ?, ?)\`,
          [
            logResult.insertId,
            session_id,
            'Heartbeat timeout — possible abandonment',
            'high'
          ]
        );
      }

      // 5. Log to console
      const timestamp = new Date().toISOString();
      console.log(\`[\${timestamp}] Session sweeper: flagged \${sessions.length} abandoned sessions\`);

    } catch (error) {
      console.error('Error in Session Sweeper cron job:', error);
    }
  };

  // Run a sweep immediately on startup
  runSweep();

  // Run every 5 minutes thereafter
  cron.schedule('*/5 * * * *', runSweep);
`;

  // We find 'cron.schedule('...', async () => {' and replace everything inside
  // An easier way is just rewriting the start function entirely.
}
