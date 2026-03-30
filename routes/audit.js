const express = require('express');
const { getDb } = require('../database/schema');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/audit — Get audit logs with filtering (admin only)
 */
router.get('/', requireAdmin, (req, res) => {
  try {
    const { user, action, from, to, limit = 100, offset = 0 } = req.query;
    const db = getDb();

    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (user) {
      sql += ' AND (username LIKE ? OR user_id = ?)';
      params.push(`%${user}%`, user);
    }

    if (action) {
      sql += ' AND action LIKE ?';
      params.push(`%${action}%`);
    }

    if (from) {
      sql += ' AND timestamp >= ?';
      params.push(from);
    }

    if (to) {
      sql += ' AND timestamp <= ?';
      params.push(to);
    }

    // Get total count
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = db.prepare(countSql).get(...params).total;

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const logs = db.prepare(sql).all(...params);

    res.json({ logs, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error('Audit query error:', err);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

/**
 * GET /api/audit/stats — Get audit statistics (admin only)
 */
router.get('/stats', requireAdmin, (req, res) => {
  try {
    const db = getDb();

    const totalLogs = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;
    const todayLogs = db.prepare(
      "SELECT COUNT(*) as count FROM audit_logs WHERE date(timestamp) = date('now')"
    ).get().count;

    const topActions = db.prepare(`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `).all();

    const recentFailures = db.prepare(`
      SELECT * FROM audit_logs
      WHERE action LIKE '%FAILED%' OR action LIKE '%UNAUTHORIZED%'
      ORDER BY timestamp DESC
      LIMIT 20
    `).all();

    res.json({ totalLogs, todayLogs, topActions, recentFailures });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get audit stats' });
  }
});

module.exports = router;
