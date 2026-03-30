/**
 * IDSTS — Admin User Management Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  if (!requireAdmin()) return;

  const user = getUser();
  document.getElementById('app').innerHTML = buildSidebar('admin-users') + buildUsersContent();

  await loadUsers();
  loadNotificationCount();
});

function buildUsersContent() {
  return `
    <div class="main-content">
      <div class="top-bar">
        <h2>User Management</h2>
        <div class="top-bar-actions">
          <button class="btn btn-primary" onclick="showCreateUserModal()" id="btn-create-user">
            ➕ Create User
          </button>
        </div>
      </div>
      <div class="page-content fade-in">
        <div class="filter-bar">
          <input type="text" class="form-input" id="search-users" placeholder="🔍 Search users..."
                 oninput="filterUsers()" style="max-width: 300px;">
          <select class="form-select" id="filter-role" onchange="filterUsers()" style="max-width: 160px;">
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
          <select class="form-select" id="filter-status" onchange="filterUsers()" style="max-width: 160px;">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div class="card">
          <div class="table-container">
            <table class="data-table" id="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>2FA</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="users-tbody">
                <tr><td colspan="7" style="text-align: center; padding: 40px;"><span class="spinner"></span></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Create User Modal -->
    <div class="modal-overlay" id="create-user-modal">
      <div class="modal">
        <div class="modal-header">
          <h3>➕ Create New User</h3>
          <button class="modal-close" onclick="closeCreateUserModal()">✕</button>
        </div>
        <form id="create-user-form" onsubmit="createUser(event)">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input type="text" class="form-input" id="new-username" required>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-input" id="new-email" required>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" class="form-input" id="new-password" required minlength="6">
          </div>
          <div class="form-group">
            <label class="form-label">Role</label>
            <select class="form-select" id="new-role">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeCreateUserModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Create User</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

let allUsers = [];

async function loadUsers() {
  try {
    const data = await api.get('/users');
    allUsers = data.users || [];
    renderUsers(allUsers);
  } catch (err) {
    showToast('Failed to load users', 'error');
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('users-tbody');
  const currentUser = getUser();

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">👥</div><h3>No users found</h3></div></td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="user-avatar" style="width: 32px; height: 32px; font-size: 12px;">${u.username.charAt(0).toUpperCase()}</div>
          <strong>${u.username}</strong>
          ${u.id === currentUser.id ? '<span class="badge badge-info" style="font-size:10px;">You</span>' : ''}
        </div>
      </td>
      <td>${u.email}</td>
      <td>
        <select class="form-select" style="width: auto; padding: 4px 8px; font-size: 12px;"
                onchange="changeRole('${u.id}', this.value)"
                ${u.id === currentUser.id ? 'disabled' : ''}>
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
      <td><span class="badge badge-${u.status}">${u.status}</span></td>
      <td>${u.otp_enabled ? '✅' : '❌'}</td>
      <td style="font-size: 12px; color: var(--text-muted);">${formatDate(u.created_at)}</td>
      <td>
        <div style="display: flex; gap: 6px;">
          ${u.id !== currentUser.id ? `
            <button class="btn btn-sm ${u.status === 'active' ? 'btn-danger' : 'btn-success'}"
                    onclick="toggleStatus('${u.id}', '${u.status === 'active' ? 'suspended' : 'active'}')">
              ${u.status === 'active' ? '🚫 Suspend' : '✅ Activate'}
            </button>
            <button class="btn btn-sm btn-ghost" onclick="deleteUser('${u.id}', '${u.username}')" style="color: var(--accent-danger);">
              🗑️
            </button>
          ` : '—'}
        </div>
      </td>
    </tr>
  `).join('');
}

function filterUsers() {
  const search = document.getElementById('search-users').value.toLowerCase();
  const roleFilter = document.getElementById('filter-role').value;
  const statusFilter = document.getElementById('filter-status').value;

  const filtered = allUsers.filter(u => {
    const matchSearch = u.username.toLowerCase().includes(search) || u.email.toLowerCase().includes(search);
    const matchRole = !roleFilter || u.role === roleFilter;
    const matchStatus = !statusFilter || u.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  renderUsers(filtered);
}

function showCreateUserModal() {
  document.getElementById('create-user-modal').classList.add('active');
}

function closeCreateUserModal() {
  document.getElementById('create-user-modal').classList.remove('active');
  document.getElementById('create-user-form').reset();
}

async function createUser(e) {
  e.preventDefault();

  const username = document.getElementById('new-username').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;

  try {
    await api.post('/users', { username, email, password, role });
    showToast('User created successfully!', 'success');
    closeCreateUserModal();
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function changeRole(userId, newRole) {
  try {
    await api.put(`/users/${userId}/role`, { role: newRole });
    showToast('Role updated', 'success');
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
    await loadUsers(); // Revert UI
  }
}

async function toggleStatus(userId, newStatus) {
  try {
    await api.put(`/users/${userId}/status`, { status: newStatus });
    showToast(`User ${newStatus === 'active' ? 'activated' : 'suspended'}`, 'success');
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUser(userId, username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;

  try {
    await api.delete(`/users/${userId}`);
    showToast('User deleted', 'success');
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
