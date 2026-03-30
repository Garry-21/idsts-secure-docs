const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/schema');
const { generateToken } = require('../middleware/auth');
const { generateOTPSecret, verifyOTP, generateCurrentOTP } = require('../utils/otp');
const { createAuditEntry } = require('../middleware/audit');
const QRCode = require('qrcode');

const router = express.Router();

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_DURATION = parseInt(process.env.LOCKOUT_DURATION) || 900000; // 15 min

/**
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = getDb();

    // Check if username or email already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = uuidv4();

    // Generate OTP secret
    const { secret, otpauthUrl } = generateOTPSecret(username);

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, status, otp_secret)
      VALUES (?, ?, ?, ?, 'user', 'active', ?)
    `).run(userId, username, email, hashedPassword, secret);

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    createAuditEntry(userId, username, 'USER_REGISTERED', 'users', userId, { email }, req.ip);

    // Send notification to all admins
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
    admins.forEach(admin => {
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, type)
        VALUES (?, ?, ?, ?, 'info')
      `).run(uuidv4(), admin.id, 'New User Registered', `User "${username}" has registered.`);
    });

    res.status(201).json({
      message: 'Registration successful',
      userId,
      otp: {
        secret,
        qrCode: qrCodeDataUrl,
        otpauthUrl,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is locked
    if (user.locked_until && Date.now() < user.locked_until) {
      const remaining = Math.ceil((user.locked_until - Date.now()) / 60000);
      return res.status(423).json({ error: `Account locked. Try again in ${remaining} minutes.` });
    }

    // Check if account is suspended
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account is suspended. Contact admin.' });
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      // Increment failed attempts
      const attempts = (user.failed_login_attempts || 0) + 1;
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?')
          .run(attempts, Date.now() + LOCKOUT_DURATION, user.id);

        createAuditEntry(user.id, user.username, 'ACCOUNT_LOCKED', 'users', user.id,
          { reason: 'Too many failed login attempts' }, req.ip);

        // Notify admins
        const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
        admins.forEach(admin => {
          db.prepare(`
            INSERT INTO notifications (id, user_id, title, message, type)
            VALUES (?, ?, ?, ?, 'alert')
          `).run(uuidv4(), admin.id, 'Account Locked',
            `User "${user.username}" locked after ${MAX_LOGIN_ATTEMPTS} failed login attempts from IP ${req.ip}`);
        });

        return res.status(423).json({ error: 'Account locked due to too many failed attempts' });
      } else {
        db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(attempts, user.id);
      }

      createAuditEntry(user.id, user.username, 'LOGIN_FAILED', 'users', user.id,
        { attempt: attempts }, req.ip);

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset failed attempts
    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

    // Check if OTP is enabled
    if (user.otp_enabled && user.otp_secret) {
      // Return a temporary token for OTP verification
      const tempToken = generateToken(user.id, user.role);
      return res.json({
        requireOTP: true,
        tempToken,
        message: 'OTP verification required',
      });
    }

    // Generate JWT
    const token = generateToken(user.id, user.role);
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
      .run(sessionId, user.id, token, expiresAt);

    createAuditEntry(user.id, user.username, 'LOGIN_SUCCESS', 'users', user.id, {}, req.ip);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/verify-otp
 */
router.post('/verify-otp', (req, res) => {
  try {
    const { tempToken, otpCode } = req.body;

    if (!tempToken || !otpCode) {
      return res.status(400).json({ error: 'Token and OTP code are required' });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET || 'idsts_super_secret_jwt_key_2024_secure');

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);

    if (!user || !user.otp_secret) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    if (!verifyOTP(otpCode, user.otp_secret)) {
      createAuditEntry(user.id, user.username, 'OTP_FAILED', 'users', user.id, {}, req.ip);
      return res.status(401).json({ error: 'Invalid OTP code' });
    }

    // Generate full session token
    const token = generateToken(user.id, user.role);
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
      .run(sessionId, user.id, token, expiresAt);

    createAuditEntry(user.id, user.username, 'OTP_VERIFIED', 'users', user.id, {}, req.ip);

    res.json({
      message: 'OTP verified',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

/**
 * POST /api/auth/enable-otp
 */
router.post('/enable-otp', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Auth required' });

    const jwt = require('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'idsts_super_secret_jwt_key_2024_secure');

    const db = getDb();
    db.prepare('UPDATE users SET otp_enabled = 1 WHERE id = ?').run(decoded.userId);

    res.json({ message: 'OTP enabled successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to enable OTP' });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const db = getDb();
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * GET /api/auth/me — get current user info
 */
router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const jwt = require('jsonwebtoken');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'idsts_super_secret_jwt_key_2024_secure');

    const db = getDb();
    const user = db.prepare('SELECT id, username, email, role, status, otp_enabled, created_at FROM users WHERE id = ?').get(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
