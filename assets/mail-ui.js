const API_ROOT = '/api/email';

const elements = {
  singleForm: document.getElementById('single-send-form'),
  singleSubmit: document.getElementById('single-submit'),
  singleTo: document.getElementById('single-to'),
  singleSubject: document.getElementById('single-subject'),
  singleText: document.getElementById('single-text'),
  singleReplyTo: document.getElementById('single-reply-to'),
  singleUnsubEmail: document.getElementById('single-unsub-email'),
  singleUnsubUrl: document.getElementById('single-unsub-url'),

  bulkForm: document.getElementById('bulk-send-form'),
  bulkSubmit: document.getElementById('bulk-submit'),
  bulkRecipients: document.getElementById('bulk-recipients'),
  bulkSubject: document.getElementById('bulk-subject'),
  bulkText: document.getElementById('bulk-text'),
  bulkReplyTo: document.getElementById('bulk-reply-to'),
  bulkUnsubEmail: document.getElementById('bulk-unsub-email'),
  bulkUnsubUrl: document.getElementById('bulk-unsub-url'),

  refreshHistory: document.getElementById('refresh-history'),
  historyBody: document.getElementById('history-body'),
  historyMeta: document.getElementById('history-meta'),
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
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({ status: 'ERROR', message: 'Invalid response from API' }));
  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
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

function renderHistory(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    elements.historyBody.innerHTML = '<tr><td colspan="6">No messages yet.</td></tr>';
    elements.historyMeta.textContent = 'No rows';
    return;
  }

  elements.historyBody.innerHTML = rows
    .map((row) => {
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
    })
    .join('');

  elements.historyMeta.textContent = `Showing ${rows.length} latest message(s)`;
}

async function loadHistory() {
  elements.historyMeta.textContent = 'Loading history...';
  try {
    const rows = await request('/emails?limit=30');
    renderHistory(rows);
  } catch (error) {
    renderHistory([]);
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

function parseRecipients(input) {
  return String(input || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function handleBulkSend(event) {
  event.preventDefault();
  setBusy(elements.bulkSubmit, true, 'Send batch', 'Sending batch...');
  try {
    const recipients = parseRecipients(elements.bulkRecipients.value);
    if (!recipients.length) {
      throw new Error('Add at least one recipient email address.');
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

function boot() {
  elements.singleForm.addEventListener('submit', handleSingleSend);
  elements.bulkForm.addEventListener('submit', handleBulkSend);
  elements.refreshHistory.addEventListener('click', loadHistory);
  loadHistory();
}

boot();
