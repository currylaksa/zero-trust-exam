const { getMySessions } = require('./controllers/sessionController');
const { getExams } = require('./controllers/examController');
const db = require('./config/db');

(async () => {
    // get exams
    const reqEx = { query: {} };
    // We just want to see the type of exam.exam_id vs s.exam_id
    console.log('Testing types...');
    const [exams] = await db.query("SELECT exam_id FROM Exam LIMIT 1");
    const [sessions] = await db.query("SELECT exam_id FROM ExamSession LIMIT 1");
    console.log('From Exam:', typeof exams[0].exam_id);
    console.log('From Session:', typeof sessions[0].exam_id);
    process.exit(0);
})();
