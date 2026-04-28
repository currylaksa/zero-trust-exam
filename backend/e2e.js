const { default: axios } = require('axios');
const db = require('./config/db');
require('dotenv').config();
const jwt = require('jsonwebtoken');

(async () => {
    let examId, sId;
    try {
        const [u] = await db.query("SELECT * FROM User WHERE role='student' LIMIT 1");
        const studentId = u[0].user_id;

        const [lec] = await db.query("SELECT * FROM User WHERE role='lecturer' LIMIT 1");
        const lecturerId = lec[0].user_id;

        const [exResult] = await db.query("INSERT INTO Exam (title, duration, status, created_by) VALUES ('Test Exam', 60, 'published', ?)", [lecturerId]);
        examId = exResult.insertId;

        const [sResult] = await db.query("INSERT INTO ExamSession (exam_id, user_id, status) VALUES (?, ?, 'in_progress')", [examId, studentId]);
        sId = sResult.insertId;

        const token = jwt.sign({ user_id: studentId, role: 'student', ip: '::1' }, process.env.JWT_SECRET, { expiresIn: '1h' });

        const res = await axios.post(`http://localhost:5001/api/sessions/${sId}/submit`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Result:', res.status, res.data);
    } catch (err) {
        console.error('Axios Error:', err.response?.data || err.message);
    }
    
    if (examId) await db.query("DELETE FROM Exam WHERE exam_id=?", [examId]);
    process.exit();
})();
