const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/schema');
const { requireAdmin } = require('../middleware/auth');
const { createAuditEntry } = require('../middleware/audit');
const { generateOTPSecret } = require('../utils/otp');

const router = express.Router();

/**
 * GET /api/users — List all users (admin only)
 */
router.get('/', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT id, username, email, role, status, otp_enabled, created_at,
             failed_login_attempts, locked_until
      FROM users
      ORDER BY created_at DESC
    `).all();

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * POST /api/users — Create a new user (admin only)
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    const { secret } = generateOTPSecret(username);

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role, status, otp_secret)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(userId, username, email, hashedPassword, role || 'user', secret);

    createAuditEntry(req.user.id, req.user.username, 'USER_CREATED', 'users', userId,
      { username, email, role: role || 'user' }, req.ip);

    res.status(201).json({ message: 'User created', userId });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * PUT /api/users/:id/role — Update user role (admin only)
 */
router.put('/:id/role', requireAdmin, (req, res) => {
  try {
    const { role } = req.body;
    if (!role || !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "admin" or "user".' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);

    createAuditEntry(req.user.id, req.user.username, 'USER_ROLE_CHANGED', 'users', req.params.id,
      { username: user.username, oldRole: user.role, newRole: role }, req.ip);

    res.json({ message: 'User role updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

/**
 * PUT /api/users/:id/status — Suspend/activate user (admin only)
 */
router.put('/:id/status', requireAdmin, (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be "active" or "suspended".' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-suspension
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own status' });
    }

    db.prepare('UPDATE users SET status = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?')
      .run(status, req.params.id);

    createAuditEntry(req.user.id, req.user.username, `USER_${status.toUpperCase()}`, 'users', req.params.id,
      { username: user.username }, req.ip);

    // Notify the user
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), req.params.id,
      status === 'suspended' ? 'Account Suspended' : 'Account Activated',
      status === 'suspended' ? 'Your account has been suspended by an administrator.' : 'Your account has been reactivated.',
      status === 'suspended' ? 'alert' : 'success');

    // If unlocking, also reset lockout
    if (status === 'active') {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
    }

    res.json({ message: `User ${status === 'active' ? 'activated' : 'suspended'} successfully` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * DELETE /api/users/:id — Delete user (admin only)
 */
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

    createAuditEntry(req.user.id, req.user.username, 'USER_DELETED', 'users', req.params.id,
      { username: user.username, email: user.email }, req.ip);

    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
