const express = require('express');
const router = express.Router();

const {
  startSession,
  getSessionQuestions,
  saveAnswer,
  submitExam,
  heartbeat,
  logSuspiciousActivity,
  getMySessions,
  getSessionResults,
  getExamSubmissions,
  gradeAnswer,
  initiateResume,
  verifyResume
} = require('../controllers/sessionController');

const { verifyZeroTrust, requireRole } = require('../middleware/zeroTrust');

// Exam-taking workflow endpoints (student-only)
router.get('/my-sessions', verifyZeroTrust, requireRole('student'), getMySessions);
router.post('/start/:examId', verifyZeroTrust, requireRole('student'), startSession);
router.post('/:id/initiate-resume', verifyZeroTrust, requireRole('student'), initiateResume);
router.post('/verify-resume', verifyResume);
router.get('/:id/questions', verifyZeroTrust, requireRole('student'), getSessionQuestions);
router.post('/:id/answer', verifyZeroTrust, requireRole('student'), saveAnswer);
router.post('/:id/submit', verifyZeroTrust, requireRole('student'), submitExam);
router.post('/:id/heartbeat', verifyZeroTrust, requireRole('student'), heartbeat);
router.post('/:id/log', verifyZeroTrust, requireRole('student'), logSuspiciousActivity);

// Results endpoint (all roles)
router.get('/:id/results', verifyZeroTrust, getSessionResults);

// Lecturer Grading Endpoints
router.get('/exam/:examId/submissions', verifyZeroTrust, requireRole('lecturer', 'admin'), getExamSubmissions);
router.put('/:sessionId/answers/:answerId/grade', verifyZeroTrust, requireRole('lecturer', 'admin'), gradeAnswer);

module.exports = router;

