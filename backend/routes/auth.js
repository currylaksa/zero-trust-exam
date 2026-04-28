const express = require('express');
const router = express.Router();

const {
  register,
  login,
  setupMFA,
  verifyMFA,
  refreshToken
} = require('../controllers/authController');

const { verifyZeroTrust } = require('../middleware/zeroTrust');

// Public routes — setup-mfa & verify-mfa authenticate via tokens-in-body
// (setupToken / tempToken) since the user has not yet earned a full JWT.
router.post('/register', register);
router.post('/login', login);
router.post('/verify-mfa', verifyMFA);
router.post('/setup-mfa', setupMFA);

// Protected routes
router.post('/refresh', verifyZeroTrust, refreshToken);

module.exports = router;