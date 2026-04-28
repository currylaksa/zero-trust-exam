const express = require('express');
const router = express.Router();
const { verifyZeroTrust, requireRole } = require('../middleware/zeroTrust');
const courseController = require('../controllers/courseController');

router.use(verifyZeroTrust);

router.get('/', courseController.getAllCourses);
router.post('/', requireRole('staff', 'lecturer', 'admin'), courseController.createCourse);
router.get('/:id/students', requireRole('staff', 'admin', 'lecturer'), courseController.getCourseStudents);
router.post('/:id/enroll', requireRole('staff', 'admin'), courseController.enrollStudent);
router.delete('/:id/students/:userId', requireRole('staff', 'admin'), courseController.removeStudent);

module.exports = router;