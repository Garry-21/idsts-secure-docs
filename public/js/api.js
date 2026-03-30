/**
 * IDSTS — Shared API helper
 * Wraps fetch() with JWT token management and auto-redirect on 401.
 */

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('idsts_token');
}

function setToken(token) {
  localStorage.setItem('idsts_token', token);
}

function clearToken() {
  localStorage.removeItem('idsts_token');
  localStorage.removeItem('idsts_user');
}

function getUser() {
  const raw = localStorage.getItem('idsts_user');
  return raw ? JSON.parse(raw) : null;
}

function setUser(user) {
  localStorage.setItem('idsts_user', JSON.stringify(user));
}

async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (file uploads)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 — redirect to login
    if (response.status === 401) {
      clearToken();
      if (!window.location.pathname.includes('index.html') && window.location.pathname !== '/') {
        window.location.href = '/index.html';
      }
      throw new Error('Session expired. Please login again.');
    }

    // Handle non-JSON responses (like CSV downloads)
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
      if (!response.ok) throw new Error('Request failed');
      return response;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  } catch (err) {
    if (err.message === 'Failed to fetch') {
      throw new Error('Network error. Is the server running?');
    }
    throw err;
  }
}

// Convenience methods
const api = {
  get: (endpoint) => apiRequest(endpoint, { method: 'GET' }),
  post: (endpoint, body) => apiRequest(endpoint, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
  }),
  put: (endpoint, body) => apiRequest(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  }),
  delete: (endpoint) => apiRequest(endpoint, { method: 'DELETE' }),
};

/* ── Toast Notifications ── */
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ── Auth Guards ── */
function requireAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = '/index.html';
    return false;
  }
  return true;
}

function requireAdmin() {
  const user = getUser();
  if (!user || user.role !== 'admin') {
    showToast('Admin access required', 'error');
    window.location.href = '/dashboard.html';
    return false;
  }
  return true;
}

/* ── Format Helpers ── */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getFileIcon(mimeType) {
  if (!mimeType) return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📋';
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) return '📦';
  if (mimeType.includes('text')) return '📃';
  return '📄';
}

/* ── Sidebar Builder ── */
function buildSidebar(activePage) {
  const user = getUser();
  if (!user) return '';

  const isAdmin = user.role === 'admin';
  const initial = (user.username || 'U').charAt(0).toUpperCase();

  return `
    <div class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="logo-icon">🔒</div>
        <div>
          <h1>IDSTS</h1>
          <div class="subtitle">Document Security</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        <div class="sidebar-section">
          <div class="sidebar-section-title">Main</div>
          <a href="/dashboard.html" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}" id="nav-dashboard">
            <span class="icon">📊</span> Dashboard
          </a>
          <a href="/documents.html" class="nav-link ${activePage === 'documents' ? 'active' : ''}" id="nav-documents">
            <span class="icon">📁</span> Documents
          </a>
        </div>
        ${isAdmin ? `
        <div class="sidebar-section">
          <div class="sidebar-section-title">Administration</div>
          <a href="/admin-users.html" class="nav-link ${activePage === 'admin-users' ? 'active' : ''}" id="nav-admin-users">
            <span class="icon">👥</span> User Management
          </a>
          <a href="/audit-logs.html" class="nav-link ${activePage === 'audit-logs' ? 'active' : ''}" id="nav-audit-logs">
            <span class="icon">📜</span> Audit Logs
          </a>
          <a href="/reports.html" class="nav-link ${activePage === 'reports' ? 'active' : ''}" id="nav-reports">
            <span class="icon">📈</span> Reports
          </a>
        </div>
        ` : ''}
      </nav>
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">${initial}</div>
          <div class="user-details">
            <div class="name">${user.username}</div>
            <div class="role">${user.role}</div>
          </div>
          <button class="btn btn-ghost btn-icon" onclick="logout()" title="Logout" id="btn-logout">⏻</button>
        </div>
      </div>
    </div>
  `;
}

async function logout() {
  try {
    await api.post('/auth/logout');
  } catch { /* ignore */ }
  clearToken();
  window.location.href = '/index.html';
}

/* ── Notification Loader ── */
async function loadNotificationCount() {
  try {
    const data = await api.get('/notifications');
    const badge = document.getElementById('notification-count');
    if (badge) {
      badge.textContent = data.unreadCount || '';
      badge.style.display = data.unreadCount > 0 ? 'flex' : 'none';
    }
  } catch { /* ignore */ }
}
