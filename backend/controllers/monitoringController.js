const db = require('../config/db');

const getActiveSessions = async (req, res) => {
  try {
    const isLecturer = req.user.role === 'lecturer';
    const params = [];

    // Lecturers only see sessions from exams they created; admins see all
    let whereClause = `WHERE s.status IN ('in_progress', 'flagged')`;
    if (isLecturer) {
      whereClause += ' AND e.created_by = ?';
      params.push(req.user.user_id);
    }

    const [rows] = await db.execute(
      `SELECT
         s.session_id,
         s.exam_id,
         s.user_id,
         s.start_time,
         s.end_time,
         s.status,
         s.ip_address,
         s.device_info,
         s.tab_switch_count,
         ts.total_away_seconds,
         s.fullscreen_exit_count,
         u.username,
         u.email,
         e.title AS exam_title
       FROM ExamSession s
       JOIN User u ON s.user_id = u.user_id
       JOIN Exam e ON s.exam_id = e.exam_id
       LEFT JOIN (
         SELECT fa.session_id, SUM(COALESCE(fa.duration_away_seconds, 0)) AS total_away_seconds
         FROM FlaggedActivity fa
         JOIN ActivityLog al ON fa.log_id = al.log_id
         WHERE al.activity_type = 'TAB_SWITCH'
         GROUP BY fa.session_id
       ) ts ON ts.session_id = s.session_id
       ${whereClause}
       ORDER BY s.start_time DESC`,
      params
    );

    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getAlerts = async (req, res) => {
  try {
    const isLecturer = req.user.role === 'lecturer';
    const params = [false];

    // Lecturers only see alerts from exams they created; admins see all
    let whereClause = `WHERE fa.reviewed = ?`;
    if (isLecturer) {
      whereClause += ' AND e.created_by = ?';
      params.push(req.user.user_id);
    }

    const [rows] = await db.execute(
      `SELECT
         fa.flag_id,
         fa.log_id,
         fa.session_id,
         fa.flag_reason,
         fa.severity,
        fa.duration_away_seconds,
         fa.flagged_at,
         fa.reviewed,
         al.activity_type,
         al.description,
         al.timestamp,
         s.exam_id,
         s.user_id,
         u.username,
         e.title AS exam_title
       FROM FlaggedActivity fa
       JOIN ActivityLog al ON fa.log_id = al.log_id
       JOIN ExamSession s ON fa.session_id = s.session_id
       JOIN User u ON s.user_id = u.user_id
       JOIN Exam e ON s.exam_id = e.exam_id
       ${whereClause}
       ORDER BY fa.flagged_at DESC`,
      params
    );

    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getAuditLogs = async (req, res) => {
  const { user_id, session_id, activity_type, date, search } = req.query;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const isLecturer = req.user.role === 'lecturer';

  try {
    // Lecturers only see logs from sessions in their own exams.
    // INNER JOINs on ExamSession and Exam automatically exclude non-session logs.
    // Admins keep the original unrestricted view.
    const lecturerJoin = isLecturer
      ? `INNER JOIN ExamSession es ON al.session_id = es.session_id
         INNER JOIN Exam e ON es.exam_id = e.exam_id`
      : '';

    let whereClause = isLecturer ? `WHERE e.created_by = ?` : `WHERE 1 = 1`;
    const params = isLecturer ? [req.user.user_id] : [];

    if (user_id !== undefined) {
      whereClause += ' AND al.user_id = ?';
      params.push(user_id);
    }

    if (session_id !== undefined) {
      whereClause += ' AND al.session_id = ?';
      params.push(session_id);
    }

    if (activity_type) {
      whereClause += ' AND al.activity_type = ?';
      params.push(activity_type);
    }

    if (date) {
      whereClause += ' AND DATE(al.timestamp) = ?';
      params.push(date);
    }

    if (search) {
      whereClause += ' AND (u.username LIKE ? OR u.email LIKE ? OR al.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM ActivityLog al
      LEFT JOIN User u ON al.user_id = u.user_id
      ${lecturerJoin}
      ${whereClause}
    `;
    const [countRows] = await db.query(countQuery, params);
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const query = `
      SELECT
        al.log_id,
        al.session_id,
        al.user_id,
        al.timestamp,
        al.activity_type,
        al.description,
        u.username
      FROM ActivityLog al
      LEFT JOIN User u ON al.user_id = u.user_id
      ${lecturerJoin}
      ${whereClause}
      ORDER BY al.timestamp DESC
      LIMIT ? OFFSET ?
    `;

    // We use db.query which accepts integers for limit/offset.
    params.push(limit, offset);

    const [rows] = await db.query(query, params);

    return res.status(200).json({
      logs: rows,
      total,
      page,
      totalPages
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const markAlertReviewed = async (req, res) => {
  const flagId = req.params.id;

  try {
    // Lecturers may only review alerts that belong to their own exams
    if (req.user.role !== 'admin') {
      const [ownerRows] = await db.execute(
        `SELECT e.created_by
         FROM FlaggedActivity fa
         JOIN ExamSession s ON fa.session_id = s.session_id
         JOIN Exam e ON s.exam_id = e.exam_id
         WHERE fa.flag_id = ?`,
        [flagId]
      );

      if (ownerRows.length === 0) {
        return res.status(404).json({ message: 'Alert not found' });
      }

      if (Number(ownerRows[0].created_by) !== Number(req.user.user_id)) {
        return res.status(403).json({ message: 'Forbidden: this alert does not belong to your exam' });
      }
    }

    const [result] = await db.execute(
      'UPDATE FlaggedActivity SET reviewed = ? WHERE flag_id = ?',
      [true, flagId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    return res.status(200).json({ message: 'Alert marked as reviewed' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  getActiveSessions,
  getAlerts,
  getAuditLogs,
  markAlertReviewed
};