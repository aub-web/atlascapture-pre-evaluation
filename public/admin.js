'use strict';

// Admin pages: Projects (add/edit guidelines, template file, import) and the Export ZIP dialog.
// Uses helpers from app.js (api, esc, $, $$, toast, icon, state, route).

// ---------- Modal dialog ----------
// openModal(title, fieldsHtml, onSubmit(form), submitLabel, onMount(form)). onSubmit may throw to show an error.
function openModal(title, html, onSubmit, submitLabel = 'Save', onMount) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<form class="modal card" novalidate>
    <div class="card-head"><h2>${esc(title)}</h2><button class="btn btn-ghost btn-icon" type="button" data-close aria-label="Close">✕</button></div>
    <div class="card-body stack">${html}<div class="login-error" hidden></div></div>
    <div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">${esc(submitLabel)}</button></div>
  </form>`;
  const form = $('form', wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      // onSubmit can return 'keep' to leave the dialog open (e.g. to show a result).
      if ((await onSubmit(form)) === 'keep') btn.disabled = false;
      else close();
    } catch (err) {
      const box = $('.login-error', form);
      box.textContent = err.message;
      box.hidden = false;
      btn.disabled = false;
    }
  };
  document.body.append(wrap);
  onMount?.(form);
  $('input, select, textarea', form)?.focus();
  return { close, form };
}

// ---------- Export ZIP (dashboard) ----------

const fmtBytes = (n) => (n > 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n > 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const driveLine = (d) => `Google Drive copies: ${d.done} done${d.waiting ? `, ${d.waiting} in progress` : ''}${d.failed ? `, <span style="color:var(--red)">${d.failed} failed</span>` : ''}.`;

async function openExportDialog(rows, filters = {}) {
  if (!rows.length) return toast('No tickets match the current filters', 'error');
  const approved = rows.filter((t) => t.status === 'approved');
  const scope = [filters.country, filters.region, filters.project && rows[0]?.project_name].filter(Boolean).join(' · ') || 'All countries';
  let drive = null;
  try { drive = await api('/api/admin/drive'); } catch {}

  const { form, close } = openModal('Export ZIP', `
    <p style="margin:0"><b>${rows.length}</b> ticket${rows.length === 1 ? '' : 's'} · <span class="muted">${esc(scope)}${filters.tab && filters.tab !== 'all' ? ` · ${esc(filters.tab)}` : ''}</span></p>
    <p class="muted small" style="margin:0">The ZIP has <b>tickets.csv</b> (every entry, status and latest QC feedback) and the photos/videos in a folder per country, named <b>Country_Project_BusinessName_TICKET_View</b>. Use the dashboard filters to choose what goes in.</p>
    <label class="check on" style="padding:9px 11px"><input type="checkbox" name="includeMedia" checked><div class="small">Include photos and videos</div></label>
    ${drive?.enabled ? `<div class="small" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="muted" data-drive-status>${driveLine(drive)}</span>
      <button class="btn small" type="button" data-drive-copy>Copy files to Drive</button></div>` : ''}
    <div data-result hidden></div>
    ${approved.length ? `<details class="archive-box"><summary>Free up storage after exporting</summary>
      <p class="small" style="margin:8px 0">Remove the photos/videos of the <b>${approved.length} approved</b> ticket${approved.length === 1 ? '' : 's'} in this selection from the site's storage. Tickets, history and feedback stay; the files remain in your ZIP${drive?.enabled ? ' and in Google Drive' : ''}.</p>
      <label class="check" style="padding:9px 11px"><input type="checkbox" name="confirmArchive"><div class="small">I've downloaded the ZIP and want to remove these files from the site</div></label>
      <button class="btn btn-danger small" type="button" data-archive style="margin-top:8px">Remove files from site storage</button>
    </details>` : ''}`,
  async (f) => {
    const result = await api('/api/admin/exports', { method: 'POST', body: { ticketIds: rows.map((t) => t.id), includeMedia: f.includeMedia.checked } });
    const box = $('[data-result]', f);
    box.hidden = false;
    box.innerHTML = `<div class="export-ready">${icon.check} Ready: ${result.tickets} tickets, ${result.files} files, ${fmtBytes(result.bytes)}.
      <a class="btn btn-primary small" href="${esc(result.url)}" download>${icon.download} Download ZIP</a></div>
      <p class="muted small" style="margin:6px 0 0">The download starts automatically; the link works for 2 hours.</p>`;
    location.href = result.url;
    return 'keep'; // stay open to show the link and the archive option
  }, 'Create ZIP');

  // Copies any photos/videos not yet in Drive (e.g. uploaded before Drive was switched on) and retries failed ones.
  $('[data-drive-copy]', form)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Copying…';
    try {
      let s = await api('/api/admin/drive/run', { method: 'POST', body: { queueExisting: true, retryFailed: true } });
      for (let i = 0; s.waiting && i < 30; i++) {
        $('[data-drive-status]', form).innerHTML = driveLine(s);
        s = await api('/api/admin/drive/run', { method: 'POST', body: {} });
      }
      $('[data-drive-status]', form).innerHTML = driveLine(s);
      toast(s.failed ? `Drive: ${s.failed} file(s) failed — ${s.lastError?.error || 'see status'}` : s.waiting ? 'Still copying in the background' : 'All files are in Google Drive', s.failed ? 'error' : undefined);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Copy files to Drive';
    }
  });

  $('[data-archive]', form)?.addEventListener('click', async () => {
    if (!form.confirmArchive.checked) return toast('Tick the confirmation first', 'error');
    try {
      const r = await api('/api/admin/archive-media', { method: 'POST', body: { ticketIds: approved.map((t) => t.id) } });
      toast(r.archived ? `Removed ${r.archived} file${r.archived === 1 ? '' : 's'} from site storage` : 'Nothing to remove (already removed)');
      close();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------- Projects list ----------

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function renderProjects(view) {
  const projects = await api('/api/projects');
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Projects</h1><p>Each project has its own setup checklist, camera views and QC guidelines. Set Directors pick the project when they submit.</p></div>
      <div class="actions">
        <a class="btn btn-primary" href="#/projects/new">${icon.plus} Add project</a>
      </div>
    </div>
    <div class="card file-help">
      <div class="card-body">
        <b>Prefer a file?</b> <span class="muted">Download the template, fill in the guidelines (name, camera views, checklist, flags with Issue / Check / Fix…), then import it.</span>
        <div class="actions" style="margin-top:10px">
          <button class="btn" id="dlTemplate" type="button">${icon.download} Download template</button>
          <label class="btn" for="importFile">${icon.plus} Import file</label>
          <input type="file" id="importFile" accept=".json,application/json" hidden>
        </div>
      </div>
    </div>
    <div class="project-grid">
      ${projects.map((p) => `<div class="card project-card ${p.active ? '' : 'inactive'}" data-id="${esc(p.id)}">
        <div class="card-body">
          <div class="project-top"><h2>${esc(p.name)}</h2>
            <span class="pill ${p.active ? 'approved' : 'returned'}">${p.active ? 'Active' : 'Turned off'}</span></div>
          <p class="muted small">${p.builtin ? (p.custom ? 'Built-in, edited by an admin' : 'Built-in') : 'Added by an admin'}${p.updated_at ? ` · updated ${timeAgo(p.updated_at)}` : ''}</p>
          <ul class="project-facts">
            <li><b>${p.views}</b> camera view${p.views === 1 ? '' : 's'}</li>
            <li><b>${p.flags}</b> flag${p.flags === 1 ? '' : 's'}</li>
            <li><b>${p.checks}</b> QC check${p.checks === 1 ? '' : 's'}</li>
            <li>${p.video ? `Video ${p.file.video.minSec}–${p.file.video.maxSec}s` : 'Photos only'}</li>
            <li>${p.file.boundary ? `Box ${p.file.boundary.min}–${p.file.boundary.max} m` : 'No boundary box'}</li>
          </ul>
          <div class="actions">
            <a class="btn" href="#/projects/${esc(p.id)}">Edit</a>
            <button class="btn btn-ghost" data-download type="button">${icon.download} File</button>
            <button class="btn btn-ghost" data-toggle="${p.active ? 0 : 1}" type="button">${p.active ? 'Turn off' : 'Turn on'}</button>
          </div>
        </div>
      </div>`).join('')}
    </div>`;

  $('#dlTemplate').onclick = async () => downloadJson('project-guidelines-template.json', await api('/api/projects/template'));
  $('#importFile').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return toast("That file isn't valid JSON. Start from the downloaded template.", 'error');
    }
    try {
      const r = await api('/api/projects', { method: 'POST', body: data });
      toast(`${r.name} added`);
    } catch (err) {
      const existing = projects.find((p) => p.name.toLowerCase() === String(data.name || '').trim().toLowerCase() || p.id === data.id);
      if (!existing || !confirm(`${err.message}. Replace the guidelines of "${existing.name}" with this file?`)) return toast(err.message, 'error');
      try {
        await api(`/api/projects/${encodeURIComponent(existing.id)}`, { method: 'PUT', body: data });
        toast(`${existing.name} updated`);
      } catch (err2) {
        return toast(err2.message, 'error');
      }
    }
    state.meta = await api('/api/meta');
    renderProjects(view);
  };
  $('.project-grid').onclick = async (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const p = projects.find((x) => x.id === card.dataset.id);
    if (e.target.closest('[data-download]')) return downloadJson(`${p.id}-guidelines.json`, p.file);
    const toggle = e.target.closest('[data-toggle]');
    if (!toggle) return;
    try {
      await api(`/api/projects/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: { active: toggle.dataset.toggle === '1' } });
      toast(`${p.name} ${toggle.dataset.toggle === '1' ? 'turned on' : 'turned off'}`);
      state.meta = await api('/api/meta');
      renderProjects(view);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

// ---------- Project editor ----------

const lines = (v) => (v || []).join('\n');
const splitLines = (s) => String(s || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

async function renderProjectEditor(view, id) {
  const isNew = id === 'new';
  let file;
  if (isNew) file = { name: '', boundary: null, video: { minSec: 30, maxSec: 60 }, cameraViews: [], setupChecklist: [], flags: [{}], approveReasons: [], extraQcChecks: [] };
  else {
    const p = (await api('/api/projects')).find((x) => x.id === id);
    if (!p) {
      view.innerHTML = '<div class="empty"><h3>Project not found</h3><a href="#/projects">Back to projects</a></div>';
      return;
    }
    file = p.file;
  }

  const flagCard = (f = {}, i = 0) => `<div class="repeat-card" data-flag>
    <div class="repeat-head"><span class="flag-code c${(i % 3) + 1}">FLAG ${String(i + 1).padStart(2, '0')}</span>
      <button class="btn btn-ghost small" type="button" data-remove>Remove</button></div>
    <label class="field"><span>Title <em>*</em></span><input type="text" name="title" value="${esc(f.title || '')}" placeholder="e.g. Camera Angle & Body Visibility"></label>
    <label class="field"><span><span class="lbl lbl-issue">ISSUE</span> (what goes wrong)</span><textarea name="issue" rows="2">${esc(f.issue || '')}</textarea></label>
    <label class="field"><span><span class="lbl lbl-check">CHECK</span> (what QC checks) <em>*</em></span><textarea name="check" rows="2">${esc(f.check || '')}</textarea></label>
    <label class="field"><span><span class="lbl lbl-fix">FIX</span> (how to correct it)</span><textarea name="fix" rows="2">${esc(f.fix || '')}</textarea></label>
  </div>`;
  const extraCard = (c = {}) => `<div class="repeat-card" data-extra>
    <div class="repeat-head"><b class="small">Extra QC check</b><button class="btn btn-ghost small" type="button" data-remove>Remove</button></div>
    <div class="form-grid">
      <label class="field"><span>Label <em>*</em></span><input type="text" name="label" value="${esc(c.label || '')}"></label>
      <label class="field"><span>What QC checks</span><input type="text" name="detail" value="${esc(c.detail || '')}"></label>
      <label class="field"><span>Issue (when it fails)</span><input type="text" name="issue" value="${esc(c.issue || '')}"></label>
      <label class="field"><span>Fix</span><input type="text" name="fix" value="${esc(c.fix || '')}"></label>
    </div>
  </div>`;

  view.innerHTML = `
    <a class="back" href="#/projects">${icon.back} Projects</a>
    <div class="page-head"><div><h1>${isNew ? 'Add project' : `Edit ${esc(file.name)}`}</h1>
      <p>Fill in the guidelines as they appear in the project doc. Each flag becomes a QC check; when QC fails it, the Set Director gets that flag's Issue and Fix.</p></div></div>
    <form id="projForm" class="stack" novalidate>
      <div class="card"><div class="card-head"><h2>Basics</h2></div><div class="card-body stack">
        <label class="field"><span>Project name <em>*</em></span><input type="text" name="name" value="${esc(file.name)}" placeholder="e.g. Overlord" maxlength="80"></label>
        <div class="form-grid">
          <div class="option-box">
            <label class="check ${file.boundary ? 'on' : ''}" style="padding:8px 10px"><input type="checkbox" name="hasBoundary" ${file.boundary ? 'checked' : ''}><div><b>Boundary box</b><div class="d">Set Directors choose the box size</div></div></label>
            <div class="mini-grid" data-boundary ${file.boundary ? '' : 'hidden'}>
              <label class="field"><span>Min (m)</span><input type="text" inputmode="decimal" name="bMin" value="${file.boundary?.min ?? 2}"></label>
              <label class="field"><span>Max (m)</span><input type="text" inputmode="decimal" name="bMax" value="${file.boundary?.max ?? 6}"></label>
              <label class="field"><span>Standard (m)</span><input type="text" inputmode="decimal" name="bStd" value="${file.boundary?.standard ?? 5}"></label>
            </div>
          </div>
          <div class="option-box">
            <label class="check ${file.video ? 'on' : ''}" style="padding:8px 10px"><input type="checkbox" name="hasVideo" ${file.video ? 'checked' : ''}><div><b>Allow a video</b><div class="d">Instead of one photo per view</div></div></label>
            <div class="mini-grid" data-video ${file.video ? '' : 'hidden'}>
              <label class="field"><span>Min seconds</span><input type="text" inputmode="numeric" name="vMin" value="${file.video?.minSec ?? 30}"></label>
              <label class="field"><span>Max seconds</span><input type="text" inputmode="numeric" name="vMax" value="${file.video?.maxSec ?? 60}"></label>
            </div>
          </div>
        </div>
      </div></div>

      <div class="card"><div class="card-head"><h2>Submission form</h2></div><div class="card-body stack">
        <label class="field"><span>Camera views <span class="muted">(one per line; one photo slot each)</span></span>
          <textarea name="cameraViews" rows="5" placeholder="EXO 1&#10;EXO 2&#10;EGO">${esc(lines(file.cameraViews))}</textarea></label>
        <label class="field"><span>Setup checklist <span class="muted">(one per line; write "Group: item" to group items, e.g. "Camera settings: 30 FPS")</span></span>
          <textarea name="setupChecklist" rows="8">${esc(lines(file.setupChecklist))}</textarea></label>
      </div></div>

      <div class="card"><div class="card-head"><h2>QC guidelines (flags)</h2><button class="btn small" type="button" id="addFlag">${icon.plus} Add flag</button></div>
        <div class="card-body stack" id="flags">${(file.flags.length ? file.flags : [{}]).map(flagCard).join('')}</div></div>

      <div class="card"><div class="card-head"><h2>Approve reasons & extra checks</h2></div><div class="card-body stack">
        <label class="field"><span>Approve reasons <span class="muted">(one per line, "Title: detail")</span></span>
          <textarea name="approveReasons" rows="3" placeholder="Active Movement: The person is doing natural, active business work">${esc(file.approveReasons.map((r) => (r.detail ? `${r.title}: ${r.detail}` : r.title)).join('\n'))}</textarea></label>
        <div id="extras" class="stack">${file.extraQcChecks.map(extraCard).join('')}</div>
        <div><button class="btn small" type="button" id="addExtra">${icon.plus} Add an extra QC check</button>
          <span class="muted small">For checks that aren't a flag (e.g. "Task check").</span></div>
      </div></div>

      <div class="actions" style="justify-content:flex-end">
        <a class="btn" href="#/projects">Cancel</a>
        <button class="btn btn-primary btn-lg" type="submit">${isNew ? 'Add project' : 'Save changes'}</button>
      </div>
    </form>`;

  const form = $('#projForm');
  const renumber = () => $$('[data-flag]', form).forEach((card, i) => {
    const code = $('.flag-code', card);
    code.textContent = `FLAG ${String(i + 1).padStart(2, '0')}`;
    code.className = `flag-code c${(i % 3) + 1}`;
  });
  form.hasBoundary.onchange = () => { $('[data-boundary]', form).hidden = !form.hasBoundary.checked; form.hasBoundary.closest('.check').classList.toggle('on', form.hasBoundary.checked); };
  form.hasVideo.onchange = () => { $('[data-video]', form).hidden = !form.hasVideo.checked; form.hasVideo.closest('.check').classList.toggle('on', form.hasVideo.checked); };
  $('#addFlag').onclick = () => { $('#flags').insertAdjacentHTML('beforeend', flagCard({}, $$('[data-flag]', form).length)); renumber(); };
  $('#addExtra').onclick = () => $('#extras').insertAdjacentHTML('beforeend', extraCard());
  form.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (!rm) return;
    rm.closest('.repeat-card').remove();
    renumber();
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const val = (card, name) => $(`[name="${name}"]`, card).value.trim();
    const body = {
      name: form.name.value.trim(),
      boundary: form.hasBoundary.checked ? { min: form.bMin.value, max: form.bMax.value, standard: form.bStd.value } : null,
      video: form.hasVideo.checked ? { minSec: form.vMin.value, maxSec: form.vMax.value } : null,
      cameraViews: splitLines(form.cameraViews.value),
      setupChecklist: splitLines(form.setupChecklist.value),
      flags: $$('[data-flag]', form).map((c) => ({ title: val(c, 'title'), issue: val(c, 'issue'), check: val(c, 'check'), fix: val(c, 'fix') })),
      approveReasons: splitLines(form.approveReasons.value),
      extraQcChecks: $$('[data-extra]', form).map((c) => ({ label: val(c, 'label'), detail: val(c, 'detail'), issue: val(c, 'issue'), fix: val(c, 'fix') })),
    };
    if (!body.name) return toast('Give the project a name', 'error');
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      const r = isNew
        ? await api('/api/projects', { method: 'POST', body })
        : await api(`/api/projects/${encodeURIComponent(id)}`, { method: 'PUT', body });
      toast(isNew ? `${r.name} added. Set Directors can now choose it.` : `${r.name} saved`);
      state.meta = await api('/api/meta');
      location.hash = '#/projects';
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };
}
