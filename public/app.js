'use strict';

// ---------- Utilities ----------

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const initials = (name) => name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const ROLE_NAMES = { SD: 'Set Director', QC: 'QC Reviewer', SPL: 'Studio Project Lead', SPC: 'Studio Project Coordinator', ADMIN: 'Admin' };
const roleLabel = (u) => u.title || ROLE_NAMES[u.role];

// Atlas Capture logo (public/logo-mark.svg) in the header and on the start/login pages.
const brandHtml = () => '<img class="brand-logo" src="/logo-mark.svg" alt=""><span class="brand-text"><b>atlas capture</b><small>QA/QC Team</small></span>';
const heroLogoHtml = () => '<div class="hero-logo"><img src="/logo-mark.svg" alt="Atlas Capture"><span>atlas capture</span></div>';
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
  download: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
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
  // "Submit a photo" (start page) and old ticket links: sign in first, then continue there.
  let m;
  if ((m = hash.match(/^\/submit\/([\w-]+)$/))) return void goAfterSignIn(`/new/${m[1]}`);
  if ((m = hash.match(/^\/s\/(\d+)$/))) return void goAfterSignIn(`/t/${m[1]}`);
  // Pages reachable without logging in: the start page and login.
  const isPublic = hash === '/welcome' || hash === '/login';
  if (!state.me && !isPublic) {
    if (hash !== '/') rememberNext(hash);
    return void (location.hash = '#/welcome');
  }
  if (state.me && (hash === '/welcome' || hash === '/login')) return void (location.hash = '#/');
  if (state.me && !state.meta) state.meta = await api('/api/meta');

  renderHeader(hash);
  const view = $('#view');
  view.innerHTML = '<div class="spinner"></div>';
  window.scrollTo(0, 0);
  try {
    if (hash === '/welcome') return await renderWelcome(view);
    if (hash === '/login') return await renderLogin(view);
    if (hash === '/') return await renderHome(view);
    if ((m = hash.match(/^\/new(?:\/([\w-]+))?$/))) {
      if (state.me.role === 'SD') return renderNewTicket(view, m[1]);
      toast('Only Set Directors submit setup entries. Sign in with a Set Director account to submit.', 'error');
      return void (location.hash = '#/');
    }
    if (hash === '/team' && ['ADMIN', 'SPL'].includes(state.me.role)) return await renderTeam(view);
    if (hash === '/projects' && state.me.role === 'ADMIN') return await renderProjects(view);
    if ((m = hash.match(/^\/projects\/([\w-]+)$/)) && state.me.role === 'ADMIN') return await renderProjectEditor(view, m[1]);
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
      <a class="brand" href="#/welcome">${brandHtml()}</a>
      <div class="header-right"><a class="btn" href="#/login">Log in</a></div>`;
    return;
  }
  const me = state.me;
  const homeLabel = { SD: 'My tickets', QC: 'Review queue' }[me.role] || 'Overview';
  header.hidden = false;
  header.innerHTML = `
    <a class="brand" href="#/">${brandHtml()}</a>
    <nav class="nav">
      <a href="#/" class="${hash === '/' ? 'active' : ''}">${homeLabel}</a>
      ${me.role === 'SD' ? `<a href="#/new" class="${hash.startsWith('/new') ? 'active' : ''}">New ticket</a>` : ''}
      ${['ADMIN', 'SPL'].includes(me.role) ? `<a href="#/team" class="${hash === '/team' ? 'active' : ''}">Team</a>` : ''}
      ${me.role === 'ADMIN' ? `<a href="#/projects" class="${hash.startsWith('/projects') ? 'active' : ''}">Projects</a>` : ''}
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
    state.lastNotifId = null;
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
  // Checks every 8 s while the tab is visible, and right away when you come back to it.
  state.notifTimer = setInterval(() => { if (!document.hidden) loadNotifications(!panel.hidden); }, 8000);
  if (!state.notifFocusHooked) {
    state.notifFocusHooked = true;
    const refresh = () => { if (!document.hidden && $('#bellBadge')) loadNotifications(!$('#notifPanel')?.hidden); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
  }
}

async function loadNotifications(renderPanel) {
  let data;
  try { data = await api('/api/notifications'); } catch { return; }
  const badge = $('#bellBadge');
  if (!badge) return;
  badge.hidden = !data.unread;
  badge.textContent = data.unread > 99 ? '99+' : data.unread;
  // Pop up anything new since the last check (not on the first load of the page).
  const newest = data.items[0]?.id || 0;
  if (state.lastNotifId != null && newest > state.lastNotifId) {
    const fresh = data.items.filter((n) => n.id > state.lastNotifId && !n.read_at);
    if (fresh.length) toast(fresh.length === 1 ? fresh[0].message : `${fresh.length} new notifications`);
  }
  state.lastNotifId = Math.max(state.lastNotifId || 0, newest);
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

// Where to go after signing in (e.g. the submission form chosen on the start page).
const NEXT_KEY = 'setupqc.next';
function rememberNext(path) {
  try { sessionStorage.setItem(NEXT_KEY, path); } catch {}
}
function takeNext() {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    return next;
  } catch {
    return null;
  }
}
function goAfterSignIn(path) {
  if (state.me) return void (location.hash = `#${path}`);
  rememberNext(path);
  location.hash = '#/login';
}

const signedIn = (user) => {
  state.me = user;
  state.meta = null;
  location.hash = `#${takeNext() || '/'}`;
};

async function renderLogin(view) {
  let submitting = false;
  try { submitting = (sessionStorage.getItem(NEXT_KEY) || '').startsWith('/new'); } catch {}
  const { googleClientId, devLogin } = state.auth;
  view.innerHTML = `
    <div class="login">
      <div class="login-hero">
        ${heroLogoHtml()}
        <h1>${submitting ? 'Sign in to submit' : 'Log in'}</h1>
        <p>${submitting ? 'Set Directors sign in with their email before submitting a setup entry.' : 'Pre-recording setup approvals for the Studio QA/Capture team.'} <a href="#/welcome">← Back</a></p>
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
      <div class="page-head"><div><h1>Review queue</h1><p>Tickets waiting for review, plus the ones you've approved or returned. Your numbers count only your own reviews.</p></div></div>
      <div class="card dash-filters" id="filters" hidden></div>
      <div id="stats"></div>
      <div class="card" id="list"></div>`;
    return ticketList($('#list'), { defaultTab: 'open', columns: ['ticket', 'project', 'sd', 'location', 'status', 'round', 'submitted', 'updated'],
      onScope: (f) => renderStats($('#stats'), { filters: f }), filtersHost: $('#filters') });
  }
  if (me.role === 'ADMIN') {
    // "View as": admins can preview exactly what a QC reviewer (or a studio lead) sees.
    const people = (await api('/api/team')).users.filter((u) => u.active && ['QC', 'SPL'].includes(u.role));
    const group = (role, label) => {
      const list = people.filter((u) => u.role === role);
      return list.length ? `<optgroup label="${label}">${list.map((u) => `<option value="${u.id}">${esc(u.name)}${u.studio ? ` · ${esc(u.studio)}` : ''}</option>`).join('')}</optgroup>` : '';
    };
    view.innerHTML = `
      <div class="page-head"><div><h1>All studios overview</h1><p>Setup submissions and QC outcomes across every country, city and studio.</p></div>
        <div class="actions">
          <label class="view-as"><span>View as</span><select id="viewAs"><option value="">Everyone (admin view)</option>${group('QC', 'QC reviewers')}${group('SPL', 'Studio Project Leads')}</select></label>
          <button class="btn" id="exportZip" type="button">${icon.download} Export ZIP</button>
        </div></div>
      <div id="previewNote"></div>
      <div class="card dash-filters" id="filters" hidden></div>
      <div id="stats"></div>
      <div class="card" id="list"></div>`;
    let visible = [];
    let currentFilters = {};
    $('#exportZip').onclick = () => openExportDialog(visible, currentFilters);
    const load = (asId) => {
      const person = people.find((u) => String(u.id) === asId);
      const query = person ? `?as=${person.id}` : '';
      $('#previewNote').innerHTML = person ? `<div class="banner reviewing preview-banner">${icon.eye.replace(/width="13" height="13"/, 'width="18" height="18"')}<div>
        <b>Previewing ${esc(person.name)}'s dashboard</b> <span class="muted">(${esc(ROLE_NAMES[person.role])})</span>
        <div class="muted small">${person.role === 'QC' ? 'This is exactly what they see: tickets waiting for review, plus only the ones they approved or returned. Numbers count only their own reviews.' : 'This is exactly what they see: their studio’s tickets.'}</div></div>
        <button class="btn small" type="button" data-exit>Back to admin view</button></div>` : '';
      $('#previewNote [data-exit]')?.addEventListener('click', () => { $('#viewAs').value = ''; load(''); });
      $('#exportZip').hidden = Boolean(person);
      ticketList($('#list'), {
        onScope: (f) => renderStats($('#stats'), { byLocation: !person, query, filters: f }),
        filtersHost: $('#filters'),
        defaultTab: person?.role === 'QC' ? 'open' : 'all',
        query,
        columns: ['ticket', 'project', 'sd', 'location', 'status', 'round', 'reviewer', 'submitted', 'updated'],
        onFilter: (rows, f) => { visible = rows; currentFilters = f; },
      });
    };
    $('#viewAs').onchange = (e) => load(e.target.value);
    return load('');
  }
  view.innerHTML = `
    <div class="page-head"><div><h1>${esc(me.studio)} overview</h1><p>Setup submissions, QC outcomes and tickets that need corrections.</p></div></div>
    <div class="card dash-filters" id="filters" hidden></div>
    <div id="stats"></div>
    <div class="card" id="list"></div>`;
  return ticketList($('#list'), { defaultTab: 'returned', columns: ['ticket', 'sd', 'status', 'round', 'submitted', 'updated'],
    onScope: (f) => renderStats($('#stats'), { filters: f }), filtersHost: $('#filters') });
}

// `filters` (country, region, project, from, to) come from the ticket list below, so the numbers match it.
async function renderStats(el, { byLocation = false, query = '', filters = {} } = {}) {
  const params = new URLSearchParams(query.replace(/^\?/, ''));
  for (const k of ['country', 'region', 'project', 'from', 'to']) if (filters[k]) params.set(k, filters[k]);
  const token = (el.dataset.req = String(Math.random())); // ignore answers to older requests
  const qs = params.toString();
  const s = await api(`/api/stats${qs ? `?${qs}` : ''}`);
  if (el.dataset.req !== token) return;
  const scope = [filters.country, filters.region, filters.dateLabel].filter(Boolean).join(' · ') || 'All tickets';
  const locationTable = byLocation && s.byLocation?.length ? `
    <div class="card by-location">
      <div class="card-head"><h2>By country and city</h2><span class="muted small">${esc(scope)}</span></div>
      <div class="table-scroll"><table class="tickets"><thead><tr><th>Country</th><th>City / region</th><th>Pending</th><th>In review</th><th>Needs fixes</th><th>Approved</th><th>Total</th></tr></thead>
      <tbody>${s.byLocation.map((l) => `<tr class="static"><td><b>${esc(l.country)}</b></td><td>${esc(l.region)}</td><td>${l.pending}</td><td>${l.reviewing}</td><td>${l.returned}</td><td>${l.approved}</td><td><b>${l.total}</b></td></tr>`).join('')}</tbody></table></div>
    </div>` : '';
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
  </div>${byLocation && !s.byLocation?.length ? `<div class="card by-location"><div class="card-head"><h2>By country and city</h2><span class="muted small">${esc(scope)}</span></div><div class="empty"><p>No tickets match these filters.</p></div></div>` : locationTable}`;
}

// Submitted-date presets for the dashboard filter; bounds are local days, as ISO timestamps [from, to).
const DATE_RANGES = [['any', 'Any date'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'],
  ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Custom dates…']];
function dateBounds(range) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const day = (n) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + n);
  const month = (k) => new Date(d0.getFullYear(), d0.getMonth() + k, 1);
  const r = { today: [day(0), day(1)], yesterday: [day(-1), day(0)], '7d': [day(-6), day(1)], '30d': [day(-29), day(1)],
    month: [month(0), month(1)], lastmonth: [month(-1), month(0)] }[range];
  return r ? { from: r[0].toISOString(), to: r[1].toISOString() } : { from: '', to: '' };
}
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

// Ticket list with status tabs, search and (for everyone but SDs) Country / City / Project filters.
// `onFilter(rows, filters)` is told whenever the visible rows change (used by Export ZIP).
async function ticketList(el, { defaultTab, columns, onFilter, onScope, filtersHost, query = '' }) {
  const tickets = await api(`/api/tickets${query}`);
  const tabs = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'open', label: 'Awaiting review', match: (t) => t.status === 'pending' || t.status === 'reviewing' },
    { id: 'returned', label: 'Returned', match: (t) => t.status === 'returned' },
    { id: 'approved', label: 'Approved', match: (t) => t.status === 'approved' },
  ];
  let tab = defaultTab;
  let q = '';
  const filters = { country: '', region: '', project: '', reviewer: '', from: '', to: '' };
  let dateRange = 'any';
  // QC reviewer filter (admins): who checked each ticket.
  const reviewers = [...new Set(tickets.map((t) => t.reviewer_name).filter(Boolean))].sort();
  const showReviewer = state.me.role === 'ADMIN' && !query;
  const showFilters = state.me.role !== 'SD';
  const cols = {
    ticket: ['Ticket', (t) => `<div class="code">${esc(t.code)}</div><div class="sub">${esc(t.task_name)} · ${esc(t.scene)}</div>`],
    project: ['Project', (t) => esc(t.project_name), 'hide-sm'],
    sd: ['Set Director', (t) => esc(t.sd_name)],
    spl: ['SPL', (t) => esc(t.spl_name), 'hide-sm'],
    studio: ['Studio', (t) => esc(t.studio), 'hide-sm'],
    location: ['Location', (t) => `${esc(t.country || '—')}<div class="sub">${esc(t.region || '')}${t.region && t.studio ? ' · ' : ''}${esc(t.studio || '')}</div>`, 'hide-sm'],
    status: ['Status', (t) => pill(t)],
    round: ['Round', (t) => `<span class="muted">#${t.submission_no}</span>`, 'hide-sm'],
    reviewer: ['QC', (t) => (t.reviewer_name ? esc(t.reviewer_name) : '<span class="faint">—</span>'), 'hide-sm'],
    submitted: ['Submitted', (t) => `<span class="muted" title="${esc(fullTime(t.created_at))}">${shortDate(t.created_at)}</span>`, 'hide-sm'],
    updated: ['Updated', (t) => `<span class="muted" title="${esc(fullTime(t.updated_at))}">${timeAgo(t.updated_at)}</span>`],
  };

  // Filter options: countries/cities from the studios list (so e.g. Vietnam shows before its first ticket).
  const locations = state.meta.locations || [];
  const countries = [...new Set([...(state.meta.countries || []), ...tickets.map((t) => t.country).filter(Boolean)])].sort();
  const projects = [...new Map(tickets.map((t) => [t.project, t.project_name])).entries()];
  const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
  const regionOptions = () => {
    const regions = [...new Set([
      ...locations.filter((l) => !filters.country || l.country === filters.country).map((l) => l.region),
      ...tickets.filter((t) => !filters.country || t.country === filters.country).map((t) => t.region),
    ].filter(Boolean))].sort();
    return `<option value="">All cities / regions</option>${regions.map((r) => option(r, r, filters.region)).join('')}`;
  };

  el.innerHTML = `
    <div class="toolbar"><div class="tabs"></div><input type="search" class="search" placeholder="Search code, task, scene, SD…"></div>
    ${showFilters ? `<div class="filters">
      <select data-f="country" aria-label="Country"><option value="">All countries</option>${countries.map((c) => option(c, c, '')).join('')}</select>
      <select data-f="region" aria-label="City or region">${regionOptions()}</select>
      ${projects.length > 1 ? `<select data-f="project" aria-label="Project"><option value="">All projects</option>${projects.map(([id, name]) => option(id, name, '')).join('')}</select>` : ''}
      ${showReviewer ? `<select data-f="reviewer" aria-label="QC reviewer"><option value="">All QC reviewers</option><option value="__none">Not reviewed yet</option>${reviewers.map((r) => option(r, r, '')).join('')}</select>` : ''}
      <select data-f="date" aria-label="Submitted date">${DATE_RANGES.map(([id, label]) => option(id, label, 'any')).join('')}</select>
      <span class="date-custom" hidden><input type="date" data-d="from" aria-label="From date"><span class="muted small">to</span><input type="date" data-d="to" aria-label="To date"></span>
      <span class="filter-count muted small"></span>
    </div>` : ''}
    <div class="list-body"></div>`;
  // The filter bar can live elsewhere on the page (dashboards put it above the numbers it also filters).
  const fx = $('.filters', el) || el;
  if (filtersHost && fx !== el) { filtersHost.replaceChildren(fx); filtersHost.hidden = false; }
  const inFilters = (t) => (!filters.country || t.country === filters.country) && (!filters.region || t.region === filters.region) && (!filters.project || t.project === filters.project)
    && (!filters.reviewer || (filters.reviewer === '__none' ? !t.reviewer_name : t.reviewer_name === filters.reviewer))
    && (!filters.from || t.created_at >= filters.from) && (!filters.to || t.created_at < filters.to);
  const draw = () => {
    const scoped = tickets.filter(inFilters);
    $('.tabs', el).innerHTML = tabs.map((t) => `<button class="${t.id === tab ? 'on' : ''}" data-tab="${t.id}">${t.label} <span class="n">${scoped.filter(t.match).length}</span></button>`).join('');
    const needle = q.toLowerCase();
    const rows = scoped
      .filter(tabs.find((t) => t.id === tab).match)
      .filter((t) => !needle || [t.code, t.task_name, t.scene, t.business_type, t.sd_name, t.studio, t.country, t.region].some((v) => String(v || '').toLowerCase().includes(needle)));
    if (tab === 'open') rows.sort((a, b) => a.updated_at.localeCompare(b.updated_at)); // oldest first: FIFO queue
    const active = Object.values(filters).some(Boolean);
    if ($('.filter-count', fx)) $('.filter-count', fx).textContent = active ? `${scoped.length} of ${tickets.length} tickets match` : '';
    $('.list-body', el).innerHTML = rows.length
      ? `<table class="tickets"><thead><tr>${columns.map((c) => `<th class="${cols[c][2] || ''}">${cols[c][0]}</th>`).join('')}</tr></thead>
         <tbody>${rows.map((t) => `<tr data-id="${t.id}">${columns.map((c) => `<td class="${cols[c][2] || ''}">${cols[c][1](t)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : `<div class="empty"><h3>No tickets here</h3><p>${tickets.length ? 'Try a different tab, filter or search.' : state.me.role === 'SD' ? 'Create your first setup ticket before filming.' : 'Nothing has been submitted yet.'}</p></div>`;
    onFilter?.(rows, { ...filters, tab, q });
  };
  let lastScope = null;
  const scopeChanged = () => {
    const custom = [$('[data-d="from"]', fx)?.value, $('[data-d="to"]', fx)?.value].filter(Boolean).join(' – ');
    const f = { country: filters.country, region: filters.region, project: filters.project, from: filters.from, to: filters.to,
      dateLabel: dateRange === 'any' ? '' : dateRange === 'custom' ? custom : DATE_RANGES.find(([id]) => id === dateRange)[1] };
    const key = JSON.stringify(f);
    if (key !== lastScope) { lastScope = key; onScope?.(f); }
  };
  draw();
  scopeChanged();
  $('.tabs', el).onclick = (e) => {
    const b = e.target.closest('button');
    if (b) { tab = b.dataset.tab; draw(); }
  };
  fx.addEventListener('change', (e) => {
    if (e.target.dataset.d) { // custom dates: whole local days, "to" inclusive
      const from = $('[data-d="from"]', fx).value, to = $('[data-d="to"]', fx).value;
      filters.from = from ? new Date(`${from}T00:00`).toISOString() : '';
      filters.to = to ? new Date(new Date(`${to}T00:00`).getTime() + 86400000).toISOString() : '';
      draw(); scopeChanged();
      return;
    }
    const f = e.target.dataset.f;
    if (!f) return;
    if (f === 'date') {
      dateRange = e.target.value;
      $('.date-custom', fx).hidden = dateRange !== 'custom';
      if (dateRange === 'custom') { $('[data-d="from"]', fx).value = ''; $('[data-d="to"]', fx).value = ''; }
      Object.assign(filters, dateBounds(dateRange));
      draw(); scopeChanged();
      return;
    }
    filters[f] = e.target.value;
    if (f === 'country') {
      filters.region = '';
      $('[data-f="region"]', fx).innerHTML = regionOptions();
    }
    draw();
    scopeChanged();
  });
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
  const b = project.boundary; // null when the project has no boundary box
  const sizes = [];
  if (b) for (let v = b.min; v <= b.max + 1e-9; v += b.step || 0.5) sizes.push(v);
  const hasImages = project.mediaSlots.length > 0;
  const hasVideo = Boolean(project.video);
  const viewList = project.mediaSlots.map((s) => s.label).join(', ');
  const plain = project.setupChecklist.filter((c) => !c.group);
  const groups = [...new Set(project.setupChecklist.filter((c) => c.group).map((c) => c.group))];
  const checkItem = (c) => `<label class="check"><input type="checkbox" data-check="${c.id}"><div>${esc(c.label)}</div></label>`;

  root.innerHTML = `
    ${guidelinesHtml(project)}
    <p class="section-title checklist-title" style="margin-top:20px">Setup checklist · ${esc(project.name)}
      <span class="checklist-count" data-count></span></p>
    <p class="muted small" style="margin:-6px 0 10px">Tick every item to confirm your setup before submitting.</p>
    ${b ? `<label class="field" style="max-width:260px;margin-bottom:12px"><span>Boundary box size <em>*</em></span>
      <select data-boundary>${sizes.map((v) => `<option value="${v}" ${v === (prefill.boundarySize ?? b.standard) ? 'selected' : ''}>${v}m × ${v}m${v === b.standard ? ' (standard)' : ''}</option>`).join('')}</select>
    </label>` : ''}
    <div class="checklist">${plain.map(checkItem).join('')}</div>
    ${groups.map((g) => `<div class="check-group" style="margin-top:8px"><div class="gl">${esc(g)}</div><div class="checklist">
      ${project.setupChecklist.filter((c) => c.group === g).map(checkItem).join('')}</div></div>`).join('')}

    <p class="section-title" style="margin-top:24px">Setup preview</p>
    ${hasImages && hasVideo ? `<div class="seg" data-mode-toggle>
      <button type="button" data-mode="images" class="on">Images (${project.mediaSlots.length} view${project.mediaSlots.length > 1 ? 's' : ''})</button>
      <button type="button" data-mode="video">Video clip</button>
    </div>` : ''}
    <div class="prompt">${icon.info}<div>
      ${hasImages ? `The preview must show every camera view: <b>${esc(viewList)}</b>. Upload one image per view` : 'Upload a video of the setup'}${hasImages && hasVideo ? ', or a single' : hasVideo ? ':' : '.'}
      ${hasVideo ? `<b>${project.video.minSec}–${project.video.maxSec} second</b> video${hasImages ? ' that shows every view' : ''}.` : ''}</div></div>
    ${hasImages ? `<div data-pane="images" class="slots" style="grid-template-columns:repeat(${Math.min(project.mediaSlots.length, 5)},minmax(0,1fr))">
      ${project.mediaSlots.map((s) => `<label class="slot" data-slot="${s.key}"><span class="slot-label">${esc(s.label)}</span>
        <input type="file" accept="image/*"><div class="ph">${icon.image}<span>Add image</span></div></label>`).join('')}
    </div>` : ''}
    ${hasVideo ? `<div data-pane="video" ${hasImages ? 'hidden' : ''}>
      <label class="dropzone"><input type="file" accept="video/*">
        <div class="faint">${icon.video}</div><div><b>Choose a video</b> or drop it here</div>
        <div class="muted small">${project.video.minSec}–${project.video.maxSec} seconds · MP4 / MOV</div></label>
      <div class="video-preview" hidden><video controls muted playsinline></video><div class="dur"></div></div>
    </div>` : ''}`;

  let mode = hasImages ? 'images' : 'video';
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

  // Mode toggle (only when the project allows both photos and a video)
  const toggle = $('[data-mode-toggle]', root);
  if (toggle) toggle.onclick = (e) => {
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

  // Video (only when the project allows one)
  const dz = $('.dropzone', root);
  const preview = $('.video-preview', root);
  const videoEl = preview && $('video', preview);
  const durEl = preview && $('.dur', preview);
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
  if (dz) {
    $('input', dz).onchange = (e) => e.target.files[0] && setVideo(e.target.files[0]);
    enableDrop(dz, setVideo);
  }

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
        boundarySize: $('[data-boundary]', root)?.value ?? null,
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

// `projectId` preselects the project (e.g. chosen on the start page before signing in).
function renderNewTicket(view, projectId) {
  const { me, meta } = state;
  const chosen = meta.projects.find((p) => p.id === projectId)?.id;
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
              <select name="project">${meta.projects.map((p) => `<option value="${p.id}" ${p.id === chosen ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
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
      ${me.role === 'ADMIN' ? `<button class="btn btn-danger" id="deleteTicket" type="button">Delete ticket</button>` : ''}
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
            ${t.boundary_size ? `<dt>Boundary box</dt><dd>${t.boundary_size}m × ${t.boundary_size}m</dd>` : ""}
            ${t.country ? `<dt>Location</dt><dd>${esc(t.country)}${t.region ? ` · ${esc(t.region)}` : ""}</dd>` : ""}
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
  // Admins: delete with confirmation (type the ticket code).
  $('#deleteTicket')?.addEventListener('click', () => openModal(`Delete ${t.code}?`, `
    <p style="margin:0">This permanently deletes <b>${esc(t.code)}</b> (${esc(t.task_name)} · ${esc(t.studio || '')}), its photos/videos, history and notifications. It can't be undone.</p>
    <p class="muted small" style="margin:0">The Google Sheet keeps its row, marked "Deleted". Copies already in Google Drive or exported ZIPs aren't removed.</p>
    <label class="field"><span>Type <b>${esc(t.code)}</b> to confirm</span><input type="text" name="confirm" autocomplete="off"></label>`,
  async (form) => {
    if (form.confirm.value.trim().toUpperCase() !== t.code) throw new Error(`Type ${t.code} exactly to confirm`);
    await api(`/api/tickets/${t.id}`, { method: 'DELETE' });
    toast(`${t.code} deleted`);
    location.hash = '#/';
  }, 'Delete permanently'));
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
  // Files an admin removed from site storage after exporting (still in the ZIP / Google Drive).
  if (items.every((m) => m.archived_at)) {
    return `<div class="archived-note">${icon.info}<div><b>Files archived</b><div class="muted small">Removed from the site on ${fullTime(items[0].archived_at)} after export. They're in the exported ZIP and the Google Drive folder.</div></div></div>`;
  }
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
