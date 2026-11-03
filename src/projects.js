'use strict';

// Capture projects and their guidelines. The submission form, the QC checklist and the guideline
// flags are all rendered from a project's config.
//
// EgoExo is built in. Admins can add projects (and edit EgoExo) on the Projects page or by importing
// a template file; those are stored in the `projects` table and override the built-in definition.
//
// `flags` are the project's QC guidelines (Issue / Check / Fix). A QC check can point at a flag:
// when that check fails, the return feedback is pre-filled as "<issue> - <fix>".

const { q, run, now } = require('./db');

const BUILTIN = {
  egoexo: {
    id: 'egoexo',
    name: 'EgoExo',
    boundary: { min: 2, max: 6, step: 0.5, standard: 5 },
    setupChecklist: [
      { id: 'boundary_marked', label: 'Boundary box marked between 2m × 2m and 6m × 6m (standard is 5m × 5m)' },
      { id: 'exo_count', label: 'Exactly 4 EXO cameras mounted on tripods' },
      { id: 'tripod_height', label: 'Tripods raised to 180 cm, cameras angled downward' },
      { id: 'no_reflections', label: 'No large mirrors or highly reflective surfaces facing the capture area' },
      { id: 'res_1440p', group: 'Camera settings', label: 'Resolution: 1440p' },
      { id: 'fps_30', group: 'Camera settings', label: 'Frame rate: 30 FPS' },
      { id: 'fov_linear', group: 'Camera settings', label: 'FOV: Linear' },
      { id: 'hdr_off', group: 'Camera settings', label: 'HDR: Off' },
      { id: 'stab_off', group: 'Camera settings', label: 'Stabilization: Off' },
    ],
    mediaSlots: [
      { key: 'exo1', label: 'EXO 1' },
      { key: 'exo2', label: 'EXO 2' },
      { key: 'exo3', label: 'EXO 3' },
      { key: 'exo4', label: 'EXO 4' },
      { key: 'ego', label: 'EGO' },
    ],
    video: { minSec: 30, maxSec: 60 },
    flags: [
      {
        id: 'flag01',
        code: 'FLAG 01',
        title: 'Camera Angle & Body Visibility',
        issue: "The recorder isn't fully visible.",
        check: 'The recorder must be visible from head to feet, including hands and feet, in at least 2 EXO cameras simultaneously.',
        fix: 'Raise all 4 tripods to 180 cm and angle the cameras downward properly. Ensure objects or furniture block no more than 10% of any camera frame.',
      },
      {
        id: 'flag02',
        code: 'FLAG 02',
        title: 'Exposure & Lighting',
        issue: 'Glare or overexposure ruins the shot.',
        check: 'Ensure no large mirrors or highly reflective surfaces face the capture area.',
        fix: 'Set every camera strictly to: 1440p / 30 FPS / Linear FOV / HDR Off / Stabilization Off.',
      },
      {
        id: 'flag03',
        code: 'FLAG 03',
        title: 'Recording Area / "The Box"',
        issue: 'The space is too small, or the recorder leaves the marked area.',
        check: 'The floor-marked box must measure between 2 m × 2 m and 6 m × 6 m. The standard size is 5 m × 5 m.',
        fix: 'Ensure the recorder remains 100% inside the box throughout the entire recording. Stepping outside the box results in an automatic fail.',
      },
    ],
    approveReasons: [
      { title: 'Active Movement', detail: 'The person is doing natural, active business work (walking, lifting, carrying).' },
      { title: 'Clearly Visible', detail: "Can see the person's full body (head to feet) the entire time." },
    ],
    qcChecks: [
      {
        id: 'views',
        label: 'Camera views',
        detail: 'All 4 EXO views and 1 EGO view are present in the preview.',
        issue: 'The preview is missing one or more camera views.',
        fix: 'Upload a preview that shows all 4 EXO camera views and the 1 EGO camera view.',
      },
      {
        id: 'full_body',
        flag: 'flag01',
        label: 'Full-body visibility',
        detail: 'Recorder is visible head-to-feet (including hands and feet) in at least 2 EXO cameras simultaneously.',
      },
      {
        id: 'exposure',
        flag: 'flag02',
        label: 'Exposure & lighting',
        detail: 'No glare or overexposure; no large mirrors or highly reflective surfaces face the capture area.',
        fix: 'Set every camera strictly to: 1440p / 30 FPS / Linear FOV / HDR Off / Stabilization Off, and remove or cover any large mirrors or reflective surfaces facing the capture area.',
      },
      {
        id: 'boundary',
        flag: 'flag03',
        label: 'Boundary check',
        detail: 'Box is 2m × 2m to 6m × 6m and the recorder stays 100% inside it. Stepping outside is an automatic fail.',
      },
      {
        id: 'task',
        label: 'Task check',
        detail: 'Natural, active whole-body business work (walking, lifting, carrying): no desk-only work, zero sitting, no stretching.',
        issue: 'The task is not genuine whole-body movement.',
        fix: 'Switch to natural, active business work such as walking, lifting or carrying; no desk-only work, sitting or stretching.',
      },
      {
        id: 'occlusion',
        flag: 'flag01',
        label: 'Occlusion check',
        detail: 'No furniture or walls blocking camera views; objects block no more than 10% of any camera frame.',
        issue: 'Furniture or walls are blocking a camera view.',
        fix: 'Move objects or reposition the camera so nothing blocks more than 10% of any camera frame.',
      },
    ],
  },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const str = (v, max = 1000) => String(v ?? '').trim().slice(0, max);

function uniqueIds(items, base) {
  const seen = new Set();
  return items.map((item, i) => {
    let id = item.id ? slug(item.id) : slug(base(item, i)) || `item_${i + 1}`;
    while (seen.has(id)) id += '_x';
    seen.add(id);
    return { ...item, id };
  });
}

// Fills derived fields (flag codes on QC checks, issue/fix from flags) for display and validation.
function finalize(config, meta = {}) {
  const p = clone(config);
  p.flags ||= [];
  p.qcChecks ||= [];
  p.setupChecklist ||= [];
  p.approveReasons ||= [];
  const flags = Object.fromEntries(p.flags.map((f) => [f.id, f]));
  for (const check of p.qcChecks) {
    const flag = flags[check.flag];
    if (!flag) continue;
    check.flagCode = flag.code;
    check.issue ??= flag.issue;
    check.fix ??= flag.fix;
  }
  return { ...p, active: meta.active ?? true, builtin: Boolean(BUILTIN[p.id]), custom: meta.custom ?? false, updated_at: meta.updated_at || null };
}

// ---------- The editable "guideline file" format ----------
// What admins fill in (form) or upload (template file). Plain lists, no internal ids:
// {
//   "name": "Overlord",
//   "boundary": { "min": 2, "max": 6, "standard": 5 } | null,     // null = no boundary box field
//   "video": { "minSec": 30, "maxSec": 60 } | null,                 // null = photos only
//   "cameraViews": ["EXO 1", "EXO 2", "EGO"],                       // one photo slot per view
//   "setupChecklist": ["Boundary box marked", "Camera settings: Resolution 1440p"],  // "Group: item" groups items
//   "flags": [{ "title": "", "issue": "", "check": "", "fix": "" }],  // each becomes a QC check
//   "approveReasons": [{ "title": "", "detail": "" }],
//   "extraQcChecks": [{ "label": "", "detail": "", "issue": "", "fix": "" }]
// }

const TEMPLATE = {
  name: 'New project name',
  boundary: { min: 2, max: 6, standard: 5 },
  video: { minSec: 30, maxSec: 60 },
  cameraViews: ['Camera 1', 'Camera 2', 'Camera 3'],
  setupChecklist: [
    'Example: Capture area marked and clear',
    'Camera settings: Resolution 1440p',
    'Camera settings: 30 FPS',
  ],
  flags: [
    {
      title: 'Example flag title',
      issue: 'What goes wrong (shown to the Set Director when this check fails).',
      check: 'What QC checks for.',
      fix: 'How the Set Director fixes it.',
    },
  ],
  approveReasons: [{ title: 'Example approve reason', detail: 'What a good setup looks like.' }],
  extraQcChecks: [{ label: 'Example extra check', detail: 'What QC checks for.', issue: 'The problem.', fix: 'The correction.' }],
};

// Converts a stored config to the editable format (for the form and "Download file").
function toGuidelineFile(p) {
  return {
    id: p.id,
    name: p.name,
    boundary: p.boundary ? { min: p.boundary.min, max: p.boundary.max, standard: p.boundary.standard } : null,
    video: p.video ? { minSec: p.video.minSec, maxSec: p.video.maxSec } : null,
    cameraViews: (p.mediaSlots || []).map((s) => s.label),
    setupChecklist: (p.setupChecklist || []).map((c) => (c.group ? `${c.group}: ${c.label}` : c.label)),
    flags: (p.flags || []).map((f) => ({ title: f.title, issue: f.issue, check: f.check, fix: f.fix })),
    approveReasons: (p.approveReasons || []).map((r) => ({ title: r.title, detail: r.detail })),
    extraQcChecks: (p.qcChecks || [])
      .filter((c) => !c.flag && c.id !== 'views')
      .map((c) => ({ label: c.label, detail: c.detail, issue: c.issue || '', fix: c.fix || '' })),
  };
}

const listOf = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : []);

// Validates the editable format and builds a stored config. Throws Error(message) on bad input.
// `existing` keeps ids stable when editing, so old tickets' answers still line up.
function fromGuidelineFile(input, existing = null) {
  const name = str(input.name, 80);
  if (!name) throw new Error('Give the project a name');
  const id = existing?.id || slug(input.id || name);
  if (!id) throw new Error('The project name needs at least one letter or number');

  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  let boundary = null;
  if (input.boundary && [input.boundary.min, input.boundary.max].some((v) => num(v) !== null)) {
    const min = num(input.boundary.min), max = num(input.boundary.max);
    const standard = num(input.boundary.standard) ?? max;
    if (!(min > 0 && max >= min && standard >= min && standard <= max)) throw new Error('Boundary box: minimum, maximum and standard must be positive with min ≤ standard ≤ max');
    boundary = { min, max, step: 0.5, standard };
  }
  let video = null;
  if (input.video && [input.video.minSec, input.video.maxSec].some((v) => num(v) !== null)) {
    const minSec = num(input.video.minSec), maxSec = num(input.video.maxSec);
    if (!(minSec > 0 && maxSec >= minSec && maxSec <= 600)) throw new Error('Video length: minimum and maximum seconds must be positive, min ≤ max, and at most 600');
    video = { minSec, maxSec };
  }

  const views = listOf(input.cameraViews).map((v) => str(typeof v === 'object' ? v.label : v, 60)).filter(Boolean);
  if (!views.length && !video) throw new Error('Add at least one camera view (or allow a video)');
  const prevSlots = Object.fromEntries((existing?.mediaSlots || []).map((s) => [s.label, s.key]));
  const mediaSlots = uniqueIds(views.map((label) => ({ id: prevSlots[label], label })), (s) => s.label).map(({ id, label }) => ({ key: id, label }));

  const prevChecklist = Object.fromEntries((existing?.setupChecklist || []).map((c) => [`${c.group ? `${c.group}: ` : ''}${c.label}`, c.id]));
  const setupChecklist = uniqueIds(
    listOf(input.setupChecklist).map((line) => str(typeof line === 'object' ? (line.group ? `${line.group}: ${line.label}` : line.label) : line, 300)).filter(Boolean).map((line) => {
      const m = /^([^:]{2,40}):\s+(.+)$/.exec(line);
      return { id: prevChecklist[line], ...(m ? { group: m[1].trim(), label: m[2].trim() } : { label: line }) };
    }),
    (c) => c.label,
  ).map((c) => (c.group ? { id: c.id, group: c.group, label: c.label } : { id: c.id, label: c.label }));

  const flags = listOf(input.flags)
    .filter((f) => f && (f.title || f.issue || f.check || f.fix))
    .map((f, i) => {
      const n = String(i + 1).padStart(2, '0');
      const flag = { id: `flag${n}`, code: `FLAG ${n}`, title: str(f.title, 120), issue: str(f.issue), check: str(f.check), fix: str(f.fix) };
      if (!flag.title || !flag.check) throw new Error(`Flag ${n} needs at least a title and a check`);
      return flag;
    });

  const approveReasons = listOf(input.approveReasons)
    .map((r) => (typeof r === 'string' ? (() => { const m = /^([^:]+):\s*(.*)$/.exec(r); return m ? { title: m[1], detail: m[2] } : { title: r, detail: '' }; })() : r))
    .map((r) => ({ title: str(r.title, 120), detail: str(r.detail) }))
    .filter((r) => r.title);

  // QC checklist: "camera views present" (when there are photo slots), one check per flag, then extras.
  const qcChecks = [];
  if (mediaSlots.length) {
    const list = mediaSlots.map((s) => s.label).join(', ');
    qcChecks.push({ id: 'views', label: 'Camera views', detail: `All required views are present in the preview: ${list}.`,
      issue: 'The preview is missing one or more camera views.', fix: `Upload a preview that shows every required view: ${list}.` });
  }
  for (const f of flags) qcChecks.push({ id: f.id, flag: f.id, label: f.title, detail: f.check });
  const extras = listOf(input.extraQcChecks)
    .filter((c) => c && c.label)
    .map((c) => ({ label: str(c.label, 120), detail: str(c.detail), issue: str(c.issue) || undefined, fix: str(c.fix) || undefined }));
  for (const c of uniqueIds(extras.map((c) => ({ ...c, id: `extra_${slug(c.label)}` })), (c) => c.label)) qcChecks.push(c);
  if (!qcChecks.length) throw new Error('Add at least one flag or QC check so QC has something to review');

  // Editing the built-in EgoExo keeps its hand-written QC checks (they reference its flags by id)
  // as long as its flags and extra checks are unchanged.
  const builtinFile = BUILTIN[id] ? toGuidelineFile(finalize(BUILTIN[id])) : null;
  const sameAs = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const keepBuiltinChecks = Boolean(builtinFile) &&
    sameAs(flags.map(({ title, issue, check, fix }) => ({ title, issue, check, fix })), builtinFile.flags) &&
    sameAs(extras.map((c) => ({ label: c.label, detail: c.detail, issue: c.issue || '', fix: c.fix || '' })), builtinFile.extraQcChecks);
  return {
    id, name, boundary, video, mediaSlots, setupChecklist, flags, approveReasons,
    qcChecks: keepBuiltinChecks ? clone(BUILTIN[id].qcChecks) : qcChecks,
  };
}

// ---------- Loading (DB overrides built-in), cached briefly ----------

let cache = null;
let cacheAt = 0;
const CACHE_MS = 10_000;

async function loadProjects(force = false) {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const rows = await q('SELECT id, config, active, updated_at FROM projects');
  const all = {};
  for (const [id, config] of Object.entries(BUILTIN)) all[id] = finalize(config);
  for (const r of rows) {
    try {
      all[r.id] = finalize(JSON.parse(r.config), { active: Boolean(r.active), custom: true, updated_at: r.updated_at });
    } catch (err) {
      console.error(`[projects] bad config for ${r.id}:`, err.message);
    }
  }
  cache = all;
  cacheAt = Date.now();
  return cache;
}

// Sync access after loadProjects() (the app loads them at the start of each request).
const getProject = (id) => (cache || {})[id] || (BUILTIN[id] ? finalize(BUILTIN[id]) : null);
const listProjects = ({ includeInactive = false } = {}) =>
  Object.values(cache || Object.fromEntries(Object.entries(BUILTIN).map(([k, v]) => [k, finalize(v)])))
    .filter((p) => includeInactive || p.active)
    .sort((a, b) => a.name.localeCompare(b.name));

async function saveProject(config, { active = true } = {}) {
  await run(`INSERT INTO projects (id, config, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)
    ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, active = EXCLUDED.active, updated_at = EXCLUDED.updated_at`,
    [config.id, JSON.stringify(config), active ? 1 : 0, now()]);
  await loadProjects(true);
}

async function setProjectActive(id, active) {
  const p = getProject(id);
  if (!p) throw new Error('Project not found');
  const { active: _a, builtin: _b, custom: _c, updated_at: _u, ...config } = p;
  await saveProject(stripDerived(config), { active });
}

// Removes fields finalize() adds, before storing.
function stripDerived(p) {
  const c = clone(p);
  for (const check of c.qcChecks || []) {
    if (check.flag) {
      delete check.flagCode;
      const flag = (c.flags || []).find((f) => f.id === check.flag);
      if (flag && check.issue === flag.issue) delete check.issue;
      if (flag && check.fix === flag.fix) delete check.fix;
    }
  }
  return c;
}

module.exports = {
  BUILTIN, TEMPLATE, loadProjects, getProject, listProjects, saveProject, setProjectActive,
  toGuidelineFile, fromGuidelineFile, stripDerived,
};
