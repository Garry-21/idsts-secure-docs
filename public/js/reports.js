/**
 * IDSTS — Reports Page Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  if (!requireAdmin()) return;

  document.getElementById('app').innerHTML = buildSidebar('reports') + buildReportsContent();

  await loadReports();
  loadNotificationCount();
});

function buildReportsContent() {
  return `
    <div class="main-content">
      <div class="top-bar">
        <h2>Reports & Analytics</h2>
        <div class="top-bar-actions">
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('users')">📥 Export Users</button>
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('documents')">📥 Export Docs</button>
            <button class="btn btn-secondary btn-sm" onclick="exportCSV('audit')">📥 Export Audit</button>
          </div>
        </div>
      </div>
      <div class="page-content fade-in">
        <div class="stats-grid" id="report-stats">
          <div class="stat-card"><div style="text-align:center;padding:20px;"><span class="spinner"></span></div></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
          <div class="chart-container">
            <div class="card-header">
              <span class="card-title">Activity (Last 7 Days)</span>
            </div>
            <div id="activity-chart" style="height: 220px; display: flex; align-items: flex-end; gap: 4px;">
              <div style="text-align: center; width: 100%; color: var(--text-muted); padding: 40px;">Loading...</div>
            </div>
            <div id="activity-labels" class="chart-labels"></div>
          </div>

          <div class="chart-container">
            <div class="card-header">
              <span class="card-title">Document Uploads (Last 30 Days)</span>
            </div>
            <div id="upload-chart" style="height: 220px; display: flex; align-items: flex-end; gap: 4px;">
              <div style="text-align: center; width: 100%; color: var(--text-muted); padding: 40px;">Loading...</div>
            </div>
            <div id="upload-labels" class="chart-labels"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Top Uploaders</span>
          </div>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Username</th>
                  <th>Documents</th>
                  <th>Bar</th>
                </tr>
              </thead>
              <tbody id="top-uploaders-tbody">
                <tr><td colspan="4" style="text-align: center; padding: 30px;"><span class="spinner"></span></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadReports() {
  try {
    const data = await api.get('/reports/overview');

    // Stats
    document.getElementById('report-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon purple">👥</div>
        <div class="stat-value">${data.totalUsers}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon cyan">📄</div>
        <div class="stat-value">${data.totalDocuments}</div>
        <div class="stat-label">Total Documents</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">💾</div>
        <div class="stat-value">${formatBytes(data.storageUsed)}</div>
        <div class="stat-label">Storage Used</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon amber">📜</div>
        <div class="stat-value">${data.totalAuditLogs}</div>
        <div class="stat-label">Total Audit Entries</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">⚠️</div>
        <div class="stat-value">${data.failedLogins}</div>
        <div class="stat-label">Failed Logins (7d)</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">🚫</div>
        <div class="stat-value">${data.suspendedUsers}</div>
        <div class="stat-label">Suspended Users</div>
      </div>
    `;

    // Activity chart
    renderBarChart('activity-chart', 'activity-labels', data.recentActivity, 'date', 'count');

    // Upload trend chart
    renderBarChart('upload-chart', 'upload-labels', data.uploadTrend, 'date', 'count');

    // Top uploaders
    const maxDocs = Math.max(...data.topUploaders.map(u => u.doc_count), 1);
    document.getElementById('top-uploaders-tbody').innerHTML = data.topUploaders.map((u, i) => `
      <tr>
        <td style="font-weight: 700; color: ${i < 3 ? 'var(--accent-warning)' : 'var(--text-secondary)'};">
          ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="user-avatar" style="width: 28px; height: 28px; font-size: 11px;">${u.username.charAt(0).toUpperCase()}</div>
            <strong>${u.username}</strong>
          </div>
        </td>
        <td>${u.doc_count}</td>
        <td style="width: 200px;">
          <div style="background: var(--bg-input); border-radius: 4px; height: 8px; overflow: hidden;">
            <div style="height: 100%; width: ${(u.doc_count / maxDocs) * 100}%; background: var(--gradient-primary); border-radius: 4px; transition: width 0.5s ease;"></div>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="text-center text-muted" style="padding: 20px;">No data</td></tr>';

  } catch (err) {
    showToast('Failed to load reports', 'error');
  }
}

function renderBarChart(containerId, labelsId, data, labelKey, valueKey) {
  const container = document.getElementById(containerId);
  const labelsContainer = document.getElementById(labelsId);

  if (!data || data.length === 0) {
    container.innerHTML = '<div style="text-align: center; width: 100%; color: var(--text-muted); padding: 40px;">No data available</div>';
    return;
  }

  const max = Math.max(...data.map(d => d[valueKey]), 1);

  container.innerHTML = data.map(d => {
    const height = Math.max((d[valueKey] / max) * 100, 4);
    return `
      <div class="chart-bar-item" style="height: ${height}%;">
        <div class="tooltip">${d[labelKey]}: ${d[valueKey]}</div>
      </div>
    `;
  }).join('');

  labelsContainer.innerHTML = data.map(d => {
    const label = d[labelKey];
    // Show short date
    const shortDate = label.length > 5 ? label.substring(5) : label;
    return `<span>${shortDate}</span>`;
  }).join('');
}

async function exportCSV(type) {
  try {
    const token = getToken();
    const response = await fetch(`/api/reports/export/${type}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) throw new Error('Export failed');

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${type} report exported!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
