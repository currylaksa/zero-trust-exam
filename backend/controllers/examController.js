const db = require('../config/db');
const { sendExamPublishedEmail } = require('../services/emailService');

// Helper: notify all students enrolled in this exam's course that it is published.
// Used by createExam (created already-published) and updateExam (status flipped to published).
async function notifyEnrolledStudentsOfPublishedExam(examId) {
  try {
    const [examRows] = await db.query(
      'SELECT title, duration, start_time, end_time, course_id FROM Exam WHERE exam_id = ?',
      [examId]
    );
    if (examRows.length === 0) return;

    const exam = examRows[0];
    if (!exam.course_id) return; // no course binding → no enrolled audience

    const [cRows] = await db.query(
      'SELECT course_name, course_code FROM Course WHERE course_id = ?',
      [exam.course_id]
    );
    const courseName = cRows[0] ? `${cRows[0].course_code} - ${cRows[0].course_name}` : 'the course';

    const [students] = await db.query(
      `SELECT u.email, u.username FROM User u
       JOIN CourseEnrollment ce ON u.user_id = ce.user_id
       WHERE ce.course_id = ?`,
      [exam.course_id]
    );

    for (const st of students) {
      const dest = st.email || st.username;
      sendExamPublishedEmail({
        studentEmail: dest,
        studentName: st.username,
        examTitle: exam.title,
        courseName: courseName,
        startTime: exam.start_time,
        endTime: exam.end_time,
        duration: exam.duration
      });
    }
  } catch (emailErr) {
    console.error('Failed to send exam published emails:', emailErr);
  }
}

const createExam = async (req, res) => {
  const { title, description, duration, start_time, end_time, status, course_id } = req.body;

  if (!title || duration === undefined || duration === null) {
    return res.status(400).json({ message: 'Missing required fields: title and duration' });
  }

  const start_time_val = start_time ? new Date(start_time) : null;
  const end_time_val = end_time ? new Date(end_time) : null;
  const exam_status = status || 'draft';

  try {
    if (course_id) {
      const [courses] = await db.execute('SELECT course_id, assigned_lecturer_id FROM Course WHERE course_id = ?', [course_id]);
      if (courses.length === 0) {
        return res.status(400).json({ message: 'Invalid course_id' });
      }

      // Zero-Trust Enforce: Check if the lecturer owns the course they are linking to, unless admin
      if (req.user.role === 'lecturer' && Number(courses[0].assigned_lecturer_id) !== Number(req.user.user_id)) {
        return res.status(403).json({ message: 'Zero-Trust Policy Violation: You are not authorized to create exams for this course.' });
      }
    }

    const [result] = await db.execute(
      `INSERT INTO Exam (title, description, duration, created_by, start_time, end_time, status, course_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description || null, duration, req.user.user_id, start_time_val, end_time_val, exam_status, course_id || null]
    );

    // If created already-published with a course binding, notify enrolled students.
    // Fire-and-forget so a mail-server failure does not break exam creation.
    if (exam_status === 'published' && course_id) {
      notifyEnrolledStudentsOfPublishedExam(result.insertId);
    }

    return res.status(201).json({
      exam_id: result.insertId,
      title
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getAllExams = async (req, res) => {
  try {
    let query = `
      SELECT e.*, u.username AS creator_username
      FROM Exam e
      JOIN User u ON e.created_by = u.user_id
    `;
    const params = [];

    if (req.user.role === 'student') {
      query += `
        WHERE e.status = ?
        AND (e.course_id IS NULL OR e.course_id IN (SELECT course_id FROM CourseEnrollment WHERE user_id = ?))
      `;
      params.push('published', req.user.user_id);
    } else if (req.user.role === 'lecturer') {
      query += ' WHERE e.created_by = ?';
      params.push(req.user.user_id);
    }

    query += ' ORDER BY e.exam_id DESC';

    const [rows] = await db.execute(query, params);
    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getExamById = async (req, res) => {
  const examId = req.params.id;

  try {
    let examQuery = `
      SELECT e.*, u.username AS creator_username
      FROM Exam e
      JOIN User u ON e.created_by = u.user_id
      WHERE e.exam_id = ?
    `;
    const examParams = [examId];

    if (req.user.role === 'student') {
      examQuery += ' AND e.status = ?';
      examParams.push('published');
    } else if (req.user.role === 'lecturer') {
      examQuery += ' AND e.created_by = ?';
      examParams.push(req.user.user_id);
    }

    const [examRows] = await db.execute(examQuery, examParams);
    if (examRows.length === 0) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (req.user.role === 'student' && examRows[0].course_id !== null) {
      const [enrollment] = await db.execute(
        'SELECT * FROM CourseEnrollment WHERE course_id = ? AND user_id = ?',
        [examRows[0].course_id, req.user.user_id]
      );
      if (enrollment.length === 0) {
        return res.status(403).json({ message: 'You are not enrolled in this course' });
      }
    }

    const [questionRows] = await db.execute(
      'SELECT * FROM Question WHERE exam_id = ? ORDER BY question_order ASC, question_id ASC',
      [examId]
    );

    const questions = questionRows.map((question) => {
      const mapped = { ...question };
      if (mapped.options !== null) {
        try {
          mapped.options = typeof mapped.options === 'string' ? JSON.parse(mapped.options) : mapped.options;
        } catch {
          mapped.options = [];
        }
      }
      return mapped;
    });

    return res.status(200).json({
      ...examRows[0],
      questions
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateExam = async (req, res) => {
  const examId = req.params.id;
  const { title, description, duration, start_time, end_time, status, course_id } = req.body;

  try {
    const [examRows] = await db.execute('SELECT * FROM Exam WHERE exam_id = ?', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const existingExam = examRows[0];
    if (req.user.role === 'lecturer' && Number(existingExam.created_by) !== Number(req.user.user_id)) {
      return res.status(403).json({ message: 'Forbidden: not allowed to update this exam' });
    }

    const fields = [];
    const values = [];

    if (title !== undefined && title !== null) {
      fields.push('title = ?');
      values.push(title);
    }
    if (description !== undefined && description !== null) {
      fields.push('description = ?');
      values.push(description);
    }
    if (duration !== undefined && duration !== null) {
      fields.push('duration = ?');
      values.push(duration);
    }
    if (course_id !== undefined) {
        if (course_id !== null) {
          const [courses] = await db.execute("SELECT course_id, assigned_lecturer_id FROM Course WHERE course_id = ?", [course_id]);
          if (courses.length === 0) return res.status(400).json({ message: "Invalid course_id" });
          if (req.user.role === "lecturer" && Number(courses[0].assigned_lecturer_id) !== Number(req.user.user_id)) return res.status(403).json({ message: "Zero-Trust: Not authorized for this course." });
        }
      fields.push('course_id = ?');
      values.push(course_id);
    }
    if (start_time !== undefined && start_time !== null) {
      fields.push('start_time = ?');
      values.push(new Date(start_time));
    }
    if (end_time !== undefined && end_time !== null) {
      fields.push('end_time = ?');
      values.push(new Date(end_time));
    }
    if (status !== undefined && status !== null) {
      fields.push('status = ?');
      values.push(status);
    }

    if (fields.length > 0) {
      values.push(examId);
      await db.execute(`UPDATE Exam SET ${fields.join(', ')} WHERE exam_id = ?`, values);
    }

    const [updatedRows] = await db.execute('SELECT * FROM Exam WHERE exam_id = ?', [examId]);

    // If status flipped to 'published', notify enrolled students.
    // Fire-and-forget so a mail-server failure does not break exam update.
    if (status === 'published' && existingExam.status !== 'published') {
      notifyEnrolledStudentsOfPublishedExam(examId);
    }

    return res.status(200).json(updatedRows[0]);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteExam = async (req, res) => {
  const examId = req.params.id;

  try {
    const [examRows] = await db.execute('SELECT created_by FROM Exam WHERE exam_id = ?', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (req.user.role !== 'admin' && Number(examRows[0].created_by) !== Number(req.user.user_id)) {
      return res.status(403).json({ message: 'Forbidden: not allowed to delete this exam' });
    }

    await db.execute('DELETE FROM Exam WHERE exam_id = ?', [examId]);
    return res.status(200).json({ message: 'Exam deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const addQuestion = async (req, res) => {
  const examId = req.params.id;
  const { question_text, question_type, options, correct_answer, marks } = req.body;

  if (!question_text || !question_type) {
    return res.status(400).json({ message: 'Missing required fields: question_text and question_type' });
  }

  if (question_type === 'mcq' && (!Array.isArray(options) || options.length < 2)) {
    return res.status(400).json({ message: 'MCQ requires options array with at least 2 items' });
  }

  const question_marks = marks || 1;

  try {
    const [examRows] = await db.execute('SELECT exam_id, created_by FROM Exam WHERE exam_id = ?', [examId]);
    if (examRows.length === 0) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    if (req.user.role !== 'admin' && Number(examRows[0].created_by) !== Number(req.user.user_id)) {
      return res.status(403).json({ message: 'Forbidden: not allowed to add questions to this exam' });
    }

    const serializedOptions = options !== undefined ? JSON.stringify(options) : null;
    const [result] = await db.execute(
      `INSERT INTO Question (exam_id, question_text, question_type, options, correct_answer, marks)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [examId, question_text, question_type, serializedOptions, correct_answer || null, question_marks]
    );

    return res.status(201).json({
      question_id: result.insertId
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getQuestions = async (req, res) => {
  const examId = req.params.id;

  try {
    // Lecturers may only view questions for their own exams (correct_answer is included in the response)
    if (req.user.role === 'lecturer') {
      const [examRows] = await db.execute('SELECT created_by FROM Exam WHERE exam_id = ?', [examId]);
      if (examRows.length === 0) {
        return res.status(404).json({ message: 'Exam not found' });
      }
      if (Number(examRows[0].created_by) !== Number(req.user.user_id)) {
        return res.status(403).json({ message: 'Forbidden: not allowed to view questions for this exam' });
      }
    }

    const [rows] = await db.execute(
      'SELECT * FROM Question WHERE exam_id = ? ORDER BY question_order ASC, question_id ASC',
      [examId]
    );

    const isStudent = req.user.role === 'student';
    const questions = rows.map((question) => {
      const mapped = { ...question };

      if (mapped.options !== null) {
        try {
          mapped.options = typeof mapped.options === 'string' ? JSON.parse(mapped.options) : mapped.options;
        } catch {
          mapped.options = [];
        }
      }

      if (isStudent) {
        delete mapped.correct_answer;
      }

      return mapped;
    });

    return res.status(200).json(questions);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteQuestion = async (req, res) => {
  const { questionId } = req.params;

  try {
    const [questionRows] = await db.execute(
      'SELECT exam_id FROM Question WHERE question_id = ?',
      [questionId]
    );

    if (questionRows.length === 0) {
      return res.status(404).json({ message: 'Question not found' });
    }

    const examId = questionRows[0].exam_id;

    if (req.user.role !== 'admin') {
      const [examRows] = await db.execute(
        'SELECT created_by FROM Exam WHERE exam_id = ?',
        [examId]
      );

      if (examRows.length === 0 || Number(examRows[0].created_by) !== Number(req.user.user_id)) {
        return res.status(403).json({ message: 'Forbidden: not allowed to delete this question' });
      }
    }

    await db.execute('DELETE FROM Question WHERE question_id = ?', [questionId]);
    return res.status(200).json({ message: 'Question deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  createExam,
  getAllExams,
  getExamById,
  updateExam,
  deleteExam,
  addQuestion,
  getQuestions,
  deleteQuestion
};
