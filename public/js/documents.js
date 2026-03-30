/**
 * IDSTS — Document Management Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const user = getUser();
  document.getElementById('app').innerHTML = buildSidebar('documents') + buildDocumentsContent();

  await loadDocuments();
  loadNotificationCount();
  setupDropZone();
});

function buildDocumentsContent() {
  return `
    <div class="main-content">
      <div class="top-bar">
        <h2>Documents</h2>
        <div class="top-bar-actions">
          <button class="btn btn-primary" onclick="showUploadModal()" id="btn-upload">
            📤 Upload Document
          </button>
        </div>
      </div>
      <div class="page-content fade-in">
        <div class="filter-bar">
          <input type="text" class="form-input" id="search-docs" placeholder="🔍 Search documents..."
                 oninput="filterDocuments()" style="max-width: 300px;">
        </div>
        <div id="documents-list" class="docs-grid">
          <div class="empty-state" style="grid-column: 1/-1;">
            <span class="spinner spinner-lg"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Upload Modal -->
    <div class="modal-overlay" id="upload-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>📤 Upload Document</h3>
          <button class="modal-close" onclick="closeUploadModal()">✕</button>
        </div>
        <div class="drop-zone" id="drop-zone" onclick="document.getElementById('file-input').click()">
          <div class="icon">📁</div>
          <p>Drag & drop your file here, or <span class="browse-link">browse</span></p>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Max file size: 50MB • All files encrypted with AES-256</p>
        </div>
        <input type="file" id="file-input" style="display: none;" onchange="handleFileSelect(this)">
        <div id="file-preview" class="hidden" style="margin-top: 16px; padding: 12px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="file-icon" style="font-size: 24px;">📄</span>
            <div style="flex: 1;">
              <div id="file-name" style="font-weight: 600; font-size: 14px;"></div>
              <div id="file-size" style="font-size: 12px; color: var(--text-muted);"></div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="clearFile()">✕</button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeUploadModal()">Cancel</button>
          <button class="btn btn-primary" id="btn-do-upload" onclick="uploadFile()" disabled>🔒 Encrypt & Upload</button>
        </div>
      </div>
    </div>

    <!-- Share Modal -->
    <div class="modal-overlay" id="share-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>🔗 Share Document</h3>
          <button class="modal-close" onclick="closeShareModal()">✕</button>
        </div>
        <div class="form-group">
          <label class="form-label">Select User</label>
          <select class="form-select" id="share-user"></select>
        </div>
        <div class="form-group">
          <label class="form-label">Permission</label>
          <select class="form-select" id="share-permission">
            <option value="view">View Only</option>
            <option value="download">View & Download</option>
          </select>
        </div>
        <div id="current-access" class="hidden" style="margin-top: 16px;">
          <h4 style="font-size: 14px; margin-bottom: 8px;">Current Access</h4>
          <div id="access-list"></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeShareModal()">Cancel</button>
          <button class="btn btn-primary" onclick="shareDocument()">Share</button>
        </div>
      </div>
    </div>
  `;
}

let allDocuments = [];
let selectedFile = null;
let shareDocId = null;

async function loadDocuments() {
  try {
    const data = await api.get('/documents');
    allDocuments = data.documents || [];
    renderDocuments(allDocuments);
  } catch (err) {
    showToast('Failed to load documents', 'error');
    document.getElementById('documents-list').innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="icon">⚠️</div>
        <h3>Failed to load documents</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

function renderDocuments(docs) {
  const container = document.getElementById('documents-list');
  const user = getUser();

  if (docs.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="icon">📁</div>
        <h3>No documents found</h3>
        <p>Upload your first document to get started with secure storage.</p>
        <button class="btn btn-primary" style="margin-top: 16px;" onclick="showUploadModal()">📤 Upload Document</button>
      </div>
    `;
    return;
  }

  container.innerHTML = docs.map(doc => {
    const isOwner = doc.owner_id === user.id || user.role === 'admin';
    return `
      <div class="doc-card" data-id="${doc.id}">
        <div class="doc-icon">${getFileIcon(doc.mime_type)}</div>
        <div class="doc-name">${doc.original_name}</div>
        <div class="doc-meta">
          ${formatBytes(doc.size)} • ${timeAgo(doc.uploaded_at)}
          ${doc.owner_name ? `• by ${doc.owner_name}` : ''}
        </div>
        <div class="doc-actions">
          <button class="btn btn-sm btn-secondary" onclick="viewDoc('${doc.id}')" title="View">
            👀 View
          </button>
          ${isOwner || doc.permission === 'download' ? `
          <button class="btn btn-sm btn-secondary" onclick="downloadDoc('${doc.id}', '${doc.original_name}')" title="Download">
            📥 Download
          </button>
          ` : ''}
          ${isOwner ? `
            <button class="btn btn-sm btn-secondary" onclick="showShareModal('${doc.id}')" title="Share">
              🔗 Share
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteDoc('${doc.id}', '${doc.original_name}')" title="Delete">
              🗑️
            </button>
          ` : `
            <span class="badge badge-${doc.permission || 'view'}">${doc.permission || 'shared'}</span>
          `}
        </div>
      </div>
    `;
  }).join('');
}

async function viewDoc(id) {
  try {
    showToast('Decrypting for viewing...', 'info');
    const token = getToken();
    const response = await fetch(`/api/documents/${id}/view`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'View failed');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    
    // Clean up url gracefully after new tab opens
    setTimeout(() => URL.revokeObjectURL(url), 60000); 
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function filterDocuments() {
  const query = document.getElementById('search-docs').value.toLowerCase();
  const filtered = allDocuments.filter(d =>
    d.original_name.toLowerCase().includes(query) ||
    (d.owner_name || '').toLowerCase().includes(query) ||
    (d.mime_type || '').toLowerCase().includes(query)
  );
  renderDocuments(filtered);
}

function showUploadModal() {
  document.getElementById('upload-modal').classList.add('active');
}

function closeUploadModal() {
  document.getElementById('upload-modal').classList.remove('active');
  clearFile();
}

function setupDropZone() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  });
}

function handleFileSelect(input) {
  if (input.files.length > 0) {
    setSelectedFile(input.files[0]);
  }
}

function setSelectedFile(file) {
  selectedFile = file;
  document.getElementById('file-preview').classList.remove('hidden');
  document.getElementById('file-name').textContent = file.name;
  document.getElementById('file-size').textContent = formatBytes(file.size);
  document.getElementById('file-icon').textContent = getFileIcon(file.type);
  document.getElementById('btn-do-upload').disabled = false;
}

function clearFile() {
  selectedFile = null;
  document.getElementById('file-preview').classList.add('hidden');
  document.getElementById('file-input').value = '';
  document.getElementById('btn-do-upload').disabled = true;
}

async function uploadFile() {
  if (!selectedFile) return;

  const btn = document.getElementById('btn-do-upload');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Encrypting…';

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);

    await api.post('/documents/upload', formData);
    showToast('Document uploaded and encrypted!', 'success');
    closeUploadModal();
    await loadDocuments();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔒 Encrypt & Upload';
  }
}

async function downloadDoc(id, name) {
  try {
    showToast('Decrypting and downloading...', 'info');
    const token = getToken();
    const response = await fetch(`/api/documents/${id}/download`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Download failed');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Download complete!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteDoc(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

  try {
    await api.delete(`/documents/${id}`);
    showToast('Document deleted', 'success');
    await loadDocuments();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function showShareModal(docId) {
  shareDocId = docId;
  const modal = document.getElementById('share-modal');

  try {
    // Load users list
    let users = [];
    try {
      const data = await api.get('/users');
      users = data.users || [];
    } catch {
      // Non-admin may not have access — just show the modal with empty list
      showToast('Cannot load user list. Ask admin for user IDs.', 'warning');
    }

    const select = document.getElementById('share-user');
    const currentUser = getUser();
    const filteredUsers = users.filter(u => u.id !== currentUser.id);
    select.innerHTML = filteredUsers.map(u =>
      `<option value="${u.id}">${u.username} (${u.email})</option>`
    ).join('');

    if (filteredUsers.length === 0) {
      select.innerHTML = '<option disabled>No users available</option>';
    }

    // Load current access
    try {
      const accessData = await api.get(`/documents/${docId}/access`);
      const accessList = accessData.access || [];
      if (accessList.length > 0) {
        document.getElementById('current-access').classList.remove('hidden');
        document.getElementById('access-list').innerHTML = accessList.map(a => `
          <div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border-subtle);">
            <span>👤</span>
            <span style="flex: 1; font-size: 13px;">${a.username || a.user_id}</span>
            <span class="badge badge-${a.permission}">${a.permission}</span>
          </div>
        `).join('');
      }
    } catch { /* ignore */ }

    modal.classList.add('active');
  } catch (err) {
    showToast('Failed to prepare share dialog', 'error');
  }
}

function closeShareModal() {
  document.getElementById('share-modal').classList.remove('active');
  shareDocId = null;
}

async function shareDocument() {
  if (!shareDocId) return;

  const userId = document.getElementById('share-user').value;
  const permission = document.getElementById('share-permission').value;

  if (!userId) {
    showToast('Select a user to share with', 'warning');
    return;
  }

  try {
    await api.post(`/documents/${shareDocId}/share`, { userId, permission });
    showToast('Document shared successfully!', 'success');
    closeShareModal();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
