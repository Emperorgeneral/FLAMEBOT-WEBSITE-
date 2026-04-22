const API_ROOT = '/api/email';
const SEEN_THREADS_KEY = 'flamebot-mail-thread-seen';

const state = {
  authenticated: false,
  page: 'inbox',
  recipients: [],
  threads: [],
  activeThread: null,
  activeThreadEmail: '',
  selectedRecipientEmail: '',
  selectedRecipients: new Set(),
  inboxQuery: '',
  singleRecipientQuery: '',
  singleRecipientSource: 'all',
  bulkRecipientQuery: '',
  bulkRecipientSource: 'all',
  seenThreads: loadSeenThreads(),
};

const elements = {
  authShell: document.getElementById('mail-auth-shell'),
  appShell: document.getElementById('mail-app-shell'),
  loginForm: document.getElementById('mail-login-form'),
  loginSubmit: document.getElementById('mail-login-submit'),
  loginEmail: document.getElementById('mail-login-email'),
  loginPassword: document.getElementById('mail-login-password'),
  logoutButton: document.getElementById('mail-logout'),
  refreshButton: document.getElementById('refresh-history'),

  navInbox: document.getElementById('nav-inbox'),
  navSingle: document.getElementById('nav-single'),
  navBulk: document.getElementById('nav-bulk'),
  navInboxBadge: document.getElementById('nav-inbox-badge'),
  railRecipientCount: document.getElementById('rail-recipient-count'),
  railThreadCount: document.getElementById('rail-thread-count'),

  pageInbox: document.getElementById('page-inbox'),
  pageThread: document.getElementById('page-thread'),
  pageSingle: document.getElementById('page-single'),
  pageBulk: document.getElementById('page-bulk'),

  inboxSearch: document.getElementById('inbox-search'),
  inboxSearchBtn: document.getElementById('inbox-search-btn'),
  inboxThreadList: document.getElementById('inbox-thread-list'),

  threadBack: document.getElementById('thread-back'),
  threadTitle: document.getElementById('thread-title'),
  threadMeta: document.getElementById('thread-meta'),
  threadStream: document.getElementById('thread-stream'),
  threadReplyForm: document.getElementById('thread-reply-form'),
  threadReplySubject: document.getElementById('thread-reply-subject'),
  threadReplyText: document.getElementById('thread-reply-text'),
  threadReplySubmit: document.getElementById('thread-reply-submit'),

  singleRecipientSearch: document.getElementById('single-recipient-search'),
  singleRecipientSource: document.getElementById('single-recipient-source'),
  singleRecipientList: document.getElementById('single-recipient-list'),
  singleSelectedTitle: document.getElementById('single-selected-title'),
  singleSelectedMeta: document.getElementById('single-selected-meta'),
  singleForm: document.getElementById('single-send-form'),
  singleSubject: document.getElementById('single-subject'),
  singleText: document.getElementById('single-text'),
  singleReplyTo: document.getElementById('single-reply-to'),
  singleSubmit: document.getElementById('single-submit'),

  bulkRecipientSearch: document.getElementById('bulk-recipient-search'),
  bulkRecipientSource: document.getElementById('bulk-recipient-source'),
  bulkSelectShown: document.getElementById('bulk-select-shown'),
  bulkSelectAll: document.getElementById('bulk-select-all'),
  bulkClearAll: document.getElementById('bulk-clear-all'),
  bulkRecipientList: document.getElementById('bulk-recipient-list'),
  bulkSelectedMeta: document.getElementById('bulk-selected-meta'),
  bulkSelectionSummary: document.getElementById('bulk-selection-summary'),
  bulkForm: document.getElementById('bulk-send-form'),
  bulkSubject: document.getElementById('bulk-subject'),
  bulkText: document.getElementById('bulk-text'),
  bulkReplyTo: document.getElementById('bulk-reply-to'),
  bulkSubmit: document.getElementById('bulk-submit'),

  toast: document.getElementById('toast'),
};

function loadSeenThreads() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEEN_THREADS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveSeenThreads() {
  window.localStorage.setItem(SEEN_THREADS_KEY, JSON.stringify(state.seenThreads));
}

function showToast(message, tone = 'success') {
  elements.toast.hidden = false;
  elements.toast.dataset.tone = tone;
  elements.toast.textContent = message;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3800);
}

function setBusy(button, busy, idleLabel, busyLabel) {
  button.disabled = Boolean(busy);
  button.textContent = busy ? busyLabel : idleLabel;
}

function renderAuthState() {
  const authed = Boolean(state.authenticated);
  elements.authShell.hidden = authed;
  elements.appShell.hidden = !authed;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeOptional(value) {
  const text = String(value || '').trim();
  return text || undefined;
}

function formatDate(value) {
  if (!value) {
    return 'N/A';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function formatShortDate(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function requestErrorMessage(payload, response) {
  if (payload?.message) {
    return String(payload.message);
  }
  if (typeof payload?.detail === 'string') {
    return String(payload.detail);
  }
  return `Request failed (${response.status})`;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({ status: 'ERROR', message: 'Invalid response from API' }));
  if (response.status === 401) {
    const message = requestErrorMessage(payload, response);
    if (/sign in required/i.test(message)) {
      state.authenticated = false;
      renderAuthState();
    }
    throw new Error(message);
  }
  if (!response.ok) {
    throw new Error(requestErrorMessage(payload, response));
  }
  return payload;
}

async function checkSession() {
  const response = await fetch(`${API_ROOT}/auth/me`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  state.authenticated = Boolean(payload && payload.authenticated);
  renderAuthState();
  return state.authenticated;
}

function recipientLabel(entry) {
  const name = String(entry.display_name || '').trim();
  return name ? name : String(entry.email || '');
}

function recipientMeta(entry) {
  return `${String(entry.email || '')} · ${String(entry.source || 'unknown')}`;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function messageText(message) {
  return String(message.body_text || '').trim() || stripHtml(message.body_html || '');
}

function hasUnread(thread) {
  if (String(thread.last_message_direction) !== 'received') {
    return false;
  }
  const seen = state.seenThreads[thread.participant_email];
  const seenTime = seen ? new Date(seen).getTime() : 0;
  const lastTime = thread.last_message_at ? new Date(thread.last_message_at).getTime() : 0;
  return lastTime > seenTime;
}

function markThreadSeen(thread) {
  const latestIncoming = [...(thread.messages || [])].reverse().find((message) => String(message.direction) === 'received');
  if (!latestIncoming) {
    return;
  }
  state.seenThreads[thread.participant_email] = latestIncoming.timestamp;
  saveSeenThreads();
}

function filteredRecipients(mode) {
  const query = String(mode === 'bulk' ? state.bulkRecipientQuery : state.singleRecipientQuery).trim().toLowerCase();
  const source = String(mode === 'bulk' ? state.bulkRecipientSource : state.singleRecipientSource);
  return state.recipients.filter((row) => {
    const matchesSource = source === 'all' || String(row.source || '') === source;
    if (!matchesSource) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      String(row.email || '').toLowerCase().includes(query)
      || String(row.display_name || '').toLowerCase().includes(query)
      || String(row.first_name || '').toLowerCase().includes(query)
      || String(row.last_name || '').toLowerCase().includes(query)
      || String(row.source || '').toLowerCase().includes(query)
    );
  });
}

function updateSidebarStats() {
  elements.railRecipientCount.textContent = String(state.recipients.length);
  elements.railThreadCount.textContent = String(state.threads.length);
  const unreadThreads = state.threads.filter(hasUnread).length;
  elements.navInboxBadge.hidden = unreadThreads === 0;
  elements.navInboxBadge.textContent = String(unreadThreads);
}

function setPage(page) {
  state.page = page;

  elements.navInbox.classList.toggle('active', page === 'inbox' || page === 'thread');
  elements.navSingle.classList.toggle('active', page === 'single');
  elements.navBulk.classList.toggle('active', page === 'bulk');

  elements.pageInbox.hidden = page !== 'inbox';
  elements.pageThread.hidden = page !== 'thread';
  elements.pageSingle.hidden = page !== 'single';
  elements.pageBulk.hidden = page !== 'bulk';
}

function renderInboxList() {
  if (!state.threads.length) {
    elements.inboxThreadList.innerHTML = '<div class="emptyState small"><h3>No senders yet</h3><p class="hint">When messages are sent or received, senders appear here.</p></div>';
    return;
  }

  elements.inboxThreadList.innerHTML = state.threads.map((thread) => {
    const unread = hasUnread(thread);
    return `
      <button type="button" class="threadCard" data-email="${escapeHtml(thread.participant_email)}">
        <div class="threadRow">
          <strong>${escapeHtml(thread.participant_name || thread.participant_email || '')}</strong>
          <span class="threadTime">${escapeHtml(formatShortDate(thread.last_message_at))}</span>
        </div>
        <div class="threadRow sub">
          <span>${escapeHtml(thread.participant_email || '')}</span>
          ${unread ? '<span class="unreadBadge">1</span>' : ''}
        </div>
        <p class="threadSubject">${escapeHtml(thread.last_message_subject || '(No subject)')}</p>
+        <p class="threadPreview">${escapeHtml(thread.last_message_preview || '')}</p>
      </button>
    `;
  }).join('');
}

function renderThreadMessages() {
  const thread = state.activeThread;
  if (!thread) {
    elements.threadStream.innerHTML = '<div class="emptyState small"><h3>No conversation loaded</h3><p class="hint">Open a sender from inbox first.</p></div>';
    return;
  }

  elements.threadTitle.textContent = thread.participant_name || thread.participant_email;
  elements.threadMeta.textContent = `${thread.participant_email} · ${thread.received_count || 0} received · ${thread.sent_count || 0} sent`;

  if (!Array.isArray(thread.messages) || thread.messages.length === 0) {
    elements.threadStream.innerHTML = '<div class="emptyState small"><h3>No messages</h3><p class="hint">This thread has no history yet.</p></div>';
    return;
  }

  elements.threadStream.innerHTML = thread.messages.map((message) => {
    const text = escapeHtml(messageText(message)).replaceAll('\n', '<br />');
    const subject = String(message.subject || '').trim();
    return `
      <article class="chatBubble ${escapeHtml(message.direction || 'received')}">
        <div class="bubbleMeta">
          <span>${escapeHtml(message.direction === 'sent' ? 'You' : message.from_email || '')}</span>
          <time>${escapeHtml(formatDate(message.timestamp))}</time>
        </div>
        ${subject ? `<h3>${escapeHtml(subject)}</h3>` : ''}
        <div class="bubbleBody">${text || '<span class="hint">No text body.</span>'}</div>
      </article>
    `;
  }).join('');
  elements.threadStream.scrollTop = elements.threadStream.scrollHeight;
}

function renderSingleRecipients() {
  const rows = filteredRecipients('single');
  if (!rows.length) {
    elements.singleRecipientList.innerHTML = '<div class="emptyState small"><h3>No recipients found</h3><p class="hint">Try another name or category.</p></div>';
    return;
  }

  elements.singleRecipientList.innerHTML = rows.map((row) => {
    const active = String(row.email || '').toLowerCase() === String(state.selectedRecipientEmail || '').toLowerCase();
    return `
      <button type="button" class="recipientCard ${active ? 'active' : ''}" data-kind="single" data-email="${escapeHtml(row.email)}">
        <strong>${escapeHtml(recipientLabel(row))}</strong>
        <p>${escapeHtml(recipientMeta(row))}</p>
      </button>
    `;
  }).join('');
}

function renderSingleSelectionMeta() {
  if (!state.selectedRecipientEmail) {
    elements.singleSelectedTitle.textContent = 'Choose a recipient';
    elements.singleSelectedMeta.textContent = 'Recipient details show here.';
    return;
  }
  const recipient = state.recipients.find((entry) => String(entry.email).toLowerCase() === String(state.selectedRecipientEmail).toLowerCase());
  elements.singleSelectedTitle.textContent = recipient ? recipientLabel(recipient) : state.selectedRecipientEmail;
  elements.singleSelectedMeta.textContent = recipient ? recipientMeta(recipient) : state.selectedRecipientEmail;
}

function renderBulkRecipients() {
  const rows = filteredRecipients('bulk');
  if (!rows.length) {
    elements.bulkRecipientList.innerHTML = '<div class="emptyState small"><h3>No recipients found</h3><p class="hint">Try another filter.</p></div>';
    return;
  }

  elements.bulkRecipientList.innerHTML = rows.map((row) => {
    const checked = state.selectedRecipients.has(row.email) ? 'checked' : '';
    return `
      <label class="recipientCard checkable">
        <div class="checkRow">
          <input type="checkbox" data-kind="bulk" data-email="${escapeHtml(row.email)}" ${checked} />
          <div>
            <strong>${escapeHtml(recipientLabel(row))}</strong>
            <p>${escapeHtml(recipientMeta(row))}</p>
          </div>
        </div>
      </label>
    `;
  }).join('');
}

function renderBulkSelectionSummary() {
  const selected = Array.from(state.selectedRecipients);
  elements.bulkSelectedMeta.textContent = `${selected.length} recipients selected`;
  if (!selected.length) {
    elements.bulkSelectionSummary.innerHTML = '<div class="emptyState small"><h3>No recipients selected</h3><p class="hint">Use Select shown or Select all to build your audience quickly.</p></div>';
    return;
  }

  elements.bulkSelectionSummary.innerHTML = selected
    .slice(0, 30)
    .map((email) => `<span class="selectionPill">${escapeHtml(email)}</span>`)
    .join('');
}

function renderAll() {
  updateSidebarStats();
  renderInboxList();
  renderThreadMessages();
  renderSingleRecipients();
  renderSingleSelectionMeta();
  renderBulkRecipients();
  renderBulkSelectionSummary();
}

async function loadRecipients() {
  if (!state.authenticated) {
    return;
  }
  const payload = await request('/emails/recipients?page=1&page_size=500');
  state.recipients = Array.isArray(payload.items) ? payload.items : [];
}

async function loadThreads() {
  if (!state.authenticated) {
    return;
  }
  const q = encodeURIComponent(state.inboxQuery || '');
  const payload = await request(`/threads?q=${q}`);
  state.threads = Array.isArray(payload.items) ? payload.items : [];
}

async function openThread(email) {
  const participant = String(email || '').trim();
  if (!participant) {
    return;
  }
  const payload = await request(`/threads/${encodeURIComponent(participant)}`);
  state.activeThreadEmail = participant;
  state.activeThread = payload;
  markThreadSeen(payload);
  renderAll();
  setPage('thread');
}

async function refreshWorkspace() {
  try {
    await Promise.all([loadRecipients(), loadThreads()]);
    if (state.activeThreadEmail) {
      await openThread(state.activeThreadEmail);
    }
    renderAll();
    showToast('Workspace refreshed.');
  } catch (error) {
    showToast(error.message || 'Unable to refresh workspace', 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  setBusy(elements.loginSubmit, true, 'Sign in', 'Signing in...');
  try {
    await request('/auth/login', {
      method: 'POST',
      body: {
        email: elements.loginEmail.value.trim(),
        password: elements.loginPassword.value,
      },
    });
    state.authenticated = true;
    elements.loginPassword.value = '';
    renderAuthState();
    await Promise.all([loadRecipients(), loadThreads()]);
    renderAll();
    setPage('inbox');
    showToast('Signed in successfully.');
  } catch (error) {
    showToast(error.message || 'Sign in failed', 'error');
  } finally {
    setBusy(elements.loginSubmit, false, 'Sign in', 'Signing in...');
  }
}

async function handleLogout() {
  try {
    await request('/auth/logout', { method: 'POST', body: {} });
  } catch (_error) {
    // Ignore, we still clear local state.
  }
  state.authenticated = false;
  state.activeThread = null;
  state.activeThreadEmail = '';
  renderAuthState();
  showToast('Logged out.');
}

async function handleThreadReply(event) {
  event.preventDefault();
  if (!state.activeThreadEmail) {
    return;
  }
  setBusy(elements.threadReplySubmit, true, 'Send reply', 'Sending...');
  try {
    const payload = {
      to: state.activeThreadEmail,
      subject: String(elements.threadReplySubject.value || '').trim(),
      text: String(elements.threadReplyText.value || '').trim(),
    };
    const result = await request('/emails/send', { method: 'POST', body: payload });
    if (String(result.status || '').toLowerCase() !== 'sent') {
      throw new Error(`Reply status: ${result.status || 'unknown'}`);
    }
    elements.threadReplyText.value = '';
    await Promise.all([loadRecipients(), loadThreads()]);
    await openThread(state.activeThreadEmail);
    showToast('Reply sent successfully.');
  } catch (error) {
    showToast(error.message || 'Reply send failed', 'error');
  } finally {
    setBusy(elements.threadReplySubmit, false, 'Send reply', 'Sending...');
  }
}

async function handleSingleSend(event) {
  event.preventDefault();
  if (!state.selectedRecipientEmail) {
    showToast('Select one recipient first.', 'error');
    return;
  }
  setBusy(elements.singleSubmit, true, 'Send email', 'Sending...');
  try {
    const payload = {
      to: state.selectedRecipientEmail,
      subject: String(elements.singleSubject.value || '').trim(),
      text: String(elements.singleText.value || '').trim(),
      reply_to: normalizeOptional(elements.singleReplyTo.value),
    };
    const result = await request('/emails/send', { method: 'POST', body: payload });
    if (String(result.status || '').toLowerCase() !== 'sent') {
      throw new Error(`Message status: ${result.status || 'unknown'}`);
    }
    elements.singleSubject.value = '';
    elements.singleText.value = '';
    await Promise.all([loadRecipients(), loadThreads()]);
    renderAll();
    showToast('Email sent successfully.');
  } catch (error) {
    showToast(error.message || 'Unable to send email', 'error');
  } finally {
    setBusy(elements.singleSubmit, false, 'Send email', 'Sending...');
  }
}

async function handleBulkSend(event) {
  event.preventDefault();
  const recipients = Array.from(state.selectedRecipients);
  if (!recipients.length) {
    showToast('Select at least one recipient.', 'error');
    return;
  }
  setBusy(elements.bulkSubmit, true, 'Send batch', 'Sending...');
  try {
    const payload = {
      recipients,
      subject: String(elements.bulkSubject.value || '').trim(),
      text: String(elements.bulkText.value || '').trim(),
      reply_to: normalizeOptional(elements.bulkReplyTo.value),
    };
    const result = await request('/emails/send-bulk', { method: 'POST', body: payload });
    elements.bulkSubject.value = '';
    elements.bulkText.value = '';
    await Promise.all([loadRecipients(), loadThreads()]);
    renderAll();
    showToast(`Batch complete: ${result.sent || 0} sent, ${result.failed || 0} failed.`);
  } catch (error) {
    showToast(error.message || 'Unable to send batch', 'error');
  } finally {
    setBusy(elements.bulkSubmit, false, 'Send batch', 'Sending...');
  }
}

function handleInboxClick(event) {
  const button = event.target.closest('button[data-email]');
  if (!button) {
    return;
  }
  openThread(String(button.dataset.email || '')).catch((error) => showToast(error.message || 'Unable to open thread', 'error'));
}

function handleSingleRecipientClick(event) {
  const button = event.target.closest('button[data-kind="single"][data-email]');
  if (!button) {
    return;
  }
  state.selectedRecipientEmail = String(button.dataset.email || '');
  renderAll();
}

function handleBulkRecipientToggle(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.kind !== 'bulk') {
    return;
  }
  const email = String(target.dataset.email || '').trim();
  if (!email) {
    return;
  }
  if (target.checked) {
    state.selectedRecipients.add(email);
  } else {
    state.selectedRecipients.delete(email);
  }
  renderAll();
}

function boot() {
  renderAuthState();

  elements.loginForm.addEventListener('submit', handleLogin);
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.refreshButton.addEventListener('click', refreshWorkspace);

  elements.navInbox.addEventListener('click', () => setPage('inbox'));
  elements.navSingle.addEventListener('click', () => setPage('single'));
  elements.navBulk.addEventListener('click', () => setPage('bulk'));

  elements.inboxSearchBtn.addEventListener('click', () => {
    state.inboxQuery = String(elements.inboxSearch.value || '').trim();
    loadThreads().then(renderAll).catch((error) => showToast(error.message || 'Search failed', 'error'));
  });
  elements.inboxSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      state.inboxQuery = String(elements.inboxSearch.value || '').trim();
      loadThreads().then(renderAll).catch((error) => showToast(error.message || 'Search failed', 'error'));
    }
  });

  elements.threadBack.addEventListener('click', () => setPage('inbox'));
  elements.threadReplyForm.addEventListener('submit', handleThreadReply);

  elements.singleRecipientSearch.addEventListener('input', (event) => {
    state.singleRecipientQuery = String(event.target.value || '');
    renderAll();
  });
  elements.singleRecipientSource.addEventListener('change', (event) => {
    state.singleRecipientSource = String(event.target.value || 'all');
    renderAll();
  });
  elements.singleForm.addEventListener('submit', handleSingleSend);

  elements.bulkRecipientSearch.addEventListener('input', (event) => {
    state.bulkRecipientQuery = String(event.target.value || '');
    renderAll();
  });
  elements.bulkRecipientSource.addEventListener('change', (event) => {
    state.bulkRecipientSource = String(event.target.value || 'all');
    renderAll();
  });
  elements.bulkSelectShown.addEventListener('click', () => {
    filteredRecipients('bulk').forEach((row) => {
      if (row.email) {
        state.selectedRecipients.add(row.email);
      }
    });
    renderAll();
  });
  elements.bulkSelectAll.addEventListener('click', () => {
    state.recipients.forEach((row) => {
      if (row.email) {
        state.selectedRecipients.add(row.email);
      }
    });
    renderAll();
  });
  elements.bulkClearAll.addEventListener('click', () => {
    state.selectedRecipients.clear();
    renderAll();
  });
  elements.bulkForm.addEventListener('submit', handleBulkSend);

  elements.inboxThreadList.addEventListener('click', handleInboxClick);
  elements.singleRecipientList.addEventListener('click', handleSingleRecipientClick);
  elements.bulkRecipientList.addEventListener('change', handleBulkRecipientToggle);

  checkSession()
    .then(async (authed) => {
      if (!authed) {
        return;
      }
      await Promise.all([loadRecipients(), loadThreads()]);
      renderAll();
      setPage('inbox');
    })
    .catch(() => {
      state.authenticated = false;
      renderAuthState();
    });
}

boot();
