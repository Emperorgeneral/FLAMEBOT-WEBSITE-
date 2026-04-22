const API_ROOT = '/api/email';
const SEEN_THREADS_KEY = 'flamebot-mail-thread-seen';

const state = {
  authenticated: false,
  view: 'inbox',
  recipients: [],
  threads: [],
  activeThread: null,
  activeThreadEmail: '',
  selectedRecipientEmail: '',
  selectedRecipients: new Set(),
  singleRecipientQuery: '',
  singleRecipientSource: 'all',
  bulkRecipientQuery: '',
  bulkRecipientSource: 'all',
  threadQuery: '',
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

  listTag: document.getElementById('list-tag'),
  listTitle: document.getElementById('list-title'),
  listHint: document.getElementById('list-hint'),
  listContent: document.getElementById('list-content'),
  threadTools: document.getElementById('thread-tools'),
  threadSearch: document.getElementById('thread-search'),
  threadSearchBtn: document.getElementById('thread-search-btn'),
  singleTools: document.getElementById('single-tools'),
  singleRecipientSearch: document.getElementById('single-recipient-search'),
  singleRecipientSource: document.getElementById('single-recipient-source'),
  bulkTools: document.getElementById('bulk-tools'),
  bulkRecipientSearch: document.getElementById('bulk-recipient-search'),
  bulkRecipientSource: document.getElementById('bulk-recipient-source'),
  bulkSelectAll: document.getElementById('bulk-select-all'),
  bulkClearAll: document.getElementById('bulk-clear-all'),

  inboxView: document.getElementById('inbox-view'),
  threadEmpty: document.getElementById('thread-empty'),
  threadShell: document.getElementById('thread-shell'),
  threadTitle: document.getElementById('thread-title'),
  threadMeta: document.getElementById('thread-meta'),
  threadStream: document.getElementById('thread-stream'),
  threadReplyForm: document.getElementById('thread-reply-form'),
  threadReplySubject: document.getElementById('thread-reply-subject'),
  threadReplyText: document.getElementById('thread-reply-text'),
  threadReplySubmit: document.getElementById('thread-reply-submit'),

  singleView: document.getElementById('single-view'),
  singleSelectedTitle: document.getElementById('single-selected-title'),
  singleSelectedMeta: document.getElementById('single-selected-meta'),
  singleForm: document.getElementById('single-send-form'),
  singleSubject: document.getElementById('single-subject'),
  singleText: document.getElementById('single-text'),
  singleReplyTo: document.getElementById('single-reply-to'),
  singleSubmit: document.getElementById('single-submit'),
  singleThreadStream: document.getElementById('single-thread-stream'),

  bulkView: document.getElementById('bulk-view'),
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
  const email = String(entry.email || '').trim();
  const source = String(entry.source || 'unknown');
  return `${email} · ${source}`;
}

function participantName(email) {
  const match = state.recipients.find((entry) => String(entry.email).toLowerCase() === String(email).toLowerCase());
  return match ? recipientLabel(match) : String(email || '');
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

function threadPreview(thread) {
  const preview = String(thread.last_message_preview || '').trim();
  if (preview) {
    return preview;
  }
  return String(thread.last_message_subject || '').trim() || 'No preview yet';
}

function emptyThread(email) {
  const recipient = state.recipients.find((entry) => String(entry.email).toLowerCase() === String(email).toLowerCase());
  return {
    participant_email: email,
    participant_name: recipient ? recipientLabel(recipient) : null,
    participant_source: recipient?.source || 'unknown',
    sent_count: 0,
    received_count: 0,
    messages: [],
  };
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

function updateRailStats() {
  elements.railRecipientCount.textContent = String(state.recipients.length);
  elements.railThreadCount.textContent = String(state.threads.length);
  const unreadThreads = state.threads.filter(hasUnread).length;
  elements.navInboxBadge.hidden = unreadThreads === 0;
  elements.navInboxBadge.textContent = String(unreadThreads);
}

function markThreadSeen(thread) {
  const latestIncoming = [...(thread.messages || [])].reverse().find((message) => String(message.direction) === 'received');
  if (!latestIncoming) {
    return;
  }
  state.seenThreads[thread.participant_email] = latestIncoming.timestamp;
  saveSeenThreads();
}

function renderModeState() {
  elements.navInbox.classList.toggle('active', state.view === 'inbox');
  elements.navSingle.classList.toggle('active', state.view === 'single');
  elements.navBulk.classList.toggle('active', state.view === 'bulk');

  elements.threadTools.hidden = state.view !== 'inbox';
  elements.singleTools.hidden = state.view !== 'single';
  elements.bulkTools.hidden = state.view !== 'bulk';

  elements.inboxView.hidden = state.view !== 'inbox';
  elements.singleView.hidden = state.view !== 'single';
  elements.bulkView.hidden = state.view !== 'bulk';
}

function renderListHeader() {
  if (state.view === 'single') {
    elements.listTag.textContent = 'Single send';
    elements.listTitle.textContent = 'Recipient Directory';
    elements.listHint.textContent = 'Pick one saved contact and compose from the same thread-aware workspace.';
    return;
  }
  if (state.view === 'bulk') {
    elements.listTag.textContent = 'Bulk send';
    elements.listTitle.textContent = 'Audience Selector';
    elements.listHint.textContent = 'Filter by category, select many, then send one consistent campaign.';
    return;
  }
  elements.listTag.textContent = 'Inbox';
  elements.listTitle.textContent = 'Conversation Threads';
  elements.listHint.textContent = 'Every sender stays inside one continuous conversation with unread badges for new replies.';
}

function renderSingleRecipientList() {
  const rows = filteredRecipients('single');
  if (!rows.length) {
    elements.listContent.innerHTML = '<div class="emptyState small"><h3>No recipients found</h3><p class="hint">Try a different name or category.</p></div>';
    return;
  }

  elements.listContent.innerHTML = rows.map((row) => {
    const active = String(row.email || '').toLowerCase() === String(state.selectedRecipientEmail || '').toLowerCase();
    return `
      <button type="button" class="directoryItem ${active ? 'active' : ''}" data-kind="single-recipient" data-email="${escapeHtml(row.email)}">
        <div>
          <strong>${escapeHtml(recipientLabel(row))}</strong>
          <p>${escapeHtml(row.email || '')}</p>
        </div>
        <span class="sourceBadge">${escapeHtml(row.source || 'unknown')}</span>
      </button>
    `;
  }).join('');
}

function renderBulkRecipientList() {
  const rows = filteredRecipients('bulk');
  if (!rows.length) {
    elements.listContent.innerHTML = '<div class="emptyState small"><h3>No recipients found</h3><p class="hint">Adjust your search or category filter.</p></div>';
    return;
  }

  elements.listContent.innerHTML = rows.map((row) => {
    const checked = state.selectedRecipients.has(row.email) ? 'checked' : '';
    return `
      <label class="directoryItem selectable">
        <div class="directoryCheck">
          <input type="checkbox" data-kind="bulk-recipient" data-email="${escapeHtml(row.email)}" ${checked} />
          <div>
            <strong>${escapeHtml(recipientLabel(row))}</strong>
            <p>${escapeHtml(row.email || '')}</p>
          </div>
        </div>
        <span class="sourceBadge">${escapeHtml(row.source || 'unknown')}</span>
      </label>
    `;
  }).join('');
}

function renderThreadList() {
  if (!state.threads.length) {
    elements.listContent.innerHTML = '<div class="emptyState small"><h3>No threads yet</h3><p class="hint">Incoming replies and sent mail will gather here as continuous conversations.</p></div>';
    return;
  }

  elements.listContent.innerHTML = state.threads.map((thread) => {
    const active = String(thread.participant_email || '').toLowerCase() === String(state.activeThreadEmail || '').toLowerCase();
    const unread = hasUnread(thread);
    return `
      <button type="button" class="threadItem ${active ? 'active' : ''}" data-kind="thread" data-email="${escapeHtml(thread.participant_email)}">
        <div class="threadTop">
          <strong>${escapeHtml(thread.participant_name || thread.participant_email || '')}</strong>
          <span class="threadTime">${escapeHtml(formatShortDate(thread.last_message_at))}</span>
        </div>
        <div class="threadTop secondary">
          <span>${escapeHtml(thread.participant_email || '')}</span>
          ${unread ? '<span class="unreadBadge">1</span>' : ''}
        </div>
        <p class="threadSubject">${escapeHtml(thread.last_message_subject || '(No subject)')}</p>
        <p class="threadPreview">${escapeHtml(threadPreview(thread))}</p>
      </button>
    `;
  }).join('');
}

function renderListPanel() {
  renderListHeader();
  updateRailStats();
  if (state.view === 'single') {
    renderSingleRecipientList();
    return;
  }
  if (state.view === 'bulk') {
    renderBulkRecipientList();
    return;
  }
  renderThreadList();
}

function renderMessageStream(container, messages, emptyText) {
  if (!Array.isArray(messages) || messages.length === 0) {
    container.innerHTML = `<div class="emptyState small"><h3>Nothing here yet</h3><p class="hint">${escapeHtml(emptyText)}</p></div>`;
    return;
  }

  container.innerHTML = messages.map((message) => {
    const text = escapeHtml(messageText(message)).replaceAll('\n', '<br />');
    const subject = String(message.subject || '').trim();
    const status = String(message.status || '').trim();
    return `
      <article class="chatBubble ${escapeHtml(message.direction || 'received')}">
        <div class="bubbleMeta">
          <span>${escapeHtml(message.direction === 'sent' ? 'You' : message.from_email || '')}</span>
          <time>${escapeHtml(formatDate(message.timestamp))}</time>
        </div>
        ${subject ? `<h3>${escapeHtml(subject)}</h3>` : ''}
        <div class="bubbleBody">${text || '<span class="hint">No text body.</span>'}</div>
        ${status ? `<p class="bubbleStatus">${escapeHtml(status)}</p>` : ''}
      </article>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function renderSingleView() {
  const email = state.selectedRecipientEmail;
  if (!email) {
    elements.singleSelectedTitle.textContent = 'Choose a recipient';
    elements.singleSelectedMeta.textContent = 'Search the directory, select one contact, then send directly inside that conversation.';
    renderMessageStream(elements.singleThreadStream, [], 'No recipient selected yet.');
    return;
  }

  const recipient = state.recipients.find((entry) => String(entry.email).toLowerCase() === String(email).toLowerCase());
  elements.singleSelectedTitle.textContent = recipient ? recipientLabel(recipient) : email;
  elements.singleSelectedMeta.textContent = recipient ? recipientMeta(recipient) : email;
  renderMessageStream(
    elements.singleThreadStream,
    state.activeThread?.participant_email === email ? (state.activeThread.messages || []) : [],
    'No previous conversation yet. Your new message will start this thread.'
  );
}

function renderBulkSelectionSummary() {
  const selected = Array.from(state.selectedRecipients);
  elements.bulkSelectedMeta.textContent = `${selected.length} recipients selected`;
  if (!selected.length) {
    elements.bulkSelectionSummary.innerHTML = '<div class="emptyState small"><h3>No recipients selected</h3><p class="hint">Choose recipients from the middle column, by category or all at once.</p></div>';
    return;
  }
  elements.bulkSelectionSummary.innerHTML = selected
    .slice(0, 20)
    .map((email) => `<span class="selectionPill">${escapeHtml(participantName(email))}</span>`)
    .join('');
}

function defaultReplySubject(thread) {
  const latestSubject = [...(thread.messages || [])]
    .reverse()
    .map((message) => String(message.subject || '').trim())
    .find(Boolean);
  if (!latestSubject) {
    return 'Re: Message';
  }
  return latestSubject.startsWith('Re:') ? latestSubject : `Re: ${latestSubject}`;
}

function renderInboxView() {
  const thread = state.activeThread;
  const showThread = state.view === 'inbox' && thread && thread.participant_email;
  elements.threadEmpty.hidden = Boolean(showThread);
  elements.threadShell.hidden = !showThread;
  if (!showThread) {
    return;
  }

  elements.threadTitle.textContent = thread.participant_name || thread.participant_email;
  elements.threadMeta.textContent = `${thread.participant_email} · ${thread.participant_source || 'unknown'} · ${thread.received_count || 0} received · ${thread.sent_count || 0} sent`;
  renderMessageStream(elements.threadStream, thread.messages || [], 'No messages in this thread yet.');
  elements.threadReplySubject.value = defaultReplySubject(thread);
}

function renderConversationPanel() {
  renderModeState();
  renderInboxView();
  renderSingleView();
  renderBulkSelectionSummary();
}

function setView(view) {
  state.view = ['single', 'bulk', 'inbox'].includes(view) ? view : 'inbox';
  renderListPanel();
  renderConversationPanel();
}

async function loadRecipients() {
  if (!state.authenticated) {
    return;
  }
  const payload = await request('/emails/recipients?page=1&page_size=250');
  state.recipients = Array.isArray(payload.items) ? payload.items : [];
  renderListPanel();
  renderConversationPanel();
}

async function loadThreads() {
  if (!state.authenticated) {
    return;
  }
  const q = encodeURIComponent(state.threadQuery || '');
  const payload = await request(`/threads?q=${q}`);
  state.threads = Array.isArray(payload.items) ? payload.items : [];
  if (state.activeThreadEmail && !state.threads.some((thread) => String(thread.participant_email).toLowerCase() === String(state.activeThreadEmail).toLowerCase())) {
    state.activeThreadEmail = '';
    state.activeThread = null;
  }
  renderListPanel();
  renderConversationPanel();
}

async function loadThread(email, options = {}) {
  const participant = String(email || '').trim();
  if (!participant) {
    state.activeThreadEmail = '';
    state.activeThread = null;
    renderListPanel();
    renderConversationPanel();
    return;
  }

  try {
    const payload = await request(`/threads/${encodeURIComponent(participant)}`);
    state.activeThreadEmail = participant;
    state.activeThread = payload;
    if (options.markSeen !== false) {
      markThreadSeen(payload);
    }
  } catch (error) {
    if (/404/.test(String(error.message || ''))) {
      state.activeThreadEmail = participant;
      state.activeThread = emptyThread(participant);
    } else {
      throw error;
    }
  }

  renderListPanel();
  renderConversationPanel();
}

async function refreshWorkspace() {
  try {
    await Promise.all([loadRecipients(), loadThreads()]);
    const targetEmail = state.view === 'single' ? state.selectedRecipientEmail : state.activeThreadEmail;
    if (targetEmail) {
      await loadThread(targetEmail, { markSeen: state.view === 'inbox' });
    }
    showToast('Workspace refreshed.');
  } catch (error) {
    showToast(error.message || 'Unable to refresh mail workspace', 'error');
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
    if (state.threads.length) {
      await loadThread(state.threads[0].participant_email);
    }
    setView('inbox');
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
    // Ignore; local state reset still matters.
  }
  state.authenticated = false;
  state.activeThread = null;
  state.activeThreadEmail = '';
  renderAuthState();
  showToast('Logged out.');
}

async function handleSingleSend(event) {
  event.preventDefault();
  if (!state.selectedRecipientEmail) {
    showToast('Select a recipient first.', 'error');
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
    await loadThreads();
    await loadThread(state.selectedRecipientEmail, { markSeen: false });
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

  setBusy(elements.bulkSubmit, true, 'Send batch', 'Sending batch...');
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
    await loadThreads();
    showToast(`Batch complete: ${result.sent || 0} sent, ${result.failed || 0} failed.`);
  } catch (error) {
    showToast(error.message || 'Unable to send batch', 'error');
  } finally {
    setBusy(elements.bulkSubmit, false, 'Send batch', 'Sending batch...');
  }
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
      metadata: {
        source: 'mail_console_chat_reply',
      },
    };
    const result = await request('/emails/send', { method: 'POST', body: payload });
    if (String(result.status || '').toLowerCase() !== 'sent') {
      throw new Error(`Reply status: ${result.status || 'unknown'}`);
    }
    elements.threadReplyText.value = '';
    await loadThreads();
    await loadThread(state.activeThreadEmail);
    showToast('Reply sent successfully.');
  } catch (error) {
    showToast(error.message || 'Reply send failed', 'error');
  } finally {
    setBusy(elements.threadReplySubmit, false, 'Send reply', 'Sending...');
  }
}

function handleListClick(event) {
  const threadTarget = event.target.closest('[data-kind="thread"][data-email]');
  if (threadTarget) {
    const email = String(threadTarget.dataset.email || '');
    setView('inbox');
    loadThread(email).catch((error) => showToast(error.message || 'Unable to open thread', 'error'));
    return;
  }

  const singleTarget = event.target.closest('[data-kind="single-recipient"][data-email]');
  if (singleTarget) {
    const email = String(singleTarget.dataset.email || '');
    state.selectedRecipientEmail = email;
    setView('single');
    loadThread(email, { markSeen: false }).catch((error) => showToast(error.message || 'Unable to load recipient thread', 'error'));
  }
}

function handleBulkRecipientToggle(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.kind !== 'bulk-recipient') {
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
  renderListPanel();
  renderConversationPanel();
}

function boot() {
  renderAuthState();

  elements.loginForm.addEventListener('submit', handleLogin);
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.refreshButton.addEventListener('click', refreshWorkspace);

  elements.navInbox.addEventListener('click', () => setView('inbox'));
  elements.navSingle.addEventListener('click', () => setView('single'));
  elements.navBulk.addEventListener('click', () => setView('bulk'));

  elements.singleRecipientSearch.addEventListener('input', (event) => {
    state.singleRecipientQuery = String(event.target.value || '');
    renderListPanel();
  });
  elements.singleRecipientSource.addEventListener('change', (event) => {
    state.singleRecipientSource = String(event.target.value || 'all');
    renderListPanel();
  });

  elements.bulkRecipientSearch.addEventListener('input', (event) => {
    state.bulkRecipientQuery = String(event.target.value || '');
    renderListPanel();
  });
  elements.bulkRecipientSource.addEventListener('change', (event) => {
    state.bulkRecipientSource = String(event.target.value || 'all');
    renderListPanel();
  });
  elements.bulkSelectAll.addEventListener('click', () => {
    filteredRecipients('bulk').forEach((row) => {
      if (row.email) {
        state.selectedRecipients.add(row.email);
      }
    });
    renderListPanel();
    renderConversationPanel();
  });
  elements.bulkClearAll.addEventListener('click', () => {
    state.selectedRecipients.clear();
    renderListPanel();
    renderConversationPanel();
  });

  elements.threadSearchBtn.addEventListener('click', () => {
    state.threadQuery = String(elements.threadSearch.value || '').trim();
    loadThreads().catch((error) => showToast(error.message || 'Unable to search threads', 'error'));
  });
  elements.threadSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      state.threadQuery = String(elements.threadSearch.value || '').trim();
      loadThreads().catch((error) => showToast(error.message || 'Unable to search threads', 'error'));
    }
  });

  elements.listContent.addEventListener('click', handleListClick);
  elements.listContent.addEventListener('change', handleBulkRecipientToggle);
  elements.singleForm.addEventListener('submit', handleSingleSend);
  elements.bulkForm.addEventListener('submit', handleBulkSend);
  elements.threadReplyForm.addEventListener('submit', handleThreadReply);

  checkSession()
    .then(async (authed) => {
      if (!authed) {
        return;
      }
      await Promise.all([loadRecipients(), loadThreads()]);
      setView('inbox');
      if (state.threads.length) {
        await loadThread(state.threads[0].participant_email);
      } else {
        renderConversationPanel();
      }
    })
    .catch(() => {
      state.authenticated = false;
      renderAuthState();
    });
}

boot();
