const express = require('express');
const router = express.Router();

const {
  getActiveSessions,
  getAlerts,
  getAuditLogs,
  markAlertReviewed
} = require('../controllers/monitoringController');

const { getSessionRiskHistory } = require('../controllers/riskScoreController');

const { verifyZeroTrust, requireRole } = require('../middleware/zeroTrust');

router.get('/sessions', verifyZeroTrust, requireRole('lecturer', 'admin'), getActiveSessions);
router.get('/alerts', verifyZeroTrust, requireRole('lecturer', 'admin'), getAlerts);
router.get('/audit-logs', verifyZeroTrust, requireRole('lecturer', 'admin'), getAuditLogs);
router.put('/alerts/:id/review', verifyZeroTrust, requireRole('lecturer', 'admin'), markAlertReviewed);

// Control #26 — per-session score history for the dashboard detail modal.
router.get('/sessions/:id/risk-history', verifyZeroTrust, requireRole('lecturer', 'admin'), getSessionRiskHistory);

module.exports = router;