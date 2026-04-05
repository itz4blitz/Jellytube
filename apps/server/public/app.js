const state = {
  config: null,
  session: null,
  myRequests: [],
  pendingRequests: [],
  stats: null
};

const elements = {
  statusCard: document.getElementById('statusCard'),
  statusMessage: document.getElementById('statusMessage'),
  loginCard: document.getElementById('loginCard'),
  dashboard: document.getElementById('dashboard'),
  requestCard: document.getElementById('requestCard'),
  accountCard: document.getElementById('accountCard'),
  requestsCard: document.getElementById('requestsCard'),
  adminCard: document.getElementById('adminCard'),
  appName: document.getElementById('appName'),
  heroLede: document.getElementById('heroLede'),
  heroSummaryTitle: document.getElementById('heroSummaryTitle'),
  heroSummaryBody: document.getElementById('heroSummaryBody'),
  heroStats: document.getElementById('heroStats'),
  welcomeLine: document.getElementById('welcomeLine'),
  accountUsername: document.getElementById('accountUsername'),
  accountRole: document.getElementById('accountRole'),
  accountUserId: document.getElementById('accountUserId'),
  myStatsLine: document.getElementById('myStatsLine'),
  logoutButton: document.getElementById('logoutButton'),
  loginForm: document.getElementById('loginForm'),
  requestForm: document.getElementById('requestForm'),
  requestUrlInput: document.getElementById('requestUrl'),
  titleHintInput: document.getElementById('titleHint'),
  requestNoteInput: document.getElementById('requestNote'),
  requestPreviewTitle: document.getElementById('requestPreviewTitle'),
  requestPreviewSummary: document.getElementById('requestPreviewSummary'),
  requestPreviewBadges: document.getElementById('requestPreviewBadges'),
  requestPreviewNote: document.getElementById('requestPreviewNote'),
  myRequests: document.getElementById('myRequests'),
  pendingRequests: document.getElementById('pendingRequests'),
  statsLine: document.getElementById('statsLine'),
  requestTemplate: document.getElementById('requestTemplate')
};

bootstrap().catch((error) => {
  console.error(error);
  setStatus(error.message || 'Failed to load Jellytube', 'danger');
});

elements.logoutButton.addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.reload();
});

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  setStatus('Signing in with Jellyfin...', 'info');

  const form = new FormData(elements.loginForm);
  const response = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: form.get('username'),
      password: form.get('password')
    })
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({ error: 'Login failed' }));
    setStatus(json.error || 'Login failed', 'danger');
    return;
  }

  await refresh();
  clearStatus();
});

elements.requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = new FormData(elements.requestForm);
  const payload = {
    url: String(form.get('url') || '').trim(),
    titleHint: String(form.get('titleHint') || '').trim() || undefined,
    note: String(form.get('note') || '').trim() || undefined
  };

  setStatus('Submitting request...', 'info');

  const response = await fetch('/api/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    setStatus(json.error || 'Request submission failed', 'danger');
    return;
  }

  elements.requestForm.reset();
  applyPrefill();
  await refresh();
  setStatus(json.request?.status === 'queued' ? 'Request queued.' : 'Request submitted.', 'success');
});

for (const input of [elements.requestUrlInput, elements.titleHintInput, elements.requestNoteInput]) {
  input.addEventListener('input', renderComposerPreview);
}

async function bootstrap() {
  const configResponse = await fetch('/api/public-config');
  state.config = await configResponse.json();
  elements.appName.textContent = state.config.appName;
  document.title = state.config.appName;
  applyPrefill();
  await refresh();
}

async function refresh() {
  const sessionResponse = await fetch('/api/session');

  if (!sessionResponse.ok) {
    state.session = null;
    state.myRequests = [];
    state.pendingRequests = [];
    state.stats = null;
    render();
    return;
  }

  state.session = (await sessionResponse.json()).user;
  const myResponsePromise = fetch('/api/requests');

  if (state.session.role === 'admin') {
    const [myResponse, pendingResponse, statsResponse] = await Promise.all([
      myResponsePromise,
      fetch('/api/requests?scope=pending'),
      fetch('/api/admin/stats')
    ]);

    state.myRequests = (await myResponse.json()).requests;
    state.pendingRequests = (await pendingResponse.json()).requests;
    state.stats = (await statsResponse.json()).counts;
  } else {
    state.myRequests = (await (await myResponsePromise).json()).requests;
    state.pendingRequests = [];
    state.stats = null;
  }

  render();
}

function render() {
  if (!state.session) {
    elements.logoutButton.hidden = true;
    elements.loginCard.hidden = !state.config.allowPasswordLogin;
    elements.dashboard.hidden = true;
    elements.requestCard.hidden = true;
    elements.accountCard.hidden = true;
    elements.requestsCard.hidden = true;
    elements.adminCard.hidden = true;
    elements.heroLede.textContent = 'Turn videos, playlists, and creator feeds into trackable Jellyfin requests.';
    elements.heroSummaryTitle.textContent = 'Request once. Review once. Download privately.';
    elements.heroSummaryBody.textContent = 'Jellytube gives your Jellyfin users a proper intake flow for web video without turning MeTube into the user-facing app.';
    renderMetricRow(elements.heroStats, [
      { label: 'Identity', value: 'Jellyfin' },
      { label: 'Requests', value: 'Tracked' },
      { label: 'Review', value: 'Admin queue' }
    ]);
    renderComposerPreview();
    setStatus(state.config.allowPasswordLogin ? 'Sign in with your Jellyfin account to submit requests.' : 'Password login is disabled.', 'info');
    return;
  }

  const counts = getRequestCounts(state.myRequests);
  const isAdmin = state.session.role === 'admin';

  elements.logoutButton.hidden = false;
  elements.loginCard.hidden = true;
  elements.dashboard.hidden = false;
  elements.requestCard.hidden = false;
  elements.accountCard.hidden = false;
  elements.requestsCard.hidden = false;

  elements.heroLede.textContent = isAdmin
    ? 'Run the web-video request desk from one place and keep approvals tied to Jellyfin identities.'
    : 'Request web videos without exposing the downloader and keep the whole trail tied to your Jellyfin account.';
  elements.heroSummaryTitle.textContent = isAdmin
    ? 'Moderate intake before it reaches MeTube.'
    : 'Your request history stays visible after submission.';
  elements.heroSummaryBody.textContent = isAdmin
    ? `${state.pendingRequests.length} ${pluralize('request', state.pendingRequests.length)} currently waiting for review.`
    : `${counts.queued} ${pluralize('request', counts.queued)} already queued for MeTube.`;
  renderMetricRow(elements.heroStats, buildHeroMetrics(counts, isAdmin));

  elements.welcomeLine.textContent = isAdmin
    ? 'Paste a supported link, add any context, and review the queue below like a proper intake board.'
    : `${state.session.username}, paste a video, playlist, or channel URL and add any context your admin needs.`;
  elements.accountUsername.textContent = state.session.username;
  elements.accountRole.textContent = isAdmin ? 'Admin' : 'User';
  elements.accountUserId.textContent = state.session.userId;
  elements.myStatsLine.replaceChildren(...buildRequestStats(state.myRequests));

  renderRequestCollection(elements.myRequests, state.myRequests, 'You have not submitted any requests yet.', false);

  if (isAdmin) {
    elements.adminCard.hidden = false;
    renderRequestCollection(elements.pendingRequests, state.pendingRequests, 'Nothing is waiting for review right now.', true);
    elements.statsLine.replaceChildren(...buildStatBadges(state.stats || {}));
  } else {
    elements.adminCard.hidden = true;
    elements.statsLine.replaceChildren();
    elements.pendingRequests.replaceChildren();
  }

  renderComposerPreview();
}

function renderMetricRow(target, items) {
  target.replaceChildren(...items.map((item) => {
    const chip = document.createElement('div');
    chip.className = 'metric-chip';

    const label = document.createElement('span');
    label.className = 'metric-label';
    label.textContent = item.label;

    const value = document.createElement('span');
    value.className = 'metric-value';
    value.textContent = String(item.value);

    chip.append(label, value);
    return chip;
  }));
}

function renderRequestCollection(container, requests, emptyMessage, isAdminQueue) {
  if (!requests.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = emptyMessage;
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren(...requests.map((request) => renderRequest(request, isAdminQueue)));
}

function renderRequest(request, isAdminQueue) {
  const fragment = elements.requestTemplate.content.cloneNode(true);
  const root = fragment.querySelector('.request-item');
  const sourceBadge = fragment.querySelector('.badge-source');
  const kindBadge = fragment.querySelector('.badge-kind');
  const statusBadge = fragment.querySelector('.badge-status');
  const created = fragment.querySelector('.request-created');
  const title = fragment.querySelector('.request-title');
  const url = fragment.querySelector('.request-url');
  const note = fragment.querySelector('.request-note');
  const extra = fragment.querySelector('.request-extra');
  const actions = fragment.querySelector('.actions');

  root.dataset.status = request.status;
  sourceBadge.textContent = humanizeSource(request.source);
  kindBadge.textContent = humanizeKind(request.kind);
  statusBadge.textContent = humanizeStatus(request.status);
  statusBadge.dataset.status = request.status;
  created.textContent = formatDate(request.createdAt);
  title.textContent = request.titleHint || fallbackRequestTitle(request);
  url.textContent = request.url;
  note.textContent = request.note || '';
  note.hidden = !request.note;

  const actor = state.session && request.requestedBy.userId === state.session.userId
    ? 'You'
    : request.requestedBy.username;

  appendDetail(extra, `${actor} requested this on ${formatDate(request.createdAt)}.`);

  if (request.decision) {
    const reasonSuffix = request.decision.reason ? ` Reason: ${request.decision.reason}` : '';
    appendDetail(
      extra,
      `${request.decision.byUsername} reviewed this on ${formatDate(request.decision.decidedAt)}.${reasonSuffix}`,
      request.status === 'rejected' ? 'danger' : undefined
    );
  }

  if (request.metube?.submittedAt) {
    appendDetail(extra, `Queued in MeTube on ${formatDate(request.metube.submittedAt)}.`, 'success');
  }

  if (request.metube?.error) {
    appendDetail(extra, `MeTube error: ${request.metube.error}`, 'danger');
  }

  if (isAdminQueue && request.status === 'pending') {
    actions.appendChild(buildActionButton('Approve', async () => {
      await decide(request.id, 'approve');
    }));
    actions.appendChild(buildActionButton('Reject', async () => {
      const reason = window.prompt('Optional rejection reason') || undefined;
      await decide(request.id, 'reject', reason);
    }, 'danger'));
  }

  return fragment;
}

function appendDetail(container, text, tone) {
  const line = document.createElement('p');
  line.className = 'detail-line';
  line.textContent = text;
  if (tone) {
    line.dataset.tone = tone;
  }
  container.appendChild(line);
}

function buildActionButton(label, onClick, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) {
    button.classList.add(className);
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await onClick();
    } finally {
      button.disabled = false;
    }
  });

  return button;
}

function buildHeroMetrics(counts, isAdmin) {
  const metrics = [
    { label: 'Requests', value: counts.total },
    { label: 'Queued', value: counts.queued }
  ];

  if (isAdmin) {
    metrics.push({ label: 'Needs review', value: state.pendingRequests.length });
  } else {
    metrics.push({ label: 'Rejected', value: counts.rejected });
  }

  return metrics;
}

function getRequestCounts(requests) {
  return {
    total: requests.length,
    pending: requests.filter((request) => request.status === 'pending').length,
    queued: requests.filter((request) => request.status === 'queued').length,
    rejected: requests.filter((request) => request.status === 'rejected').length,
    failed: requests.filter((request) => request.status === 'failed').length
  };
}

function buildRequestStats(requests) {
  return buildStatBadges(getRequestCounts(requests));
}

function buildStatBadges(counts) {
  return Object.entries(counts).map(([label, value]) => buildBadge(`${humanizeLabel(label)}: ${value}`));
}

function buildBadge(text) {
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = text;
  return badge;
}

function renderComposerPreview() {
  const preview = describeRequestInput(
    elements.requestUrlInput.value,
    elements.titleHintInput.value,
    elements.requestNoteInput.value
  );

  elements.requestPreviewTitle.textContent = preview.title;
  elements.requestPreviewSummary.textContent = preview.summary;
  elements.requestPreviewBadges.replaceChildren(...preview.badges.map((badge) => buildBadge(badge)));
  elements.requestPreviewNote.textContent = preview.note;
  elements.requestPreviewNote.hidden = !preview.note;
}

function describeRequestInput(rawUrl, rawTitleHint, rawNote) {
  const url = rawUrl.trim();
  const titleHint = rawTitleHint.trim();
  const note = rawNote.trim();

  if (!url) {
    return {
      title: 'Paste a supported link to get started.',
      summary: 'Jellytube will classify the link, attach it to your Jellyfin identity, and route it through review if needed.',
      badges: ['Jellyfin identity', 'Admin review', 'MeTube queue'],
      note: titleHint ? `Title hint ready: ${titleHint}` : ''
    };
  }

  const inspection = inspectUrl(url);
  if (!inspection.valid) {
    return {
      title: 'This does not look like a full URL yet.',
      summary: 'Paste the complete https:// link for a video, playlist, or creator page.',
      badges: ['Needs full URL'],
      note: titleHint ? `Title hint ready: ${titleHint}` : ''
    };
  }

  const source = humanizeSource(inspection.source);
  const kind = humanizeKind(inspection.kind);
  const title = titleHint || `${kind} request from ${inspection.host}`;
  const badges = [source, kind, note ? 'Note included' : 'Add request context'];
  const summaryParts = [`Detected a ${source} ${kind.toLowerCase()} request.`];

  if (inspection.hasPlaylistContext) {
    badges[2] = 'Playlist context';
    summaryParts.push('Playlist context is present in the link, so backfill or queue notes may help.');
  }

  if (inspection.source === 'generic') {
    summaryParts.push('Non-admin users may still be limited by the allowed host list.');
  }

  return {
    title,
    summary: summaryParts.join(' '),
    badges,
    note: note
      ? 'Your admin note will be attached to the request.'
      : titleHint
        ? `Users will see the title hint "${titleHint}".`
        : ''
  };
}

function inspectUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.toLowerCase();
    const youtube = host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be';
    const rumble = host === 'rumble.com';
    const odysee = host === 'odysee.com';
    const hasPlaylistContext = parsed.searchParams.has('list');

    let source = 'generic';
    let kind = 'unknown';

    if (youtube) {
      source = 'youtube';
      if (host === 'youtu.be' || path.startsWith('/watch') || path.startsWith('/shorts/')) {
        kind = 'video';
      }
      if (path.startsWith('/playlist')) {
        kind = 'playlist';
      }
      if (path.startsWith('/channel/') || path.startsWith('/c/') || path.startsWith('/user/') || path.startsWith('/@')) {
        kind = 'channel';
      }
      if (kind === 'unknown' && hasPlaylistContext) {
        kind = 'playlist';
      }
    } else if (rumble) {
      source = 'rumble';
      if (path.startsWith('/v')) {
        kind = 'video';
      } else if (path.startsWith('/c/') || path.startsWith('/user/')) {
        kind = 'channel';
      }
    } else if (odysee) {
      source = 'odysee';
      if (path.includes(':')) {
        kind = 'video';
      } else if (path.length > 1) {
        kind = 'channel';
      }
    } else {
      if (path.includes('playlist') || hasPlaylistContext) {
        kind = 'playlist';
      }
    }

    return {
      valid: true,
      source,
      kind,
      host,
      hasPlaylistContext
    };
  } catch {
    return {
      valid: false,
      source: 'generic',
      kind: 'unknown',
      host: '',
      hasPlaylistContext: false
    };
  }
}

async function decide(id, action, reason) {
  const response = await fetch(`/api/admin/requests/${id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reason ? { reason } : {})
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    setStatus(json.error || `Unable to ${action} request`, 'danger');
    return;
  }

  await refresh();
  setStatus(`Request ${action}d.`, 'success');
}

function applyPrefill() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  const title = params.get('title');

  if (url) {
    elements.requestUrlInput.value = url;
  }

  if (title) {
    elements.titleHintInput.value = title;
  }

  renderComposerPreview();
}

function fallbackRequestTitle(request) {
  return `${humanizeKind(request.kind)} request from ${humanizeSource(request.source)}`;
}

function humanizeSource(source) {
  switch (source) {
    case 'youtube':
      return 'YouTube';
    case 'rumble':
      return 'Rumble';
    case 'odysee':
      return 'Odysee';
    default:
      return 'External';
  }
}

function humanizeKind(kind) {
  switch (kind) {
    case 'video':
      return 'Video';
    case 'playlist':
      return 'Playlist';
    case 'channel':
      return 'Channel';
    default:
      return 'Link';
  }
}

function humanizeStatus(status) {
  switch (status) {
    case 'pending':
      return 'Pending review';
    case 'queued':
      return 'Queued';
    case 'rejected':
      return 'Rejected';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function humanizeLabel(label) {
  return label.charAt(0).toUpperCase() + label.slice(1).replace(/_/g, ' ');
}

function pluralize(word, count) {
  return count === 1 ? word : `${word}s`;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function setStatus(message, tone = 'info') {
  elements.statusMessage.textContent = message;
  elements.statusCard.dataset.tone = tone;
  elements.statusCard.hidden = !message;
}

function clearStatus() {
  elements.statusMessage.textContent = '';
  elements.statusCard.hidden = true;
  delete elements.statusCard.dataset.tone;
}
