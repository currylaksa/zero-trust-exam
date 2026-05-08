const express = require('express');
const router = express.Router();

const {
  login,
  setupMFA,
  verifyMFA,
  refreshToken
} = require('../controllers/authController');

const { verifyZeroTrust } = require('../middleware/zeroTrust');

// Public routes — setup-mfa & verify-mfa authenticate via tokens-in-body
// (setupToken / tempToken) since the user has not yet earned a full JWT.
// NOTE: /register is intentionally NOT exposed. All account creation goes
// through POST /api/users (admin-only) so role escalation via self-signup
// is impossible. The authController.register function remains as dead code
// and can be deleted in a future cleanup.
router.post('/login', login);
router.post('/verify-mfa', verifyMFA);
router.post('/setup-mfa', setupMFA);

// Protected routes
router.post('/refresh', verifyZeroTrust, refreshToken);

module.exports = router;