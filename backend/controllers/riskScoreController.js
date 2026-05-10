const db = require('../config/db');

// JSON columns are returned as parsed objects on MySQL 8 and as strings
// on MariaDB (LONGTEXT). Normalize so the frontend always sees an array.
const parseJSONField = (val) => {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
};

/**
 * GET /api/monitoring/sessions/:id/risk-history
 *
 * Returns the most-recent N risk scores for one session, ordered chronologically
 * (oldest first) so the frontend can render a left-to-right sparkline directly.
 * Default limit 30, max 200.
 *
 * Auth (mounted in routes/monitoring.js): verifyZeroTrust + requireRole('lecturer','admin').
 * Lecturer ownership check inline — same pattern as monitoringController.markAlertReviewed.
 */
const getSessionRiskHistory = async (req, res) => {
  const sessionId = req.params.id;
  if (!sessionId) return res.status(400).json({ message: 'Missing session_id' });

  try {
    // Lecturer ownership check: only allow access to sessions whose exam
    // was created by this lecturer. Admins skip the check.
    if (req.user.role === 'lecturer') {
      const [ownerRows] = await db.execute(
        `SELECT e.created_by
           FROM ExamSession s
           JOIN Exam e ON s.exam_id = e.exam_id
          WHERE s.session_id = ?`,
        [sessionId]
      );

      if (ownerRows.length === 0) {
        return res.status(404).json({ message: 'Session not found' });
      }
      if (Number(ownerRows[0].created_by) !== Number(req.user.user_id)) {
        return res.status(403).json({ message: 'Forbidden: this session does not belong to your exam' });
      }
    }

    // Clamp limit to a sane window. db.query (not execute) is required here
    // because mysql2's prepared-statement protocol doesn't accept LIMIT
    // placeholders in some configurations — same workaround used in
    // monitoringController.getAuditLogs.
    const requested = parseInt(req.query.limit, 10);
    const limit = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 30, 200));

    const [rows] = await db.query(
      `SELECT score_id, risk_score, risk_level, contributing_factors, scored_at
         FROM SessionRiskScore
        WHERE session_id = ?
        ORDER BY scored_at DESC
        LIMIT ?`,
      [sessionId, limit]
    );

    // Reverse so the response is oldest -> newest, sparkline-friendly.
    rows.reverse();

    const normalized = rows.map((r) => ({
      ...r,
      contributing_factors: parseJSONField(r.contributing_factors),
    }));

    return res.status(200).json({
      session_id: Number(sessionId),
      count: normalized.length,
      scores: normalized,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  getSessionRiskHistory,
};
