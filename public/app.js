'use strict';

// ---------- Utilities ----------

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const initials = (name) => name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const ROLE_NAMES = { SD: 'Set Director', QC: 'QC Reviewer', SPL: 'Studio Project Lead', SPC: 'Studio Project Coordinator', ADMIN: 'Admin' };
const roleLabel = (u) => u.title || ROLE_NAMES[u.role];
const STATUS_ORDER = ['pending', 'reviewing', 'returned', 'approved'];

const icon = {
  check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  image: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
  video: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 13l5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
  send: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>',
  eye: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  undo: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  camera: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  user: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
};
const bigIcon = (svg) => svg.replace(/width="\d+" height="\d+"/, 'width="18" height="18"');

function timeAgo(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
const fullTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const fmtDuration = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const pill = (t) => `<span class="pill ${t.status}">${esc(t.status_label)}</span>`;

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, {
    ...opts,
    headers: opts.body && !isForm ? { 'Content-Type': 'application/json' } : {},
    body: opts.body && !isForm ? JSON.stringify(opts.body) : opts.body,
  });
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (res.status === 401 && data?.code === 'site_password') {
    showSiteGate();
    throw new Error('Access password required');
  }
  if (res.status === 401 && !path.startsWith('/api/me') && !path.startsWith('/api/public')) {
    state.me = null;
    location.hash = '#/welcome';
  }
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

// Shared site password (test deployments): shown in the page when the API asks for it.
function showSiteGate() {
  if ($('#siteGate')) return;
  $('#header').hidden = true;
  $('#view').innerHTML = `
    <form id="siteGate" class="card site-gate" novalidate>
      <h1>Studio Setup QC</h1>
      <p class="muted">This is a test site. Enter the access password you were given.</p>
      <input type="password" name="password" placeholder="Access password" autocomplete="current-password">
      <button class="btn btn-primary btn-lg btn-block" type="submit">Continue</button>
      <div class="login-error" hidden></div>
    </form>`;
  const form = $('#siteGate');
  form.password.focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('/site-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ password: form.password.value }),
    });
    if (res.ok) return location.reload();
    const box = $('.login-error', form);
    box.textContent = (await res.json().catch(() => null))?.error || "That password isn't right.";
    box.hidden = false;
  };
}

// Uploads go up in chunks (each request stays small enough for serverless hosts).
function putChunk(url, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      xhr.status < 300 ? resolve(data) : reject(Object.assign(new Error(data.error || 'Upload failed'), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });
}

// Uploads [{ slot, file, duration }] and returns [{ slot, uploadId }]. Each chunk is retried twice.
async function uploadFiles(files, onProgress) {
  const total = files.reduce((sum, f) => sum + f.file.size, 0) || 1;
  let done = 0;
  const result = [];
  for (const f of files) {
    const { uploadId, chunkSize, chunks } = await api('/api/uploads', {
      method: 'POST',
      body: { name: f.file.name, mime: f.file.type, size: f.file.size, duration: f.duration ?? null },
    });
    for (let n = 0; n < chunks; n++) {
      const blob = f.file.slice(n * chunkSize, (n + 1) * chunkSize);
      for (let attempt = 0; ; attempt++) {
        try {
          await putChunk(`/api/uploads/${uploadId}/${n}`, blob, (p) => onProgress((done + p * blob.size) / total));
          break;
        } catch (err) {
          if (attempt >= 2 || (err.status && err.status < 500)) throw err;
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      done += blob.size;
      onProgress(done / total);
    }
    await api(`/api/uploads/${uploadId}/complete`, { method: 'POST' });
    result.push({ slot: f.slot, uploadId });
  }
  return result;
}

// ---------- State & router ----------

const state = { me: null, meta: null, auth: null, notifTimer: null };

async function route() {
  const hash = location.hash.slice(1) || '/';
  if (!state.auth) state.auth = await api('/api/auth-config');
  if (!state.me) {
    try { state.me = await api('/api/me'); } catch {}
  }
  // Pages reachable without logging in: the start page, login, and "Submit a photo".
  const isPublic = [/^\/welcome$/, /^\/login$/, /^\/submit\/\w+$/, /^\/s\/\d+$/].some((r) => r.test(hash));
  if (!state.me && !isPublic) return void (location.hash = '#/welcome');
  if (state.me && (hash === '/welcome' || hash === '/login')) return void (location.hash = '#/');
  if (state.me && !state.meta) state.meta = await api('/api/meta');

  renderHeader(hash);
  const view = $('#view');
  view.innerHTML = '<div class="spinner"></div>';
  window.scrollTo(0, 0);
  let m;
  try {
    if (hash === '/welcome') return await renderWelcome(view);
    if (hash === '/login') return await renderLogin(view);
    if ((m = hash.match(/^\/submit\/(\w+)$/))) return await renderQuickSubmit(view, m[1]);
    if ((m = hash.match(/^\/s\/(\d+)$/))) return await renderPublicTicket(view, Number(m[1]));
    if (hash === '/') return await renderHome(view);
    if (hash === '/new' && state.me.role === 'SD') return renderNewTicket(view);
    if (hash === '/team' && ['ADMIN', 'SPL'].includes(state.me.role)) return await renderTeam(view);
    if ((m = hash.match(/^\/t\/(\d+)$/))) return await renderTicket(view, Number(m[1]));
    view.innerHTML = '<div class="empty"><h3>Page not found</h3><a href="#/">Go home</a></div>';
  } catch (err) {
    view.innerHTML = `<div class="empty"><h3>Couldn't load this page</h3><p>${esc(err.message)}</p><a href="#/">Go home</a></div>`;
  }
}
window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);

// ---------- Header & notifications ----------

function renderHeader(hash) {
  const header = $('#header');
  if (!state.me) {
    clearInterval(state.notifTimer);
    header.hidden = hash === '/welcome' || hash === '/login';
    header.innerHTML = `
      <a class="brand" href="#/welcome"><span class="brand-mark">${icon.check.replace('currentColor', '#fff')}</span><span class="brand-text">Studio Setup QC</span></a>
      <div class="header-right"><a class="btn" href="#/login">Log in</a></div>`;
    return;
  }
  const me = state.me;
  const homeLabel = { SD: 'My tickets', QC: 'Review queue' }[me.role] || 'Overview';
  header.hidden = false;
  header.innerHTML = `
    <a class="brand" href="#/"><span class="brand-mark">${icon.check.replace('currentColor', '#fff')}</span><span class="brand-text">Studio Setup QC</span></a>
    <nav class="nav">
      <a href="#/" class="${hash === '/' ? 'active' : ''}">${homeLabel}</a>
      ${me.role === 'SD' ? `<a href="#/new" class="${hash === '/new' ? 'active' : ''}">New ticket</a>` : ''}
      ${['ADMIN', 'SPL'].includes(me.role) ? `<a href="#/team" class="${hash === '/team' ? 'active' : ''}">Team</a>` : ''}
    </nav>
    <div class="header-right">
      <div class="bell">
        <button class="btn btn-ghost btn-icon" id="bellBtn" aria-label="Notifications">${icon.bell}</button>
        <span class="badge" id="bellBadge" hidden></span>
        <div class="notif-panel" id="notifPanel" hidden></div>
      </div>
      <div class="user-chip">
        <div class="who"><b>${esc(me.name)}</b><span>${esc(roleLabel(me))}${me.studio ? ' · ' + esc(me.studio) : ''}</span></div>
        <span class="avatar">${esc(initials(me.name))}</span>
      </div>
      <button class="btn btn-ghost" id="signOut">${state.auth.devLogin ? 'Switch user' : 'Sign out'}</button>
    </div>`;

  $('#signOut').onclick = async () => {
    await api('/api/session', { method: 'DELETE' });
    window.google?.accounts.id.disableAutoSelect();
    state.me = state.meta = null;
    location.hash = '#/welcome';
  };
  const panel = $('#notifPanel');
  $('#bellBtn').onclick = (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) loadNotifications(true);
  };
  document.onclick = (e) => { if (!panel.contains(e.target)) panel.hidden = true; };

  loadNotifications(false);
  clearInterval(state.notifTimer);
  state.notifTimer = setInterval(() => loadNotifications(!panel.hidden), 20000);
}

async function loadNotifications(renderPanel) {
  let data;
  try { data = await api('/api/notifications'); } catch { return; }
  const badge = $('#bellBadge');
  if (!badge) return;
  badge.hidden = !data.unread;
  badge.textContent = data.unread > 99 ? '99+' : data.unread;
  if (!renderPanel) return;

  const panel = $('#notifPanel');
  panel.innerHTML = `
    <div class="notif-head"><h3>Notifications</h3>${data.unread ? '<button class="btn btn-ghost small" id="markAll">Mark all read</button>' : ''}</div>
    ${data.items.length ? data.items.map((n) => `
      <a class="notif-item ${n.read_at ? '' : 'unread'}" href="${n.ticket_id ? `#/t/${n.ticket_id}` : n.type === 'access_request' ? '#/team' : '#/'}" data-id="${n.id}">
        <div class="t">${esc(n.message)}</div><div class="when">${timeAgo(n.created_at)}</div>
      </a>`).join('') : '<div class="notif-empty">You\'re all caught up.</div>'}`;
  $('#markAll', panel)?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await api('/api/notifications/read', { method: 'POST', body: {} });
    loadNotifications(true);
  });
  $$('.notif-item', panel).forEach((a) => a.addEventListener('click', () => {
    panel.hidden = true;
    api('/api/notifications/read', { method: 'POST', body: { ids: [Number(a.dataset.id)] } }).then(() => loadNotifications(false));
  }));
}

// ---------- Login ----------

let gisPromise = null;
function loadGoogleIdentity() {
  gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      gisPromise = null;
      reject(new Error("Couldn't reach Google sign-in. Check your connection and reload."));
    };
    document.head.append(s);
  });
  return gisPromise;
}

const signedIn = (user) => {
  state.me = user;
  state.meta = null;
  location.hash = '#/';
};

async function renderLogin(view) {
  const { googleClientId, devLogin } = state.auth;
  view.innerHTML = `
    <div class="login">
      <div class="login-hero">
        <div class="brand-mark">${icon.check.replace('width="12" height="12"', 'width="24" height="24"').replace('currentColor', '#fff')}</div>
        <h1>Log in</h1>
        <p>Pre-recording setup approvals for the Studio QA/Capture team. <a href="#/welcome">← Back</a></p>
      </div>
      <div class="card"><div class="card-body" id="emailSignIn"></div></div>
      ${googleClientId ? `<div class="card" style="margin-top:16px"><div class="card-body google-signin">
        <p>Or sign in with Google</p>
        <div id="googleBtn"></div>
        <div class="login-error" id="loginError" hidden></div>
      </div></div>` : ''}
      ${devLogin ? `<div class="card" style="margin-top:16px"><div class="card-body">
        <div class="dev-note">${icon.info}<div><b>Development sign-in</b> — anyone can pick any name. Turn this off by removing DEV_LOGIN.</div></div>
        <input type="search" id="who" placeholder="Search your name…">
        <div id="people" style="margin-top:16px"></div>
      </div></div>` : ''}
    </div>`;

  mountEmailSignIn($('#emailSignIn'));
  if (googleClientId) mountGoogleButton(googleClientId);
  if (devLogin) await mountNamePicker();
}

async function mountGoogleButton(clientId) {
  const errorEl = $('#loginError');
  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };
  try {
    await loadGoogleIdentity();
  } catch (err) {
    return showError(err.message);
  }
  google.accounts.id.initialize({
    client_id: clientId,
    ux_mode: 'popup',
    callback: async ({ credential }) => {
      errorEl.hidden = true;
      try {
        signedIn(await api('/api/session/google', { method: 'POST', body: { credential } }));
      } catch (err) {
        showError(err.message);
      }
    },
  });
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  google.accounts.id.renderButton($('#googleBtn'), { theme: dark ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'signin_with', width: 280 });
}

async function mountNamePicker() {
  const users = await api('/api/users');
  const groups = [
    { title: 'Admin Team', users: users.filter((u) => u.role === 'ADMIN') },
    { title: 'QC Team', users: users.filter((u) => u.role === 'QC') },
  ];
  for (const studio of [...new Set(users.filter((u) => u.studio).map((u) => u.studio))]) {
    const order = { SPL: 0, SPC: 1, SD: 2 };
    groups.push({ title: studio, users: users.filter((u) => u.studio === studio).sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name)) });
  }

  const draw = (q) => {
    q = q.trim().toLowerCase();
    $('#people').innerHTML = groups.map((g) => {
      const list = g.users.filter((u) => !q || u.name.toLowerCase().includes(q));
      if (!list.length) return '';
      return `<div class="people-group"><p class="section-title">${esc(g.title)}</p><div class="people">
        ${list.map((u) => `<button class="person" data-id="${u.id}"><span class="avatar">${esc(initials(u.name))}</span>
          <div><b>${esc(u.name)}</b><span>${esc(roleLabel(u))}</span></div></button>`).join('')}
      </div></div>`;
    }).join('') || '<div class="empty">No one matches that name.</div>';
  };
  draw('');
  $('#who').oninput = (e) => draw(e.target.value);
  $('#people').onclick = async (e) => {
    const btn = e.target.closest('.person');
    if (!btn) return;
    signedIn(await api('/api/session', { method: 'POST', body: { userId: Number(btn.dataset.id) } }));
  };
}

// ---------- Home (role-based) ----------

async function renderHome(view) {
  const me = state.me;
  if (me.role === 'SD') {
    view.innerHTML = `
      <div class="page-head">
        <div><h1>My setup tickets</h1><p>Submit your setup preview before filming. You'll be notified when QC approves or returns it.</p></div>
        <a class="btn btn-primary" href="#/new">${icon.plus} New ticket</a>
      </div>
      <div class="card" id="list"></div>`;
    return ticketList($('#list'), { defaultTab: 'all', columns: ['ticket', 'project', 'spl', 'status', 'round', 'updated'] });
  }
  if (me.role === 'QC') {
    view.innerHTML = `
      <div class="page-head"><div><h1>Review queue</h1><p>Open a ticket to review the 4 EXO and 1 EGO camera views against the checklist.</p></div></div>
      <div id="stats"></div>
      <div class="card" id="list"></div>`;
    renderStats($('#stats'));
    return ticketList($('#list'), { defaultTab: 'open', columns: ['ticket', 'sd', 'studio', 'status', 'round', 'reviewer', 'updated'] });
  }
  if (me.role === 'ADMIN') {
    view.innerHTML = `
      <div class="page-head"><div><h1>All studios overview</h1><p>Setup submissions and QC outcomes across every studio.</p></div></div>
      <div id="stats"></div>
      <div class="card" id="list"></div>`;
    renderStats($('#stats'));
    return ticketList($('#list'), { defaultTab: 'all', columns: ['ticket', 'project', 'sd', 'studio', 'status', 'round', 'reviewer', 'updated'] });
  }
  view.innerHTML = `
    <div class="page-head"><div><h1>${esc(me.studio)} overview</h1><p>Setup submissions, QC outcomes and tickets that need corrections.</p></div></div>
    <div id="stats"></div>
    <div class="card" id="list"></div>`;
  renderStats($('#stats'));
  return ticketList($('#list'), { defaultTab: 'returned', columns: ['ticket', 'sd', 'status', 'round', 'reviewer', 'updated'] });
}

async function renderStats(el) {
  const s = await api('/api/stats');
  const pct = s.firstPassRate == null ? '—' : `${Math.round(s.firstPassRate * 100)}<small>%</small>`;
  const avg = s.avgDecisionMinutes == null ? '—'
    : s.avgDecisionMinutes < 60 ? `${Math.round(s.avgDecisionMinutes)}<small> min</small>`
    : `${(s.avgDecisionMinutes / 60).toFixed(1)}<small> h</small>`;
  el.innerHTML = `<div class="stats">
    <div class="card stat"><div class="k">Pending review</div><div class="v">${s.counts.pending}</div></div>
    <div class="card stat"><div class="k">In review</div><div class="v">${s.counts.reviewing}</div></div>
    <div class="card stat"><div class="k">Needs fixes</div><div class="v">${s.counts.returned}</div></div>
    <div class="card stat"><div class="k">Approved</div><div class="v">${s.counts.approved}</div></div>
    <div class="card stat"><div class="k">First-pass approval</div><div class="v">${pct}</div></div>
    <div class="card stat"><div class="k">Avg. QC turnaround</div><div class="v">${avg}</div></div>
  </div>`;
}

async function ticketList(el, { defaultTab, columns }) {
  const tickets = await api('/api/tickets');
  const tabs = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'open', label: 'Awaiting review', match: (t) => t.status === 'pending' || t.status === 'reviewing' },
    { id: 'returned', label: 'Returned', match: (t) => t.status === 'returned' },
    { id: 'approved', label: 'Approved', match: (t) => t.status === 'approved' },
  ];
  let tab = defaultTab;
  let q = '';
  const cols = {
    ticket: ['Ticket', (t) => `<div class="code">${esc(t.code)}</div><div class="sub">${esc(t.task_name)} · ${esc(t.scene)}</div>`],
    project: ['Project', (t) => esc(t.project_name), 'hide-sm'],
    sd: ['Set Director', (t) => esc(t.sd_name)],
    spl: ['SPL', (t) => esc(t.spl_name), 'hide-sm'],
    studio: ['Studio', (t) => esc(t.studio), 'hide-sm'],
    status: ['Status', (t) => pill(t)],
    round: ['Round', (t) => `<span class="muted">#${t.submission_no}</span>`, 'hide-sm'],
    reviewer: ['QC', (t) => (t.reviewer_name ? esc(t.reviewer_name) : '<span class="faint">—</span>'), 'hide-sm'],
    updated: ['Updated', (t) => `<span class="muted" title="${esc(fullTime(t.updated_at))}">${timeAgo(t.updated_at)}</span>`],
  };

  el.innerHTML = `
    <div class="toolbar"><div class="tabs"></div><input type="search" class="search" placeholder="Search code, task, scene, SD…"></div>
    <div class="list-body"></div>`;
  const draw = () => {
    $('.tabs', el).innerHTML = tabs.map((t) => `<button class="${t.id === tab ? 'on' : ''}" data-tab="${t.id}">${t.label} <span class="n">${tickets.filter(t.match).length}</span></button>`).join('');
    const needle = q.toLowerCase();
    const rows = tickets
      .filter(tabs.find((t) => t.id === tab).match)
      .filter((t) => !needle || [t.code, t.task_name, t.scene, t.business_type, t.sd_name, t.studio].some((v) => String(v || '').toLowerCase().includes(needle)));
    if (tab === 'open') rows.sort((a, b) => a.updated_at.localeCompare(b.updated_at)); // oldest first: FIFO queue
    $('.list-body', el).innerHTML = rows.length
      ? `<table class="tickets"><thead><tr>${columns.map((c) => `<th class="${cols[c][2] || ''}">${cols[c][0]}</th>`).join('')}</tr></thead>
         <tbody>${rows.map((t) => `<tr data-id="${t.id}">${columns.map((c) => `<td class="${cols[c][2] || ''}">${cols[c][1](t)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : `<div class="empty"><h3>No tickets here</h3><p>${tickets.length ? 'Try a different tab or search.' : state.me.role === 'SD' ? 'Create your first setup ticket before filming.' : 'Nothing has been submitted yet.'}</p></div>`;
  };
  draw();
  $('.tabs', el).onclick = (e) => {
    const b = e.target.closest('button');
    if (b) { tab = b.dataset.tab; draw(); }
  };
  $('.search', el).oninput = (e) => { q = e.target.value; draw(); };
  $('.list-body', el).onclick = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) location.hash = `#/t/${tr.dataset.id}`;
  };
}

// ---------- Project guidelines (QC flags + approve reasons) ----------

function guidelinesHtml(project, { open = false } = {}) {
  if (!project.flags?.length) return '';
  return `<details class="guide" ${open ? 'open' : ''}>
    <summary>${esc(project.name)} QC guidelines <span class="muted small">· what QC flags and how to fix it</span></summary>
    <div class="guide-body">
      ${project.flags.map((f, i) => `<div class="flag">
        <div class="flag-code c${(i % 3) + 1}">${esc(f.code)}</div>
        <h3 class="flag-title">${esc(f.title)}</h3>
        <p><span class="lbl lbl-issue">ISSUE:</span> ${esc(f.issue)}</p>
        <p><span class="lbl lbl-check">CHECK:</span> ${esc(f.check)}</p>
        <p><span class="lbl lbl-fix">FIX:</span> ${esc(f.fix)}</p>
      </div>`).join('')}
      ${project.approveReasons?.length ? `<div class="flag approve">
        <h3 class="approve-title">Approve Reasons:</h3>
        <ul>${project.approveReasons.map((r) => `<li><b>${esc(r.title)}:</b> ${esc(r.detail)}</li>`).join('')}</ul>
      </div>` : ''}
    </div>
  </details>`;
}

const flagTag = (c) => (c.flagCode ? ` <span class="flag-tag">${esc(c.flagCode)}</span>` : '');

// ---------- Submission fields (checklist + media), shared by New and Resubmit ----------

function mountSubmissionFields(root, project, prefill = {}) {
  const b = project.boundary;
  const sizes = [];
  for (let v = b.min; v <= b.max + 1e-9; v += b.step) sizes.push(v);
  const plain = project.setupChecklist.filter((c) => !c.group);
  const groups = [...new Set(project.setupChecklist.filter((c) => c.group).map((c) => c.group))];
  const checkItem = (c) => `<label class="check"><input type="checkbox" data-check="${c.id}"><div>${esc(c.label)}</div></label>`;

  root.innerHTML = `
    ${guidelinesHtml(project)}
    <p class="section-title checklist-title" style="margin-top:20px">Setup checklist · ${esc(project.name)}
      <span class="checklist-count" data-count></span></p>
    <p class="muted small" style="margin:-6px 0 10px">Tick every item to confirm your setup before submitting.</p>
    <label class="field" style="max-width:260px;margin-bottom:12px"><span>Boundary box size <em>*</em></span>
      <select data-boundary>${sizes.map((v) => `<option value="${v}" ${v === (prefill.boundarySize ?? b.standard) ? 'selected' : ''}>${v}m × ${v}m${v === b.standard ? ' (standard)' : ''}</option>`).join('')}</select>
    </label>
    <div class="checklist">${plain.map(checkItem).join('')}</div>
    ${groups.map((g) => `<div class="check-group" style="margin-top:8px"><div class="gl">${esc(g)}</div><div class="checklist">
      ${project.setupChecklist.filter((c) => c.group === g).map(checkItem).join('')}</div></div>`).join('')}

    <p class="section-title" style="margin-top:24px">Setup preview</p>
    <div class="seg" data-mode-toggle>
      <button type="button" data-mode="images" class="on">Images (5 views)</button>
      <button type="button" data-mode="video">Video clip</button>
    </div>
    <div class="prompt">${icon.info}<div>The preview must show <b>all 4 EXO camera views and 1 EGO camera view</b>.
      Upload one image per camera, or a single <b>${project.video.minSec}–${project.video.maxSec} second</b> video that shows every view.</div></div>
    <div data-pane="images" class="slots">
      ${project.mediaSlots.map((s) => `<label class="slot" data-slot="${s.key}"><span class="slot-label">${esc(s.label)}</span>
        <input type="file" accept="image/*"><div class="ph">${icon.image}<span>Add image</span></div></label>`).join('')}
    </div>
    <div data-pane="video" hidden>
      <label class="dropzone"><input type="file" accept="video/*">
        <div class="faint">${icon.video}</div><div><b>Choose a video</b> or drop it here</div>
        <div class="muted small">${project.video.minSec}–${project.video.maxSec} seconds · MP4 / MOV</div></label>
      <div class="video-preview" hidden><video controls muted playsinline></video><div class="dur"></div></div>
    </div>`;

  let mode = 'images';
  let videoDuration = null;
  const slotFiles = {};
  let videoFile = null;

  // Checklist highlight + live "x of y confirmed" count
  const boxes = $$('.check input', root);
  const countEl = $('[data-count]', root);
  const updateCount = () => {
    const done = boxes.filter((cb) => cb.checked).length;
    countEl.textContent = `${done} of ${boxes.length} confirmed`;
    countEl.classList.toggle('complete', done === boxes.length);
  };
  boxes.forEach((cb) => cb.addEventListener('change', () => {
    const item = cb.closest('.check');
    item.classList.toggle('on', cb.checked);
    if (cb.checked) item.classList.remove('missing');
    updateCount();
  }));
  updateCount();

  // Mode toggle
  $('[data-mode-toggle]', root).onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    mode = btn.dataset.mode;
    $$('[data-mode-toggle] button', root).forEach((x) => x.classList.toggle('on', x === btn));
    $$('[data-pane]', root).forEach((p) => (p.hidden = p.dataset.pane !== mode));
  };

  const enableDrop = (el, onFile) => {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag');
      if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
    });
  };

  // Image slots
  $$('.slot', root).forEach((slot) => {
    const input = $('input', slot);
    const setFile = (file) => {
      if (!file.type.startsWith('image/')) return toast('Please choose an image file', 'error');
      slotFiles[slot.dataset.slot] = file;
      $('img', slot)?.remove();
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      slot.append(img);
      slot.classList.add('filled');
    };
    input.onchange = () => input.files[0] && setFile(input.files[0]);
    enableDrop(slot, setFile);
  });

  // Video
  const dz = $('.dropzone', root);
  const preview = $('.video-preview', root);
  const videoEl = $('video', preview);
  const durEl = $('.dur', preview);
  const setVideo = (file) => {
    if (!file.type.startsWith('video/')) return toast('Please choose a video file', 'error');
    videoFile = file;
    videoDuration = null;
    preview.hidden = false;
    durEl.className = 'dur';
    durEl.textContent = 'Reading video length…';
    videoEl.src = URL.createObjectURL(file);
    videoEl.onloadedmetadata = () => {
      videoDuration = videoEl.duration;
      const ok = videoDuration >= project.video.minSec - 0.5 && videoDuration <= project.video.maxSec + 0.5;
      durEl.className = `dur ${ok ? 'ok' : 'bad'}`;
      durEl.textContent = `${file.name} · ${fmtDuration(videoDuration)} ${ok ? '✓' : `— must be ${project.video.minSec}–${project.video.maxSec} seconds`}`;
    };
    videoEl.onerror = () => {
      durEl.className = 'dur bad';
      durEl.textContent = "This browser can't read the video. Try an MP4 (H.264) file.";
    };
  };
  $('input', dz).onchange = (e) => e.target.files[0] && setVideo(e.target.files[0]);
  enableDrop(dz, setVideo);

  return {
    validate() {
      const errors = [];
      const unchecked = boxes.filter((cb) => !cb.checked);
      if (unchecked.length) {
        // Point at exactly what's missing: highlight the unticked items and scroll to the first one.
        unchecked.forEach((cb) => cb.closest('.check').classList.add('missing'));
        unchecked[0].closest('.check').scrollIntoView({ behavior: 'smooth', block: 'center' });
        errors.push(`Tick the ${unchecked.length} setup checklist item${unchecked.length > 1 ? 's' : ''} highlighted in red to confirm your setup`);
      }
      if (mode === 'images') {
        const missing = project.mediaSlots.filter((s) => !slotFiles[s.key]);
        if (missing.length) errors.push(`Add preview images for: ${missing.map((s) => s.label).join(', ')}`);
      } else if (!videoFile) {
        errors.push('Add a setup video clip');
      } else if (videoDuration == null) {
        errors.push("Video length couldn't be read yet");
      } else if (videoDuration < project.video.minSec - 0.5 || videoDuration > project.video.maxSec + 0.5) {
        errors.push(`Video must be ${project.video.minSec}–${project.video.maxSec} seconds (yours is ${fmtDuration(videoDuration)})`);
      }
      return errors;
    },
    values() {
      return {
        boundarySize: $('[data-boundary]', root).value,
        checklist: Object.fromEntries($$('.check input', root).map((cb) => [cb.dataset.check, cb.checked])),
        mediaType: mode,
      };
    },
    files() {
      return mode === 'images'
        ? project.mediaSlots.map((s) => ({ slot: s.key, file: slotFiles[s.key] }))
        : [{ slot: 'video', file: videoFile, duration: videoDuration }];
    },
  };
}

// Uploads the media, then posts the submission. Shared by New, Resubmit and "Submit a photo".
// `fields` are the form's own values; `sub` is the mounted submission fields.
async function submitWithProgress(btn, progressEl, url, fields, sub, label) {
  btn.disabled = true;
  progressEl.hidden = false;
  const bar = $('div', progressEl);
  try {
    const media = await uploadFiles(sub.files(), (p) => {
      bar.style.width = `${Math.round(p * 100)}%`;
      btn.textContent = p < 1 ? `Uploading ${Math.round(p * 100)}%…` : 'Saving…';
    });
    btn.textContent = 'Saving…';
    return await api(url, { method: 'POST', body: { ...fields, ...sub.values(), media } });
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = label;
    progressEl.hidden = true;
    bar.style.width = '0';
    return null;
  }
}

// ---------- New ticket ----------

function renderNewTicket(view) {
  const { me, meta } = state;
  const defaultSpl = meta.spls.find((s) => s.studio === me.studio);
  view.innerHTML = `
    <a class="back" href="#/">${icon.back} My tickets</a>
    <div class="page-head"><div><h1>New setup ticket</h1><p>Submit your setup for QC approval before any filming starts.</p></div></div>
    <form id="newForm" class="card" novalidate>
      <div class="card-body stack">
        <div>
          <p class="section-title">General information</p>
          <div class="form-grid">
            <label class="field"><span>Set Director</span><input type="text" value="${esc(me.name)}" readonly></label>
            <label class="field"><span>Assigned Studio Project Lead (SPL) <em>*</em></span>
              <select name="splId" required>
                <option value="">Select SPL…</option>
                ${meta.spls.map((s) => `<option value="${s.id}" ${s.id === defaultSpl?.id ? 'selected' : ''}>${esc(s.name)} · ${esc(s.studio)}</option>`).join('')}
              </select></label>
            <label class="field"><span>Task Name <em>*</em></span><input type="text" name="taskName" required maxlength="200"></label>
            <label class="field"><span>Scene <em>*</em></span><input type="text" name="scene" required maxlength="200"></label>
            <label class="field"><span>Business Type <em>*</em></span><input type="text" name="businessType" required maxlength="200"></label>
            <label class="field"><span>Project <em>*</em></span>
              <select name="project">${meta.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
          </div>
        </div>
        <div id="subFields"></div>
      </div>
      <div class="card-body" style="border-top:1px solid var(--border)">
        <div class="actions" style="justify-content:flex-end"><a class="btn" href="#/">Cancel</a><button class="btn btn-primary btn-lg" type="submit">Submit for QC review</button></div>
        <div class="progress" hidden><div></div></div>
      </div>
    </form>`;

  const form = $('#newForm');
  let fields;
  const mountProject = () => {
    const project = meta.projects.find((p) => p.id === form.project.value);
    fields = mountSubmissionFields($('#subFields'), project);
  };
  form.project.onchange = mountProject;
  mountProject();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const errors = [];
    if (!form.splId.value) errors.push('Select the assigned SPL');
    for (const [name, label] of [['taskName', 'Task Name'], ['scene', 'Scene'], ['businessType', 'Business Type']]) {
      if (!form[name].value.trim()) errors.push(`${label} is required`);
    }
    errors.push(...fields.validate());
    if (errors.length) return toast(errors[0], 'error');

    const values = Object.fromEntries(['splId', 'taskName', 'scene', 'businessType', 'project'].map((n) => [n, form[n].value.trim()]));
    const btn = $('button[type=submit]', form);
    const result = await submitWithProgress(btn, $('.progress', form), '/api/tickets', values, fields, 'Submit for QC review');
    if (result) {
      toast('Ticket submitted — QC has been notified');
      location.hash = `#/t/${result.id}`;
    }
  };
}

// ---------- Ticket detail ----------

const HISTORY_TEXT = {
  submitted: 'submitted the ticket',
  review_started: 'started reviewing',
  approved: 'approved the setup — filming can begin',
  returned: 'returned the ticket with required fixes',
  resubmitted: 'resubmitted with an updated setup',
};
const HISTORY_ICON = { submitted: icon.send, review_started: icon.eye, approved: icon.check, returned: icon.x, resubmitted: icon.undo };

async function renderTicket(view, id) {
  let data = await api(`/api/tickets/${id}`);
  if (state.me.role === 'QC' && data.ticket.status === 'pending') {
    await api(`/api/tickets/${id}/start-review`, { method: 'POST' });
    data = await api(`/api/tickets/${id}`);
  }
  const { ticket: t, project, media, history } = data;
  const me = state.me;
  const rounds = [...new Set(media.map((m) => m.submission_no))].sort((a, b) => b - a);
  const lastReturn = history.find((h) => h.action === 'returned');
  const canReview = ['QC', 'ADMIN'].includes(me.role) && ['pending', 'reviewing'].includes(t.status);
  const canResubmit = me.role === 'SD' && t.sd_id === me.id && t.status === 'returned';
  const backLabel = { SD: 'My tickets', QC: 'Review queue' }[me.role] || 'Overview';

  view.innerHTML = `
    <a class="back" href="#/">${icon.back} ${backLabel}</a>
    <div class="page-head">
      <div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><h1>${esc(t.code)}</h1>${pill(t)}</div>
        <p>${esc(t.task_name)} · ${esc(t.scene)} · ${esc(t.project_name)}</p>
      </div>
    </div>
    <div class="grid-2">
      <div class="stack">
        ${statusBanner(t, lastReturn)}
        <div class="card">
          <div class="card-head"><h2>Setup preview</h2><span class="muted small">Round ${t.submission_no}${t.submission_no > 1 ? ` of ${t.submission_no}` : ''}</span></div>
          <div class="card-body">${mediaGallery(media.filter((m) => m.submission_no === t.submission_no))}</div>
        </div>
        ${rounds.length > 1 ? `<div class="card"><div class="card-head"><h2>Previous submissions</h2></div><div class="card-body">
          ${rounds.filter((r) => r !== t.submission_no).map((r) => `<details class="round"><summary>Round ${r}</summary><div>${mediaGallery(media.filter((m) => m.submission_no === r))}</div></details>`).join('')}
        </div></div>` : ''}
        ${canResubmit ? `<div class="card" id="resubmitCard">
          <div class="card-head"><h2>Fix and resubmit</h2></div>
          <div class="card-body stack">
            <p class="muted" style="margin:0">Adjust the cameras or setup per the QC feedback, re-confirm the checklist and upload a new preview.</p>
            <div id="resubFields"></div>
            <label class="field"><span>Note to QC (optional)</span><textarea id="resubNote" style="min-height:80px" placeholder="What did you change?"></textarea></label>
            <div class="actions" style="justify-content:flex-end"><button class="btn btn-primary btn-lg" id="resubmitBtn">Resubmit for QC review</button></div>
            <div class="progress" hidden><div></div></div>
          </div></div>` : ''}
      </div>

      <div class="stack">
        ${canReview ? qcPanel(t, project) : qcResults(t, project)}
        ${canReview || canResubmit ? `<div class="card"><div class="card-body">${guidelinesHtml(project, { open: canReview })}</div></div>` : ''}
        <div class="card">
          <div class="card-head"><h2>Details</h2></div>
          <div class="card-body"><dl class="dl">
            <dt>Set Director</dt><dd>${esc(t.sd_name)}</dd>
            <dt>Assigned SPL</dt><dd>${esc(t.spl_name || '—')}</dd>
            <dt>Studio</dt><dd>${esc(t.studio || '—')}</dd>
            <dt>Project</dt><dd>${esc(t.project_name)}</dd>
            <dt>Task Name</dt><dd>${esc(t.task_name)}</dd>
            <dt>Scene</dt><dd>${esc(t.scene)}</dd>
            <dt>Business Type</dt><dd>${esc(t.business_type)}</dd>
            <dt>Boundary box</dt><dd>${t.boundary_size}m × ${t.boundary_size}m</dd>
            <dt>QC reviewer</dt><dd>${esc(t.reviewer_name || '—')}</dd>
            <dt>Submitted</dt><dd>${fullTime(t.created_at)}</dd>
          </dl></div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Setup checklist</h2><span class="muted small">Confirmed by SD</span></div>
          <div class="card-body"><ul class="result-list">
            ${project.setupChecklist.map((c) => resultItem(t.setup_checklist[c.id], `${c.group ? esc(c.group) + ': ' : ''}${esc(c.label)}`)).join('')}
          </ul></div>
        </div>
        <div class="card">
          <div class="card-head"><h2>History</h2></div>
          <div class="card-body">${historyHtml(history)}</div>
        </div>
      </div>
    </div>`;

  bindLightbox(view);
  if (canReview) bindQcPanel(t, project);
  if (canResubmit) {
    const fields = mountSubmissionFields($('#resubFields'), project, { boundarySize: t.boundary_size });
    const card = $('#resubmitCard');
    $('#resubmitBtn').onclick = async () => {
      const errors = fields.validate();
      if (errors.length) return toast(errors[0], 'error');
      const ok = await submitWithProgress($('#resubmitBtn'), $('.progress', card), `/api/tickets/${t.id}/resubmit`,
        { note: $('#resubNote').value }, fields, 'Resubmit for QC review');
      if (ok) {
        toast('Resubmitted — QC has been notified');
        route();
      }
    };
  }
}

function historyHtml(history) {
  return `<ul class="timeline">
    ${history.map((h) => `<li><span class="dot ${h.action}">${HISTORY_ICON[h.action] || ''}</span>
      <div class="what"><b>${esc(h.user_name || 'System')}</b> ${HISTORY_TEXT[h.action] || esc(h.action)}${h.via === 'quick' ? ' <span class="via-tag">via Submit a photo</span>' : ''}</div>
      <div class="when" title="${esc(fullTime(h.created_at))}">${fullTime(h.created_at)}</div>
      ${h.comment ? `<div class="comment">${esc(h.comment)}</div>` : ''}</li>`).join('')}
  </ul>`;
}

const resultItem = (ok, html) => `<li><span class="ic ${ok ? 'ok' : 'no'}">${ok ? icon.check : icon.x}</span><div>${html}</div></li>`;

function statusBanner(t, lastReturn) {
  if (t.status === 'approved') {
    return `<div class="banner approved">${bigIcon(icon.check)}<div><b>Approved — filming can begin</b>
      <span class="muted">Approved by ${esc(t.reviewer_name)} · ${fullTime(t.decided_at)}</span></div></div>`;
  }
  if (t.status === 'returned') {
    return `<div class="banner returned">${bigIcon(icon.x)}<div style="min-width:0"><b>Returned — fixes needed before filming</b>
      <span class="muted">${esc(lastReturn?.user_name || t.reviewer_name || 'QC')} · ${fullTime(t.decided_at)}</span>
      ${lastReturn?.comment ? `<div class="feedback">${esc(lastReturn.comment)}</div>` : ''}</div></div>`;
  }
  if (t.status === 'reviewing') {
    return `<div class="banner reviewing">${icon.eye.replace(/width="13" height="13"/, 'width="18" height="18"')}<div><b>QC is reviewing this setup</b>
      <span class="muted">${esc(t.reviewer_name)} is checking the 4 EXO views and 1 EGO view.</span></div></div>`;
  }
  return `<div class="banner pending">${icon.clock}<div><b>Pending QC review</b>
    <span class="muted">${t.submission_no > 1 ? `Resubmission (round ${t.submission_no}) is` : 'Submitted and'} waiting for a QC reviewer. Don't start filming yet.</span></div></div>`;
}

function mediaGallery(items) {
  if (!items.length) return '<div class="empty">No media</div>';
  const video = items.find((m) => m.slot === 'video');
  if (video) {
    return `<div class="gallery-video"><video controls preload="metadata" src="${esc(video.url)}"></video>
      <div class="muted small" style="margin-top:6px">${esc(video.original_name || 'Setup video')}${video.duration ? ` · ${fmtDuration(video.duration)}` : ''}</div></div>`;
  }
  return `<div class="gallery">${items.map((m) => `<div class="tile ${m.slot === 'ego' ? 'ego' : ''}" data-src="${esc(m.url)}" data-label="${esc(m.label)}">
    <img src="${esc(m.url)}" alt="${esc(m.label)} preview" loading="lazy"><span class="slot-label">${esc(m.label)}</span></div>`).join('')}</div>`;
}

function bindLightbox(root) {
  root.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile[data-src]');
    if (!tile) return;
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<span class="cap">${esc(tile.dataset.label)}</span><img src="${tile.dataset.src}" alt="">`;
    const close = () => { lb.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (ev) => ev.key === 'Escape' && close();
    lb.onclick = close;
    document.addEventListener('keydown', onKey);
    document.body.append(lb);
  });
}

function qcResults(t, project) {
  const checks = t.qc_checks || {};
  if (!Object.keys(checks).length) {
    return `<div class="card"><div class="card-head"><h2>QC review</h2></div><div class="card-body muted">
      ${t.status === 'reviewing' ? `${esc(t.reviewer_name)} is reviewing this setup now.` : 'Not reviewed yet.'}</div></div>`;
  }
  return `<div class="card"><div class="card-head"><h2>QC review</h2><span class="muted small">${esc(t.reviewer_name || '')}</span></div>
    <div class="card-body"><ul class="result-list">
      ${project.qcChecks.map((c) => resultItem(checks[c.id], `<b>${esc(c.label)}</b>${flagTag(c)}<div class="muted small">${esc(c.detail)}</div>`)).join('')}
    </ul></div></div>`;
}

function qcPanel(t, project) {
  const other = t.reviewer_id && t.reviewer_id !== state.me.id ? `<p class="muted small" style="margin:0 0 12px">${esc(t.reviewer_name)} opened this ticket first.</p>` : '';
  return `<div class="card" id="qcPanel" style="border-color:var(--accent)">
    <div class="card-head"><h2>QC review checklist</h2><span class="muted small" id="qcCount"></span></div>
    <div class="card-body">
      ${other}
      <div class="checklist">
        ${project.qcChecks.map((c) => `<label class="check"><input type="checkbox" data-qc="${c.id}"><div><b>${esc(c.label)}</b>${flagTag(c)}<div class="d">${esc(c.detail)}</div></div></label>`).join('')}
      </div>
      <div class="actions" style="margin-top:16px">
        <button class="btn btn-success btn-lg" id="approveBtn" disabled>${icon.check} Approve</button>
        <button class="btn btn-danger btn-lg" id="returnToggle">Request changes</button>
      </div>
      <div id="returnBox" hidden style="margin-top:16px">
        <label class="field"><span>Required feedback <em>*</em></span>
          <textarea id="feedback" style="min-height:140px"></textarea></label>
        <p class="muted small" style="margin:6px 0 12px">Format: <b>[Problem / Issue Description] - [Clear Correction or Required Action]</b>. The SD and the assigned SPL will be notified.</p>
        <div class="actions"><button class="btn btn-danger solid" id="returnBtn">Return ticket</button><button class="btn btn-ghost" id="returnCancel">Cancel</button></div>
      </div>
    </div></div>`;
}

function bindQcPanel(t, project) {
  const panel = $('#qcPanel');
  const boxes = $$('[data-qc]', panel);
  const getChecks = () => Object.fromEntries(boxes.map((b) => [b.dataset.qc, b.checked]));
  const refresh = () => {
    const n = boxes.filter((b) => b.checked).length;
    $('#qcCount').textContent = `${n} / ${boxes.length} passed`;
    $('#approveBtn').disabled = n !== boxes.length;
    boxes.forEach((b) => b.closest('.check').classList.toggle('on', b.checked));
  };
  boxes.forEach((b) => b.addEventListener('change', refresh));
  refresh();

  $('#approveBtn').onclick = async () => {
    $('#approveBtn').disabled = true;
    try {
      await api(`/api/tickets/${t.id}/approve`, { method: 'POST', body: { qcChecks: getChecks() } });
      toast(`${t.code} approved — the Set Director has been notified`);
      route();
    } catch (err) {
      toast(err.message, 'error');
      refresh();
    }
  };

  const box = $('#returnBox');
  const template = state.meta.feedbackTemplate;
  $('#returnToggle').onclick = () => {
    box.hidden = false;
    const failed = project.qcChecks.filter((c) => !getChecks()[c.id]);
    const ta = $('#feedback');
    if (!ta.value.trim() || ta.dataset.auto === ta.value) {
      // Failed checks pre-fill from the project guidelines: "[issue] - [fix]"; QC can edit before sending.
      const line = (c) => `${c.flagCode ? `${c.flagCode} ` : ''}${c.label}: ${c.issue && c.fix ? `${c.issue} - ${c.fix}` : template}`;
      ta.value = (failed.length ? failed.map(line) : [template]).join('\n\n');
      ta.dataset.auto = ta.value;
    }
    ta.focus();
    const i = ta.value.indexOf('[');
    if (i >= 0) ta.setSelectionRange(i, ta.value.indexOf(']', i) + 1);
  };
  $('#returnCancel').onclick = () => (box.hidden = true);
  $('#returnBtn').onclick = async () => {
    const comment = $('#feedback').value.trim();
    if (comment.includes('[Problem / Issue Description]') || comment.includes('[Clear Correction or Required Action]')) {
      return toast('Replace the [bracketed] placeholders with the actual problem and correction', 'error');
    }
    if (comment.length < 10) return toast('Feedback is required', 'error');
    $('#returnBtn').disabled = true;
    try {
      await api(`/api/tickets/${t.id}/return`, { method: 'POST', body: { qcChecks: getChecks(), comment } });
      toast(`${t.code} returned — SD and SPL have been notified`);
      route();
    } catch (err) {
      toast(err.message, 'error');
      $('#returnBtn').disabled = false;
    }
  };
}
