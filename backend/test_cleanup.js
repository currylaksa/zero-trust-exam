const pool = require('./config/db');
(async () => {
    try {
        const id = 1; // test id
        await pool.query('DELETE FROM CourseEnrollment WHERE user_id = ? OR enrolled_by = ?', [id, id]);
        await pool.query('DELETE FROM CourseEnrollment WHERE course_id IN (SELECT course_id FROM Course WHERE created_by = ?)', [id]);
        await pool.query('DELETE FROM Exam WHERE created_by = ?', [id]);
        await pool.query('DELETE FROM Course WHERE created_by = ?', [id]);
        await pool.query('DELETE FROM User WHERE user_id = ?', [id]);
        console.log('Success');
    } catch (err) {
        console.log('Err', err);
    }
    process.exit(0);
})();
