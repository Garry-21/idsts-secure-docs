const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/schema');
const { requireAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');
const { createAuditEntry } = require('../middleware/audit');

const router = express.Router();

// Configure multer for file uploads (temp storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

const UPLOADS_DIR = process.env.VERCEL 
  ? path.join('/tmp', 'uploads')
  : process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'uploads')
    : path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * POST /api/documents/upload — Upload and encrypt a file
 */
router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { originalname, mimetype, size, buffer } = req.file;
    const docId = uuidv4();
    const encryptedFilename = `${docId}.enc`;

    // Encrypt the file
    const { encrypted, iv } = encrypt(buffer);

    // Write encrypted file to disk
    const filePath = path.join(UPLOADS_DIR, encryptedFilename);
    fs.writeFileSync(filePath, encrypted);

    // Save metadata to database
    const db = getDb();
    db.prepare(`
      INSERT INTO documents (id, filename, original_name, mime_type, size, owner_id, encryption_iv)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(docId, encryptedFilename, originalname, mimetype, size, req.user.id, iv);

    createAuditEntry(req.user.id, req.user.username, 'DOCUMENT_UPLOADED', 'documents', docId,
      { filename: originalname, size }, req.ip);

    // Notify the user
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, ?, ?, 'success')
    `).run(uuidv4(), req.user.id, 'Document Uploaded', `"${originalname}" has been encrypted and stored securely.`);

    res.status(201).json({
      message: 'File uploaded and encrypted successfully',
      document: {
        id: docId,
        original_name: originalname,
        mime_type: mimetype,
        size,
        uploaded_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

/**
 * GET /api/documents — List accessible documents
 */
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    let documents;

    if (req.user.role === 'admin') {
      // Admins can see all documents
      documents = db.prepare(`
        SELECT d.*, u.username as owner_name
        FROM documents d
        LEFT JOIN users u ON d.owner_id = u.id
        ORDER BY d.uploaded_at DESC
      `).all();
    } else {
      // Users can see their own documents + shared documents
      documents = db.prepare(`
        SELECT d.*, u.username as owner_name, da.permission
        FROM documents d
        LEFT JOIN users u ON d.owner_id = u.id
        LEFT JOIN document_access da ON d.id = da.document_id AND da.user_id = ?
        WHERE d.owner_id = ? OR da.user_id = ?
        ORDER BY d.uploaded_at DESC
      `).all(req.user.id, req.user.id, req.user.id);
    }

    res.json({ documents });
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/**
 * GET /api/documents/:id/download — Decrypt and download a file
 */
router.get('/:id/download', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check access
    if (req.user.role !== 'admin' && doc.owner_id !== req.user.id) {
      const access = db.prepare(
        'SELECT * FROM document_access WHERE document_id = ? AND user_id = ? AND permission = ?'
      ).get(doc.id, req.user.id, 'download');

      if (!access) {
        createAuditEntry(req.user.id, req.user.username, 'UNAUTHORIZED_DOWNLOAD_ATTEMPT', 'documents', doc.id,
          { filename: doc.original_name }, req.ip);
        return res.status(403).json({ error: 'No download access to this document' });
      }
    }

    // Read and decrypt the file
    const filePath = path.join(UPLOADS_DIR, doc.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const encryptedData = fs.readFileSync(filePath);
    const decryptedData = decrypt(encryptedData, doc.encryption_iv);

    createAuditEntry(req.user.id, req.user.username, 'DOCUMENT_DOWNLOADED', 'documents', doc.id,
      { filename: doc.original_name }, req.ip);

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.send(decryptedData);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

/**
 * GET /api/documents/:id/view — Decrypt and view a file inline
 */
router.get('/:id/view', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check access (view or download allowed)
    if (req.user.role !== 'admin' && doc.owner_id !== req.user.id) {
      const access = db.prepare(
        'SELECT * FROM document_access WHERE document_id = ? AND user_id = ? AND permission IN ("view", "download")'
      ).get(doc.id, req.user.id);

      if (!access) {
        createAuditEntry(req.user.id, req.user.username, 'UNAUTHORIZED_VIEW_ATTEMPT', 'documents', doc.id,
          { filename: doc.original_name }, req.ip);
        return res.status(403).json({ error: 'No view access to this document' });
      }
    }

    // Read and decrypt the file
    const filePath = path.join(UPLOADS_DIR, doc.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const encryptedData = fs.readFileSync(filePath);
    const decryptedData = decrypt(encryptedData, doc.encryption_iv);

    createAuditEntry(req.user.id, req.user.username, 'DOCUMENT_VIEWED', 'documents', doc.id,
      { filename: doc.original_name }, req.ip);

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.original_name}"`);
    res.send(decryptedData);
  } catch (err) {
    console.error('View error:', err);
    res.status(500).json({ error: 'View failed' });
  }
});

/**
 * POST /api/documents/:id/share — Share document with another user
 */
router.post('/:id/share', requireAuth, (req, res) => {
  try {
    const { userId, permission } = req.body;
    const docId = req.params.id;

    if (!userId || !permission) {
      return res.status(400).json({ error: 'userId and permission are required' });
    }

    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Only owner or admin can share
    if (req.user.role !== 'admin' && doc.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the document owner or admin can share' });
    }

    // Check target user exists
    const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Check if access already exists
    const existing = db.prepare('SELECT id FROM document_access WHERE document_id = ? AND user_id = ?').get(docId, userId);
    if (existing) {
      db.prepare('UPDATE document_access SET permission = ? WHERE id = ?').run(permission, existing.id);
    } else {
      db.prepare(`
        INSERT INTO document_access (id, document_id, user_id, permission, granted_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), docId, userId, permission, req.user.id);
    }

    createAuditEntry(req.user.id, req.user.username, 'DOCUMENT_SHARED', 'documents', docId,
      { sharedWith: targetUser.username, permission }, req.ip);

    // Notify the target user
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type)
      VALUES (?, ?, ?, ?, 'info')
    `).run(uuidv4(), userId, 'Document Shared', `"${doc.original_name}" has been shared with you (${permission}).`);

    res.json({ message: 'Document shared successfully' });
  } catch (err) {
    console.error('Share error:', err);
    res.status(500).json({ error: 'Sharing failed' });
  }
});

/**
 * GET /api/documents/:id/access — Get access list for a document
 */
router.get('/:id/access', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (req.user.role !== 'admin' && doc.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const accessList = db.prepare(`
      SELECT da.*, u.username, u.email
      FROM document_access da
      LEFT JOIN users u ON da.user_id = u.id
      WHERE da.document_id = ?
    `).all(req.params.id);

    res.json({ access: accessList });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get access list' });
  }
});

/**
 * DELETE /api/documents/:id — Delete a document
 */
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Only owner or admin can delete
    if (req.user.role !== 'admin' && doc.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner or admin can delete this document' });
    }

    // Delete encrypted file from disk
    const filePath = path.join(UPLOADS_DIR, doc.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database (cascades to document_access)
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);

    createAuditEntry(req.user.id, req.user.username, 'DOCUMENT_DELETED', 'documents', req.params.id,
      { filename: doc.original_name }, req.ip);

    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
