'use strict';

// Pages added on top of app.js: the start page, "Submit a photo" (no login) with its
// submission log, the public ticket view, and Team management. Uses helpers from app.js.

// ---------- Email sign-in (one-time code + access requests) ----------

const LAST_EMAIL_KEY = 'setupqc.lastEmail';

function mountEmailSignIn(el) {
  const domains = state.auth.companyDomains.map((d) => `@${d}`).join(' / ');
  const errorBox = '<div class="login-error" hidden></div>';
  const showError = (msg) => {
    const box = $('.login-error', el);
    box.textContent = msg;
    box.hidden = false;
  };
  const busy = (btn, on, label) => {
    btn.disabled = on;
    if (label) btn.textContent = label;
  };

  const stepEmail = (prefill = '') => {
    let saved = prefill;
    if (!saved) try { saved = localStorage.getItem(LAST_EMAIL_KEY) || ''; } catch {}
    el.innerHTML = `
      <h2>Sign in with your email</h2>
      <p class="muted" style="margin:6px 0 14px">${esc(domains)} emails on the team sign in right away. Other emails need approval from an admin or manager first.</p>
      <form class="stack" novalidate>
        <input type="text" name="email" inputmode="email" autocomplete="email" placeholder="you${esc(domains.split(' / ')[0])}" value="${esc(saved)}">
        <button class="btn btn-primary btn-lg btn-block" type="submit">Continue</button>
      </form>${errorBox}`;
    const form = $('form', el);
    form.email.focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = form.email.value.trim().toLowerCase();
      if (!email.includes('@')) return showError('Enter your email address');
      const btn = $('button', form);
      busy(btn, true, 'Checking…');
      try {
        const r = await api('/api/auth/email/start', { method: 'POST', body: { email } });
        try { localStorage.setItem(LAST_EMAIL_KEY, email); } catch {}
        if (r.status === 'code_sent') return stepCode(email, r.testCode);
        if (r.status === 'needs_approval') return stepNeedsApproval(email, r.name);
        if (r.status === 'unknown') return stepRequest(email);
        if (r.status === 'pending') return stepMessage('Waiting for approval', `The access request for <b>${esc(email)}</b> is waiting for an admin or manager. You'll get an email once it's approved.`);
        if (r.status === 'denied') return stepMessage('Access not approved', `The access request for <b>${esc(email)}</b> wasn't approved. Contact your Studio Project Lead if this is a mistake.`);
      } catch (err) {
        showError(err.message);
      }
      busy(btn, false, 'Continue');
    };
  };

  const stepCode = (email, testCode) => {
    el.innerHTML = `
      <h2>Check your email</h2>
      <p class="muted" style="margin:6px 0 14px">We sent a 6-digit code to <b>${esc(email)}</b>. It expires in 10 minutes.</p>
      ${testCode ? `<div class="dev-note">${icon.info}<div><b>Test mode:</b> email isn't set up yet, so your code is shown here: <b class="code">${esc(testCode)}</b></div></div>` : ''}
      <form class="stack" novalidate>
        <input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" class="code-input">
        <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
      </form>${errorBox}
      <div class="login-links"><a href="#" data-act="back">Use a different email</a><a href="#" data-act="resend">Send a new code</a></div>`;
    const form = $('form', el);
    form.code.focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button', form);
      busy(btn, true, 'Signing in…');
      try {
        signedIn(await api('/api/auth/email/verify', { method: 'POST', body: { email, code: form.code.value } }));
      } catch (err) {
        showError(err.message);
        busy(btn, false, 'Sign in');
      }
    };
    $('.login-links', el).onclick = async (e) => {
      const a = e.target.closest('a[data-act]');
      if (!a) return;
      e.preventDefault();
      if (a.dataset.act === 'back') return stepEmail(email);
      try {
        const r = await api('/api/auth/email/start', { method: 'POST', body: { email } });
        toast('New code sent');
        stepCode(email, r.testCode);
      } catch (err) {
        showError(err.message);
      }
    };
  };

  const stepNeedsApproval = (email, name) => {
    el.innerHTML = `
      <h2>Approval needed</h2>
      <p class="muted" style="margin:6px 0 14px">Hi ${esc(name || '')}. <b>${esc(email)}</b> isn't a company email, so an admin or manager needs to approve it before your first sign-in.</p>
      <form class="stack" novalidate>
        <label class="field"><span>Note to the approver (optional)</span><textarea name="note" style="min-height:70px" placeholder="e.g. QC reviewer for Studio Manila"></textarea></label>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Request access</button>
      </form>${errorBox}
      <div class="login-links"><a href="#" data-act="back">Use a different email</a></div>`;
    bindRequest(email, () => ({ note: $('form', el).note.value }));
  };

  const stepRequest = async (email) => {
    const opts = await api('/api/public/options');
    const studios = [...new Set(opts.submitters.map((s) => s.studio))];
    el.innerHTML = `
      <h2>Request access</h2>
      <p class="muted" style="margin:6px 0 14px"><b>${esc(email)}</b> isn't on the team yet. Send a request and an admin or manager will review it. You'll get an email once it's approved.</p>
      <form class="stack" novalidate>
        <label class="field"><span>Full name <em>*</em></span><input type="text" name="name" maxlength="120" autocomplete="name"></label>
        <label class="field"><span>Your role <em>*</em></span>
          <select name="role"><option value="">Select your role…</option>${['SD', 'SPC', 'SPL', 'QC', 'ADMIN'].map((r) => `<option value="${r}">${esc(ROLE_NAMES[r])}</option>`).join('')}</select></label>
        <label class="field" data-studio hidden><span>Studio <em>*</em></span>
          <select name="studio"><option value="">Select your studio…</option>${studios.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
        <label class="field"><span>Note (optional)</span><textarea name="note" style="min-height:70px"></textarea></label>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Send request</button>
      </form>${errorBox}
      <div class="login-links"><a href="#" data-act="back">Use a different email</a></div>`;
    const form = $('form', el);
    form.role.onchange = () => ($('[data-studio]', form).hidden = !['SD', 'SPC', 'SPL'].includes(form.role.value));
    bindRequest(email, () => {
      if (!form.name.value.trim()) throw new Error('Enter your full name');
      if (!form.role.value) throw new Error('Choose your role');
      if (!$('[data-studio]', form).hidden && !form.studio.value) throw new Error('Choose your studio');
      return { name: form.name.value, role: form.role.value, studio: form.studio.value, note: form.note.value };
    });
  };

  function bindRequest(email, collect) {
    const form = $('form', el);
    $('.login-links', el).onclick = (e) => {
      if (!e.target.closest('a[data-act="back"]')) return;
      e.preventDefault();
      stepEmail(email);
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      try {
        const body = { email, ...collect() };
        busy(btn, true, 'Sending…');
        const r = await api('/api/auth/request', { method: 'POST', body });
        if (r.status === 'allowed') return stepEmail(email);
        stepMessage('Request sent', `Your request for <b>${esc(email)}</b> was sent to the admins and managers. You'll get an email once it's approved, then sign in here with the same email.`);
      } catch (err) {
        showError(err.message);
        busy(btn, false);
      }
    };
  }

  const stepMessage = (title, html) => {
    el.innerHTML = `<h2>${esc(title)}</h2><p class="muted" style="margin:6px 0 14px">${html}</p>
      <div class="login-links"><a href="#" data-act="back">Use a different email</a></div>`;
    $('.login-links', el).onclick = (e) => {
      e.preventDefault();
      stepEmail();
    };
  };

  stepEmail();
}

// ---------- Start page (before login) ----------

async function renderWelcome(view) {
  const { projects } = await api('/api/public/options');
  view.innerHTML = `
    <div class="welcome">
      <div class="login-hero">
        <div class="brand-mark">${icon.check.replace('width="12" height="12"', 'width="24" height="24"').replace('currentColor', '#fff')}</div>
        <h1>Studio Setup QC</h1>
        <p>Pre-recording setup approvals for the Studio QA/Capture team. What would you like to do?</p>
      </div>
      <div class="choices">
        <div class="card choice">
          <div class="choice-icon">${icon.camera}</div>
          <h2>Submit a photo</h2>
          <p>No login needed. Choose the project, upload your setup preview, and check QC's feedback in the submission log.</p>
          <p class="section-title" style="margin:4px 0 8px">Which project?</p>
          <div class="project-picks">${projects.map((p) => `<a class="btn btn-primary btn-lg btn-block" href="#/submit/${p.id}">${esc(p.name)}</a>`).join('')}</div>
        </div>
        <div class="card choice">
          <div class="choice-icon">${icon.user}</div>
          <h2>Log in as a user</h2>
          <p>For QC reviewers, Studio Project Leads, admins, and Set Directors managing their tickets.</p>
          <a class="btn btn-lg btn-block" href="#/login" style="margin-top:auto">Log in</a>
        </div>
      </div>
    </div>`;
}

// ---------- Submit a photo (no login) ----------

function submitterOptions(submitters, selected) {
  const studios = [...new Set(submitters.map((s) => s.studio))];
  return studios.map((st) => `<optgroup label="${esc(st)}">${submitters.filter((s) => s.studio === st)
    .map((s) => `<option value="${s.id}" ${String(s.id) === String(selected) ? 'selected' : ''}>${esc(s.name)} · ${esc(ROLE_NAMES[s.role])}</option>`).join('')}</optgroup>`).join('');
}

// Remembers the last name picked on this device so repeat submitters don't have to search again.
const LAST_SUBMITTER_KEY = 'setupqc.lastSubmitter';
function rememberedSubmitter() {
  try { return localStorage.getItem(LAST_SUBMITTER_KEY); } catch { return null; }
}
function rememberSubmitter(id) {
  try { localStorage.setItem(LAST_SUBMITTER_KEY, id); } catch {}
}

async function renderQuickSubmit(view, projectId) {
  const opts = await api('/api/public/options');
  const project = opts.projects.find((p) => p.id === projectId);
  if (!project) {
    view.innerHTML = '<div class="empty"><h3>Unknown project</h3><a href="#/welcome">Back to start</a></div>';
    return;
  }
  const saved = rememberedSubmitter();
  const remembered = opts.submitters.some((s) => String(s.id) === saved) ? saved : '';

  view.innerHTML = `
    <a class="back" href="#/welcome">${icon.back} Start</a>
    <div class="page-head"><div><h1>Submit a setup photo · ${esc(project.name)}</h1>
      <p>Choose your name so QC knows who submitted, then upload the preview. Track QC feedback in the submission log.</p></div></div>
    <div class="grid-2">
      <form id="qForm" class="card" novalidate>
        <div class="card-body stack">
          <div>
            <p class="section-title">Who is submitting?</p>
            <div class="form-grid">
              <label class="field"><span>Your name <em>*</em></span>
                <select name="submitterId"><option value="">Select your name…</option>${submitterOptions(opts.submitters, remembered)}</select></label>
              <label class="field"><span>Assigned SPL <em>*</em></span>
                <select name="splId"><option value="">Select SPL…</option>
                  ${opts.spls.map((s) => `<option value="${s.id}">${esc(s.name)} · ${esc(s.studio)}</option>`).join('')}</select></label>
              <label class="field"><span>Task Name <em>*</em></span><input type="text" name="taskName" maxlength="200"></label>
              <label class="field"><span>Scene <em>*</em></span><input type="text" name="scene" maxlength="200"></label>
              <label class="field full"><span>Business Type <em>*</em></span><input type="text" name="businessType" maxlength="200"></label>
            </div>
          </div>
          <div id="qFields"></div>
        </div>
        <div class="card-body" style="border-top:1px solid var(--border)">
          <div class="actions" style="justify-content:flex-end"><button class="btn btn-primary btn-lg" type="submit">Submit for QC review</button></div>
          <div class="progress" hidden><div></div></div>
        </div>
      </form>
      <div class="card" id="qLog"><div class="spinner"></div></div>
    </div>`;

  const form = $('#qForm');
  const syncSpl = () => {
    const who = opts.submitters.find((s) => String(s.id) === form.submitterId.value);
    const spl = who && opts.spls.find((s) => s.studio === who.studio);
    if (spl) form.splId.value = spl.id;
  };
  form.submitterId.onchange = syncSpl;
  syncSpl();
  const fields = mountSubmissionFields($('#qFields'), project);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const errors = [];
    if (!form.submitterId.value) errors.push('Choose your name so QC knows who submitted');
    if (!form.splId.value) errors.push('Select the assigned SPL');
    for (const [name, label] of [['taskName', 'Task Name'], ['scene', 'Scene'], ['businessType', 'Business Type']]) {
      if (!form[name].value.trim()) errors.push(`${label} is required`);
    }
    errors.push(...fields.validate());
    if (errors.length) return toast(errors[0], 'error');

    const values = Object.fromEntries(['submitterId', 'splId', 'taskName', 'scene', 'businessType'].map((n) => [n, form[n].value.trim()]));
    values.project = project.id;
    const result = await submitWithProgress($('button[type=submit]', form), $('.progress', form), '/api/public/submissions', values, fields, 'Submit for QC review');
    if (result) {
      rememberSubmitter(form.submitterId.value);
      toast('Submitted — QC has been notified');
      location.hash = `#/s/${result.id}`;
    }
  };

  renderSubmissionLog($('#qLog'), project);
}

async function renderSubmissionLog(el, project) {
  const rows = await api(`/api/public/submissions?project=${encodeURIComponent(project.id)}`);
  const tabs = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'returned', label: 'Returned', match: (t) => t.status === 'returned' },
    { id: 'open', label: 'In QC', match: (t) => t.status === 'pending' || t.status === 'reviewing' },
    { id: 'approved', label: 'Approved', match: (t) => t.status === 'approved' },
  ];
  let tab = 'all';
  let q = '';
  el.innerHTML = `
    <div class="card-head"><h2>Submission log</h2><span class="muted small">Who submitted · QC feedback</span></div>
    <div class="toolbar"><div class="tabs"></div><input type="search" class="search" placeholder="Search name, task, code…"></div>
    <div class="log"></div>`;
  const draw = () => {
    $('.tabs', el).innerHTML = tabs.map((t) => `<button class="${t.id === tab ? 'on' : ''}" data-tab="${t.id}">${t.label} <span class="n">${rows.filter(t.match).length}</span></button>`).join('');
    const needle = q.toLowerCase();
    const list = rows
      .filter(tabs.find((t) => t.id === tab).match)
      .filter((t) => !needle || [t.code, t.sd_name, t.task_name, t.scene, t.studio].some((v) => String(v || '').toLowerCase().includes(needle)));
    $('.log', el).innerHTML = list.length ? list.map((t) => `
      <a class="log-item" href="#/s/${t.id}">
        <div class="log-top"><b>${esc(t.code)}</b>${pill(t)}<span class="faint small" style="margin-left:auto" title="${esc(fullTime(t.updated_at))}">${timeAgo(t.updated_at)}</span></div>
        <div class="small">Submitted by <b>${esc(t.sd_name)}</b> · ${esc(t.studio)}${t.submission_no > 1 ? ` · Round ${t.submission_no}` : ''}</div>
        <div class="muted small">${esc(t.task_name)} · ${esc(t.scene)}</div>
        ${t.status === 'returned' && t.last_return ? `<div class="log-feedback"><b>Why it was returned</b> <span class="muted">· ${esc(t.last_return.user_name || 'QC')}</span><div>${esc(t.last_return.comment)}</div></div>` : ''}
        ${t.status === 'approved' ? `<div class="small log-ok">${icon.check} Approved by ${esc(t.reviewer_name || 'QC')}: filming can begin</div>` : ''}
      </a>`).join('') : `<div class="empty"><h3>Nothing here yet</h3><p>${rows.length ? 'Try another tab or search.' : 'Submissions for this project will appear here.'}</p></div>`;
  };
  draw();
  $('.tabs', el).onclick = (e) => {
    const b = e.target.closest('button');
    if (b) { tab = b.dataset.tab; draw(); }
  };
  $('.search', el).oninput = (e) => { q = e.target.value; draw(); };
}

async function renderPublicTicket(view, id) {
  const [{ ticket: t, project, history }, opts] = await Promise.all([api(`/api/public/submissions/${id}`), api('/api/public/options')]);
  const lastReturn = history.find((h) => h.action === 'returned');
  const canResubmit = t.status === 'returned';
  const studioPeople = opts.submitters.filter((s) => s.studio === t.studio);
  const saved = rememberedSubmitter();
  const remembered = studioPeople.some((s) => String(s.id) === saved) ? saved : '';

  view.innerHTML = `
    <a class="back" href="#/submit/${esc(t.project)}">${icon.back} ${esc(project.name)} submission log</a>
    <div class="page-head">
      <div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><h1>${esc(t.code)}</h1>${pill(t)}</div>
        <p>Submitted by <b>${esc(t.sd_name)}</b> · ${esc(t.studio)} · ${esc(t.task_name)} · ${esc(t.scene)}</p>
      </div>
      ${state.me ? `<a class="btn" href="#/t/${t.id}">Open full ticket</a>` : ''}
    </div>
    <div class="grid-2">
      <div class="stack">
        ${statusBanner(t, lastReturn)}
        ${canResubmit ? `<div class="card" id="resubmitCard">
          <div class="card-head"><h2>Fix and resubmit</h2></div>
          <div class="card-body stack">
            <p class="muted" style="margin:0">Fix the setup per the QC feedback above, re-confirm the checklist and upload a new preview.</p>
            <label class="field" style="max-width:360px"><span>Who is resubmitting? <em>*</em></span>
              <select id="resubWho"><option value="">Select your name…</option>${submitterOptions(studioPeople, remembered)}</select></label>
            <div id="resubFields"></div>
            <label class="field"><span>Note to QC (optional)</span><textarea id="resubNote" style="min-height:80px" placeholder="What did you change?"></textarea></label>
            <div class="actions" style="justify-content:flex-end"><button class="btn btn-primary btn-lg" id="resubmitBtn">Resubmit for QC review</button></div>
            <div class="progress" hidden><div></div></div>
          </div></div>` : ''}
        <div class="card">
          <div class="card-head"><h2>History</h2><span class="muted small">Every submission and QC decision</span></div>
          <div class="card-body">${historyHtml(history)}</div>
        </div>
      </div>
      <div class="stack">
        ${qcResults(t, project)}
        <div class="card">
          <div class="card-head"><h2>Details</h2></div>
          <div class="card-body"><dl class="dl">
            <dt>Submitted by</dt><dd>${esc(t.sd_name)}</dd>
            <dt>Studio</dt><dd>${esc(t.studio || '—')}</dd>
            <dt>Assigned SPL</dt><dd>${esc(t.spl_name || '—')}</dd>
            <dt>Project</dt><dd>${esc(t.project_name)}</dd>
            <dt>Task Name</dt><dd>${esc(t.task_name)}</dd>
            <dt>Scene</dt><dd>${esc(t.scene)}</dd>
            <dt>Business Type</dt><dd>${esc(t.business_type)}</dd>
            <dt>Boundary box</dt><dd>${t.boundary_size}m × ${t.boundary_size}m</dd>
            <dt>QC reviewer</dt><dd>${esc(t.reviewer_name || '—')}</dd>
            <dt>Submitted</dt><dd>${fullTime(t.created_at)}</dd>
          </dl></div>
        </div>
        <div class="card"><div class="card-body">${guidelinesHtml(project, { open: canResubmit })}</div></div>
      </div>
    </div>`;

  if (!canResubmit) return;
  const fields = mountSubmissionFields($('#resubFields'), project, { boundarySize: t.boundary_size });
  $('#resubmitBtn').onclick = async () => {
    const who = $('#resubWho').value;
    const errors = [...(who ? [] : ['Choose who is resubmitting']), ...fields.validate()];
    if (errors.length) return toast(errors[0], 'error');
    const ok = await submitWithProgress($('#resubmitBtn'), $('.progress', $('#resubmitCard')), `/api/public/submissions/${t.id}/resubmit`,
      { submitterId: who, note: $('#resubNote').value }, fields, 'Resubmit for QC review');
    if (ok) {
      rememberSubmitter(who);
      toast('Resubmitted — QC has been notified');
      route();
    }
  };
}

// ---------- Team (add users) ----------

async function renderTeam(view) {
  const me = state.me;
  const [{ users, addableRoles, companyDomains }, requests] = await Promise.all([api('/api/team'), api('/api/access-requests')]);
  const isAdmin = me.role === 'ADMIN';
  const studioRoles = ['SD', 'SPC', 'SPL'];
  const domains = companyDomains.map((d) => `@${d}`).join(', ');
  view.innerHTML = `
    <div class="page-head"><div><h1>Team</h1>
      <p>${isAdmin ? 'Everyone who can use the app. People added here are kept; people from the roster file are managed in config/team.js.'
        : `People in ${esc(me.studio)}. You can add Set Directors and Coordinators to your studio.`}
        ${esc(domains)} emails can sign in right away; other emails need your approval.</p></div></div>
    ${requests.length ? `<div class="card" id="reqs" style="margin-bottom:20px">
      <div class="card-head"><h2>Access requests</h2><span class="pill pending">${requests.length} waiting</span></div>
      <div class="card-body">${requests.map((r) => `<div class="req-card" data-req="${r.id}">
        <div class="req-top"><b>${esc(r.name)}</b><span class="muted">${esc(r.email)}</span>
          <span class="signin-tag ${r.company ? 'ok' : 'wait'}">${r.company ? 'Company email' : 'External email'}</span>
          ${r.on_team ? '<span class="via-tag">On the team</span>' : '<span class="via-tag">New person</span>'}
          <span class="faint small" style="margin-left:auto">${timeAgo(r.requested_at)}</span></div>
        <div class="small" style="margin-top:4px">${esc(ROLE_NAMES[r.role])}${r.studio ? ` · ${esc(r.studio)}` : ''}</div>
        ${r.request_note ? `<div class="req-note">${esc(r.request_note)}</div>` : ''}
        ${r.on_team ? '' : `<div class="req-edit">
          <select data-role>${addableRoles.map((x) => `<option value="${x}" ${x === r.role ? 'selected' : ''}>${esc(ROLE_NAMES[x])}</option>`).join('')}</select>
          <select data-studio>${isAdmin ? `<option value="">No studio</option>${state.meta.studios.map((s) => `<option ${s === r.studio ? 'selected' : ''}>${esc(s)}</option>`).join('')}` : `<option>${esc(me.studio)}</option>`}</select>
        </div>`}
        <div class="actions"><button class="btn btn-success" data-approve>${icon.check} Approve</button><button class="btn btn-danger" data-deny>Deny</button></div>
      </div>`).join('')}</div></div>` : ''}
    <div class="team-layout">
      <div class="card" id="teamList"></div>
      <div class="stack team-side">
      <form class="card" id="addUser" novalidate>
        <div class="card-head"><h2>Add a user</h2></div>
        <div class="card-body stack">
          <label class="field"><span>Full name <em>*</em></span><input type="text" name="name" maxlength="120"></label>
          <label class="field"><span>Email</span><input type="text" name="email" inputmode="email" placeholder="name@atlascapture.io">
            <small class="muted">The Google account they'll sign in with. Needed for Google sign-in.</small></label>
          <label class="field"><span>Role <em>*</em></span>
            <select name="role">${addableRoles.map((r) => `<option value="${r}">${esc(ROLE_NAMES[r])}</option>`).join('')}</select></label>
          <label class="field" data-studio-field><span>Studio <em>*</em></span>
            ${isAdmin ? `<input type="text" name="studio" list="studioList" placeholder="Choose or type a new studio">
              <datalist id="studioList">${state.meta.studios.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>`
              : `<input type="text" name="studio" value="${esc(me.studio)}" readonly>`}</label>
          ${isAdmin ? '<label class="field"><span>Job title (optional)</span><input type="text" name="title" maxlength="120" placeholder="e.g. Admin - Studio QC"></label>' : ''}
          <button class="btn btn-primary btn-lg" type="submit">${icon.plus} Add user</button>
        </div>
      </form>
      ${isAdmin ? `<div class="card" id="importRoster">
        <div class="card-head"><h2>Import roster</h2></div>
        <div class="card-body stack">
          <p class="muted small" style="margin:0">Upload <b>config/team.json</b> (made on your PC with <code>node scripts/export-roster.js</code>).
            Matching people are updated by email, new people are added.</p>
          <input type="file" accept=".json,application/json" name="file">
          <label class="check" style="padding:9px 11px"><input type="checkbox" name="deactivate"><div class="small">Also deactivate roster people who aren't in this file</div></label>
          <button class="btn" type="button" data-import>Import</button>
        </div>
      </div>` : ''}
      </div>
    </div>`;

  $('#importRoster [data-import]')?.addEventListener('click', async () => {
    const box = $('#importRoster');
    const file = $('input[name=file]', box).files[0];
    if (!file) return toast('Choose the team.json file first', 'error');
    let roster;
    try {
      roster = JSON.parse(await file.text());
    } catch {
      return toast("That file isn't valid JSON. Use config/team.json from the export script.", 'error');
    }
    try {
      const r = await api('/api/team/import', { method: 'POST', body: { ...roster, deactivateMissing: $('input[name=deactivate]', box).checked } });
      toast(`Roster imported: ${r.added} added, ${r.updated} updated${r.deactivated ? `, ${r.deactivated} deactivated` : ''}`);
      state.meta = await api('/api/meta');
      renderTeam(view);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#reqs')?.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-req]');
    const btn = e.target.closest('[data-approve], [data-deny]');
    if (!card || !btn) return;
    btn.disabled = true;
    try {
      if (btn.hasAttribute('data-approve')) {
        const role = $('[data-role]', card)?.value;
        const studio = $('[data-studio]', card)?.value;
        await api(`/api/access-requests/${card.dataset.req}/approve`, { method: 'POST', body: role ? { role, studio } : {} });
        toast('Approved. They can sign in now and were notified by email.');
      } else {
        await api(`/api/access-requests/${card.dataset.req}/deny`, { method: 'POST' });
        toast('Request denied');
      }
      renderTeam(view);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });

  const form = $('#addUser');
  const syncStudio = () => ($('[data-studio-field]', form).hidden = !studioRoles.includes(form.role.value));
  form.role.onchange = syncStudio;
  syncStudio();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(['name', 'email', 'role', 'studio', 'title'].map((k) => [k, form[k]?.value.trim() || '']));
    if (!body.name) return toast('Name is required', 'error');
    if (studioRoles.includes(body.role) && !body.studio) return toast('Choose a studio', 'error');
    try {
      const user = await api('/api/team', { method: 'POST', body });
      toast(`${user.name} added as ${ROLE_NAMES[user.role]}`);
      state.meta = await api('/api/meta');
      renderTeam(view);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const list = $('#teamList');
  let q = '';
  list.innerHTML = `
    <div class="toolbar"><b>${users.filter((u) => u.active).length} active</b><input type="search" class="search" placeholder="Search name, email, studio…"></div>
    <div class="list-body"></div>`;
  const draw = () => {
    const needle = q.toLowerCase();
    const rows = users.filter((u) => !needle || [u.name, u.email, u.studio, u.title, ROLE_NAMES[u.role]].some((v) => String(v || '').toLowerCase().includes(needle)));
    const signIn = (u) => {
      if (!u.email) return '<span class="faint small">No email</span>';
      if (u.company) return '<span class="signin-tag ok">Company email</span>';
      const btn = u.can_manage && u.id !== me.id && u.active
        ? `<button class="btn btn-ghost small" data-login="${u.id}" data-approved="${u.login_approved ? 0 : 1}">${u.login_approved ? 'Revoke' : 'Approve'}</button>` : '';
      return `${u.login_approved ? '<span class="signin-tag ok">Approved</span>' : '<span class="signin-tag wait">Needs approval</span>'} ${btn}`;
    };
    $('.list-body', list).innerHTML = rows.length ? `<div class="table-scroll"><table class="tickets team"><thead><tr><th>Name</th><th>Role</th><th class="hide-sm">Studio</th><th>Sign-in</th><th></th></tr></thead><tbody>
      ${rows.map((u) => `<tr class="${u.active ? '' : 'inactive'}">
        <td><b>${esc(u.name)}</b>${u.source !== 'roster' ? ' <span class="via-tag">Added</span>' : ''}${u.active ? '' : ' <span class="via-tag">Inactive</span>'}
          ${u.title ? `<div class="sub">${esc(u.title)}</div>` : ''}
          <div class="sub email">${u.email ? esc(u.email) : '<span class="faint">No email</span>'}</div></td>
        <td>${esc(ROLE_NAMES[u.role])}</td>
        <td class="hide-sm">${esc(u.studio || '—')}</td>
        <td class="signin-cell">${signIn(u)}</td>
        <td style="text-align:right">${u.source !== 'roster' && u.can_manage && u.id !== me.id ? `<button class="btn btn-ghost small" data-toggle="${u.id}" data-active="${u.active ? 0 : 1}">${u.active ? 'Deactivate' : 'Reactivate'}</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No one matches.</div>';
  };
  draw();
  $('.search', list).oninput = (e) => { q = e.target.value; draw(); };
  list.onclick = async (e) => {
    const login = e.target.closest('[data-login]');
    if (login) {
      try {
        await api(`/api/team/${login.dataset.login}`, { method: 'PATCH', body: { loginApproved: login.dataset.approved === '1' } });
        renderTeam(view);
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    const btn = e.target.closest('[data-toggle]');
    if (!btn) return;
    try {
      await api(`/api/team/${btn.dataset.toggle}`, { method: 'PATCH', body: { active: btn.dataset.active === '1' } });
      renderTeam(view);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}
