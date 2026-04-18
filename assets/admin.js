const API_ROOT = '/api/backend';
const TOKEN_KEY = 'flamebot_admin_token';

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || '',
  admin: null,
  currentView: 'dashboard',
  overview: null,
  analytics: null,
  subscriptionSettings: null,
  plans: [],
  ambassadors: [],
  users: [],
  userCounts: null,
  selectedUserId: '',
  loaded: {
    overview: false,
    ambassadors: false,
    users: false,
    analytics: false,
  },
  filters: {
    search: '',
    status: '',
  },
  ambassadorOnboarding: {
    onboardingKey: '',
    verificationToken: '',
    expiresAtMs: 0,
    timerId: 0,
  },
};

const elements = {
  authShell: document.getElementById('auth-shell'),
  appShell: document.getElementById('app-shell'),
  loginForm: document.getElementById('login-form'),
  adminHeading: document.getElementById('admin-heading'),
  adminSubheading: document.getElementById('admin-subheading'),
  refreshButton: document.getElementById('refresh-button'),
  logoutButton: document.getElementById('logout-button'),
  navButtons: Array.from(document.querySelectorAll('[data-view]')),
  viewPanels: Array.from(document.querySelectorAll('[data-view-panel]')),
  statsGrid: document.getElementById('stats-grid'),
  subscriptionSettingsForm: document.getElementById('subscription-settings-form'),
  subscriptionEnforcementEnabled: document.getElementById('subscription-enforcement-enabled'),
  subscriptionMinVersion: document.getElementById('subscription-min-version'),
  subscriptionProviderReadiness: document.getElementById('subscription-provider-readiness'),
  subscriptionSettingsSave: document.getElementById('subscription-settings-save'),
  planCreateForm: document.getElementById('plan-create-form'),
  planCode: document.getElementById('plan-code'),
  planDisplayName: document.getElementById('plan-display-name'),
  planDurationDays: document.getElementById('plan-duration-days'),
  planPriceCents: document.getElementById('plan-price-cents'),
  planSortOrder: document.getElementById('plan-sort-order'),
  planIsActive: document.getElementById('plan-is-active'),
  planCreateBtn: document.getElementById('plan-create-btn'),
  plansTableBody: document.getElementById('plans-table-body'),
  growthTrend: document.getElementById('growth-trend'),
  recentUsersBody: document.getElementById('recent-users-body'),
  miniAdminForm: document.getElementById('mini-admin-form'),
  miniAdminName: document.getElementById('mini-admin-name'),
  miniAdminEmail: document.getElementById('mini-admin-email'),
  miniAdminTelegramId: document.getElementById('mini-admin-telegram-id'),
  miniAdminVerificationCode: document.getElementById('mini-admin-verification-code'),
  miniAdminOnboardingKey: document.getElementById('mini-admin-onboarding-key'),
  miniAdminVerificationToken: document.getElementById('mini-admin-verification-token'),
  miniAdminCodeCountdown: document.getElementById('mini-admin-code-countdown'),
  miniAdminSendCodeButton: document.getElementById('mini-admin-send-code'),
  miniAdminVerifyCodeButton: document.getElementById('mini-admin-verify-code'),
  ambassadorsTableBody: document.getElementById('ambassadors-table-body'),
  filtersForm: document.getElementById('filters-form'),
  filterSearch: document.getElementById('filter-search'),
  filterStatus: document.getElementById('filter-status'),
  usersSubstats: document.getElementById('users-substats'),
  usersTableBody: document.getElementById('users-table-body'),
  tableCaption: document.getElementById('table-caption'),
  selectedUserMeta: document.getElementById('selected-user-meta'),
  userEditorForm: document.getElementById('user-editor-form'),
  editorStatus: document.getElementById('editor-status'),
  editorReferrer: document.getElementById('editor-referrer'),
  editorEmail: document.getElementById('editor-email'),
  editorPassword: document.getElementById('editor-password'),
  editorAmbassador: document.getElementById('editor-ambassador'),
  editorOwner: document.getElementById('editor-owner'),
  clearReferrerButton: document.getElementById('clear-referrer-button'),
  referralPerformanceBody: document.getElementById('referral-performance-body'),
  recentReferralsBody: document.getElementById('recent-referrals-body'),
  analyticsCards: document.getElementById('analytics-cards'),
  dailyTraffic: document.getElementById('daily-traffic'),
  analyticsUsersBody: document.getElementById('analytics-users-body'),
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

function setButtonBusy(button, busy, idleLabel, busyLabel) {
  if (!button) {
    return;
  }
  button.disabled = Boolean(busy);
  button.textContent = busy ? busyLabel : idleLabel;
}

function updateAmbassadorActionButtons() {
  if (elements.miniAdminVerifyCodeButton) {
    elements.miniAdminVerifyCodeButton.disabled = false;
    elements.miniAdminVerifyCodeButton.textContent = 'Verify code';
  }
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
    error.payload = data;
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

function updateCodeCountdown() {
  const expiresAtMs = Number(state.ambassadorOnboarding.expiresAtMs || 0);
  if (!elements.miniAdminCodeCountdown) {
    return;
  }
  if (!expiresAtMs) {
    elements.miniAdminCodeCountdown.dataset.state = 'idle';
    elements.miniAdminCodeCountdown.textContent = 'Verification code not active.';
    return;
  }
  const remainingMs = Math.max(0, expiresAtMs - Date.now());
  const remainingSec = Math.ceil(remainingMs / 1000);
  if (remainingSec <= 0) {
    window.clearInterval(state.ambassadorOnboarding.timerId || 0);
    state.ambassadorOnboarding.timerId = 0;
    state.ambassadorOnboarding.verificationToken = '';
    state.ambassadorOnboarding.onboardingKey = '';
    state.ambassadorOnboarding.expiresAtMs = 0;
    if (elements.miniAdminVerificationToken) {
      elements.miniAdminVerificationToken.value = '';
    }
    if (elements.miniAdminOnboardingKey) {
      elements.miniAdminOnboardingKey.value = '';
    }
    elements.miniAdminCodeCountdown.dataset.state = 'expired';
    elements.miniAdminCodeCountdown.textContent = 'Code expired. Click Send code to request a new one.';
    return;
  }
  const minutes = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const seconds = String(remainingSec % 60).padStart(2, '0');
  elements.miniAdminCodeCountdown.dataset.state = 'active';
  elements.miniAdminCodeCountdown.textContent = `Code expires in ${minutes}:${seconds}`;
}

function startCodeCountdown(expiresInSec) {
  const ttl = Number(expiresInSec || 0);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    return;
  }
  window.clearInterval(state.ambassadorOnboarding.timerId || 0);
  state.ambassadorOnboarding.timerId = window.setInterval(updateCodeCountdown, 1000);
  state.ambassadorOnboarding.expiresAtMs = Date.now() + ttl * 1000;
  updateCodeCountdown();
}

function resetAmbassadorOnboarding({ keepInputs = true } = {}) {
  window.clearInterval(state.ambassadorOnboarding.timerId || 0);
  state.ambassadorOnboarding.timerId = 0;
  state.ambassadorOnboarding.onboardingKey = '';
  state.ambassadorOnboarding.verificationToken = '';
  state.ambassadorOnboarding.expiresAtMs = 0;
  if (elements.miniAdminOnboardingKey) {
    elements.miniAdminOnboardingKey.value = '';
  }
  if (elements.miniAdminVerificationToken) {
    elements.miniAdminVerificationToken.value = '';
  }
  if (!keepInputs) {
    if (elements.miniAdminTelegramId) {
      elements.miniAdminTelegramId.value = '';
    }
    if (elements.miniAdminVerificationCode) {
      elements.miniAdminVerificationCode.value = '';
    }
  }
  updateCodeCountdown();
  updateAmbassadorActionButtons();
}

function renderStats(container, cards) {
  container.innerHTML = cards
    .map(([label, value]) => `<article class="statCard"><span class="sectionTag">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join('');
}

function renderTrendList(container, points, valueLabel) {
  if (!Array.isArray(points) || !points.length) {
    container.innerHTML = '<p class="emptyState">No trend data yet.</p>';
    return;
  }
  const maxValue = Math.max(...points.map((point) => Number(point.users ?? point.visits ?? 0)), 1);
  container.innerHTML = points
    .map((point) => {
      const value = Number(point.users ?? point.visits ?? 0);
      const width = Math.max(8, Math.round((value / maxValue) * 100));
      return `
        <div class="trendRow">
          <div class="trendMeta">
            <span>${escapeHtml(point.label || '')}</span>
            <span>${escapeHtml(`${value} ${valueLabel}`)}</span>
          </div>
          <div class="trendBar"><span style="width:${width}%"></span></div>
        </div>
      `;
    })
    .join('');
}

function userLabel(user) {
  const flamebotId = user.flamebot_id || 'Pending app login';
  const telegram = user.telegram_username ? `${user.telegram_id} • @${user.telegram_username}` : user.telegram_id;
  return `<strong>${escapeHtml(flamebotId)}</strong><div class="subtle">${escapeHtml(telegram || 'Unknown Telegram')}</div>`;
}

function renderSession() {
  const isAuthed = Boolean(state.admin);
  elements.authShell.hidden = isAuthed;
  elements.appShell.hidden = !isAuthed;
  if (!isAuthed) {
    return;
  }
  elements.adminHeading.textContent = state.admin.role === 'main_admin' ? 'Admin dashboard' : 'Restricted dashboard';
  elements.adminSubheading.textContent = state.admin.email || '';
}

function renderDashboard() {
  const summary = state.overview?.summary || {};
  renderStats(elements.statsGrid, [
    ['Total Users', summary.total_users || 0],
    ['Active Users', summary.active_users || 0],
    ['Pre-Registered', summary.pre_registered_users || 0],
    ['Registered', summary.registered_users || 0],
    ['Paid Users', summary.paid_users || 0],
  ]);
  renderTrendList(elements.growthTrend, state.overview?.growth_trend?.daily || [], 'users');

  const recentUsers = Array.isArray(state.overview?.recent_users) ? state.overview.recent_users : [];
  elements.recentUsersBody.innerHTML = recentUsers.length
    ? recentUsers
        .map(
          (user) => `
            <tr>
              <td>${userLabel(user)}</td>
              <td>${escapeHtml(user.telegram_username ? `@${user.telegram_username}` : user.telegram_id || 'Unknown')}</td>
              <td><span class="statusPill" data-status="${escapeHtml(user.status || '')}">${escapeHtml(String(user.status || '').replace('_', ' '))}</span></td>
              <td>${escapeHtml(user.referred_by_email || (user.referred_by_telegram_id ? `Telegram ${user.referred_by_telegram_id}` : 'Owner / direct'))}</td>
              <td class="subtle">${escapeHtml(formatDate(user.last_activity_at || user.last_login_at || user.created_at))}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="5" class="subtle">No users yet.</td></tr>';
}

function renderSubscriptionSettings() {
  const settings = state.subscriptionSettings?.settings || {};
  const providers = state.subscriptionSettings?.providers || {};

  if (elements.subscriptionEnforcementEnabled) {
    elements.subscriptionEnforcementEnabled.value = String(Boolean(settings.enforcement_enabled));
  }
  if (elements.subscriptionMinVersion) {
    elements.subscriptionMinVersion.value = String(settings.min_supported_app_version || '');
  }
  if (elements.subscriptionProviderReadiness) {
    elements.subscriptionProviderReadiness.value = JSON.stringify(providers, null, 2);
  }
  // Plans may be embedded in the settings response.
  if (Array.isArray(state.subscriptionSettings?.plans)) {
    state.plans = state.subscriptionSettings.plans;
  }
  renderPlans();
}

function renderPlans() {
  if (!elements.plansTableBody) return;
  const plans = state.plans || [];
  if (!plans.length) {
    elements.plansTableBody.innerHTML = '<tr><td colspan="6" class="subtle">No plans yet. Create one above.</td></tr>';
    return;
  }
  elements.plansTableBody.innerHTML = plans
    .map(
      (plan) => `
        <tr>
          <td><strong>${escapeHtml(plan.plan_code)}</strong></td>
          <td>${escapeHtml(plan.display_name)}</td>
          <td>${escapeHtml(plan.duration_days)}</td>
          <td>$${escapeHtml((plan.price_usd_cents / 100).toFixed(2))}</td>
          <td><span class="statusPill" data-status="${plan.is_active ? 'paid' : 'pre_registered'}">${plan.is_active ? 'Active' : 'Inactive'}</span></td>
          <td>
            <button class="rowButton" data-plan-toggle="${escapeHtml(plan.id)}" data-plan-active="${plan.is_active}" type="button">${plan.is_active ? 'Deactivate' : 'Activate'}</button>
            <button class="rowButton" data-plan-edit="${escapeHtml(plan.id)}" type="button">Edit price</button>
            <button class="rowButton" data-plan-delete="${escapeHtml(plan.id)}" type="button">Delete</button>
          </td>
        </tr>
      `,
    )
    .join('');

  elements.plansTableBody.querySelectorAll('[data-plan-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => handlePlanToggle(btn.dataset.planToggle, btn.dataset.planActive !== 'true'));
  });
  elements.plansTableBody.querySelectorAll('[data-plan-edit]').forEach((btn) => {
    btn.addEventListener('click', () => handlePlanEditPrice(btn.dataset.planEdit));
  });
  elements.plansTableBody.querySelectorAll('[data-plan-delete]').forEach((btn) => {
    btn.addEventListener('click', () => handlePlanDelete(btn.dataset.planDelete));
  });
}

function renderAmbassadorOptions() {
  const selectedUser = state.users.find((user) => (user.record_id || user.flamebot_id) === state.selectedUserId);
  const currentReferrer = selectedUser?.referred_by_telegram_id || '';
  const ambassadorHasCurrentReferrer = state.ambassadors.some((a) => a.telegram_id === currentReferrer);
  const extraOption =
    currentReferrer && !ambassadorHasCurrentReferrer
      ? [`<option value="${escapeHtml(currentReferrer)}" selected>Telegram ${escapeHtml(currentReferrer)}${selectedUser?.referred_by_email ? ` — ${escapeHtml(selectedUser.referred_by_email)}` : ''}</option>`]
      : [];
  elements.editorReferrer.innerHTML = ['<option value="">Unassigned</option>']
    .concat(
      state.ambassadors.map(
        (ambassador) => `<option value="${escapeHtml(ambassador.telegram_id || '')}" ${ambassador.telegram_id === currentReferrer ? 'selected' : ''}>${escapeHtml(ambassador.display_label || ambassador.email || ambassador.telegram_id || 'Unknown')}</option>`,
      ),
    )
    .concat(extraOption)
    .join('');
}

function renderAmbassadors() {
  elements.ambassadorsTableBody.innerHTML = state.ambassadors.length
    ? state.ambassadors
        .map(
          (ambassador) => `
            <tr>
              <td>
                <strong>${escapeHtml(ambassador.display_label || ambassador.email || ambassador.telegram_id || 'Unknown')}</strong>
                <div class="subtle">${escapeHtml(ambassador.dashboard_url || 'No dashboard URL')}</div>
              </td>
              <td>${escapeHtml(ambassador.telegram_id || 'Unknown')}</td>
              <td>${escapeHtml(ambassador.total_referred_users || 0)}</td>
              <td>${escapeHtml(ambassador.pre_registered_users || 0)}</td>
              <td>${escapeHtml(ambassador.registered_users || 0)}</td>
              <td>${escapeHtml(ambassador.paid_users || 0)}</td>
              <td>${escapeHtml(ambassador.active_users || 0)}</td>
              <td>${escapeHtml(`${ambassador.conversion_rate || 0}%`)}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="8" class="subtle">No ambassadors yet.</td></tr>';

  elements.referralPerformanceBody.innerHTML = state.ambassadors.length
    ? state.ambassadors
        .map(
          (ambassador) => `
            <tr>
              <td>${escapeHtml(ambassador.display_label || ambassador.email || ambassador.telegram_id || 'Unknown')}</td>
              <td>${escapeHtml(ambassador.total_referred_users || 0)}</td>
              <td>${escapeHtml(ambassador.pre_registered_users || 0)}</td>
              <td>${escapeHtml(ambassador.registered_users || 0)}</td>
              <td>${escapeHtml(ambassador.paid_users || 0)}</td>
              <td>${escapeHtml(`${ambassador.conversion_rate || 0}%`)}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="6" class="subtle">No referral performance data yet.</td></tr>';

  renderAmbassadorOptions();
}

function renderUserSubstats() {
  const counts = state.userCounts || { total: 0, active: 0, pre_registered: 0, registered: 0, paid: 0 };
  elements.usersSubstats.innerHTML = [
    ['Visible users', counts.total || 0],
    ['Active', counts.active || 0],
    ['Pre-registered', counts.pre_registered || 0],
    ['Registered', counts.registered || 0],
    ['Paid', counts.paid || 0],
  ]
    .map(([label, value]) => `<span class="subStatChip"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></span>`)
    .join('');
}

function selectUser(recordId) {
  state.selectedUserId = recordId;
  const user = state.users.find((entry) => (entry.record_id || entry.flamebot_id) === recordId);
  if (!user) {
    elements.selectedUserMeta.textContent = 'Select a user from the table.';
    return;
  }
  elements.selectedUserMeta.textContent = `${user.telegram_id || 'Unknown'} • ${user.platform || 'pending'} • ${formatDate(user.last_activity_at || user.last_login_at || user.created_at)}`;
  elements.editorStatus.value = user.status || 'pre_registered';
  elements.editorEmail.value = user.email || '';
  elements.editorPassword.value = '';
  elements.editorAmbassador.value = user.is_ambassador ? 'true' : 'false';
  elements.editorOwner.value = user.is_owner ? 'true' : 'false';
  renderAmbassadorOptions();
}

function renderUsers() {
  renderUserSubstats();
  if (!state.users.length) {
    elements.usersTableBody.innerHTML = '<tr><td colspan="8" class="subtle">No users matched the current filter.</td></tr>';
    elements.tableCaption.textContent = 'No records returned for the current filter.';
    elements.recentReferralsBody.innerHTML = '<tr><td colspan="4" class="subtle">No referral users yet.</td></tr>';
    return;
  }

  elements.tableCaption.textContent = `${state.users.length} user record${state.users.length === 1 ? '' : 's'} loaded from the backend.`;
  elements.usersTableBody.innerHTML = state.users
    .map(
      (user) => `
        <tr>
          <td>${userLabel(user)}</td>
          <td>${escapeHtml(user.telegram_username ? `@${user.telegram_username}` : user.telegram_id || 'Unknown')}</td>
          <td><span class="statusPill" data-status="${escapeHtml(user.status || '')}">${escapeHtml(String(user.status || '').replace('_', ' '))}</span></td>
          <td>
            <strong>${escapeHtml(user.platform || 'pending')}</strong>
            <div class="subtle">${escapeHtml(user.last_seen_device || 'No device recorded')}</div>
          </td>
          <td>${escapeHtml(user.referred_by_email || (user.referred_by_telegram_id ? `Telegram ${user.referred_by_telegram_id}` : 'Owner / direct'))}</td>
          <td class="subtle">${escapeHtml(formatDate(user.last_activity_at || user.backend_last_signal_at || user.created_at))}</td>
          <td><button class="rowButton" data-user-id="${escapeHtml(user.record_id || user.flamebot_id || '')}" type="button">Manage</button></td>
        </tr>
      `,
    )
    .join('');

  elements.usersTableBody.querySelectorAll('[data-user-id]').forEach((button) => {
    button.addEventListener('click', () => selectUser(button.dataset.userId));
  });

  const referredUsers = state.users.filter((user) => user.referred_by_telegram_id);
  elements.recentReferralsBody.innerHTML = referredUsers.length
    ? referredUsers
        .slice(0, 12)
        .map(
          (user) => `
            <tr>
              <td>${userLabel(user)}</td>
              <td>${escapeHtml(user.referred_by_email || user.referred_by_telegram_id || 'Unknown')}</td>
              <td><span class="statusPill" data-status="${escapeHtml(user.status || '')}">${escapeHtml(String(user.status || '').replace('_', ' '))}</span></td>
              <td class="subtle">${escapeHtml(formatDate(user.last_activity_at || user.created_at))}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="4" class="subtle">No referral users yet.</td></tr>';

  renderAmbassadorOptions();
}

function renderAnalytics() {
  const website = state.analytics?.website || {};
  const backend = state.analytics?.backend || {};
  const users = state.analytics?.users || {};
  renderStats(elements.analyticsCards, [
    ['Total Site Visits', website.total_site_visits || 0],
    ['Website Hits', website.website_hits || 0],
    ['Unique Visitors', website.unique_visitors || 0],
    ['Active Users', users.active_users || 0],
    ['Online Sessions', backend.online_sessions || 0],
  ]);
  renderTrendList(elements.dailyTraffic, website.daily_traffic || [], 'visits');
  const recentActivity = Array.isArray(users.recent_activity) ? users.recent_activity : [];
  elements.analyticsUsersBody.innerHTML = recentActivity.length
    ? recentActivity
        .map(
          (user) => `
            <tr>
              <td>${userLabel(user)}</td>
              <td><span class="statusPill" data-status="${escapeHtml(user.status || '')}">${escapeHtml(String(user.status || '').replace('_', ' '))}</span></td>
              <td>${escapeHtml(user.last_seen_platform || user.platform || 'pending')}</td>
              <td class="subtle">${escapeHtml(formatDate(user.last_activity_at || user.last_login_at || user.created_at))}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="4" class="subtle">No activity data yet.</td></tr>';
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

async function loadOverview() {
  const [overviewData, subscriptionSettingsData] = await Promise.all([
    api('/admin/overview'),
    api('/admin/subscription/settings'),
  ]);
  state.overview = overviewData;
  state.subscriptionSettings = subscriptionSettingsData;
  state.loaded.overview = true;
  renderDashboard();
  renderSubscriptionSettings();
}

async function loadAmbassadors() {
  const data = await api('/admin/ambassadors');
  state.ambassadors = data.ambassadors || [];
  state.loaded.ambassadors = true;
  renderAmbassadors();
}

async function loadUsers() {
  const params = new URLSearchParams();
  if (state.filters.search) {
    params.set('search', state.filters.search);
  }
  if (state.filters.status) {
    params.set('status', state.filters.status);
  }
  const data = await api(`/admin/users${params.toString() ? `?${params.toString()}` : ''}`);
  state.users = data.users || [];
  state.userCounts = data.counts || null;
  state.loaded.users = true;
  if (state.selectedUserId && !state.users.some((user) => (user.record_id || user.flamebot_id) === state.selectedUserId)) {
    state.selectedUserId = '';
    elements.selectedUserMeta.textContent = 'Select a user from the table.';
  }
  renderUsers();
}

async function loadAnalytics() {
  const data = await api('/admin/analytics');
  state.analytics = data;
  state.loaded.analytics = true;
  renderAnalytics();
}

async function ensureViewData(view) {
  if (view === 'dashboard' && !state.loaded.overview) {
    await loadOverview();
  }
  if (view === 'ambassadors' && !state.loaded.ambassadors) {
    await loadAmbassadors();
  }
  if ((view === 'users' || view === 'referrals') && !state.loaded.users) {
    await loadUsers();
  }
  if (view === 'referrals' && !state.loaded.ambassadors) {
    await loadAmbassadors();
  }
  if (view === 'analytics' && !state.loaded.analytics) {
    await loadAnalytics();
  }
}

function resetLoaded() {
  state.loaded = { overview: false, ambassadors: false, users: false, analytics: false };
}

async function restoreSession() {
  if (!state.token) {
    renderSession();
    return;
  }
  try {
    const data = await api('/admin/auth/me');
    state.admin = data.admin || null;
    renderSession();
    setView('dashboard');
    await ensureViewData('dashboard');
  } catch (error) {
    setToken('');
    state.admin = null;
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
    const data = await api('/admin/auth/login', {
      method: 'POST',
      body: {
        email: formData.get('email'),
        password: formData.get('password'),
      },
    });
    setToken(data.token || '');
    state.admin = data.admin || null;
    resetLoaded();
    elements.loginForm.reset();
    renderSession();
    setView('dashboard');
    await ensureViewData('dashboard');
    showToast('Dashboard unlocked.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleLogout() {
  try {
    if (state.token) {
      await api('/admin/auth/logout', { method: 'POST' });
    }
  } catch (_error) {
  } finally {
    setToken('');
    state.admin = null;
    state.overview = null;
    state.analytics = null;
    state.ambassadors = [];
    state.users = [];
    state.userCounts = null;
    state.selectedUserId = '';
    resetLoaded();
    renderSession();
    showToast('Signed out.');
  }
}

async function handleRefresh() {
  try {
    resetLoaded();
    await ensureViewData(state.currentView);
    if (state.currentView !== 'dashboard') {
      await ensureViewData('dashboard');
    }
    showToast('Dashboard refreshed.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function reloadPlans() {
  try {
    const data = await api('/admin/subscription/plans');
    state.plans = data.plans || [];
    renderPlans();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handlePlanCreate(event) {
  event.preventDefault();
  try {
    setButtonBusy(elements.planCreateBtn, true, 'Create plan', 'Creating...');
    const payload = {
      plan_code: String(elements.planCode?.value || '').trim().toLowerCase(),
      display_name: String(elements.planDisplayName?.value || '').trim(),
      duration_days: Number(elements.planDurationDays?.value || 0),
      price_usd_cents: Number(elements.planPriceCents?.value || 0),
      sort_order: Number(elements.planSortOrder?.value || 0),
      is_active: String(elements.planIsActive?.value || 'true') === 'true',
    };
    await api('/admin/subscription/plans', { method: 'POST', body: payload });
    elements.planCreateForm?.reset();
    await reloadPlans();
    showToast('Plan created.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setButtonBusy(elements.planCreateBtn, false, 'Create plan', 'Creating...');
  }
}

async function handlePlanToggle(planId, setActive) {
  try {
    const data = await api(`/admin/subscription/plans/${encodeURIComponent(planId)}`, {
      method: 'PATCH',
      body: { is_active: setActive },
    });
    state.plans = state.plans.map((p) => (p.id === planId ? data.plan : p));
    renderPlans();
    showToast(`Plan ${setActive ? 'activated' : 'deactivated'}.`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handlePlanEditPrice(planId) {
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan) return;
  const currentCents = plan.price_usd_cents;
  const input = window.prompt(`Update price for "${plan.display_name}" (enter USD cents, e.g. 1000 = $10.00):`, String(currentCents));
  if (input === null) return;
  const newCents = Number(input);
  if (!Number.isFinite(newCents) || newCents < 0) {
    showToast('Invalid price. Enter a non-negative integer in cents.', 'error');
    return;
  }
  try {
    const data = await api(`/admin/subscription/plans/${encodeURIComponent(planId)}`, {
      method: 'PATCH',
      body: { price_usd_cents: Math.round(newCents) },
    });
    state.plans = state.plans.map((p) => (p.id === planId ? data.plan : p));
    renderPlans();
    showToast('Plan price updated.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handlePlanDelete(planId) {
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan) return;
  if (!window.confirm(`Delete plan "${plan.display_name}" (${plan.plan_code})? This cannot be undone.`)) return;
  try {
    await api(`/admin/subscription/plans/${encodeURIComponent(planId)}`, { method: 'DELETE' });
    state.plans = state.plans.filter((p) => p.id !== planId);
    renderPlans();
    showToast('Plan deleted.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleSubscriptionSettingsSubmit(event) {
  event.preventDefault();
  try {
    setButtonBusy(elements.subscriptionSettingsSave, true, 'Save subscription settings', 'Saving...');
    const payload = {
      enforcement_enabled: String(elements.subscriptionEnforcementEnabled?.value || 'false') === 'true',
      min_supported_app_version: String(elements.subscriptionMinVersion?.value || '').trim(),
    };
    const data = await api('/admin/subscription/settings', {
      method: 'POST',
      body: payload,
    });
    state.subscriptionSettings = data;
    renderSubscriptionSettings();
    showToast('Subscription settings updated.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setButtonBusy(elements.subscriptionSettingsSave, false, 'Save subscription settings', 'Saving...');
  }
}

async function handleMiniAdminCreate(event) {
  event.preventDefault();
  const formData = new FormData(elements.miniAdminForm);
  const verificationToken = state.ambassadorOnboarding.verificationToken || String(formData.get('verification_token') || '').trim();
  if (!verificationToken) {
    showToast('Send and verify the Telegram code first.', 'error');
    return;
  }
  try {
    const data = await api('/admin/ambassadors', {
      method: 'POST',
      body: {
        name: formData.get('name'),
        email: formData.get('email'),
        telegram_id: String(formData.get('telegram_id') || '').trim() || null,
        verification_token: verificationToken,
      },
    });
    elements.miniAdminForm.reset();
    resetAmbassadorOnboarding({ keepInputs: false });
    state.loaded.ambassadors = false;
    state.loaded.overview = false;
    await Promise.all([ensureViewData('ambassadors'), ensureViewData('dashboard')]);
    showToast(data?.ambassador?.dashboard_url ? `Ambassador created. Login URL: ${data.ambassador.dashboard_url}` : 'Ambassador created.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleAmbassadorSendCode() {
  const name = String(elements.miniAdminName?.value || '').trim();
  const email = String(elements.miniAdminEmail?.value || '').trim();
  const telegramId = String(elements.miniAdminTelegramId?.value || '').trim();
  if (!telegramId) {
    showToast('Enter Telegram ID first.', 'error');
    return;
  }
  try {
    setButtonBusy(elements.miniAdminSendCodeButton, true, 'Send code', 'Sending...');
    const data = await api('/admin/ambassadors/send-code', {
      method: 'POST',
      body: {
        name,
        email,
        telegram_id: telegramId,
      },
    });
    resetAmbassadorOnboarding({ keepInputs: true });
    const onboardingKey = String(data?.verification?.onboarding_key || '').trim();
    state.ambassadorOnboarding.onboardingKey = onboardingKey;
    if (elements.miniAdminOnboardingKey) {
      elements.miniAdminOnboardingKey.value = onboardingKey;
    }
    startCodeCountdown(Number(data?.verification?.expires_in_sec || 0));
    if (elements.miniAdminVerificationCode) {
      elements.miniAdminVerificationCode.value = '';
      elements.miniAdminVerificationCode.focus();
    }
    const tgExact = String(data?.verification?.telegram_id || '').trim();
    const tgMasked = String(data?.verification?.telegram_id_masked || '').trim() || 'Unavailable';
    const chatExact = String(data?.verification?.delivery_chat_id || '').trim();
    const chatMasked = String(data?.verification?.delivery_chat_id_masked || '').trim() || 'Unavailable';
    const chatSource = String(data?.verification?.delivery_chat_id_source || '').trim() || 'unknown';
    const tgUsername = String(data?.verification?.telegram_username || '').trim();
    const botUsername = String(data?.verification?.bot_username || '').trim();
    const botSource = String(data?.verification?.bot_token_source || '').trim();
    showToast(`Code sent to ${tgUsername ? `@${tgUsername}` : tgMasked} (tg: ${tgExact || tgMasked}, chat: ${chatExact || chatMasked}, source: ${chatSource}) via ${botUsername ? `@${botUsername}` : 'configured bot'} [${botSource || 'unknown source'}].`);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setButtonBusy(elements.miniAdminSendCodeButton, false, 'Send code', 'Sending...');
    updateAmbassadorActionButtons();
  }
}

async function handleAmbassadorVerifyCode() {
  const onboardingKey = String(state.ambassadorOnboarding.onboardingKey || elements.miniAdminOnboardingKey?.value || '').trim();
  const telegramId = String(elements.miniAdminTelegramId?.value || '').trim();
  const code = String(elements.miniAdminVerificationCode?.value || '').trim();
  if (!onboardingKey && !telegramId) {
    showToast('Enter Telegram ID first or click Send code.', 'error');
    return;
  }
  if (!code) {
    showToast('Enter the verification code from Telegram.', 'error');
    return;
  }
  try {
    setButtonBusy(elements.miniAdminVerifyCodeButton, true, 'Verify code', 'Verifying...');
    const data = await api('/admin/ambassadors/verify-code', {
      method: 'POST',
      body: {
        onboarding_key: onboardingKey || null,
        telegram_id: telegramId || null,
        verification_code: code,
      },
    });
    const refreshedOnboardingKey = String(data?.verification?.onboarding_key || onboardingKey).trim();
    state.ambassadorOnboarding.onboardingKey = refreshedOnboardingKey;
    if (elements.miniAdminOnboardingKey) {
      elements.miniAdminOnboardingKey.value = refreshedOnboardingKey;
    }
    const token = String(data?.verification?.verification_token || '').trim();
    state.ambassadorOnboarding.verificationToken = token;
    if (elements.miniAdminVerificationToken) {
      elements.miniAdminVerificationToken.value = token;
    }
    if (elements.miniAdminTelegramId) {
      elements.miniAdminTelegramId.value = String(data?.verification?.telegram_id || '');
    }
    startCodeCountdown(Number(data?.verification?.expires_in_sec || 0));
    showToast('Telegram ID verified. You can now create ambassador access.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setButtonBusy(elements.miniAdminVerifyCodeButton, false, 'Verify code', 'Verifying...');
    updateAmbassadorActionButtons();
  }
}

async function handleUserUpdate(event) {
  event.preventDefault();
  if (!state.selectedUserId) {
    showToast('Select a user first.', 'error');
    return;
  }
  try {
    await api(`/admin/users/${encodeURIComponent(state.selectedUserId)}`, {
      method: 'PATCH',
      body: {
        registration_status: elements.editorStatus.value,
        referred_by_telegram_id: elements.editorReferrer.value || null,
        email: elements.editorEmail.value.trim() || null,
        password: elements.editorPassword.value,
        is_ambassador: elements.editorAmbassador.value === 'true',
        is_owner: elements.editorOwner.value === 'true',
      },
    });
    state.loaded.users = false;
    state.loaded.ambassadors = false;
    state.loaded.overview = false;
    state.loaded.analytics = false;
    await Promise.all([ensureViewData('users'), ensureViewData('ambassadors'), ensureViewData('dashboard')]);
    if (state.selectedUserId) {
      selectUser(state.selectedUserId);
    }
    showToast('User updated.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function clearReferrer() {
  if (!state.selectedUserId) {
    showToast('Select a user first.', 'error');
    return;
  }
  try {
    await api(`/admin/users/${encodeURIComponent(state.selectedUserId)}`, {
      method: 'PATCH',
      body: { clear_referrer: true },
    });
    state.loaded.users = false;
    state.loaded.ambassadors = false;
    state.loaded.overview = false;
    await Promise.all([ensureViewData('users'), ensureViewData('ambassadors'), ensureViewData('dashboard')]);
    showToast('Referrer cleared.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function applyFilters(event) {
  event.preventDefault();
  state.filters.search = elements.filterSearch.value.trim();
  state.filters.status = elements.filterStatus.value;
  state.loaded.users = false;
  await ensureViewData('users').catch((error) => showToast(error.message, 'error'));
}

function bindEvents() {
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.refreshButton.addEventListener('click', handleRefresh);
  elements.miniAdminForm.addEventListener('submit', handleMiniAdminCreate);
  elements.miniAdminSendCodeButton?.addEventListener('click', handleAmbassadorSendCode);
  elements.miniAdminVerifyCodeButton?.addEventListener('click', handleAmbassadorVerifyCode);
  [elements.miniAdminName, elements.miniAdminEmail, elements.miniAdminTelegramId].forEach((input) => {
    input?.addEventListener('input', () => {
      resetAmbassadorOnboarding({ keepInputs: true });
    });
  });
  elements.filtersForm.addEventListener('submit', applyFilters);
  elements.userEditorForm.addEventListener('submit', handleUserUpdate);
  elements.clearReferrerButton.addEventListener('click', clearReferrer);
  elements.subscriptionSettingsForm?.addEventListener('submit', handleSubscriptionSettingsSubmit);
  elements.planCreateForm?.addEventListener('submit', handlePlanCreate);
  elements.navButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const nextView = button.dataset.view;
      setView(nextView);
      try {
        await ensureViewData(nextView);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

bindEvents();
updateCodeCountdown();
updateAmbassadorActionButtons();
restoreSession();