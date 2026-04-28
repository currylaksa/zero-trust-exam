const express = require('express');
const router = express.Router();
const regulationsController = require('../controllers/regulationsController');

// Public route for fetching zero trust regulations
router.get('/', regulationsController.getRegulations);

module.exports = router;
