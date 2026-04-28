const { default: axios } = require('axios');
(async () => {
  try {
     const db = require('./config/db');
     // make a student and token manually
     const jwt = require('jsonwebtoken');
     require('dotenv').config();
     
     const [u] = await db.query("SELECT * FROM User WHERE role='student' LIMIT 1");
     if (!u[0]) return console.log('no student');
     const studentId = u[0].user_id;
     
     const [e] = await db.query("SELECT * FROM ExamSession WHERE user_id=? AND status='in_progress' LIMIT 1", [studentId]);
     if (!e[0]) return console.log('no in progress session, trying to start one...');
     let sId = e[0]?.session_id;

     if (!sId) {
        // try finding published exam
        const [ex] = await db.query("SELECT * FROM Exam WHERE status='published' LIMIT 1");
        if(ex[0]) {
           await db.query("INSERT INTO ExamSession(exam_id, user_id, status) VALUES (?, ?, 'in_progress')", [ex[0].exam_id, studentId]);
           const [s] = await db.query("SELECT LAST_INSERT_ID() as id");
           sId = s[0].id;
        }
     }
     if(!sId) return console.log('no exam');
     
     const token = jwt.sign({ user_id: studentId, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' });
     
     const res = await axios.post(`http://localhost:5001/api/sessions/${sId}/submit`, {}, {
        headers: { Authorization: `Bearer ${token}` }
     });
     console.log('Result:', res.data);
  } catch (err) {
     console.log('Axios error:', err?.response?.data || err.message);
  }
  process.exit();
})();
