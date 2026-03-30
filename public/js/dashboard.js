/**
 * IDSTS — Dashboard Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const user = getUser();
  document.getElementById('app').innerHTML = buildSidebar('dashboard') + buildDashboardContent(user);

  await loadDashboard(user);
  loadNotificationCount();
});

function buildDashboardContent(user) {
  const isAdmin = user.role === 'admin';

  return `
    <div class="main-content">
      <div class="top-bar">
        <h2>Dashboard</h2>
        <div class="top-bar-actions">
          <div class="notification-bell" onclick="toggleNotifications()" id="notification-bell">
            <button class="btn btn-ghost btn-icon">🔔</button>
            <span class="count" id="notification-count" style="display:none"></span>
            <div class="notification-dropdown" id="notification-dropdown"></div>
          </div>
        </div>
      </div>
      <div class="page-content fade-in">
        <div class="mb-6">
          <h3 style="font-size: 24px; font-weight: 700;">Welcome back, ${user.username}! 👋</h3>
          <p class="text-muted" style="margin-top: 4px;">Here's what's happening with your documents.</p>
        </div>

        <div class="stats-grid" id="stats-grid">
          <!-- Filled by JS -->
        </div>

        ${isAdmin ? `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div class="card">
              <div class="card-header">
                <span class="card-title">Recent Activity</span>
              </div>
              <div id="recent-activity">
                <div class="empty-state" style="padding: 30px;">
                  <span class="spinner"></span>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="card-header">
                <span class="card-title">Quick Actions</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <a href="/documents.html" class="nav-link" style="padding: 14px;">
                  <span class="icon">📤</span> Upload New Document
                </a>
                <a href="/admin-users.html" class="nav-link" style="padding: 14px;">
                  <span class="icon">👥</span> Manage Users
                </a>
                <a href="/audit-logs.html" class="nav-link" style="padding: 14px;">
                  <span class="icon">📜</span> View Audit Logs
                </a>
                <a href="/reports.html" class="nav-link" style="padding: 14px;">
                  <span class="icon">📈</span> Generate Reports
                </a>
              </div>
            </div>
          </div>
        ` : `
          <div class="card">
            <div class="card-header">
              <span class="card-title">Your Recent Documents</span>
              <a href="/documents.html" class="btn btn-sm btn-secondary">View All</a>
            </div>
            <div id="recent-docs">
              <div class="empty-state" style="padding: 30px;">
                <span class="spinner"></span>
              </div>
            </div>
          </div>
        `}
      </div>
    </div>
  `;
}

async function loadDashboard(user) {
  try {
    // Load stats
    const docsData = await api.get('/documents');
    const docs = docsData.documents || [];

    const statsGrid = document.getElementById('stats-grid');

    if (user.role === 'admin') {
      // Admin: show system-wide stats
      try {
        const report = await api.get('/reports/overview');
        statsGrid.innerHTML = `
          <div class="stat-card">
            <div class="stat-icon purple">👥</div>
            <div class="stat-value">${report.totalUsers}</div>
            <div class="stat-label">Total Users</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon cyan">📄</div>
            <div class="stat-value">${report.totalDocuments}</div>
            <div class="stat-label">Total Documents</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">💾</div>
            <div class="stat-value">${formatBytes(report.storageUsed)}</div>
            <div class="stat-label">Storage Used</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon amber">📜</div>
            <div class="stat-value">${report.totalAuditLogs}</div>
            <div class="stat-label">Audit Entries</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon red">⚠️</div>
            <div class="stat-value">${report.failedLogins}</div>
            <div class="stat-label">Failed Logins (7d)</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">✅</div>
            <div class="stat-value">${report.activeUsers}</div>
            <div class="stat-label">Active Users</div>
          </div>
        `;

        // Load recent activity
        const auditData = await api.get('/audit?limit=8');
        const activityEl = document.getElementById('recent-activity');
        if (auditData.logs && auditData.logs.length > 0) {
          activityEl.innerHTML = auditData.logs.map(log => `
            <div style="padding: 10px 0; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 12px; align-items: center;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-glass); display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;">
                ${getActionIcon(log.action)}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  <strong>${log.username || 'System'}</strong> — ${log.action}
                </div>
                <div style="font-size: 11px; color: var(--text-muted);">${timeAgo(log.timestamp)}</div>
              </div>
            </div>
          `).join('');
        } else {
          activityEl.innerHTML = '<p class="text-muted text-center" style="padding: 20px;">No recent activity</p>';
        }
      } catch {
        statsGrid.innerHTML = `
          <div class="stat-card">
            <div class="stat-icon cyan">📄</div>
            <div class="stat-value">${docs.length}</div>
            <div class="stat-label">Total Documents</div>
          </div>
        `;
      }
    } else {
      // User stats
      const myDocs = docs.filter(d => d.owner_id === user.id);
      const sharedDocs = docs.filter(d => d.owner_id !== user.id);

      statsGrid.innerHTML = `
        <div class="stat-card">
          <div class="stat-icon cyan">📄</div>
          <div class="stat-value">${myDocs.length}</div>
          <div class="stat-label">My Documents</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple">🔗</div>
          <div class="stat-value">${sharedDocs.length}</div>
          <div class="stat-label">Shared with Me</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">💾</div>
          <div class="stat-value">${formatBytes(myDocs.reduce((sum, d) => sum + (d.size || 0), 0))}</div>
          <div class="stat-label">Storage Used</div>
        </div>
      `;

      // Show recent docs
      const recentDocsEl = document.getElementById('recent-docs');
      if (docs.length > 0) {
        recentDocsEl.innerHTML = docs.slice(0, 5).map(doc => `
          <div style="padding: 12px 0; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 12px; align-items: center;">
            <div style="font-size: 24px;">${getFileIcon(doc.mime_type)}</div>
            <div style="flex: 1;">
              <div style="font-size: 14px; font-weight: 500;">${doc.original_name}</div>
              <div style="font-size: 12px; color: var(--text-muted);">${formatBytes(doc.size)} • ${timeAgo(doc.uploaded_at)}</div>
            </div>
          </div>
        `).join('');
      } else {
        recentDocsEl.innerHTML = `
          <div class="empty-state" style="padding: 30px;">
            <div class="icon">📁</div>
            <h3>No documents yet</h3>
            <p>Upload your first document to get started.</p>
            <a href="/documents.html" class="btn btn-primary btn-sm" style="margin-top: 12px;">Upload Document</a>
          </div>
        `;
      }
    }
  } catch (err) {
    showToast('Failed to load dashboard data', 'error');
  }
}

function getActionIcon(action) {
  if (action.includes('LOGIN')) return '🔑';
  if (action.includes('UPLOAD')) return '📤';
  if (action.includes('DOWNLOAD')) return '📥';
  if (action.includes('DELETE')) return '🗑️';
  if (action.includes('SHARE')) return '🔗';
  if (action.includes('REGISTER')) return '👤';
  if (action.includes('LOCKED')) return '🔒';
  return '📌';
}

async function toggleNotifications() {
  const dropdown = document.getElementById('notification-dropdown');
  const isActive = dropdown.classList.contains('active');

  if (isActive) {
    dropdown.classList.remove('active');
    return;
  }

  try {
    const data = await api.get('/notifications');
    const notifications = data.notifications || [];

    if (notifications.length === 0) {
      dropdown.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No notifications</div>';
    } else {
      dropdown.innerHTML = `
        <div style="padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 14px;">Notifications</strong>
          <button class="btn btn-ghost btn-sm" onclick="markAllRead()">Mark all read</button>
        </div>
        ${notifications.slice(0, 10).map(n => `
          <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="markRead('${n.id}', this)">
            <div class="title">${n.title}</div>
            <div class="message">${n.message}</div>
            <div class="time">${timeAgo(n.created_at)}</div>
          </div>
        `).join('')}
      `;
    }

    dropdown.classList.add('active');
  } catch {
    showToast('Failed to load notifications', 'error');
  }
}

async function markRead(id, el) {
  try {
    await api.put(`/notifications/${id}/read`);
    if (el) el.classList.remove('unread');
    loadNotificationCount();
  } catch { /* ignore */ }
}

async function markAllRead() {
  try {
    await api.put('/notifications/read-all');
    loadNotificationCount();
    document.querySelectorAll('.notification-item.unread').forEach(el => el.classList.remove('unread'));
    showToast('All notifications marked as read', 'success');
  } catch { /* ignore */ }
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notification-dropdown');
  const bell = document.getElementById('notification-bell');
  if (dropdown && bell && !bell.contains(e.target)) {
    dropdown.classList.remove('active');
  }
});
