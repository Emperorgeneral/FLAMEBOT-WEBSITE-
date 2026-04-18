const API_ROOT = '/api/backend';
const TOKEN_KEY = 'flamebot_ambassador_token';

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || '',
  ambassador: null,
  users: [],
  counts: null,
  currentView: 'dashboard',
};

const elements = {
  authShell: document.getElementById('auth-shell'),
  appShell: document.getElementById('app-shell'),
  loginForm: document.getElementById('login-form'),
  dashboardHeading: document.getElementById('dashboard-heading'),
  dashboardSubheading: document.getElementById('dashboard-subheading'),
  refreshButton: document.getElementById('refresh-button'),
  logoutButton: document.getElementById('logout-button'),
  navButtons: Array.from(document.querySelectorAll('[data-view]')),
  viewPanels: Array.from(document.querySelectorAll('[data-view-panel]')),
  statsGrid: document.getElementById('stats-grid'),
  referralToken: document.getElementById('referral-token'),
  referralLink: document.getElementById('referral-link'),
  recentUsersBody: document.getElementById('recent-users-body'),
  tableCaption: document.getElementById('table-caption'),
  usersTableBody: document.getElementById('users-table-body'),
  passwordForm: document.getElementById('password-form'),
  passwordCurrent: document.getElementById('password-current'),
  passwordNew: document.getElementById('password-new'),
  passwordConfirm: document.getElementById('password-confirm'),
  toast: document.getElementById('toast'),
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setToken(token) {
  state.token = token || '';
  if (state.token) {
    sessionStorage.setItem(TOKEN_KEY, state.token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

function showToast(message, tone = 'success') {
  elements.toast.hidden = false;
  elements.toast.dataset.tone = tone;
  elements.toast.textContent = message;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3600);
}

async function api(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({ status: 'ERROR', message: 'Invalid server response' }));
  if (!response.ok) {
    const error = new Error(data?.message || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

function formatDate(value) {
  if (!value) {
    return 'Not yet';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function renderStats() {
  const counts = state.counts || { total: 0, active: 0, pre_registered: 0, registered: 0, paid: 0 };
  elements.statsGrid.innerHTML = [
    ['Total Users', counts.total || 0],
    ['Active Users', counts.active || 0],
    ['Pre-Registered', counts.pre_registered || 0],
    ['Registered', counts.registered || 0],
    ['Paid Users', counts.paid || 0],
  ]
    .map(([label, value]) => `<article class="statCard"><span class="sectionTag">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join('');
}

function renderSession() {
  const isAuthed = Boolean(state.ambassador);
  elements.authShell.hidden = isAuthed;
  elements.appShell.hidden = !isAuthed;
  if (!isAuthed) {
    return;
  }
  elements.dashboardHeading.textContent = state.ambassador.is_owner ? 'Owner referral dashboard' : 'Ambassador dashboard';
  elements.dashboardSubheading.textContent = state.ambassador.full_name || state.ambassador.email || state.ambassador.telegram_id || '';
}

function renderReferralLink() {
  const referralToken = String(state.ambassador?.referral_token || '').trim();
  const startUrl = String(state.ambassador?.prereg_bot_start_url || '').trim();
  elements.referralToken.value = referralToken;
  elements.referralLink.value = startUrl;
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const currentPassword = String(elements.passwordCurrent?.value || '');
  const newPassword = String(elements.passwordNew?.value || '');
  const confirmPassword = String(elements.passwordConfirm?.value || '');

  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast('Fill current password, new password, and confirmation.', 'error');
    return;
  }
  if (newPassword !== confirmPassword) {
    showToast('New password and confirmation do not match.', 'error');
    return;
  }

  try {
    const data = await api('/ambassador/auth/change-password', {
      method: 'POST',
      body: {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      },
    });
    elements.passwordForm?.reset();
    showToast(data?.message || 'Password updated.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderRecentUsers() {
  const recentUsers = state.users.slice(0, 8);
  elements.recentUsersBody.innerHTML = recentUsers.length
    ? recentUsers
        .map(
          (user) => `
            <tr>
              <td>
                <strong>${escapeHtml(user.flamebot_id || 'Pending app login')}</strong>
                <div class="subtle">${escapeHtml(user.telegram_username ? `@${user.telegram_username}` : user.telegram_id || 'Unknown')}</div>
              </td>
              <td><span class="statusPill" data-status="${escapeHtml(user.status || '')}">${escapeHtml(String(user.status || '').replace('_', ' '))}</span></td>
              <td>${escapeHtml(user.platform || 'pending')}</td>
              <td class="subtle">${escapeHtml(formatDate(user.last_activity_at || user.last_login_at || user.created_at))}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="4" class="subtle">No referred users yet.</td></tr>';
}

function renderUsers() {
  if (!state.users.length) {
    elements.usersTableBody.innerHTML = '<tr><td colspan="6" class="subtle">No users have joined through your referral yet.</td></tr>';
    elements.tableCaption.textContent = 'No referral users returned yet.';
    return;
  }

  elements.tableCaption.textContent = `${state.users.length} user record${state.users.length === 1 ? '' : 's'} linked to your referral.`;
  elements.usersTableBody.innerHTML = state.users
    .map(
      (user) => `
        <tr>
          <td>
            <strong>${escapeHtml(user.flamebot_id || 'Pending app login')}</strong>
            <div class="subtle">${escapeHtml(user.telegram_username ? `@${user.telegram_username}` : user.telegram_id || 'Unknown')}</div>
          </td>
          <td>${escapeHtml(user.telegram_id || 'Unknown')}</td>
          <td><span class="statusPill" data-status="${escapeHtml(user.status || '')}">${escapeHtml(String(user.status || '').replace('_', ' '))}</span></td>
          <td>${escapeHtml(user.platform || 'pending')}</td>
          <td class="subtle">${escapeHtml(formatDate(user.last_login_at || user.first_app_login_at))}</td>
          <td class="subtle">${escapeHtml(formatDate(user.last_activity_at || user.backend_last_signal_at || user.created_at))}</td>
        </tr>
      `,
    )
    .join('');
}

function setView(view) {
  state.currentView = view;
  elements.navButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === view);
  });
  elements.viewPanels.forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
}

async function loadReferralData() {
  const [usersData, linkData] = await Promise.all([api('/ambassador/users'), api('/ambassador/referral-link')]);
  state.users = usersData.users || [];
  state.counts = usersData.counts || null;
  state.ambassador = {
    ...(state.ambassador || {}),
    ...(linkData.ambassador || {}),
    referral_token: linkData.referral_token,
    prereg_bot_start_url: linkData.prereg_bot_start_url,
  };
  renderStats();
  renderReferralLink();
  renderRecentUsers();
  renderUsers();
}

async function restoreSession() {
  if (!state.token) {
    renderSession();
    return;
  }
  try {
    const data = await api('/ambassador/auth/me');
    state.ambassador = data.ambassador || null;
    renderSession();
    setView('dashboard');
    await loadReferralData();
  } catch (error) {
    setToken('');
    state.ambassador = null;
    renderSession();
    if (error.status && error.status !== 401) {
      showToast(error.message, 'error');
    }
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(elements.loginForm);
  try {
    const data = await api('/ambassador/auth/login', {
      method: 'POST',
      body: {
        email: formData.get('email'),
        password: formData.get('password'),
      },
    });
    setToken(data.token || '');
    state.ambassador = data.ambassador || null;
    elements.loginForm.reset();
    renderSession();
    setView('dashboard');
    await loadReferralData();
    showToast('Dashboard unlocked.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleLogout() {
  try {
    if (state.token) {
      await api('/ambassador/auth/logout', { method: 'POST' });
    }
  } catch (_error) {
  } finally {
    setToken('');
    state.ambassador = null;
    state.users = [];
    state.counts = null;
    renderSession();
    showToast('Signed out.');
  }
}

function bindEvents() {
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.refreshButton.addEventListener('click', () => loadReferralData().then(() => showToast('Dashboard refreshed.')).catch((error) => showToast(error.message, 'error')));
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.passwordForm?.addEventListener('submit', handlePasswordChange);
  elements.navButtons.forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
}

bindEvents();
restoreSession();