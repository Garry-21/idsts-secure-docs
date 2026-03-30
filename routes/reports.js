const express = require('express');
const { getDb } = require('../database/schema');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/reports/overview — System overview report (admin only)
 */
router.get('/overview', requireAdmin, (req, res) => {
  try {
    const db = getDb();

    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get().count;
    const suspendedUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'suspended'").get().count;
    const totalDocuments = db.prepare('SELECT COUNT(*) as count FROM documents').get().count;
    const totalAuditLogs = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;

    // Storage used (sum of file sizes)
    const storageUsed = db.prepare('SELECT COALESCE(SUM(size), 0) as total FROM documents').get().total;

    // Recent activity (last 7 days)
    const recentActivity = db.prepare(`
      SELECT date(timestamp) as date, COUNT(*) as count
      FROM audit_logs
      WHERE timestamp >= datetime('now', '-7 days')
      GROUP BY date(timestamp)
      ORDER BY date ASC
    `).all();

    // Document uploads over time (last 30 days)
    const uploadTrend = db.prepare(`
      SELECT date(uploaded_at) as date, COUNT(*) as count
      FROM documents
      WHERE uploaded_at >= datetime('now', '-30 days')
      GROUP BY date(uploaded_at)
      ORDER BY date ASC
    `).all();

    // Top users by document count
    const topUploaders = db.prepare(`
      SELECT u.username, COUNT(d.id) as doc_count
      FROM users u
      LEFT JOIN documents d ON u.id = d.owner_id
      GROUP BY u.id
      ORDER BY doc_count DESC
      LIMIT 10
    `).all();

    // Failed login attempts
    const failedLogins = db.prepare(`
      SELECT COUNT(*) as count FROM audit_logs
      WHERE action LIKE '%FAILED%' AND timestamp >= datetime('now', '-7 days')
    `).get().count;

    res.json({
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalDocuments,
      totalAuditLogs,
      storageUsed,
      recentActivity,
      uploadTrend,
      topUploaders,
      failedLogins,
    });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

/**
 * GET /api/reports/export/users — Export users as CSV (admin only)
 */
router.get('/export/users', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, username, email, role, status, created_at FROM users').all();

    const csv = [
      'ID,Username,Email,Role,Status,Created At',
      ...users.map(u => `${u.id},${u.username},${u.email},${u.role},${u.status},${u.created_at}`),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users_report.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export users' });
  }
});

/**
 * GET /api/reports/export/audit — Export audit logs as CSV (admin only)
 */
router.get('/export/audit', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 1000').all();

    const csv = [
      'ID,User ID,Username,Action,Resource Type,Resource ID,IP Address,Timestamp',
      ...logs.map(l =>
        `${l.id},${l.user_id || ''},${l.username || ''},${l.action},${l.resource_type || ''},${l.resource_id || ''},${l.ip_address || ''},${l.timestamp}`
      ),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit_logs_report.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

/**
 * GET /api/reports/export/documents — Export documents as CSV (admin only)
 */
router.get('/export/documents', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const docs = db.prepare(`
      SELECT d.id, d.original_name, d.mime_type, d.size, u.username as owner, d.uploaded_at
      FROM documents d
      LEFT JOIN users u ON d.owner_id = u.id
    `).all();

    const csv = [
      'ID,Filename,Type,Size (bytes),Owner,Uploaded At',
      ...docs.map(d => `${d.id},${d.original_name},${d.mime_type || ''},${d.size},${d.owner || ''},${d.uploaded_at}`),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="documents_report.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export documents' });
  }
});

module.exports = router;
