const API_ROOT = '/api/email';

const state = {
  authenticated: false,
  recipients: [],
  selectedRecipients: new Set(),
  recipientsQuery: '',
  historyTab: 'sent',
  historyPage: 1,
  historyPageSize: 10,
  historyTotal: 0,
  historyQuery: '',
  historySender: '',
  activeIncomingMessage: null,
};

const elements = {
  authShell: document.getElementById('mail-auth-shell'),
  appShell: document.getElementById('mail-app-shell'),
  loginForm: document.getElementById('mail-login-form'),
  loginSubmit: document.getElementById('mail-login-submit'),
  loginEmail: document.getElementById('mail-login-email'),
  loginPassword: document.getElementById('mail-login-password'),
  logoutButton: document.getElementById('mail-logout'),

  singleForm: document.getElementById('single-send-form'),
  singleSubmit: document.getElementById('single-submit'),
  singleSearch: document.getElementById('single-search'),
  singleSearchResults: document.getElementById('single-search-results'),
  singleTo: document.getElementById('single-to'),
  singleSubject: document.getElementById('single-subject'),
  singleText: document.getElementById('single-text'),
  singleReplyTo: document.getElementById('single-reply-to'),
  singleUnsubEmail: document.getElementById('single-unsub-email'),
  singleUnsubUrl: document.getElementById('single-unsub-url'),

  bulkForm: document.getElementById('bulk-send-form'),
  bulkSubmit: document.getElementById('bulk-submit'),
  bulkRecipientSearch: document.getElementById('bulk-recipient-search'),
  bulkRecipientList: document.getElementById('bulk-recipient-list'),
  bulkSelectAll: document.getElementById('bulk-select-all'),
  bulkClearAll: document.getElementById('bulk-clear-all'),
  bulkSelectedMeta: document.getElementById('bulk-selected-meta'),
  bulkSubject: document.getElementById('bulk-subject'),
  bulkText: document.getElementById('bulk-text'),
  bulkReplyTo: document.getElementById('bulk-reply-to'),
  bulkUnsubEmail: document.getElementById('bulk-unsub-email'),
  bulkUnsubUrl: document.getElementById('bulk-unsub-url'),

  refreshHistory: document.getElementById('refresh-history'),
  tabSent: document.getElementById('tab-sent'),
  tabInbox: document.getElementById('tab-inbox'),
  historyHeadSent: document.getElementById('history-head-sent'),
  historyHeadInbox: document.getElementById('history-head-inbox'),
  historyBody: document.getElementById('history-body'),
  historyMeta: document.getElementById('history-meta'),
  historySearch: document.getElementById('history-search'),
  historySender: document.getElementById('history-sender'),
  historySearchBtn: document.getElementById('history-search-btn'),
  historyPrev: document.getElementById('history-prev'),
  historyNext: document.getElementById('history-next'),
  historyPageMeta: document.getElementById('history-page-meta'),

  messageDetail: document.getElementById('message-detail'),
  detailSubject: document.getElementById('detail-subject'),
  detailFrom: document.getElementById('detail-from'),
  detailTo: document.getElementById('detail-to'),
  detailDate: document.getElementById('detail-date'),
  detailBody: document.getElementById('detail-body'),
  detailClose: document.getElementById('detail-close'),
  replyForm: document.getElementById('reply-form'),
  replySubject: document.getElementById('reply-subject'),
  replyText: document.getElementById('reply-text'),
  replySubmit: document.getElementById('reply-submit'),

  toast: document.getElementById('toast'),
};

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
    const message = String(payload?.message || 'Sign in required');
    // Only clear local session state when the website auth layer rejects the request.
    if (/sign in required/i.test(message)) {
      state.authenticated = false;
      renderAuthState();
    }
    throw new Error(message);
  }
  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

async function checkSession() {
  const response = await fetch(`${API_ROOT}/auth/me`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
    },
  });
  const payload = await response.json().catch(() => ({}));
  state.authenticated = Boolean(payload && payload.authenticated);
  renderAuthState();
  return state.authenticated;
}

function recipientLabel(entry) {
  const name = String(entry.display_name || '').trim();
  return name ? `${name} <${entry.email}>` : String(entry.email || '');
}

function filteredRecipients(query = '') {
  const text = String(query || '').trim().toLowerCase();
  if (!text) {
    return state.recipients;
  }
  return state.recipients.filter((row) => {
    return (
      String(row.email || '').toLowerCase().includes(text)
      || String(row.display_name || '').toLowerCase().includes(text)
      || String(row.first_name || '').toLowerCase().includes(text)
      || String(row.last_name || '').toLowerCase().includes(text)
    );
  });
}

function renderSingleSearchResults() {
  const rows = filteredRecipients(elements.singleSearch.value).slice(0, 10);
  if (!rows.length) {
    elements.singleSearchResults.innerHTML = '<p class="hint">No matching saved recipients.</p>';
    return;
  }
  elements.singleSearchResults.innerHTML = rows
    .map((row) => `
      <button type="button" class="recipientChip" data-email="${escapeHtml(row.email)}">
        ${escapeHtml(recipientLabel(row))}
      </button>
    `)
    .join('');
}

function renderBulkRecipients() {
  const rows = filteredRecipients(elements.bulkRecipientSearch.value);
  if (!rows.length) {
    elements.bulkRecipientList.innerHTML = '<p class="hint">No recipients found.</p>';
    elements.bulkSelectedMeta.textContent = `${state.selectedRecipients.size} recipients selected`;
    return;
  }

  elements.bulkRecipientList.innerHTML = rows
    .map((row) => {
      const checked = state.selectedRecipients.has(row.email) ? 'checked' : '';
      return `
        <label class="recipientRow">
          <input type="checkbox" data-email="${escapeHtml(row.email)}" ${checked} />
          <span>${escapeHtml(recipientLabel(row))}</span>
        </label>
      `;
    })
    .join('');

  elements.bulkSelectedMeta.textContent = `${state.selectedRecipients.size} recipients selected`;
}

async function loadRecipients() {
  if (!state.authenticated) {
    return;
  }
  try {
    const payload = await request('/emails/recipients?page=1&page_size=500');
    state.recipients = Array.isArray(payload.items) ? payload.items : [];
    renderSingleSearchResults();
    renderBulkRecipients();
  } catch (error) {
    state.recipients = [];
    renderSingleSearchResults();
    renderBulkRecipients();
    showToast(error.message || 'Unable to load recipients', 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  setBusy(elements.loginSubmit, true, 'Sign in', 'Signing in...');
  try {
    const payload = {
      email: elements.loginEmail.value.trim(),
      password: elements.loginPassword.value,
    };
    await request('/auth/login', { method: 'POST', body: payload });
    state.authenticated = true;
    elements.loginPassword.value = '';
    renderAuthState();
    showToast('Signed in successfully.');
    await loadHistory();
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
    // Ignore; force local logout state anyway.
  }
  state.authenticated = false;
  renderAuthState();
  showToast('Logged out.');
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

function bodySnippet(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '-';
  }
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function renderPager() {
  const page = state.historyPage;
  const total = state.historyTotal;
  const pageSize = state.historyPageSize;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  elements.historyPageMeta.textContent = `Page ${page} of ${pageCount}`;
  elements.historyPrev.disabled = page <= 1;
  elements.historyNext.disabled = page >= pageCount;
}

function setHistoryTab(tab) {
  state.historyTab = tab === 'inbox' ? 'inbox' : 'sent';
  elements.tabSent.classList.toggle('active', state.historyTab === 'sent');
  elements.tabInbox.classList.toggle('active', state.historyTab === 'inbox');
  elements.tabSent.setAttribute('aria-selected', String(state.historyTab === 'sent'));
  elements.tabInbox.setAttribute('aria-selected', String(state.historyTab === 'inbox'));
  elements.historyHeadSent.hidden = state.historyTab !== 'sent';
  elements.historyHeadInbox.hidden = state.historyTab !== 'inbox';
  hideMessageDetail();
}

function renderSentRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    elements.historyBody.innerHTML = '<tr><td colspan="6">No sent messages found.</td></tr>';
    return;
  }
  elements.historyBody.innerHTML = rows.map((row) => {
    const status = String(row.status || 'unknown').toLowerCase();
    return `
      <tr>
        <td>${escapeHtml(formatDate(row.created_at))}</td>
        <td><span class="status ${escapeHtml(status)}">${escapeHtml(status)}</span></td>
        <td>${escapeHtml(row.recipient || '')}</td>
        <td>${escapeHtml(row.subject || '')}</td>
        <td>${escapeHtml(row.from_email || '')}</td>
        <td>${escapeHtml(row.error_message || '-')}</td>
      </tr>
    `;
  }).join('');
}

function renderInboxRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    elements.historyBody.innerHTML = '<tr><td colspan="6">No incoming messages found.</td></tr>';
    return;
  }
  elements.historyBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(formatDate(row.received_at || row.created_at))}</td>
      <td>${escapeHtml(row.from_email || '')}</td>
      <td>${escapeHtml(row.to_email || '')}</td>
      <td>${escapeHtml(row.subject || '(No subject)')}</td>
      <td>${escapeHtml(bodySnippet(row.body_text || row.body_html || ''))}</td>
      <td><button type="button" class="ghostButton inbox-open" data-id="${escapeHtml(row.id)}">Open</button></td>
    </tr>
  `).join('');
}

function hideMessageDetail() {
  state.activeIncomingMessage = null;
  elements.messageDetail.hidden = true;
  elements.replyForm.hidden = true;
}

function showIncomingDetail(row) {
  state.activeIncomingMessage = row;
  elements.messageDetail.hidden = false;
  elements.replyForm.hidden = false;
  elements.detailSubject.textContent = String(row.subject || '(No subject)');
  elements.detailFrom.textContent = String(row.from_email || '-');
  elements.detailTo.textContent = String(row.to_email || '-');
  elements.detailDate.textContent = formatDate(row.received_at || row.created_at);

  const safeText = escapeHtml(String(row.body_text || '')).replaceAll('\n', '<br />');
  if (safeText) {
    elements.detailBody.innerHTML = safeText;
  } else if (row.body_html) {
    elements.detailBody.innerHTML = row.body_html;
  } else {
    elements.detailBody.innerHTML = '<p class="hint">No message body.</p>';
  }

  elements.replySubject.value = String(row.subject || '').startsWith('Re:')
    ? String(row.subject || '')
    : `Re: ${String(row.subject || '').trim() || 'Message'}`;
  elements.replyText.value = '';
}

async function loadHistory() {
  if (!state.authenticated) {
    return;
  }
  elements.historyMeta.textContent = 'Loading...';
  renderPager();

  const page = state.historyPage;
  const pageSize = state.historyPageSize;
  const query = encodeURIComponent(state.historyQuery || '');
  const sender = encodeURIComponent(state.historySender || '');

  try {
    if (state.historyTab === 'inbox') {
      const payload = await request(`/emails/incoming?page=${page}&page_size=${pageSize}&q=${query}&sender=${sender}`);
      state.historyTotal = Number(payload.total || 0);
      renderInboxRows(payload.items || []);
      elements.historyMeta.textContent = `Inbox messages: ${state.historyTotal}`;
    } else {
      const payload = await request(`/emails/page?page=${page}&page_size=${pageSize}&q=${query}&sender=${sender}`);
      state.historyTotal = Number(payload.total || 0);
      renderSentRows(payload.items || []);
      elements.historyMeta.textContent = `Sent messages: ${state.historyTotal}`;
    }
    renderPager();
  } catch (error) {
    state.historyTotal = 0;
    elements.historyBody.innerHTML = '<tr><td colspan="6">Unable to load data.</td></tr>';
    elements.historyMeta.textContent = 'Load failed';
    renderPager();
    showToast(error.message || 'Unable to load message history', 'error');
  }
}

async function handleSingleSend(event) {
  event.preventDefault();
  setBusy(elements.singleSubmit, true, 'Send email', 'Sending...');
  try {
    const payload = {
      to: elements.singleTo.value.trim(),
      subject: elements.singleSubject.value.trim(),
      text: elements.singleText.value,
      reply_to: normalizeOptional(elements.singleReplyTo.value),
      unsubscribe_email: normalizeOptional(elements.singleUnsubEmail.value),
      unsubscribe_url: normalizeOptional(elements.singleUnsubUrl.value),
    };

    const result = await request('/emails/send', { method: 'POST', body: payload });
    if (String(result.status || '').toLowerCase() === 'sent') {
      showToast('Email sent successfully.');
      elements.singleText.value = '';
    } else {
      showToast(`Message queued with status: ${result.status || 'unknown'}`, 'error');
    }
    await loadHistory();
  } catch (error) {
    showToast(error.message || 'Unable to send email', 'error');
  } finally {
    setBusy(elements.singleSubmit, false, 'Send email', 'Sending...');
  }
}

async function handleBulkSend(event) {
  event.preventDefault();
  setBusy(elements.bulkSubmit, true, 'Send batch', 'Sending batch...');
  try {
    const recipients = Array.from(state.selectedRecipients);
    if (!recipients.length) {
      throw new Error('Select at least one recipient.');
    }

    const payload = {
      recipients,
      subject: elements.bulkSubject.value.trim(),
      text: elements.bulkText.value,
      reply_to: normalizeOptional(elements.bulkReplyTo.value),
      unsubscribe_email: normalizeOptional(elements.bulkUnsubEmail.value),
      unsubscribe_url: normalizeOptional(elements.bulkUnsubUrl.value),
    };

    const result = await request('/emails/send-bulk', { method: 'POST', body: payload });
    showToast(`Batch complete: ${result.sent || 0} sent, ${result.failed || 0} failed.`);
    elements.bulkText.value = '';
    await loadHistory();
  } catch (error) {
    showToast(error.message || 'Unable to send bulk batch', 'error');
  } finally {
    setBusy(elements.bulkSubmit, false, 'Send batch', 'Sending batch...');
  }
}

function applyHistoryFilters() {
  state.historyQuery = String(elements.historySearch.value || '').trim();
  state.historySender = String(elements.historySender.value || '').trim();
  state.historyPage = 1;
  loadHistory();
}

async function handleReplySend(event) {
  event.preventDefault();
  if (!state.activeIncomingMessage) {
    return;
  }
  setBusy(elements.replySubmit, true, 'Send Reply', 'Sending...');
  try {
    const payload = {
      to: String(state.activeIncomingMessage.from_email || '').trim(),
      subject: String(elements.replySubject.value || '').trim(),
      text: String(elements.replyText.value || '').trim(),
      reply_to: String(state.activeIncomingMessage.to_email || '').trim() || undefined,
      metadata: {
        source: 'mail_console_reply',
        in_reply_to: state.activeIncomingMessage.message_id_header || undefined,
        incoming_id: state.activeIncomingMessage.id,
      },
    };
    if (!payload.to || !payload.subject || !payload.text) {
      throw new Error('Reply requires recipient, subject, and message body.');
    }
    const result = await request('/emails/send', { method: 'POST', body: payload });
    if (String(result.status || '').toLowerCase() !== 'sent') {
      throw new Error(`Reply status: ${result.status || 'unknown'}`);
    }
    showToast('Reply sent successfully.');
    elements.replyText.value = '';
    setHistoryTab('sent');
    state.historyPage = 1;
    loadHistory();
  } catch (error) {
    showToast(error.message || 'Reply send failed', 'error');
  } finally {
    setBusy(elements.replySubmit, false, 'Send Reply', 'Sending...');
  }
}

function boot() {
  renderAuthState();
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.singleForm.addEventListener('submit', handleSingleSend);
  elements.bulkForm.addEventListener('submit', handleBulkSend);
  elements.replyForm.addEventListener('submit', handleReplySend);
  elements.refreshHistory.addEventListener('click', loadHistory);

  elements.singleSearch.addEventListener('input', renderSingleSearchResults);
  elements.singleSearchResults.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-email]');
    if (!target) {
      return;
    }
    elements.singleTo.value = String(target.dataset.email || '');
  });

  elements.bulkRecipientSearch.addEventListener('input', renderBulkRecipients);
  elements.bulkRecipientList.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
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
    elements.bulkSelectedMeta.textContent = `${state.selectedRecipients.size} recipients selected`;
  });

  elements.bulkSelectAll.addEventListener('click', () => {
    filteredRecipients(elements.bulkRecipientSearch.value).forEach((row) => {
      if (row.email) {
        state.selectedRecipients.add(row.email);
      }
    });
    renderBulkRecipients();
  });

  elements.bulkClearAll.addEventListener('click', () => {
    state.selectedRecipients.clear();
    renderBulkRecipients();
  });

  elements.tabSent.addEventListener('click', () => {
    setHistoryTab('sent');
    state.historyPage = 1;
    loadHistory();
  });
  elements.tabInbox.addEventListener('click', () => {
    setHistoryTab('inbox');
    state.historyPage = 1;
    loadHistory();
  });

  elements.historySearchBtn.addEventListener('click', applyHistoryFilters);
  elements.historySearch.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyHistoryFilters();
    }
  });
  elements.historySender.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyHistoryFilters();
    }
  });

  elements.historyPrev.addEventListener('click', () => {
    if (state.historyPage > 1) {
      state.historyPage -= 1;
      loadHistory();
    }
  });
  elements.historyNext.addEventListener('click', () => {
    const pageCount = Math.max(1, Math.ceil(state.historyTotal / state.historyPageSize));
    if (state.historyPage < pageCount) {
      state.historyPage += 1;
      loadHistory();
    }
  });

  elements.historyBody.addEventListener('click', (event) => {
    const target = event.target.closest('button.inbox-open[data-id]');
    if (!target) {
      return;
    }
    const rowId = String(target.dataset.id || '').trim();
    if (!rowId || state.historyTab !== 'inbox') {
      return;
    }
    request(`/emails/incoming?page=${state.historyPage}&page_size=${state.historyPageSize}&q=${encodeURIComponent(state.historyQuery)}&sender=${encodeURIComponent(state.historySender)}`)
      .then((payload) => {
        const rows = Array.isArray(payload.items) ? payload.items : [];
        const row = rows.find((x) => String(x.id) === rowId);
        if (!row) {
          throw new Error('Message not found in current page.');
        }
        showIncomingDetail(row);
      })
      .catch((error) => showToast(error.message || 'Unable to open message', 'error'));
  });

  elements.detailClose.addEventListener('click', hideMessageDetail);

  checkSession()
    .then((authed) => {
      if (authed) {
        setHistoryTab('sent');
        return Promise.all([loadRecipients(), loadHistory()]);
      }
      return null;
    })
    .catch(() => {
      state.authenticated = false;
      renderAuthState();
    });
}

boot();
