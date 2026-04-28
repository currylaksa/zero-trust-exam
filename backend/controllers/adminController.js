const pool = require('../config/db');

exports.getStats = async (req, res) => {
    try {
        const [userCounts] = await pool.query('SELECT role, COUNT(*) as count FROM User GROUP BY role');
        const [exams] = await pool.query('SELECT COUNT(*) as count FROM Exam');
        const [sessions] = await pool.query('SELECT COUNT(*) as count FROM ExamSession');

        const totalStudents = userCounts.find(u => u.role === 'student')?.count || 0;
        const totalLecturers = userCounts.find(u => u.role === 'lecturer')?.count || 0;
        const totalExams = exams[0]?.count || 0;
        const totalSessions = sessions[0]?.count || 0;

        res.json({
            students: totalStudents,
            lecturers: totalLecturers,
            exams: totalExams,
            sessions: totalSessions
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};