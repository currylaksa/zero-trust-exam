const express = require('express');
const router = express.Router();

const {
  createExam,
  getAllExams,
  getExamById,
  updateExam,
  deleteExam,
  addQuestion,
  getQuestions,
  deleteQuestion
} = require('../controllers/examController');

const { verifyZeroTrust, requireRole } = require('../middleware/zeroTrust');

router.post('/', verifyZeroTrust, requireRole('lecturer', 'admin'), createExam);
router.get('/', verifyZeroTrust, getAllExams);
router.get('/:id', verifyZeroTrust, getExamById);
router.put('/:id', verifyZeroTrust, requireRole('lecturer', 'admin'), updateExam);
router.delete('/:id', verifyZeroTrust, requireRole('lecturer', 'admin'), deleteExam);

// Question routes
router.post('/:id/questions', verifyZeroTrust, requireRole('lecturer', 'admin'), addQuestion);
router.get('/:id/questions', verifyZeroTrust, getQuestions);
router.delete('/questions/:questionId', verifyZeroTrust, requireRole('lecturer', 'admin'), deleteQuestion);

module.exports = router;
