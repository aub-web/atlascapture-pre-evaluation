'use strict';

// Pages added on top of app.js: email sign-in, the start page, and Team management.
// Uses helpers from app.js.

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
    const studios = opts.studios || [];
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
        ${heroLogoHtml()}
        <h1>Studio Setup QC</h1>
        <p>Pre-recording setup approvals for the Studio QA/Capture team. What would you like to do?</p>
      </div>
      <div class="choices">
        <div class="card choice">
          <div class="choice-icon">${icon.camera}</div>
          <h2>Submit a photo</h2>
          <p>For Set Directors. Choose the project, sign in with your email, then upload your setup preview. QC's feedback appears under My tickets.</p>
          <p class="section-title" style="margin:4px 0 8px">Which project?</p>
          <div class="project-picks">${projects.map((p) => `<a class="btn btn-primary btn-lg btn-block" href="#/submit/${p.id}">${esc(p.name)}</a>`).join('')}</div>
        </div>
        <div class="card choice">
          <div class="choice-icon">${icon.user}</div>
          <h2>Log in as a user</h2>
          <p>For QC reviewers, Studio Project Leads, admins, and Set Directors checking their tickets.</p>
          <a class="btn btn-lg btn-block" href="#/login" style="margin-top:auto">Log in</a>
        </div>
      </div>
    </div>`;
}

// ---------- Team (add users) ----------

// Studio <option>s grouped by country → city/region.
function studioOptions(selected) {
  const groups = {};
  for (const l of state.meta.locations || []) (groups[l.country || 'No country yet'] ||= []).push(l);
  return Object.entries(groups).map(([country, list]) => `<optgroup label="${esc(country)}">${list
    .map((l) => `<option value="${esc(l.name)}" ${l.name === selected ? 'selected' : ''}>${esc(l.name)}${l.region ? ` · ${esc(l.region)}` : ''}</option>`).join('')}</optgroup>`).join('');
}

function studiosHtml(studios) {
  if (!studios.length) return '<p class="muted">No studios yet.</p>';
  const byCountry = {};
  for (const s of studios) (byCountry[s.country || 'No country yet'] ||= []).push(s);
  return Object.entries(byCountry).map(([country, list]) => `<div class="studio-country"><div class="studio-country-name">${esc(country)}</div>
    ${list.map((s) => `<div class="studio-row"><div><b>${esc(s.name)}</b><div class="muted small">${esc(s.region || 'No city/region')} · ${s.members} member${s.members === 1 ? '' : 's'}</div></div>
      <button class="btn btn-ghost small" type="button" data-edit-studio="${esc(s.name)}">Edit</button></div>`).join('')}</div>`).join('');
}

function openStudioDialog(s, editing, done) {
  const countries = state.meta.countries || ['Philippines', 'Indonesia', 'Vietnam'];
  openModal(editing ? `Edit ${s.name}` : 'Add studio', `
    <label class="field"><span>Studio name <em>*</em></span><input type="text" name="name" value="${esc(s.name)}" placeholder="e.g. Studio Hanoi"></label>
    <label class="field"><span>Country <em>*</em></span><input type="text" name="country" list="countryList" value="${esc(s.country || '')}" placeholder="Philippines, Indonesia, Vietnam…">
      <datalist id="countryList">${countries.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="field"><span>City / region <em>*</em></span><input type="text" name="region" value="${esc(s.region || '')}" placeholder="e.g. Manila, CDO, Bali, Hanoi"></label>
    <p class="muted small" style="margin:0">Tickets from this studio are grouped under this country and city on the dashboard, and go to the country's tab in the Google Sheet.</p>`,
  async (form) => {
    await api('/api/studios', { method: 'POST', body: { name: form.name.value, country: form.country.value, region: form.region.value, original: editing ? s.name : '' } });
    toast(editing ? 'Studio saved' : 'Studio added');
    state.meta = await api('/api/meta');
    done();
  }, editing ? 'Save' : 'Add studio');
}

function openMemberDialog(u, done) {
  const roles = ['SD', 'SPC', 'SPL', 'QC', 'ADMIN'];
  openModal(`Edit ${u.name}`, `
    <label class="field"><span>Full name <em>*</em></span><input type="text" name="name" value="${esc(u.name)}"></label>
    <label class="field"><span>Email</span><input type="text" name="email" inputmode="email" value="${esc(u.email || '')}"></label>
    <label class="field"><span>Role <em>*</em></span><select name="role">${roles.map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${esc(ROLE_NAMES[r])}</option>`).join('')}</select></label>
    <label class="field" data-studio-field><span>Studio <em>*</em></span><select name="studio"><option value="">Choose a studio…</option>${studioOptions(u.studio)}</select></label>
    <label class="field"><span>Job title (optional)</span><input type="text" name="title" value="${esc(u.title || '')}"></label>`,
  async (form) => {
    await api(`/api/team/${u.id}`, { method: 'PATCH', body: { name: form.name.value, email: form.email.value, role: form.role.value, studio: form.studio.value, title: form.title.value } });
    toast(`${form.name.value} updated`);
    done();
  }, 'Save', (form) => {
    const sync = () => ($('[data-studio-field]', form).hidden = !['SD', 'SPC', 'SPL'].includes(form.role.value));
    form.role.onchange = sync;
    sync();
  });
}

async function renderTeam(view) {
  const me = state.me;
  const [{ users, addableRoles, companyDomains }, requests, studios] = await Promise.all([
    api('/api/team'), api('/api/access-requests'), me.role === 'ADMIN' ? api('/api/studios') : Promise.resolve([]),
  ]);
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
            ${isAdmin ? `<select name="studio"><option value="">Choose a studio…</option>${studioOptions('')}</select>
              <small class="muted">New studio? Add it under Studios below first.</small>`
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
      ${isAdmin ? `<div class="card" id="studios"><div class="card-head"><h2>Studios</h2><button class="btn small" type="button" data-add-studio>${icon.plus} Add studio</button></div>
        <div class="card-body studio-list">${studiosHtml(studios)}</div></div>` : ''}
      </div>
    </div>`;

  // Studios: add / edit (country + city/region drive the dashboard filters and the sheet tabs).
  $('#studios')?.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit-studio]');
    if (!edit && !e.target.closest('[data-add-studio]')) return;
    const s = edit ? studios.find((x) => x.name === edit.dataset.editStudio) : { name: '', country: '', region: '' };
    openStudioDialog(s, Boolean(edit), () => renderTeam(view));
  });

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
        <td style="text-align:right;white-space:nowrap">${isAdmin && u.id !== me.id ? `<button class="btn btn-ghost small" data-edit="${u.id}">Edit</button>` : ''}${u.source !== 'roster' && u.can_manage && u.id !== me.id ? `<button class="btn btn-ghost small" data-toggle="${u.id}" data-active="${u.active ? 0 : 1}">${u.active ? 'Deactivate' : 'Reactivate'}</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No one matches.</div>';
  };
  draw();
  $('.search', list).oninput = (e) => { q = e.target.value; draw(); };
  list.onclick = async (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) return openMemberDialog(users.find((x) => x.id === Number(edit.dataset.edit)), () => renderTeam(view));
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
