const db = require('../config/db');

// GET /api/courses
exports.getAllCourses = async (req, res) => {
  const { user_id, role } = req.user;
  try {
    let query = '';
    let queryParams = [];

    if (role === 'lecturer') {
      query = `
        SELECT c.*, COUNT(ce.user_id) as enrollment_count, l.username as lecturer_username
        FROM Course c
        LEFT JOIN CourseEnrollment ce ON c.course_id = ce.course_id
        LEFT JOIN User l ON c.assigned_lecturer_id = l.user_id
        WHERE c.assigned_lecturer_id = ?
        GROUP BY c.course_id
      `;
      queryParams = [user_id];
    } else if (role === 'admin' || role === 'staff') {
      query = `
        SELECT c.*, COUNT(ce.user_id) as enrollment_count, l.username as lecturer_username
        FROM Course c
        LEFT JOIN CourseEnrollment ce ON c.course_id = ce.course_id
        LEFT JOIN User l ON c.assigned_lecturer_id = l.user_id
        GROUP BY c.course_id
      `;
    } else if (role === 'student') {
      query = `
        SELECT c.*, l.username as lecturer_username
        FROM Course c
        JOIN CourseEnrollment ce ON c.course_id = ce.course_id
        LEFT JOIN User l ON c.assigned_lecturer_id = l.user_id
        WHERE ce.user_id = ?
      `;
      queryParams = [user_id];
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [courses] = await db.query(query, queryParams);
    res.status(200).json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Server error fetching courses' });
  }
};

// POST /api/courses
exports.createCourse = async (req, res) => {
  const { course_code, course_name, assigned_lecturer_id } = req.body;
  const { user_id } = req.user;

  if (!course_code || !course_name) {
    return res.status(400).json({ error: 'Course code and name are required' });
  }

  try {
    if (assigned_lecturer_id) {
      const [lecturers] = await db.query('SELECT role FROM User WHERE user_id = ? AND role = "lecturer"', [assigned_lecturer_id]);
      if (lecturers.length === 0) {
        return res.status(400).json({ error: 'Invalid assigned lecturer ID (User is not a lecturer)' });
      }
    }

    const [existing] = await db.query('SELECT course_id FROM Course WHERE course_code = ?', [course_code]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Course code already exists' });
    }

    const [result] = await db.query(
      'INSERT INTO Course (course_code, course_name, created_by, assigned_lecturer_id) VALUES (?, ?, ?, ?)',
      [course_code, course_name, user_id, assigned_lecturer_id || null]
    );

    res.status(201).json({
      message: 'Course created successfully',
      course: {
        course_id: result.insertId,
        course_code,
        course_name,
        created_by: user_id,
        assigned_lecturer_id: assigned_lecturer_id || null
      }
    });
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ error: 'Server error creating course' });
  }
};

// GET /api/courses/:id/students
exports.getCourseStudents = async (req, res) => {
  const course_id = req.params.id;

  try {
    const query = `
      SELECT u.user_id, u.username, u.email, s.student_matric, ce.enrolled_at
      FROM CourseEnrollment ce
      JOIN User u ON ce.user_id = u.user_id
      LEFT JOIN Student s ON u.user_id = s.user_id
      WHERE ce.course_id = ?
    `;
    const [students] = await db.query(query, [course_id]);
    res.status(200).json(students);
  } catch (error) {
    console.error('Error fetching course students:', error);
    res.status(500).json({ error: 'Server error fetching students' });
  }
};

// POST /api/courses/:id/enroll
exports.enrollStudent = async (req, res) => {
  const course_id = req.params.id;
  const { user_id } = req.body;
  const enrolled_by = req.user.user_id;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const [users] = await db.query('SELECT role FROM User WHERE user_id = ?', [user_id]);
    if (users.length === 0 || users[0].role !== 'student') {
      return res.status(400).json({ error: 'User is not a student or does not exist' });
    }

    await db.query(
      'INSERT INTO CourseEnrollment (course_id, user_id, enrolled_by) VALUES (?, ?, ?)',
      [course_id, user_id, enrolled_by]
    );

    res.status(201).json({ message: 'Student enrolled successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Student is already enrolled in this course' });
    }
    console.error('Error enrolling student:', error);
    res.status(500).json({ error: 'Server error enrolling student' });
  }
};

// DELETE /api/courses/:id/students/:userId
exports.removeStudent = async (req, res) => {
  const course_id = req.params.id;
  const user_id = req.params.userId;

  try {
    const [result] = await db.query(
      'DELETE FROM CourseEnrollment WHERE course_id = ? AND user_id = ?',
      [course_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Student is not enrolled in this course' });
    }

    res.status(200).json({ message: 'Student removed from course successfully' });
  } catch (error) {
    console.error('Error removing student:', error);
    res.status(500).json({ error: 'Server error removing student' });
  }
};