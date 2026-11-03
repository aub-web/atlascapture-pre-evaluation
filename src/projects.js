'use strict';

// Per-project rules. Add a new entry here to support another capture project;
// the submission form, the QC checklist and the guideline flags are all rendered from this config.
//
// `flags` are the project's QC guidelines (Issue / Check / Fix). A QC check can point at a flag:
// when that check fails, the return feedback is pre-filled as "<issue> - <fix>".

const PROJECTS = {
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

// Fill each QC check's issue/fix from its flag unless the check overrides them.
for (const project of Object.values(PROJECTS)) {
  const flags = Object.fromEntries((project.flags || []).map((f) => [f.id, f]));
  for (const check of project.qcChecks) {
    const flag = flags[check.flag];
    if (!flag) continue;
    check.flagCode = flag.code;
    check.issue ??= flag.issue;
    check.fix ??= flag.fix;
  }
}

const getProject = (id) => PROJECTS[id] || null;

module.exports = { PROJECTS, getProject };
