const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyZeroTrust, requireRole } = require('../middleware/zeroTrust');


router.get('/stats', verifyZeroTrust, requireRole('admin'), adminController.getStats);

module.exports = router;