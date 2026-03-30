const express = require('express');
const { getDb } = require('../database/schema');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/notifications — Get user's notifications
 */
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id);

    const unreadCount = db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(req.user.id).count;

    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * PUT /api/notifications/:id/read — Mark notification as read
 */
router.put('/:id/read', requireAuth, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

/**
 * PUT /api/notifications/read-all — Mark all notifications as read
 */
router.put('/read-all', requireAuth, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

module.exports = router;
