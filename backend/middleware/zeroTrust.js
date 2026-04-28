const db = require('../config/db');
const jwt = require('jsonwebtoken');

// Must match authController.js — otherwise tokens verify with a different secret than login used.
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Zero-Trust Middleware: Verifies JWT auth, client IP consistency, user existence, and logs all API access.
 */
const verifyZeroTrust = async (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ 
      error: 'Server configuration error' 
    });
  }
  try {
    // ---- [ZT: Enforce presence of valid JWT on every request] ----
    const authHeader = req.headers.authorization || '';
    const tokenMatch = authHeader.match(/^Bearer (.+)$/);
    if (!tokenMatch) {
      return res.status(401).json({ message: 'No token provided' });
    }
    const token = tokenMatch[1];

    // ---- [ZT: Verify JWT and handle all error cases strictly] ----
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
      }
      return res.status(403).json({ message: 'Invalid token' });
    }

    // ---- [ZT: Ensure user still exists in DB (prevents access with stale tokens)] ----
    // JWT from auth/login uses `userId` (camelCase); support `user_id` if present elsewhere
    const userId = payload.userId ?? payload.user_id;
    if (userId === undefined || userId === null) {
      return res.status(403).json({ message: 'Invalid token payload' });
    }
    const [users] = await db.execute('SELECT * FROM User WHERE user_id = ?', [userId]);
    if (!users.length) {
      return res.status(401).json({ message: 'User not found' });
    }
    const user = users[0];

    // ---- [ZT: Tie session to client IP; detect and block IP changes] ----
    const clientIp = req.ip || req.connection?.remoteAddress || '';
    if (payload.ip && payload.ip !== clientIp) {
      // Insert ActivityLog for IP mismatch
      await db.execute(
        `INSERT INTO ActivityLog (user_id, activity_type, description) VALUES (?, ?, ?)`,
        [user.user_id, 'IP_MISMATCH', `Session IP mismatch: JWT IP ${payload.ip}, Request IP ${clientIp}`]
      );
      return res.status(403).json({ message: 'Session invalid: location changed' });
    }

    // ---- [ZT: Attach verified user to request for downstream use (RBAC etc.)] ----
    // Controllers expect req.user.user_id (same as User.user_id from DB).
    req.user = user;

    // ---- [ZT: Log every API access for auditing and anomaly detection] ----
    await db.execute(
      `INSERT INTO ActivityLog (user_id, activity_type, description) VALUES (?, ?, ?)`,
      [
        user.user_id,
        'API_ACCESS',
        `Access: [${req.method}] ${req.originalUrl || req.url}`
      ]
    );

    // All checks passed
    next();
  } catch (err) {
    // Log to stderr explicitly — some dev setups swallow console output; stderr is more reliable.
    const detail = err && err.stack ? err.stack : String(err);
    process.stderr.write(`[ZeroTrust] ${detail}\n`);
    console.error('Zero Trust Middleware Error:', err);

    const body = { message: 'Internal server error (zero-trust enforcement)' };
    // Surface real error in local dev so REST Client shows it even when the Node terminal is blank.
    if (process.env.NODE_ENV !== 'production') {
      body.error = err && err.message ? err.message : String(err);
    }
    return res.status(500).json(body);
  }
};

/**
 * Zero-Trust RBAC Middleware Generator: Only allows access for users matching allowed role(s).
 * @param  {...string} roles  One or more allowed role strings (e.g., 'admin', 'student')
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    // ---- [ZT: Enforce strict Role-Based Access Control (RBAC)] ----
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
};

module.exports = {
  verifyZeroTrust,
  requireRole,
};