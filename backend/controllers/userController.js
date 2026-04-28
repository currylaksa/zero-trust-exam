const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { sendWelcomeEmail } = require('../services/emailService');

exports.getUsers = async (req, res) => {
    try {
        const { search, role } = req.query;
        let query = `
            SELECT u.user_id as id, u.username, u.email, u.role, u.mfa_enabled as mfaEnabled, u.created_at as createdAt, s.student_matric
            FROM User u
            LEFT JOIN Student s ON u.user_id = s.user_id
            WHERE 1=1
        `;
        const params = [];

        if (role) {
            query += ` AND u.role = ?`;
            params.push(role);
        }

        if (search) {
            query += ` AND (u.username LIKE ? OR u.email LIKE ? OR s.student_matric LIKE ?)`;
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam);
        }

        const [users] = await pool.query(query, params);
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching users' });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO User (username, email, password, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, role]
        );

        try {
            const userEmail = email || username;
            sendWelcomeEmail({ studentEmail: userEmail, studentName: username, role });
        } catch (emailErr) {
            console.error('Failed to send welcome email:', emailErr);
        }

        res.status(201).json({ id: result.insertId, username, email, role, mfaEnabled: 0, createdAt: new Date() });
    } catch (error) {
        res.status(500).json({ message: 'Error creating user', error: error.message });
    }
};

exports.updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        await pool.query('UPDATE User SET role = ? WHERE user_id = ?', [role, id]);
        res.json({ message: 'User updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating user' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Manual cascade to handle foreign key restrictions introduced in Phase 8
        await pool.query('DELETE FROM CourseEnrollment WHERE user_id = ? OR enrolled_by = ?', [id, id]);
        
        // Remove enrollments for courses created by this user
        const [courses] = await pool.query('SELECT course_id FROM Course WHERE created_by = ?', [id]);
        if (courses.length > 0) {
            const courseIds = courses.map(c => c.course_id);
            await pool.query('DELETE FROM CourseEnrollment WHERE course_id IN (?)', [courseIds]);
        }
        
        // Remove exams and courses created by this user
        await pool.query('DELETE FROM Exam WHERE created_by = ?', [id]);
        await pool.query('DELETE FROM Course WHERE created_by = ?', [id]);
        
        // Finally, delete the user (will cascade to Student, Admin, etc.)
        await pool.query('DELETE FROM User WHERE user_id = ?', [id]);
        
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Error deleting user' });
    }
};