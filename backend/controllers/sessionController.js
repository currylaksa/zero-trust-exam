const db = require('../config/db');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const {
  sendExamStartedEmail,
  sendExamSubmittedEmail,
  sendExamSubmittedLecturerEmail,
  sendSessionFlaggedEmail
} = require('../services/emailService');

const shuffleFisherYates = (arr) => {
  const a = Array.isArray(arr) ? arr.slice() : [];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const parseOptionsJSON = (options) => {
  if (options === null || options === undefined) return null;
  if (typeof options === 'string') {
    try {
      return JSON.parse(options);
    } catch {
      return [];
    }
  }
  return options;
};

// Finalize a session: auto-grade MCQs, nullify post-flag answers,
// insert placeholders for skipped questions, and update session status.
// Used by submitExam (manual submit) and sessionSweeper (heartbeat timeout).
async function finalizeSession({ sessionId, examId, currentStatus }) {
  let flaggedAt = null;
  if (currentStatus === 'flagged') {
    const [flagRows] = await db.execute(
      `SELECT MIN(flagged_at) as first_flag FROM FlaggedActivity WHERE session_id = ? AND severity = 'high'`,
      [sessionId]
    );
    if (flagRows[0]?.first_flag) {
      flaggedAt = new Date(flagRows[0].first_flag);
    }
  }

  const [qaRows] = await db.execute(
    `SELECT a.answer_id, a.answer_text, a.submitted_at, q.correct_answer, q.options, q.marks
     FROM Answer a
     JOIN Question q ON a.question_id = q.question_id
     WHERE a.session_id = ? AND q.question_type = 'mcq'`,
    [sessionId]
  );

  for (const row of qaRows) {
    let isCorrect = false;
    let actual_correct = row.correct_answer;

    const opts = parseOptionsJSON(row.options);
    const correctAnswerStr = row.correct_answer != null ? String(row.correct_answer) : '';
    if (opts && correctAnswerStr && ['A','B','C','D'].includes(correctAnswerStr.toUpperCase())) {
      const idx = correctAnswerStr.toUpperCase().charCodeAt(0) - 65;
      if (opts[idx]) {
        actual_correct = opts[idx];
      }
    }

    if (String(row.answer_text).trim() === String(actual_correct).trim()) {
      isCorrect = true;
    }

    let finalScore = isCorrect ? (row.marks || 1) : 0;
    if (flaggedAt && row.submitted_at && new Date(row.submitted_at) > flaggedAt) {
      finalScore = 0;
    }

    await db.execute(
      `UPDATE Answer SET score = ? WHERE answer_id = ?`,
      [finalScore, row.answer_id]
    );
  }

  if (flaggedAt) {
    await db.execute(
      `UPDATE Answer a
       JOIN Question q ON a.question_id = q.question_id
       SET a.score = 0
       WHERE a.session_id = ?
         AND q.question_type != 'mcq'
         AND a.submitted_at > ?`,
      [sessionId, flaggedAt]
    );
  }

  try {
    const [allQuestions] = await db.execute(
      `SELECT question_id FROM Question WHERE exam_id = ?`,
      [examId]
    );
    const [submittedAnswers] = await db.execute(
      `SELECT question_id FROM Answer WHERE session_id = ?`,
      [sessionId]
    );
    const submittedIds = new Set(submittedAnswers.map(a => a.question_id));
    const skippedQuestions = allQuestions.filter(q => !submittedIds.has(q.question_id));

    if (skippedQuestions.length > 0) {
      await Promise.all(skippedQuestions.map(q =>
        db.execute(
          `INSERT INTO Answer (session_id, question_id, answer_text, score, submitted_at)
           VALUES (?, ?, NULL, 0, NOW())`,
          [sessionId, q.question_id]
        )
      ));
    }
  } catch (insertErr) {
    console.error('Failed to insert placeholder answers for skipped questions:', insertErr);
  }

  const finalStatus = currentStatus === 'flagged' ? 'flagged' : 'completed';
  await db.execute(
    `UPDATE ExamSession SET status = ?, end_time = NOW() WHERE session_id = ?`,
    [finalStatus, sessionId]
  );

  return { finalStatus, flaggedAt };
}

const startSession = async (req, res) => {
  const examId = req.params.exam_id ?? req.params.examId ?? req.params.id;
  if (!examId) return res.status(400).json({ message: 'Missing exam_id' });

  const userId = req.user && req.user.user_id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const [examRows] = await db.execute(
      `SELECT * FROM Exam WHERE exam_id = ? AND status = ?`,
      [examId, 'published']
    );

    if (examRows.length === 0) {
      return res.status(404).json({ message: 'Exam not found or not published' });
    }

    if (examRows[0].course_id !== null) {
      const [enrollment] = await db.execute(
        'SELECT * FROM CourseEnrollment WHERE course_id = ? AND user_id = ?',
        [examRows[0].course_id, userId]
      );
      if (enrollment.length === 0) {
        return res.status(403).json({ message: 'You are not enrolled in this course' });
      }
    }

    // Check time window
    const now = new Date();
    if (examRows[0].start_time !== null && new Date(examRows[0].start_time) > now) {
      return res.status(400).json({ 
        message: `This exam has not started yet. It opens at ${new Date(examRows[0].start_time).toLocaleString()}`, 
        open_time: examRows[0].start_time 
      });
    }
    if (examRows[0].end_time !== null && new Date(examRows[0].end_time) < now) {
      return res.status(400).json({ 
        message: `This exam has closed. It ended at ${new Date(examRows[0].end_time).toLocaleString()}`, 
        close_time: examRows[0].end_time 
      });
    }

    const [existingSessions] = await db.execute(
      `SELECT session_id FROM ExamSession WHERE exam_id = ? AND user_id = ? AND status = ?`,
      [examId, userId, 'in_progress']
    );

    if (existingSessions.length > 0) {
      return res.status(409).json({ message: 'Session already in progress for this exam', session_id: existingSessions[0].session_id });
    }

    const clientIp = req.ip || req.connection?.remoteAddress || '';
    const deviceInfo = req.headers['user-agent'];

    const [result] = await db.execute(
      `INSERT INTO ExamSession (user_id, exam_id, start_time, status, ip_address, device_info)
       VALUES (?, ?, NOW(), ?, ?, ?)`,
      [userId, examId, 'in_progress', clientIp, deviceInfo]
    );

    const sessionId = result.insertId;

    await db.execute(
      `INSERT INTO ActivityLog (session_id, user_id, activity_type, description)
       VALUES (?, ?, ?, ?)`,
      [
        sessionId,
        userId,
        'EXAM_START',
        `Exam session started: exam_id=${examId}`
      ]
    );

    const exam = examRows[0];

    try {
      const [uRows] = await db.query('SELECT username FROM User WHERE user_id = ?', [userId]);
      const studentUsername = uRows[0]?.username || 'Student';

      const [cRows] = await db.query('SELECT created_by FROM Exam WHERE exam_id = ?', [examId]);
      if (cRows.length > 0 && cRows[0].created_by) {
        const [lRows] = await db.query('SELECT email, username FROM User WHERE user_id = ?', [cRows[0].created_by]);
        if (lRows.length > 0) {
          const lecturerEmail = lRows[0].email || lRows[0].username;
          sendExamStartedEmail({
            lecturerEmail: lecturerEmail,
            lecturerName: lRows[0].username,
            studentName: studentUsername,
            examTitle: exam.title,
            startTime: new Date(),
            sessionId: sessionId
          });
        }
      }
    } catch (emailErr) {
      console.error('Failed to send exam started email:', emailErr);
    }

    return res.status(201).json({
      session_id: sessionId,
      exam: {
        exam_id: exam.exam_id,
        title: exam.title,
        description: exam.description,
        duration: exam.duration,
        start_time: exam.start_time,
        end_time: exam.end_time,
        status: exam.status
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getSessionQuestions = async (req, res) => {
  const sessionId = req.params.session_id ?? req.params.id;
  if (!sessionId) return res.status(400).json({ message: 'Missing session_id' });

  const userId = req.user && req.user.user_id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const [sessionRows] = await db.execute(
      `SELECT es.session_id, es.exam_id, es.status, es.start_time, e.duration 
       FROM ExamSession es
       JOIN Exam e ON es.exam_id = e.exam_id
       WHERE es.session_id = ? AND es.user_id = ?`,
      [sessionId, userId]
    );

    if (sessionRows.length === 0) {
      return res.status(403).json({ message: 'Forbidden: session does not belong to this user' });
    }

    const session = sessionRows[0];
    if (session.status !== 'in_progress' && session.status !== 'flagged') {
      return res.status(400).json({ message: 'Session is not in progress' });
    }

    const [questionRows] = await db.execute(
      `SELECT * FROM Question
       WHERE exam_id = ?
       ORDER BY question_order ASC, question_id ASC`,
      [session.exam_id]
    );

    const questions = questionRows.map((q) => {
      const mapped = { ...q };
      mapped.options = parseOptionsJSON(mapped.options);
      delete mapped.correct_answer; // never return answer keys
      return mapped;
    });

    const [answerRows] = await db.execute(
      `SELECT question_id, answer_text FROM Answer WHERE session_id = ?`,
      [sessionId]
    );

    return res.status(200).json({
      session: { 
        duration: session.duration, 
        start_time: session.start_time 
      },
      questions: shuffleFisherYates(questions),
      answers: answerRows
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const saveAnswer = async (req, res) => {
  const sessionId = req.params.session_id ?? req.params.id;
  if (!sessionId) return res.status(400).json({ message: 'Missing session_id' });

  const userId = req.user && req.user.user_id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { question_id, answer_text } = req.body || {};
  if (!question_id) return res.status(400).json({ message: 'Missing question_id' });

  try {
    const [sessionRows] = await db.execute(
      `SELECT session_id, status FROM ExamSession WHERE session_id = ? AND user_id = ?`,
      [sessionId, userId]
    );

    if (sessionRows.length === 0) {
      return res.status(403).json({ message: 'Forbidden: session does not belong to this user' });
    }

    const session = sessionRows[0];
    if (session.status !== 'in_progress' && session.status !== 'flagged') {
      return res.status(400).json({ message: 'Session is not in progress' });
    }

    const [existingAnswers] = await db.execute(
      `SELECT answer_id FROM Answer WHERE session_id = ? AND question_id = ? LIMIT 1`,
      [sessionId, question_id]
    );

    if (existingAnswers.length > 0) {
      await db.execute(
        `UPDATE Answer
         SET answer_text = ?, submitted_at = NOW()
         WHERE session_id = ? AND question_id = ?`,
        [answer_text, sessionId, question_id]
      );
    } else {
      await db.execute(
        `INSERT INTO Answer (session_id, question_id, answer_text)
         VALUES (?, ?, ?)`,
        [sessionId, question_id, answer_text]
      );
    }

    return res.status(200).json({ message: 'Answer saved' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const submitExam = async (req, res) => {
  const sessionId = req.params.session_id ?? req.params.id;
  if (!sessionId) return res.status(400).json({ message: 'Missing session_id' });

  const userId = req.user && req.user.user_id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const [sessionRows] = await db.execute(
      `SELECT session_id, exam_id, status FROM ExamSession WHERE session_id = ? AND user_id = ?`,
      [sessionId, userId]
    );

    if (sessionRows.length === 0) {
      return res.status(403).json({ message: 'Forbidden: session does not belong to this user' });
    }

    const session = sessionRows[0];
    if (session.status === 'completed') {
      return res.status(400).json({ message: 'Session has already been submitted' });
    }
    if (session.status !== 'in_progress' && session.status !== 'flagged') {
      return res.status(400).json({ message: 'Session is not in progress' });
    }

    // Auto-grade MCQs, nullify post-flag answers, insert placeholders for
    // skipped questions, and update session status. Preserves 'flagged' state.
    await finalizeSession({
      sessionId,
      examId: session.exam_id,
      currentStatus: session.status
    });

    await db.execute(
      `INSERT INTO ActivityLog (session_id, user_id, activity_type, description)
       VALUES (?, ?, ?, ?)`,
      [
        sessionId,
        userId,
        'EXAM_SUBMIT',
        `Exam submitted: session_id=${sessionId}, exam_id=${session.exam_id}`
      ]
    );

    try {
      // get student details
      const [uRows] = await db.query('SELECT username, email FROM User WHERE user_id = ?', [userId]);
      const studentEmail = uRows[0]?.email || uRows[0]?.username;
      const studentUsername = uRows[0]?.username || 'Student';

      // get exam details & lecturer
      const [eRows] = await db.query('SELECT title, created_by FROM Exam WHERE exam_id = ?', [session.exam_id]);
      const examTitle = eRows[0]?.title || 'Unknown Exam';
      
      let lecturerEmail = null;
      let lecturerName = null;
      if (eRows.length > 0 && eRows[0].created_by) {
        const [lRows] = await db.query('SELECT email, username FROM User WHERE user_id = ?', [eRows[0].created_by]);
        if (lRows.length > 0) {
          lecturerEmail = lRows[0].email || lRows[0].username;
          lecturerName = lRows[0].username;
        }
      }

      // calculate marks (only MCQ is auto-graded at this stage, so this might be partial)
      // total marks = sum of marks from Question for this exam
      const [qTotalRows] = await db.query('SELECT SUM(marks) as total FROM Question WHERE exam_id = ?', [session.exam_id]);
      const totalMarks = qTotalRows[0]?.total || 0;

      // earned = sum of score from Answer
      const [aScoreRows] = await db.query('SELECT SUM(score) as earned FROM Answer WHERE session_id = ?', [sessionId]);
      const earnedMarks = aScoreRows[0]?.earned || 0;

      // send to student
      if (studentEmail) {
        sendExamSubmittedEmail({
          studentEmail: studentEmail,
          studentName: studentUsername,
          examTitle: examTitle,
          submitTime: new Date(),
          sessionId: sessionId,
          score: earnedMarks,
          totalMarks: totalMarks
        });
      }
      
      // send to lecturer
      if (lecturerEmail) {
        sendExamSubmittedLecturerEmail({
          lecturerEmail: lecturerEmail,
          lecturerName: lecturerName,
          studentName: studentUsername,
          examTitle: examTitle,
          submitTime: new Date(),
          sessionId: sessionId
        });
      }
    } catch (emailErr) {
      console.error('Failed to send exam submitted emails:', emailErr);
    }

    return res.status(200).json({
      message: 'Exam submitted',
      sessionId
    });
  } catch (err) {
    console.error('Submit exam error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const heartbeat = async (req, res) => {
  const sessionId = req.params.session_id ?? req.params.id;
  if (!sessionId) return res.status(400).json({ message: 'Missing session_id' });

  const userId = req.user && req.user.user_id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const [sessionRows] = await db.execute(
      `SELECT session_id, status FROM ExamSession WHERE session_id = ? AND user_id = ?`,
      [sessionId, userId]
    );

    if (sessionRows.length === 0) {
      return res.status(403).json({ message: 'Forbidden: session does not belong to this user' });
    }

    const session = sessionRows[0];
    if (session.status !== 'in_progress' && session.status !== 'flagged') {
      return res.status(400).json({ message: 'Session is not in progress' });
    }

    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
       VALUES (?, ?, ?, ?, NOW())`,
      [sessionId, userId, 'HEARTBEAT', `Heartbeat received at ${now}`]
    );

    // Update ExamSession's last_heartbeat
    await db.execute(
      `UPDATE ExamSession SET last_heartbeat = NOW() WHERE session_id = ?`,
      [sessionId]
    );

    const clientIp = req.ip || req.connection?.remoteAddress || '';
    const payload = {
      userId: req.user.user_id,
      email: req.user.email,
      username: req.user.username,
      role: req.user.role,
      ip: clientIp
    };

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        error: 'Server configuration error'
      });
    }

    const newToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });

    return res.status(200).json({ alive: true, token: newToken });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const logSuspiciousActivity = async (req, res) => {
  const sessionId = req.params.session_id ?? req.params.id;
  if (!sessionId) return res.status(400).json({ message: 'Missing session_id' });

  const userId = req.user && req.user.user_id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { activity_type, description, duration_away_seconds = null } = req.body || {};
  const parsedDurationAwaySeconds =
    duration_away_seconds === null || duration_away_seconds === undefined || duration_away_seconds === ''
      ? null
      : Number(duration_away_seconds);
  const normalizedDurationAwaySeconds =
    Number.isFinite(parsedDurationAwaySeconds) ? Math.max(0, Math.round(parsedDurationAwaySeconds)) : null;

  const allowed = ['TAB_SWITCH', 'FULLSCREEN_EXIT', 'COPY_ATTEMPT', 'PASTE_ATTEMPT', 'RIGHT_CLICK'];
  if (!activity_type || !allowed.includes(activity_type)) {
    return res.status(400).json({ message: 'Invalid or missing activity_type' });
  }

  try {
    const [sessionRows] = await db.execute(
      `SELECT session_id, status, tab_switch_count, fullscreen_exit_count
       FROM ExamSession WHERE session_id = ? AND user_id = ?`,
      [sessionId, userId]
    );

    if (sessionRows.length === 0) {
      return res.status(403).json({ message: 'Forbidden: session does not belong to this user' });
    }

    const session = sessionRows[0];

    const activityDescription =
      activity_type === 'TAB_SWITCH' && normalizedDurationAwaySeconds !== null
        ? `Tab switch detected — student was away for ${normalizedDurationAwaySeconds} seconds`
        : (description || activity_type);
    const [logResult] = await db.execute(
      `INSERT INTO ActivityLog (session_id, user_id, activity_type, description, timestamp)
       VALUES (?, ?, ?, ?, NOW())`,
      [sessionId, userId, activity_type, activityDescription]
    );

    const logId = logResult.insertId;

    if (activity_type === 'TAB_SWITCH') {
      const newTabSwitchCount = (session.tab_switch_count || 0) + 1;
      await db.execute(
        `UPDATE ExamSession SET tab_switch_count = ? WHERE session_id = ? AND user_id = ?`,
        [newTabSwitchCount, sessionId, userId]
      );

      const isThresholdReached = newTabSwitchCount >= 5 && session.status !== 'flagged';

      if (isThresholdReached) {
        await db.execute(
          `UPDATE ExamSession SET status = ? WHERE session_id = ? AND user_id = ?`,
          ['flagged', sessionId, userId]
        );
      }

      await db.execute(
        `INSERT INTO FlaggedActivity (log_id, session_id, flag_reason, severity, duration_away_seconds)
         VALUES (?, ?, ?, ?, ?)`,
        [
          logId,
          sessionId,
          isThresholdReached
            ? `TAB_SWITCH threshold reached (${newTabSwitchCount})`
            : `TAB_SWITCH count=${newTabSwitchCount}`,
          isThresholdReached ? 'high' : 'low',
          normalizedDurationAwaySeconds
        ]
      );

      if (isThresholdReached) {
        try {
          // Send notification email to lecturer
          const [uRows] = await db.query('SELECT username FROM User WHERE user_id = ?', [userId]);
          const studentUsername = uRows[0]?.username || 'Student';

          const [sRows] = await db.query('SELECT exam_id FROM ExamSession WHERE session_id = ?', [sessionId]);
          const examId = sRows[0]?.exam_id;
          
          if (examId) {
            const [eRows] = await db.query('SELECT title, created_by FROM Exam WHERE exam_id = ?', [examId]);
            const examTitle = eRows[0]?.title || 'Unknown Exam';
            
            if (eRows.length > 0 && eRows[0].created_by) {
              const [lRows] = await db.query('SELECT email, username FROM User WHERE user_id = ?', [eRows[0].created_by]);
              if (lRows.length > 0) {
                const lecturerEmail = lRows[0].email || lRows[0].username;
                const lecturerName = lRows[0].username;
                sendSessionFlaggedEmail({
                  lecturerEmail: lecturerEmail,
                  lecturerName: lecturerName,
                  studentName: studentUsername,
                  examTitle: examTitle,
                  flagReason: `Suspicious activity detected! Tab switches: ${newTabSwitchCount}`,
                  tabSwitchCount: newTabSwitchCount,
                  sessionId: sessionId
                });
              }
            }
          }
        } catch (emailErr) {
          console.error('Failed to send session flagged email:', emailErr);
        }
      }
    } else if (activity_type === 'FULLSCREEN_EXIT') {
      const newFullscreenExitCount = (session.fullscreen_exit_count || 0) + 1;
      await db.execute(
        `UPDATE ExamSession SET fullscreen_exit_count = ? WHERE session_id = ? AND user_id = ?`,
        [newFullscreenExitCount, sessionId, userId]
      );

      await db.execute(
        `INSERT INTO FlaggedActivity (log_id, session_id, flag_reason, severity)
         VALUES (?, ?, ?, ?)`,
        [
          logId,
          sessionId,
          `FULLSCREEN_EXIT count=${newFullscreenExitCount}`,
          'medium'
        ]
      );
    }

    return res.status(200).json({ logged: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};



const getMySessions = async (req, res) => {
  const userId = req.user && req.user.user_id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const [rows] = await db.execute(`
      SELECT s.*, e.title, e.duration
      FROM ExamSession s
      JOIN Exam e ON s.exam_id = e.exam_id
      WHERE s.user_id = ?
      ORDER BY s.start_time DESC
    `, [userId]);
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getSessionResults = async (req, res) => {
  const sessionId = req.params.session_id ?? req.params.id;
  if (!sessionId) return res.status(400).json({ message: 'Missing session_id' });

  const userId = req.user && req.user.user_id;
  const userRole = req.user && req.user.role;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const [sessionRows] = await db.execute(
      `SELECT s.session_id, s.exam_id, s.user_id, s.start_time, s.end_time, s.status, s.tab_switch_count, s.fullscreen_exit_count, e.title, e.duration, e.created_by AS exam_created_by
       FROM ExamSession s
       JOIN Exam e ON s.exam_id = e.exam_id
       WHERE s.session_id = ?`,
      [sessionId]
    );

    if (sessionRows.length === 0) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const session = sessionRows[0];

    // Students may only view their own session.
    // Lecturers may only view sessions from exams they created.
    // Admins may view any session.
    if (Number(session.user_id) !== Number(userId)) {
      if (userRole === 'lecturer') {
        if (Number(session.exam_created_by) !== Number(userId)) {
          return res.status(403).json({ message: 'Forbidden: this session does not belong to your exam' });
        }
      } else if (userRole !== 'admin') {
        return res.status(403).json({ message: 'Forbidden: you do not have access to these results' });
      }
    }

    const [flaggedRows] = await db.execute(
      `SELECT
         (SELECT COUNT(*) FROM FlaggedActivity WHERE session_id = ?) AS flagCount,
         (SELECT MIN(flagged_at) FROM FlaggedActivity WHERE session_id = ? AND severity = 'high') AS first_flag`,
      [sessionId, sessionId]
    );
    const flaggedActivityCount = flaggedRows[0]?.flagCount || 0;
    const firstFlaggedAt = flaggedRows[0]?.first_flag ? new Date(flaggedRows[0].first_flag) : null;

    const [qnaRows] = await db.execute(
      `SELECT q.question_id, q.question_text, q.question_type, q.options, q.correct_answer, q.marks,
              a.answer_id, a.answer_text, a.score, a.submitted_at
       FROM Question q
       LEFT JOIN Answer a ON q.question_id = a.question_id AND a.session_id = ?
       WHERE q.exam_id = ?
       ORDER BY q.question_order ASC, q.question_id ASC`,
      [sessionId, session.exam_id]
    );

    let total_questions = qnaRows.length;
    let answered_count = 0;
    let mcq_score = 0;
    let total_mcq_questions = 0;
    let total_marks = 0;
    let earned_marks = 0;
    let non_mcq_count = 0;
    let graded_non_mcq_count = 0;

    const questionsReview = qnaRows.map(row => {
      let actual_correct_answer = row.correct_answer;
      const opts = parseOptionsJSON(row.options);

      const isNullified = firstFlaggedAt && row.submitted_at && new Date(row.submitted_at) > firstFlaggedAt;
      let effectiveScore = isNullified ? 0 : row.score;

      total_marks += (row.marks || 0);
      if (effectiveScore) earned_marks += effectiveScore;

      const correctAnswerStr = row.correct_answer != null ? String(row.correct_answer) : '';
      if ((row.question_type === 'MCQ' || row.question_type === 'mcq') && opts && correctAnswerStr && ['A','B','C','D'].includes(correctAnswerStr.toUpperCase())) {
        const idx = correctAnswerStr.toUpperCase().charCodeAt(0) - 65;
        if (opts[idx]) {
          actual_correct_answer = opts[idx];
        }
      }

      const q = {
        question_id: row.question_id,
        answer_id: row.answer_id,
        question_text: row.question_text,
        question_type: row.question_type,
        options: opts,
        correct_answer: actual_correct_answer,
        student_answer: row.answer_text,
        score: effectiveScore,
        marks: row.marks,
        is_answered: row.answer_text !== null && row.answer_text !== undefined,
        is_correct: false,
        is_nullified: isNullified
      };

      if (q.is_answered) answered_count++;

      if (q.question_type === 'MCQ' || q.question_type === 'mcq') {
        total_mcq_questions++;
        if (q.is_answered && String(q.student_answer) === String(q.correct_answer)) {
          q.is_correct = true;
          mcq_score++;
        }
      } else {
        non_mcq_count++;
        if (effectiveScore !== null && effectiveScore !== undefined) {
          graded_non_mcq_count++;
        }
      }

      return q;
    });

    const is_fully_graded = non_mcq_count === 0 || graded_non_mcq_count === non_mcq_count;

    return res.status(200).json({
      session: {
        session_id: session.session_id,
        exam_id: session.exam_id,
        title: session.title,
        status: session.status,
        start_time: session.start_time,
        end_time: session.end_time,
        duration: session.duration,
        tab_switch_count: session.tab_switch_count,
        fullscreen_exit_count: session.fullscreen_exit_count,
        flagged_activity_count: flaggedActivityCount
      },
      stats: {
        total_questions,
        answered_count,
        total_mcq_questions,
        mcq_score,
        total_marks,
        earned_marks,
        is_fully_graded
      },
      questions: questionsReview
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getExamSubmissions = async (req, res) => {
  const { examId } = req.params;

  try {
    const [examRows] = await db.execute(`SELECT e.created_by, e.title, e.duration, e.course_id, c.course_code FROM Exam e LEFT JOIN Course c ON e.course_id = c.course_id WHERE e.exam_id = ?`, [examId]);
    if (examRows.length === 0) return res.status(404).json({ message: 'Exam not found' });
    
    if (req.user.role !== 'admin' && Number(examRows[0].created_by) !== Number(req.user.user_id)) {
       return res.status(403).json({ message: 'Forbidden' });
    }

    let enrolled_count = 0;
    if (examRows[0].course_id) {
      const [enrollRows] = await db.execute('SELECT COUNT(*) as count FROM CourseEnrollment WHERE course_id = ?', [examRows[0].course_id]);
      enrolled_count = enrollRows[0].count;
    }

    const query = `
      SELECT s.session_id, s.start_time, s.end_time, s.status, s.tab_switch_count, 
             u.username, u.email, st.student_matric
      FROM ExamSession s
      JOIN User u ON s.user_id = u.user_id
      LEFT JOIN Student st ON u.user_id = st.user_id
      WHERE s.exam_id = ? AND s.status IN ('completed', 'flagged')
      ORDER BY s.start_time DESC
    `;
    const [sessions] = await db.execute(query, [examId]);

    const [allQ] = await db.execute('SELECT question_id, marks, question_type FROM Question WHERE exam_id = ?', [examId]);
    const total_marks = allQ.reduce((sum, q) => sum + (q.marks || 1), 0);
    const question_count = allQ.length;
    
    // We can fetch all answers for these sessions to calculate
    const [answersRows] = await db.execute(`
      SELECT a.session_id, a.answer_id, a.answer_text, a.score, a.submitted_at, q.question_type, q.marks
      FROM Answer a
      JOIN ExamSession s ON a.session_id = s.session_id
      JOIN Question q ON a.question_id = q.question_id
      WHERE s.exam_id = ? AND s.status IN ('completed', 'flagged')
    `, [examId]);

    const [flaggedRows] = await db.execute(`
      SELECT session_id, MIN(flagged_at) as first_flag
      FROM FlaggedActivity
      WHERE session_id IN (SELECT session_id FROM ExamSession WHERE exam_id = ?)
        AND severity = 'high'
      GROUP BY session_id
    `, [examId]);

    const sessionsWithStats = sessions.map(session => {
      const sAnswers = answersRows.filter(a => a.session_id === session.session_id);
      const sessionFlag = flaggedRows.find(f => f.session_id === session.session_id);
      const firstFlaggedAt = sessionFlag?.first_flag ? new Date(sessionFlag.first_flag) : null;
      
      let earned_marks = 0;
      let answered_count = 0;
      let manual_q_count = 0;
      let manual_graded_count = 0;

      sAnswers.forEach(ans => {
        const isNullified = firstFlaggedAt && ans.submitted_at && new Date(ans.submitted_at) > firstFlaggedAt;
        const effectiveScore = isNullified ? 0 : ans.score;

        if (ans.answer_text !== null && ans.answer_text !== undefined && ans.answer_text !== '') {
          answered_count++;
        }
        if (effectiveScore) earned_marks += effectiveScore;

        if (ans.question_type === 'short_answer' || ans.question_type === 'essay') {
          manual_q_count++;
          if (effectiveScore !== null && effectiveScore !== undefined) {
            manual_graded_count++;
          }
        }
      });

      // Manual grading is complete when every manual question has an effective score
      // (including auto-nullified answers after a flagged event).
      const is_fully_graded = manual_q_count === 0 || manual_graded_count === manual_q_count;
      const has_manual = manual_q_count > 0;

      return {
        ...session,
        exam_title: examRows[0].title,
        exam_duration: examRows[0].duration,
        course_code: examRows[0].course_code,
        enrolled_count: enrolled_count,
        total_marks,
        earned_marks,
        answered_count,
        question_count,
        is_fully_graded,
        has_manual
      };
    });

    return res.status(200).json(sessionsWithStats);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const gradeAnswer = async (req, res) => {
  const { sessionId, answerId } = req.params;
  const { score } = req.body;

  try {
    const [answerData] = await db.execute(`
      SELECT a.*, q.marks, e.created_by
      FROM Answer a
      JOIN ExamSession s ON a.session_id = s.session_id
      JOIN Exam e ON s.exam_id = e.exam_id
      JOIN Question q ON a.question_id = q.question_id
      WHERE a.answer_id = ? AND a.session_id = ?
    `, [answerId, sessionId]);

    if (answerData.length === 0) {
      return res.status(404).json({ message: 'Answer not found' });
    }

    const { created_by, marks } = answerData[0];

    if (req.user.role !== 'admin' && Number(created_by) !== Number(req.user.user_id)) {
       return res.status(403).json({ message: 'Forbidden' });
    }

    const numericScore = Number(score);
    if (isNaN(numericScore) || numericScore < 0 || numericScore > marks) {
      return res.status(400).json({ message: `Score must be between 0 and ${marks}` });
    }

    const answer = answerData[0];
    const [flagRows] = await db.execute(
      `SELECT MIN(flagged_at) as first_flag FROM FlaggedActivity WHERE session_id = ? AND severity = 'high'`,
      [sessionId]
    );
    if (flagRows[0]?.first_flag && answer.submitted_at) {
      const flaggedAt = new Date(flagRows[0].first_flag);
      if (new Date(answer.submitted_at) > flaggedAt && numericScore > 0) {
        return res.status(403).json({ message: 'Cannot assign marks: this answer was submitted after the session was flagged.' });
      }
    }

    await db.execute('UPDATE Answer SET score = ? WHERE answer_id = ?', [numericScore, answerId]);

    await db.execute(
      'INSERT INTO ActivityLog (session_id, user_id, activity_type, description) VALUES (?, ?, ?, ?)',
      [sessionId, req.user.user_id, 'GRADE_ANSWER', `Graded answer ${answerId} for session ${sessionId}`]
    );

    return res.status(200).json({ message: 'Updated successfully', score: numericScore });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const initiateResume = async (req, res) => {
  const sessionId = req.params.id;
  
  if (!sessionId) return res.status(400).json({ message: 'Missing session_id' });

  const userId = req.user.user_id;

  try {
    const [sessions] = await db.execute(
      `SELECT status FROM ExamSession WHERE session_id = ? AND user_id = ?`,
      [sessionId, userId]
    );

    if (sessions.length === 0) {
      return res.status(403).json({ message: 'Forbidden: session does not belong to this user' });
    }

    if (sessions[0].status !== 'in_progress') {
      return res.status(403).json({ message: 'Session is not in progress' });
    }

    const payload = {
      userId,
      sessionId,
      stage: 'resume_mfa',
      ip: req.ip
    };

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        error: 'Server configuration error'
      });
    }

    const resumeToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });

    await db.execute(
      `INSERT INTO ActivityLog (session_id, user_id, activity_type, description)
       VALUES (?, ?, ?, ?)`,
      [
        sessionId,
        userId,
        'RESUME_INITIATED',
        'Step-up MFA triggered for exam resume'
      ]
    );

    return res.status(200).json({ resumeToken, requiresMFA: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const verifyResume = async (req, res) => {
  const { resumeToken, otp } = req.body;
  if (!resumeToken || !otp) {
    return res.status(400).json({ message: 'Missing token or verify code' });
  }

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        error: 'Server configuration error'
      });
    }

    const decoded = jwt.verify(resumeToken, process.env.JWT_SECRET);
    if (decoded.stage !== 'resume_mfa') {
      return res.status(401).json({ message: 'Invalid token stage' });
    }
    if (decoded.ip !== req.ip) {
      return res.status(403).json({ message: 'IP address mismatch' });
    }

    const [users] = await db.execute(
      `SELECT mfa_secret FROM User WHERE user_id = ?`,
      [decoded.userId]
    );

    if (users.length === 0 || !users[0].mfa_secret) {
      return res.status(400).json({ message: 'User not found or MFA not enabled' });
    }

    const verified = speakeasy.totp.verify({
      secret: users[0].mfa_secret,
      encoding: 'base32',
      token: otp,
      window: 1
    });

    if (!verified) {
      return res.status(401).json({ message: 'Invalid verification code' });
    }

    await db.execute(
      `INSERT INTO ActivityLog (session_id, user_id, activity_type, description)
       VALUES (?, ?, ?, ?)`,
      [
        decoded.sessionId,
        decoded.userId,
        'RESUME_VERIFIED',
        'Step-up MFA passed — exam resumed'
      ]
    );

    return res.status(200).json({ 
      verified: true, 
      sessionId: decoded.sessionId 
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid or expired resume token' });
    }
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  startSession,
  initiateResume,
  verifyResume,
  getSessionQuestions,
  saveAnswer,
  submitExam,
  heartbeat,
  logSuspiciousActivity,
  getMySessions,
  getSessionResults,
  getExamSubmissions,
  gradeAnswer,
  finalizeSession
};
