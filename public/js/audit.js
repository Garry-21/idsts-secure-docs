/**
 * IDSTS — Audit Logs Viewer Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  if (!requireAdmin()) return;

  document.getElementById('app').innerHTML = buildSidebar('audit-logs') + buildAuditContent();

  await loadAuditLogs();
  loadNotificationCount();
});

function buildAuditContent() {
  return `
    <div class="main-content">
      <div class="top-bar">
        <h2>Audit Logs</h2>
        <div class="top-bar-actions">
          <button class="btn btn-secondary" onclick="exportAuditCSV()" id="btn-export-audit">
            📥 Export CSV
          </button>
        </div>
      </div>
      <div class="page-content fade-in">
        <div class="filter-bar">
          <input type="text" class="form-input" id="audit-search" placeholder="🔍 Search by user..."
                 style="max-width: 200px;">
          <input type="text" class="form-input" id="audit-action" placeholder="Filter by action..."
                 style="max-width: 200px;">
          <input type="date" class="form-input" id="audit-from" style="max-width: 180px;">
          <input type="date" class="form-input" id="audit-to" style="max-width: 180px;">
          <button class="btn btn-primary btn-sm" onclick="loadAuditLogs()">Apply</button>
          <button class="btn btn-ghost btn-sm" onclick="clearFilters()">Clear</button>
        </div>

        <div class="card">
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>IP Address</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody id="audit-tbody">
                <tr><td colspan="6" style="text-align: center; padding: 40px;"><span class="spinner"></span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="pagination" id="audit-pagination"></div>
      </div>
    </div>
  `;
}

let currentPage = 0;
const PAGE_SIZE = 25;

async function loadAuditLogs(page = 0) {
  currentPage = page;

  const user = document.getElementById('audit-search')?.value || '';
  const action = document.getElementById('audit-action')?.value || '';
  const from = document.getElementById('audit-from')?.value || '';
  const to = document.getElementById('audit-to')?.value || '';

  let queryParams = `?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
  if (user) queryParams += `&user=${encodeURIComponent(user)}`;
  if (action) queryParams += `&action=${encodeURIComponent(action)}`;
  if (from) queryParams += `&from=${from}`;
  if (to) queryParams += `&to=${to}`;

  try {
    const data = await api.get(`/audit${queryParams}`);
    renderAuditLogs(data.logs || [], data.total || 0);
  } catch (err) {
    showToast('Failed to load audit logs', 'error');
  }
}

function renderAuditLogs(logs, total) {
  const tbody = document.getElementById('audit-tbody');

  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="6">
        <div class="empty-state">
          <div class="icon">📜</div>
          <h3>No audit logs found</h3>
          <p>Try adjusting your filters.</p>
        </div>
      </td></tr>
    `;
    document.getElementById('audit-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = logs.map(log => {
    let details = '';
    try {
      const parsed = JSON.parse(log.details || '{}');
      details = Object.entries(parsed)
        .filter(([k]) => k !== 'query')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    } catch { details = log.details || ''; }

    return `
      <tr>
        <td style="font-size: 12px; white-space: nowrap; color: var(--text-muted);">
          ${formatDate(log.timestamp)}
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="user-avatar" style="width: 24px; height: 24px; font-size:10px;">${(log.username || '?').charAt(0).toUpperCase()}</div>
            <span style="font-size: 13px;">${log.username || '—'}</span>
          </div>
        </td>
        <td>
          <span class="badge badge-${getActionBadge(log.action)}">${log.action}</span>
        </td>
        <td style="font-size: 13px;">${log.resource_type || '—'}</td>
        <td style="font-size: 12px; font-family: monospace; color: var(--text-muted);">${log.ip_address || '—'}</td>
        <td style="font-size: 12px; color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${details}">${details || '—'}</td>
      </tr>
    `;
  }).join('');

  // Pagination
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pagination = document.getElementById('audit-pagination');
  if (totalPages > 1) {
    pagination.innerHTML = `
      <button class="btn btn-sm btn-secondary" ${currentPage === 0 ? 'disabled' : ''} onclick="loadAuditLogs(${currentPage - 1})">← Prev</button>
      <span class="page-info">Page ${currentPage + 1} of ${totalPages} (${total} entries)</span>
      <button class="btn btn-sm btn-secondary" ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="loadAuditLogs(${currentPage + 1})">Next →</button>
    `;
  } else {
    pagination.innerHTML = `<span class="page-info">${total} entries</span>`;
  }
}

function getActionBadge(action) {
  if (action.includes('FAILED') || action.includes('UNAUTHORIZED') || action.includes('LOCKED')) return 'alert';
  if (action.includes('DELETE')) return 'warning';
  if (action.includes('LOGIN_SUCCESS') || action.includes('VERIFIED') || action.includes('ACTIVATED')) return 'success';
  if (action.includes('UPLOAD') || action.includes('SHARE')) return 'info';
  return 'user';
}

function clearFilters() {
  document.getElementById('audit-search').value = '';
  document.getElementById('audit-action').value = '';
  document.getElementById('audit-from').value = '';
  document.getElementById('audit-to').value = '';
  loadAuditLogs();
}

async function exportAuditCSV() {
  try {
    const token = getToken();
    const response = await fetch('/api/reports/export/audit', {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) throw new Error('Export failed');

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit_logs_report.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Audit logs exported!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
