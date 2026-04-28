const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE_MIN = process.env.JWT_EXPIRES_IN || '15m';
const TEMP_JWT_EXPIRE = 5 * 60; // 5 minutes in seconds — login MFA flow
const SETUP_JWT_EXPIRE = 10 * 60; // 10 minutes in seconds — first-time MFA setup flow
const VALID_ROLES = ['student', 'lecturer', 'staff', 'admin'];

const register = async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password || !role) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  try {
    // Check if email exists
    const [userRows] = await db.execute('SELECT user_id FROM User WHERE email = ?', [email]);
    if (userRows.length > 0) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Insert into User table
    const [userResult] = await db.execute(
      'INSERT INTO User (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hash, role]
    );
    const newId = userResult.insertId;

    // If role is student, insert into Student
    if (role === 'student') {
      await db.execute(
        'INSERT INTO Student (user_id) VALUES (?)',
        [newId]
      );
    }
    // If role is admin, insert into Admin
    if (role === 'admin') {
      await db.execute(
        'INSERT INTO Admin (user_id, permissions) VALUES (?, ?)',
        [newId, null]
      );
    }

    return res.status(201).json({ message: 'User registered successfully', userId: newId });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const login = async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ 
      error: 'Server configuration error' 
    });
  }
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Missing email or password' });

  try {
    // Query for user
    const [rows] = await db.execute('SELECT * FROM User WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const user = rows[0];

    // Compare password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // MFA enforcement: every user must complete MFA before receiving a full JWT.
    if (user.mfa_enabled) {
      // Existing user — issue short-lived temp token for OTP verification
      const tempToken = jwt.sign(
        { userId: user.user_id, stage: 'mfa' },
        JWT_SECRET,
        { expiresIn: TEMP_JWT_EXPIRE }
      );
      return res.status(200).json({ mfaRequired: true, tempToken });
    }

    // First-time login (mfa_enabled is false) — issue setup token instead of full JWT.
    // The user must complete MFA enrollment before any further access is granted.
    const setupToken = jwt.sign(
      { userId: user.user_id, stage: 'mfa_setup' },
      JWT_SECRET,
      { expiresIn: SETUP_JWT_EXPIRE }
    );
    return res.status(200).json({ requiresMfaSetup: true, setupToken });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const setupMFA = async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // The setup flow uses a stage='mfa_setup' token issued by login().
  // Token is passed in body (not header) to keep verifyZeroTrust off this route,
  // so the route can be hit before the user has any full JWT.
  const { setupToken } = req.body || {};
  if (!setupToken) {
    return res.status(401).json({ message: 'Missing setup token' });
  }

  let decoded;
  try {
    decoded = jwt.verify(setupToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired setup token' });
  }

  if (decoded.stage !== 'mfa_setup' || !decoded.userId) {
    return res.status(401).json({ message: 'Invalid setup token' });
  }

  try {
    const [rows] = await db.execute('SELECT * FROM User WHERE user_id = ?', [decoded.userId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const user = rows[0];

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `UTM SecureExam:${user.email}`,
      length: 32
    });

    // Update user's mfa_secret (DO NOT enable mfa yet — that happens in verifyMFA)
    await db.execute(
      'UPDATE User SET mfa_secret = ? WHERE user_id = ?',
      [secret.base32, user.user_id]
    );

    // Generate QR code
    const dataUrl = await qrcode.toDataURL(secret.otpauth_url);

    return res.status(200).json({
      qrCode: dataUrl,
      secret: secret.base32
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const verifyMFA = async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ 
      error: 'Server configuration error' 
    });
  }
  const { tempToken, otp } = req.body;
  if (!tempToken || !otp) {
    return res.status(400).json({ message: 'Missing tempToken or otp' });
  }

  try {
    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    
    // Accept either stage: 'mfa' (login flow) OR a normal token (setup flow)
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ message: 'Invalid MFA token' });
    }

    // Find user
    const [rows] = await db.execute('SELECT * FROM User WHERE user_id = ?', [decoded.userId]);
    if (rows.length === 0 || !rows[0].mfa_secret) {
      return res.status(400).json({ message: 'MFA setup not found' });
    }
    const user = rows[0];

    // Verify TOTP
    const isValid = speakeasy.totp.verify({
      secret: user.mfa_secret,
      encoding: 'base32',
      token: otp,
      window: 1
    });

    if (!isValid) {
      // Return 400 instead of 401 so the frontend axios interceptor doesn't log the user out immediately for a typo
      return res.status(400).json({ message: 'Invalid OTP code' });
    }

    if (!user.mfa_enabled) {
      await db.execute('UPDATE User SET mfa_enabled = TRUE WHERE user_id = ?', [user.user_id]);
    }

    // Issue full JWT
    const clientIp = req.ip || req.connection?.remoteAddress || '';
    const payload = {
      userId: user.user_id,
      email: user.email,
        username: user.username,
      role: user.role,
      ip: clientIp
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRE_MIN });

    // Log LOGIN now that MFA is verified — covers both the login flow
    // (stage='mfa') and the first-time setup flow (stage='mfa_setup').
    await db.execute(
      'INSERT INTO ActivityLog (user_id, activity_type, description) VALUES (?, ?, ?)',
      [user.user_id, 'LOGIN', `User login (MFA verified): ${user.email}`]
    );

    return res.status(200).json({
      token,
      user: {
        userId: user.user_id,
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const refreshToken = async (req, res) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const clientIp = req.ip || req.connection?.remoteAddress || '';
    const payload = {
      userId: user.user_id,
      email: user.email,
      username: user.username,
      role: user.role,
      ip: clientIp
    };

    // Use JWT_EXPIRE_MIN which is already defined in this file (15 * 60)
    const newToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRE_MIN });

    await db.execute(
      'INSERT INTO ActivityLog (user_id, activity_type, description) VALUES (?, ?, ?)',
      [user.user_id, 'TOKEN_REFRESH', `Token refreshed for: ${user.email}`]
    );

    return res.status(200).json({ token: newToken });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  register,
  login,
  setupMFA,
  verifyMFA,
  refreshToken
};