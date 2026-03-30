/**
 * IDSTS — Auth Page Logic (Login + Register)
 */

document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, redirect to dashboard
  if (getToken() && getUser()) {
    window.location.href = '/dashboard.html';
    return;
  }

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }
});

async function handleLogin(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    showToast('Please fill in all fields', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;"></span> Signing in…';

  try {
    const data = await api.post('/auth/login', { username, password });

    if (data.requireOTP) {
      // Show OTP dialog
      showOTPDialog(data.tempToken);
    } else {
      // Direct login
      setToken(data.token);
      setUser(data.user);
      showToast('Login successful!', 'success');
      setTimeout(() => {
        window.location.href = '/dashboard.html';
      }, 500);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm-password').value;

  if (!username || !email || !password) {
    showToast('Please fill in all fields', 'warning');
    return;
  }

  if (password !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }

  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;"></span> Creating account…';

  try {
    const data = await api.post('/auth/register', { username, email, password });
    showToast('Registration successful! You can now login.', 'success');

    // Show OTP setup if available
    if (data.otp && data.otp.qrCode) {
      showOTPSetupDialog(data.otp);
    } else {
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 1500);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create Account';
  }
}

function showOTPDialog(tempToken) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>🔐 Two-Factor Authentication</h3>
      </div>
      <p style="color: var(--text-secondary); margin-bottom: 20px;">
        Enter the 6-digit code from your authenticator app.
      </p>
      <div class="form-group">
        <input type="text" id="otp-code" class="form-input" placeholder="000000"
               maxlength="6" pattern="[0-9]*" autofocus
               style="text-align: center; font-size: 24px; letter-spacing: 8px;">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" id="btn-verify-otp">Verify</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('btn-verify-otp').addEventListener('click', async () => {
    const otpCode = document.getElementById('otp-code').value.trim();
    if (!otpCode || otpCode.length !== 6) {
      showToast('Enter a valid 6-digit code', 'warning');
      return;
    }

    try {
      const data = await api.post('/auth/verify-otp', { tempToken, otpCode });
      setToken(data.token);
      setUser(data.user);
      overlay.remove();
      showToast('Login successful!', 'success');
      setTimeout(() => window.location.href = '/dashboard.html', 500);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function showOTPSetupDialog(otpData) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>🔐 Setup Two-Factor Auth (Optional)</h3>
      </div>
      <p style="color: var(--text-secondary); margin-bottom: 16px;">
        Scan this QR code with an authenticator app (Google Authenticator, Authy, etc.) to enable 2FA.
      </p>
      <div style="text-align: center; margin-bottom: 16px;">
        <img src="${otpData.qrCode}" alt="QR Code" style="max-width: 200px; border-radius: 8px;">
      </div>
      <div class="form-group">
        <label class="form-label">Manual Entry Key</label>
        <input type="text" class="form-input" value="${otpData.secret}" readonly
               style="font-family: monospace; font-size: 13px;"
               onclick="this.select()">
      </div>
      <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 16px;">
        You can enable 2FA later from your profile. For now, you can login without it.
      </p>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove(); window.location.href='/index.html'">
          Continue to Login
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}
