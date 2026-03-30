const jwt = require('jsonwebtoken');
const { getDb } = require('../database/schema');

const JWT_SECRET = process.env.JWT_SECRET || 'idsts_super_secret_jwt_key_2024_secure';

/**
 * Middleware: require a valid JWT token
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if session still exists
    const db = getDb();
    const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND user_id = ?').get(token, decoded.userId);
    if (!session) {
      return res.status(401).json({ error: 'Session expired or invalidated' });
    }

    // Check session expiry
    if (new Date(session.expires_at) < new Date()) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
      return res.status(401).json({ error: 'Session expired' });
    }

    // Check user status
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    if (!user || user.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended or not found' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
    };
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware: require admin role
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

/**
 * Generate a JWT token
 */
function generateToken(userId, role) {
  return jwt.sign(
    { userId, role },
    JWT_SECRET,
    { expiresIn: process.env.SESSION_EXPIRY || '24h' }
  );
}

module.exports = { requireAuth, requireAdmin, generateToken, JWT_SECRET };
