const express = require('express');
const router = express.Router();

const {
  getActiveSessions,
  getAlerts,
  getAuditLogs,
  markAlertReviewed
} = require('../controllers/monitoringController');

const { verifyZeroTrust, requireRole } = require('../middleware/zeroTrust');

router.get('/sessions', verifyZeroTrust, requireRole('lecturer', 'admin'), getActiveSessions);
router.get('/alerts', verifyZeroTrust, requireRole('lecturer', 'admin'), getAlerts);
router.get('/audit-logs', verifyZeroTrust, requireRole('lecturer', 'admin'), getAuditLogs);
router.put('/alerts/:id/review', verifyZeroTrust, requireRole('lecturer', 'admin'), markAlertReviewed);

module.exports = router;