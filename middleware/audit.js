const { getDb } = require('../database/schema');
const { v4: uuidv4 } = require('uuid');

/**
 * Middleware: log every API request to the audit_logs table
 */
function auditLog(req, res, next) {
  // Skip static files and non-API routes
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  const startTime = Date.now();

  // Capture the original json and end methods
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    // Log after response is sent
    try {
      const db = getDb();
      const userId = req.user?.id || null;
      const username = req.user?.username || 'anonymous';
      const action = `${req.method} ${req.path}`;
      const resourceType = extractResourceType(req.path);
      const resourceId = extractResourceId(req.path);
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const duration = Date.now() - startTime;

      const details = JSON.stringify({
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        method: req.method,
        query: req.query,
      });

      db.prepare(`
        INSERT INTO audit_logs (id, user_id, username, action, resource_type, resource_id, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), userId, username, action, resourceType, resourceId, details, ip);
    } catch (err) {
      console.error('Audit log error:', err.message);
    }

    return originalJson(body);
  };

  next();
}

function extractResourceType(path) {
  const parts = path.split('/').filter(Boolean);
  // /api/documents/123 -> 'documents'
  if (parts.length >= 2) return parts[1];
  return null;
}

function extractResourceId(path) {
  const parts = path.split('/').filter(Boolean);
  // /api/documents/123 -> '123'
  if (parts.length >= 3) return parts[2];
  return null;
}

/**
 * Helper: create an audit log entry directly
 */
function createAuditEntry(userId, username, action, resourceType, resourceId, details, ip) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, username, action, resource_type, resource_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, username, action, resourceType, resourceId, JSON.stringify(details), ip);
  } catch (err) {
    console.error('Audit entry error:', err.message);
  }
}

module.exports = { auditLog, createAuditEntry };
