// Weekly routine planner.
//
// The page renders a plan object: days, each holding slots, each slot naming
// an exercise, a load level (heavy/medium/light/technique), sets, reps and an
// intensity band expressed as a percentage of an estimated 1RM. The actual
// kilograms are never written down here — they are computed from the log, so
// the plan tracks the lifter instead of going stale the week after it's
// written.
//
// DEFAULT_PLAN below is the plan "Reset to default" restores. Edit it to
// change the shipped routine; edit the page itself (Customize) to change the
// copy saved in this browser.

// ---------- the default routine ----------
//
// Built around two priorities and a constraint:
//
//   Primary   snatch, clean & jerk — trained three times a week each, because
//             Olympic lifts are technique under load and frequency is what
//             moves them. Only one of those three exposures is heavy.
//   Secondary weighted pull-up, weighted dip — three exposures each as well,
//             but stacked on the days the bar isn't heavy.
//   Constraint 5 lifting days, 2 full rest days, 1-2 easy runs/hikes, and a
//             weekly fatigue cost in the range the log says is actually
//             being absorbed (see the Volume page's weighted fatigue units).
//
// Every slot's `group` is what the heavy/medium/light grid at the bottom of
// the page is built from — two slots sharing a group are two exposures of the
// same movement, and the grid checks that each group gets a heavy, a medium
// and a light one.
//
// `ref` pegs a slot's percentages to a different lift: a snatch high pull is
// prescribed off the snatch, not off its own best pull, so the accessory
// follows the lift it serves.

const DEFAULT_PLAN = {
  version: 1,
  days: [
    {
      name: "Monday",
      title: "Heavy snatch · heavy front squat",
      note: "The week's top snatch effort, on the freshest day. One hard leg session, stacked here rather than spread out.",
      slots: [
        { ex: "S", group: "Snatch", load: "heavy", sets: 5, reps: 2, pctLo: 0.82, pctHi: 0.9, rest: "3 min",
          note: "Build to a heavy double. Two misses at the same weight ends the exercise for the day." },
        { ex: "SHP", group: "Snatch", load: "medium", sets: 3, reps: 3, pctLo: 0.95, pctHi: 1.05, ref: "S", rest: "2 min",
          note: "Percentages are of the snatch. Finish the extension; this is not a shrug." },
        { ex: "FSQ", group: "Squat", load: "heavy", sets: 4, reps: 2, pctLo: 0.85, pctHi: 0.9, rest: "3 min",
          note: "Heavy front squat belongs next to the heavy pull, not on its own day." },
        { ex: "BE", group: "Accessory", load: "light", sets: 3, reps: 8, rest: "90 s",
          note: "Posterior chain, unloaded end of the day." },
      ],
    },
    {
      name: "Tuesday",
      title: "Heavy pull-up · heavy dip",
      note: "The secondary goals get their own hard day, on a day the bar is not heavy.",
      slots: [
        { ex: "PLU", group: "Pull-up", load: "heavy", sets: 4, reps: 3, pctLo: 0.88, pctHi: 0.93, rest: "3 min",
          note: "Added weight. Dead hang to chin over the bar, no kip." },
        { ex: "D", group: "Dip", load: "heavy", sets: 4, reps: 3, pctLo: 0.88, pctHi: 0.93, rest: "3 min",
          note: "Added weight. Full depth, controlled turnaround." },
        { ex: "BR", group: "Accessory", load: "medium", sets: 3, reps: 6, pctLo: 0.65, pctHi: 0.72, rest: "2 min",
          note: "Horizontal pulling to balance the vertical work above." },
        { ex: "SDR", group: "Accessory", load: "light", sets: 3, reps: 15, rest: "60 s",
          note: "Shoulder health for the overhead positions." },
      ],
      cardio: { activity: "Run", load: "light", detail: "30-40 min easy",
        note: "Conversational pace, after the lifting or in the evening. If Monday left the legs flat, trade it for Thursday's hike." },
    },
    {
      name: "Wednesday",
      title: "Medium clean & jerk · light squat",
      note: "Volume day for the clean & jerk — the reps that build the lift, at a weight that doesn't cost the week.",
      slots: [
        { ex: "CJ", group: "Clean & Jerk", load: "medium", sets: 4, reps: 2, pctLo: 0.72, pctHi: 0.8, rest: "3 min",
          note: "Both halves, every rep. Sharp turnover, no grinding." },
        { ex: "J", group: "Clean & Jerk", load: "medium", sets: 3, reps: 2, pctLo: 0.75, pctHi: 0.82, ref: "CJ", rest: "2 min",
          note: "From the rack, so the jerk gets reps the clean isn't paying for." },
        { ex: "CHP", group: "Clean & Jerk", load: "medium", sets: 3, reps: 3, pctLo: 0.95, pctHi: 1.05, ref: "CJ", rest: "2 min",
          note: "Percentages are of the clean & jerk." },
        { ex: "PFSQ", group: "Squat", load: "light", sets: 3, reps: 3, pctLo: 0.62, pctHi: 0.7, ref: "FSQ", rest: "2 min",
          note: "Two seconds in the hole. Position work, not a squat workout." },
        { ex: "D", group: "Dip", load: "light", sets: 3, reps: 8, pctLo: 0.6, pctHi: 0.66, rest: "90 s",
          note: "Three days clear of Tuesday's heavy dip and three before Saturday's medium one." },
      ],
    },
    {
      name: "Thursday",
      rest: true,
      title: "Rest",
      note: "A full day off before the heaviest session of the week. An easy hike is fine here; a lift is not.",
      slots: [],
      cardio: { activity: "Hike", load: "light", detail: "60-90 min, flat to rolling", optional: true,
        note: "Only if Tuesday's run didn't happen, and only easy." },
    },
    {
      name: "Friday",
      title: "Heavy clean & jerk · medium snatch",
      note: "The week's top clean & jerk, four days clear of the heavy snatch and one day off rest.",
      slots: [
        { ex: "CJ", group: "Clean & Jerk", load: "heavy", sets: 5, reps: 1, pctLo: 0.85, pctHi: 0.93, rest: "3-4 min",
          note: "Singles. Build to a heavy one; stop on the second miss." },
        { ex: "S", group: "Snatch", load: "medium", sets: 4, reps: 2, pctLo: 0.75, pctHi: 0.82, rest: "2-3 min",
          note: "Crisp doubles after the clean & jerk — speed, not another max." },
        { ex: "SQ", group: "Squat", load: "medium", sets: 3, reps: 4, pctLo: 0.72, pctHi: 0.78, rest: "3 min",
          note: "Back squat, behind the pulls so it can't blunt them." },
        { ex: "PLU", group: "Pull-up", load: "medium", sets: 3, reps: 5, pctLo: 0.78, pctHi: 0.83, rest: "2 min",
          note: "Added weight, well short of failure." },
      ],
    },
    {
      name: "Saturday",
      title: "Light technique · medium dip",
      note: "Positions at a weight that teaches instead of taxing, then the week's aerobic session.",
      slots: [
        { ex: "S", group: "Snatch", load: "light", sets: 4, reps: 3, pctLo: 0.6, pctHi: 0.68, rest: "90 s",
          note: "Every rep a technique rep. Nothing here should feel like a strain." },
        { ex: "SB", group: "Snatch", load: "technique", sets: 3, reps: 3, pctLo: 0.5, pctHi: 0.6, ref: "S", rest: "90 s",
          note: "Snatch balance — receiving position under speed." },
        { ex: "J", group: "Clean & Jerk", load: "light", sets: 3, reps: 2, pctLo: 0.65, pctHi: 0.72, ref: "CJ", rest: "90 s",
          note: "From the rack. Split depth and the overhead lockout, at a weight that can't be muscled." },
        { ex: "D", group: "Dip", load: "medium", sets: 4, reps: 6, pctLo: 0.75, pctHi: 0.8, rest: "2 min" },
        { ex: "PLU", group: "Pull-up", load: "light", sets: 3, reps: 8, rest: "90 s",
          note: "Bodyweight only, two reps short of failure." },
      ],
      cardio: { activity: "Hike", load: "medium", detail: "60-120 min, or a long easy run",
        note: "The one session of the week that's allowed to be long. Keep it aerobic." },
    },
    {
      name: "Sunday",
      rest: true,
      title: "Rest",
      note: "Nothing. The week's second full day off.",
      slots: [],
    },
  ],
};

// ---------- week types ----------
// The plan above is one week. Waving it across a month keeps the average
// weekly cost near what the log says is sustainable instead of running the
// top week every week. `volume` scales set counts, `intensity` scales the
// percentage bands.

const WEEK_TYPES = [
  { key: "heavy", label: "Heavy", intensity: 1, volume: 1,
    note: "The plan as written. One of these every other week at most — week 1 and week 3 of a four-week wave." },
  { key: "medium", label: "Medium", intensity: 0.95, volume: 0.85,
    note: "A set off most exercises and a few percent off the bar. The default week: enough to progress, cheap enough to repeat." },
  { key: "light", label: "Light", intensity: 0.88, volume: 0.7,
    note: "Technique and touch. Use it when sleep, food or life has been bad, rather than skipping the week." },
  { key: "deload", label: "Deload", intensity: 0.8, volume: 0.5,
    note: "Week 4 of the wave. Half the sets, nothing above 80% — this is where the previous three weeks actually turn into strength." },
];

const LOAD_LABELS = { heavy: "Heavy", medium: "Medium", light: "Light", technique: "Technique", rest: "Rest" };
const LOAD_ORDER = ["heavy", "medium", "light", "technique"];
// How hard a day leans on a movement, for picking the headline load when one
// focus gets more than one slot in a session. Technique sits below light: a
// snatch balance primer is the least the snatch is ever asked for.
const LOAD_RANK = { heavy: 0, medium: 1, light: 2, technique: 3 };

// What a slot counts as when the day is summarised.
//
// A slot's `group` is the lift it develops — that's the axis the
// heavy/medium/light rule runs on, and it deliberately keeps the snatch high
// pull filed under Snatch rather than under the pattern it looks like.
// Accessories have no lift to develop, so they fall back to the movement
// pattern the dictionary already assigns them: Pulls, Push, Hinge, Squat.
// The two taxonomies together are what the day strip and the week grid read.
const ACCESSORY_GROUP = "Accessory";
const CARDIO_FOCUS = "Run / hike";

// Goal movements lead the grid in priority order; everything else follows by
// how much of the week it actually takes up.
const FOCUS_ORDER = ["Snatch", "Clean & Jerk", "Squat", "Pull-up", "Dip"];

const RECENT_WINDOW_DAYS = 120;
const ACTUAL_WINDOW_DAYS = 28;
const STORAGE_KEY = "kilog.weeklyPlan.v1";
const PREFS_KEY = "kilog.weeklyPrefs.v1";

// ---------- state ----------

const $ = (sel) => document.querySelector(sel);

const state = {
  plan: null,
  customized: false,
  weekType: "medium",
  basis: "recent",
  editing: false,
  names: {},          // abbreviation -> full name
  dict: {},           // abbreviation -> the dictionary row (for movement pattern)
  maxes: {},          // abbreviation -> { oneRM, date, sets } | null
  actualWfuPerWeek: null,
  actualDaysPerWeek: null,
};

// ---------- persistence ----------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readStored(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // A private window, cleared site data or a browser blocking storage all
    // land here. The default plan is a perfectly good fallback.
    return null;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function loadPlan() {
  const stored = readStored(STORAGE_KEY);
  if (stored && stored.version === DEFAULT_PLAN.version && Array.isArray(stored.days)) {
    state.plan = stored;
    state.customized = true;
    return;
  }
  state.plan = clone(DEFAULT_PLAN);
  state.customized = false;
}

function savePlan() {
  state.customized = true;
  if (!writeStored(STORAGE_KEY, state.plan)) {
    setStatus("Couldn't save to this browser — edits will be lost on reload.", "err");
  }
  renderDirtyFlag();
}

function loadPrefs() {
  const prefs = readStored(PREFS_KEY);
  if (prefs && WEEK_TYPES.some((w) => w.key === prefs.weekType)) state.weekType = prefs.weekType;
  if (prefs && (prefs.basis === "recent" || prefs.basis === "all")) state.basis = prefs.basis;
}

function savePrefs() {
  writeStored(PREFS_KEY, { weekType: state.weekType, basis: state.basis });
}

// ---------- plan helpers ----------

function weekType() {
  return WEEK_TYPES.find((w) => w.key === state.weekType) || WEEK_TYPES[0];
}

function nameOf(abbrev) {
  return state.names[abbrev] || "";
}

function labelOf(abbrev) {
  return exerciseDisplayLabel(abbrev, nameOf(abbrev));
}

// Set counts scale with the week type, but never below one working set: a
// week type is meant to lighten an exercise, not delete it.
function scaledSets(slot) {
  return Math.max(1, Math.round(slot.sets * weekType().volume));
}

function scaledPct(slot) {
  if (!slot.pctHi) return null;
  const f = weekType().intensity;
  return { lo: (slot.pctLo || 0) * f, hi: slot.pctHi * f };
}

// Every abbreviation the plan needs a max for, including the `ref` lifts that
// slots are pegged to.
function referencedExercises() {
  const out = new Set();
  for (const day of state.plan.days) {
    for (const slot of day.slots || []) {
      if (slot.ex) out.add(slot.ex);
      if (slot.ref) out.add(slot.ref);
    }
  }
  return [...out];
}

function isBodyweight(abbrev) {
  return classifyEquipment(abbrev, nameOf(abbrev)) === "bodyweight";
}

// The kilograms a slot actually calls for, or null when the log has nothing
// to compute them from.
//
// Percentages always apply to the reference lift's *total* estimated 1RM,
// because that total is what makes a rep hard. The display then converts back
// into the terms the exercise is logged in: a bodyweight movement is written
// as added weight ("+41 kg"), same as everywhere else in the app.
function prescribedLoad(slot) {
  const pct = scaledPct(slot);
  if (!pct) return null;
  const max = state.maxes[slot.ref || slot.ex];
  if (!max) return null;

  let lo = pct.lo * max.oneRM;
  let hi = pct.hi * max.oneRM;
  const bodyweight = isBodyweight(slot.ex);
  if (bodyweight) {
    lo -= BODYWEIGHT_KG;
    hi -= BODYWEIGHT_KG;
  }
  return { lo, hi, bodyweight };
}

function formatLoad(load) {
  if (!load) return null;
  const lo = roundKg(load.lo);
  const hi = roundKg(load.hi);
  if (load.bodyweight && hi <= 0) return "bodyweight";
  const sign = load.bodyweight ? "+" : "";
  const body = lo === hi ? `${hi}` : `${Math.max(lo, 0)}–${hi}`;
  return `${sign}${body} kg`;
}

function formatPctBand(slot) {
  const pct = scaledPct(slot);
  // An accessory carries no band on purpose: it's run to the rep target, not
  // to a percentage. That's a different thing from a band the log can't price.
  if (!pct) return isBodyweight(slot.ex) ? "bodyweight" : "by feel";
  const lo = Math.round(pct.lo * 100);
  const hi = Math.round(pct.hi * 100);
  const band = lo === hi ? `${hi}%` : `${lo}–${hi}%`;
  return slot.ref ? `${band} of ${slot.ref}` : band;
}

// ---------- focus ----------

// What a slot counts as in the day strip and the week grid. See
// ACCESSORY_GROUP above for why there are two taxonomies rather than one.
function focusOf(slot) {
  if (slot.group && slot.group !== ACCESSORY_GROUP) return slot.group;
  const pattern = movementPatternFor(state.dict[slot.ex]);
  return pattern ? MOVEMENT_PATTERN_LABELS[pattern] : ACCESSORY_GROUP;
}

// One entry per movement the day actually trains, carrying the hardest load
// that movement is asked for and what it costs. A day that squats twice —
// heavy front squat and a light pause squat — reads as one Squat focus at
// heavy, because that is what the day does to the legs.
function dayFocuses(day) {
  const byFocus = new Map();
  for (const slot of day.slots || []) {
    const key = focusOf(slot);
    const entry = byFocus.get(key) || { focus: key, load: slot.load, sets: 0, wfu: 0, exercises: [] };
    if ((LOAD_RANK[slot.load] ?? 9) < (LOAD_RANK[entry.load] ?? 9)) entry.load = slot.load;
    entry.sets += scaledSets(slot);
    entry.wfu += slotFatigue(slot);
    entry.exercises.push(slot.ex);
    byFocus.set(key, entry);
  }
  if (day.cardio) {
    byFocus.set(CARDIO_FOCUS, {
      focus: CARDIO_FOCUS,
      load: day.cardio.load || "light",
      sets: 0,
      wfu: 0,
      exercises: [day.cardio.activity || "Cardio"],
      cardio: true,
      optional: Boolean(day.cardio.optional),
    });
  }
  // Hardest first, then most expensive: the heavy work is what the day is
  // for, and it should be the first thing read off the strip.
  return [...byFocus.values()].sort(
    (a, b) => (LOAD_RANK[a.load] ?? 9) - (LOAD_RANK[b.load] ?? 9) || b.wfu - a.wfu
  );
}

// ---------- fatigue accounting ----------
// Same weighted fatigue units the Volume page reports, so the plan's cost and
// the log's cost are the same number and can be compared directly.

function slotFatigue(slot) {
  return scaledSets(slot) * fatigueMultiplier(slot.ex, nameOf(slot.ex));
}

function dayTotals(day) {
  let sets = 0;
  let wfu = 0;
  for (const slot of day.slots || []) {
    sets += scaledSets(slot);
    wfu += slotFatigue(slot);
  }
  return { sets, wfu };
}

function weekTotals() {
  let sets = 0;
  let wfu = 0;
  let liftDays = 0;
  let cardio = 0;
  let cardioOptional = 0;
  for (const day of state.plan.days) {
    const totals = dayTotals(day);
    sets += totals.sets;
    wfu += totals.wfu;
    if (totals.sets > 0) liftDays += 1;
    if (day.cardio) {
      if (day.cardio.optional) cardioOptional += 1;
      else cardio += 1;
    }
  }
  return { sets, wfu, liftDays, cardio, cardioOptional };
}

// ---------- data ----------

async function loadDictionary() {
  const res = await fetch("/api/dictionary");
  const entries = await res.json();
  registerDictionary(entries);
  state.names = Object.fromEntries(entries.map((e) => [e.abbreviation, e.full_name || ""]));
  state.dict = Object.fromEntries(entries.map((e) => [e.abbreviation, e]));
  return entries;
}

// Best estimated 1RM for one exercise, over the whole log or the trailing
// window, whichever the "Maxes from" control asks for. Falls back to the
// all-time best when the recent window is empty, so a lift that hasn't come
// up lately still gets a number rather than a dash.
async function loadMax(abbrev) {
  let data;
  try {
    const res = await fetch(`/api/exercises/${encodeURIComponent(abbrev)}/history`);
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;
  }
  if (!data || !data.history || data.timesLogged === 0) return null;

  const cutoff = state.basis === "recent" ? daysAgoDate(RECENT_WINDOW_DAYS) : null;
  let best = null;
  let bestRecent = null;
  for (const h of data.history) {
    const top = topScorableSetOf(h.sets, data.abbreviation, data.fullName);
    if (!top) continue;
    const entry = { oneRM: top.oneRM, date: h.date, set: top };
    if (!best || top.oneRM > best.oneRM) best = entry;
    const when = parseDateParts(h.date);
    if (cutoff && when && when >= cutoff && (!bestRecent || top.oneRM > bestRecent.oneRM)) {
      bestRecent = entry;
    }
  }
  const chosen = bestRecent || best;
  if (!chosen) return null;
  return { ...chosen, stale: Boolean(cutoff && !bestRecent) };
}

async function loadMaxes() {
  const wanted = referencedExercises();
  const results = await Promise.all(wanted.map((ex) => loadMax(ex)));
  state.maxes = Object.fromEntries(wanted.map((ex, i) => [ex, results[i]]));
}

// What the log actually says the last four weeks cost, for the plan to be
// read against. Uses the Volume endpoint's per-day set counts rather than
// re-walking every set.
async function loadActualLoad() {
  try {
    const res = await fetch("/api/volume");
    const rows = await res.json();
    const cutoff = daysAgoDate(ACTUAL_WINDOW_DAYS);
    let wfu = 0;
    const days = new Set();
    for (const row of rows) {
      const when = parseDateParts(row.date);
      if (!when || when < cutoff) continue;
      const tier = row.fatigueTier || classifyFatigueTier(row.exercise, row.exerciseName);
      const units = row.setCount * fatigueMultiplier(row.exercise, row.exerciseName, tier);
      wfu += units;
      if (units > 0) days.add(row.date);
    }
    const weeks = ACTUAL_WINDOW_DAYS / 7;
    state.actualWfuPerWeek = wfu / weeks;
    state.actualDaysPerWeek = days.size / weeks;
  } catch {
    state.actualWfuPerWeek = null;
    state.actualDaysPerWeek = null;
  }
}

// ---------- rendering ----------

function setStatus(text, kind) {
  const el = $("#plan-status");
  el.textContent = text || "";
  el.className = kind ? `status ${kind}` : "status";
}

function renderDirtyFlag() {
  $("#plan-dirty").textContent = state.customized ? "customized" : "";
}

function renderChips() {
  for (const btn of document.querySelectorAll(".week-btn")) {
    btn.classList.toggle("chip-active", btn.dataset.week === state.weekType);
  }
  for (const btn of document.querySelectorAll(".basis-btn")) {
    btn.classList.toggle("chip-active", btn.dataset.basis === state.basis);
  }
  $("#edit-toggle").classList.toggle("chip-active", state.editing);
  $("#edit-toggle").textContent = state.editing ? "Done customizing" : "Customize";
  $("#week-note").textContent = weekType().note;
}

function renderStats() {
  const totals = weekTotals();
  const actual = state.actualWfuPerWeek;
  const tiles = [
    { value: String(totals.liftDays), label: "lifting days" },
    { value: String(totals.sets), label: "working sets" },
    { value: round1(totals.wfu).toString(), label: "fatigue units", detail: WFU_EXPLAINER_SHORT },
    {
      value: actual === null ? "—" : round1(actual).toString(),
      label: "your recent average",
      detail: actual === null ? "" : `weighted fatigue units/week, last ${ACTUAL_WINDOW_DAYS} days`,
    },
    {
      value: String(totals.cardio),
      label: "runs / hikes",
      detail: totals.cardioOptional ? `+${totals.cardioOptional} optional` : "",
    },
  ];
  $("#week-stats").innerHTML = tiles
    .map(
      (t) => `<div class="stat">
        <span class="stat-value">${escapeHtml(t.value)}</span>
        <span class="stat-label">${escapeHtml(t.label)}</span>
        <span class="stat-detail">${escapeHtml(t.detail || "")}</span>
      </div>`
    )
    .join("");

  const note = $("#week-stats-note");
  if (state.actualWfuPerWeek === null) {
    note.textContent = WFU_EXPLAINER;
    return;
  }
  const planned = weekTotals().wfu;
  const ratio = planned / state.actualWfuPerWeek;
  let verdict;
  if (ratio > 1.25) {
    verdict =
      `This week plans about ${Math.round((ratio - 1) * 100)}% more load than you've averaged over the ` +
      `last ${ACTUAL_WINDOW_DAYS} days. That's a real jump — run it as a Medium or Light week first, ` +
      `or cut a set off the accessories.`;
  } else if (ratio < 0.75) {
    verdict =
      `This week plans about ${Math.round((1 - ratio) * 100)}% less load than your recent average, ` +
      `which is what a Light or Deload week is for. Move up a week type if you're not recovering from something.`;
  } else {
    verdict =
      `That's within ${Math.round(Math.abs(ratio - 1) * 100)}% of your recent average — a load you're ` +
      `already absorbing, redistributed across the week.`;
  }
  note.textContent = `${verdict} ${WFU_EXPLAINER}`;
}

function loadBadge(load) {
  if (!load) return "";
  return `<span class="load-badge load-${escapeHtml(load)}">${escapeHtml(LOAD_LABELS[load] || load)}</span>`;
}

function maxNote(slot) {
  const key = slot.ref || slot.ex;
  const max = state.maxes[key];
  if (!scaledPct(slot)) return "";
  if (!max) return `no logged 1RM for ${escapeHtml(key)}`;
  const bodyweight = isBodyweight(key);
  const shown = bodyweight ? `+${roundKg(max.oneRM - BODYWEIGHT_KG)} kg` : formatKg(max.oneRM);
  const basis = `${escapeHtml(key)} ≈ ${escapeHtml(shown)} est. 1RM (${escapeHtml(formatShortDate(max.date))})`;
  return max.stale ? `${basis}, older than ${RECENT_WINDOW_DAYS} days` : basis;
}

function slotRowRead(slot) {
  const load = prescribedLoad(slot);
  const weight = formatLoad(load);
  const detail = [maxNote(slot), slot.rest ? `rest ${slot.rest}` : "", slot.note || ""]
    .filter(Boolean)
    .join(" · ");
  return `<tr>
    <td class="plan-col-name">
      <a class="exercise-link" href="/lapse.html?exercise=${encodeURIComponent(slot.ex)}">${escapeHtml(labelOf(slot.ex))}</a>
      ${loadBadge(slot.load)}
      <div class="plan-slot-note">${escapeHtml(detail)}</div>
    </td>
    <td class="plan-col-num">${scaledSets(slot)} × ${escapeHtml(String(slot.reps))}</td>
    <td class="plan-col-num">${escapeHtml(formatPctBand(slot))}</td>
    <td class="plan-col-num plan-weight">${
      weight ? escapeHtml(weight) : scaledPct(slot) ? "—" : ""
    }</td>
  </tr>`;
}

function slotRowEdit(slot, dayIndex, slotIndex) {
  const at = `data-day="${dayIndex}" data-slot="${slotIndex}"`;
  return `<tr class="plan-edit-row">
    <td>
      <input type="text" class="plan-ex" list="weekly-exercise-options" ${at} data-field="ex"
             value="${escapeHtml(slot.ex)}" aria-label="Exercise" />
      <select class="plan-load" ${at} data-field="load" aria-label="Load level">
        ${LOAD_ORDER.map(
          (l) => `<option value="${l}"${l === slot.load ? " selected" : ""}>${LOAD_LABELS[l]}</option>`
        ).join("")}
      </select>
      <input type="text" class="plan-group" ${at} data-field="group"
             value="${escapeHtml(slot.group || "")}" placeholder="group" aria-label="Group" />
      <input type="text" class="plan-note" ${at} data-field="note"
             value="${escapeHtml(slot.note || "")}" placeholder="note" aria-label="Note" />
    </td>
    <td class="plan-col-num">
      <input type="number" class="plan-num" min="1" max="20" ${at} data-field="sets"
             value="${slot.sets}" aria-label="Sets" />
      <span class="muted">×</span>
      <input type="number" class="plan-num" min="1" max="50" ${at} data-field="reps"
             value="${slot.reps}" aria-label="Reps" />
    </td>
    <td class="plan-col-num">
      <input type="number" class="plan-num" min="0" max="150" step="1" ${at} data-field="pctLo"
             value="${Math.round((slot.pctLo || 0) * 100)}" aria-label="Lower intensity percent" />
      <span class="muted">–</span>
      <input type="number" class="plan-num" min="0" max="150" step="1" ${at} data-field="pctHi"
             value="${Math.round((slot.pctHi || 0) * 100)}" aria-label="Upper intensity percent" />
      <input type="text" class="plan-ref" list="weekly-exercise-options" ${at} data-field="ref"
             value="${escapeHtml(slot.ref || "")}" placeholder="% of" aria-label="Percent of which lift" />
    </td>
    <td class="plan-col-num">
      <input type="text" class="plan-rest" ${at} data-field="rest"
             value="${escapeHtml(slot.rest || "")}" placeholder="rest" aria-label="Rest" />
      <button type="button" class="chip plan-remove" ${at}>Remove</button>
    </td>
  </tr>`;
}

function cardioBlock(day, dayIndex) {
  if (!day.cardio && !state.editing) return "";
  if (!day.cardio) {
    return `<div class="plan-cardio">
      <button type="button" class="chip plan-add-cardio" data-day="${dayIndex}">Add a run / hike</button>
    </div>`;
  }
  const c = day.cardio;
  if (state.editing) {
    const at = `data-day="${dayIndex}"`;
    return `<div class="plan-cardio">
      <input type="text" class="plan-cardio-field" ${at} data-cardio="activity" value="${escapeHtml(c.activity || "")}" placeholder="Run / Hike" aria-label="Activity" />
      <input type="text" class="plan-cardio-field" ${at} data-cardio="detail" value="${escapeHtml(c.detail || "")}" placeholder="30-40 min easy" aria-label="Detail" />
      <input type="text" class="plan-cardio-field plan-cardio-note" ${at} data-cardio="note" value="${escapeHtml(c.note || "")}" placeholder="note" aria-label="Cardio note" />
      <label class="plan-optional"><input type="checkbox" ${at} data-cardio="optional"${c.optional ? " checked" : ""} /> optional</label>
      <button type="button" class="chip plan-remove-cardio" ${at}>Remove</button>
    </div>`;
  }
  const bits = [escapeHtml(c.detail || "")];
  if (c.optional) bits.push("optional");
  return `<div class="plan-cardio">
    <span class="plan-cardio-activity">${escapeHtml(c.activity || "Cardio")}</span>
    ${loadBadge(c.load)}
    <span class="muted">${bits.filter(Boolean).join(" · ")}</span>
    ${c.note ? `<div class="plan-slot-note">${escapeHtml(c.note)}</div>` : ""}
  </div>`;
}

// The day's headline: which movements it trains and how hard. Read before the
// exercise table, and often instead of it — on the way to the gym the useful
// question is "what is today", not "what is set three".
function focusStrip(day) {
  const focuses = dayFocuses(day);
  if (!focuses.length) return "";
  return `<div class="plan-focus-strip">${focuses
    .map((f) => {
      const detail = f.cardio
        ? escapeHtml(f.exercises.join(", ")) + (f.optional ? " · optional" : "")
        : `${f.sets} ${f.sets === 1 ? "set" : "sets"} · ${escapeHtml(f.exercises.join(", "))}`;
      return `<span class="plan-focus load-${escapeHtml(f.load)}${f.cardio ? " plan-focus-cardio" : ""}"
                    title="${escapeHtml(f.focus)} — ${escapeHtml(LOAD_LABELS[f.load] || f.load)} — ${detail}">
        <span class="plan-focus-name">${escapeHtml(f.focus)}</span>
        <span class="plan-focus-load">${escapeHtml(LOAD_LABELS[f.load] || f.load)}</span>
      </span>`;
    })
    .join("")}</div>`;
}

function renderDay(day, dayIndex) {
  const totals = dayTotals(day);
  const isRest = Boolean(day.rest) || (day.slots || []).length === 0;
  const meta = isRest
    ? "no lifting"
    : `${totals.sets} sets · ${round1(totals.wfu)} fatigue units`;

  const rows = (day.slots || [])
    .map((slot, i) => (state.editing ? slotRowEdit(slot, dayIndex, i) : slotRowRead(slot)))
    .join("");

  const table = rows
    ? `<table class="plan-table">
        <thead><tr><th>Exercise</th><th class="plan-col-num">Sets</th><th class="plan-col-num">Intensity</th><th class="plan-col-num">${
          state.editing ? "Rest" : "Weight"
        }</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
    : "";

  const editControls = state.editing
    ? `<div class="plan-day-actions">
        <button type="button" class="chip plan-add-slot" data-day="${dayIndex}">Add an exercise</button>
        <button type="button" class="chip plan-toggle-rest" data-day="${dayIndex}">${
          day.rest ? "Make a training day" : "Make a rest day"
        }</button>
        <button type="button" class="chip plan-remove-day" data-day="${dayIndex}">Remove day</button>
      </div>`
    : "";

  return `<section class="card plan-day${isRest ? " plan-day-rest" : ""}">
    <div class="plan-day-head">
      <h2 class="plan-day-name">${escapeHtml(day.name)}</h2>
      <span class="plan-day-title">${escapeHtml(day.title || "")}</span>
      <span class="plan-day-meta">${escapeHtml(meta)}</span>
    </div>
    ${focusStrip(day)}
    ${day.note ? `<p class="muted plan-day-note">${escapeHtml(day.note)}</p>` : ""}
    ${table}
    ${cardioBlock(day, dayIndex)}
    ${editControls}
  </section>`;
}

function renderDays() {
  const html = state.plan.days.map((day, i) => renderDay(day, i)).join("");
  const addDay = state.editing
    ? `<section class="card"><button type="button" class="chip" id="plan-add-day">Add a day</button></section>`
    : "";
  $("#week-days").innerHTML = html + addDay;
}

// The week at a glance: one row per movement, one column per day, so where
// the heavy work sits — and how far apart two heavy exposures of the same
// pattern are — is a thing you see rather than a thing you count.
//
// Derived from the plan rather than written out, so a customised week is held
// to the same rule the default was built on: every goal movement gets a
// heavy, a medium and a light exposure, and a gap shows up as an empty cell.
function renderGrid() {
  const days = state.plan.days;
  const rows = new Map();

  const rowFor = (focus) => {
    if (!rows.has(focus)) rows.set(focus, { focus, cells: days.map(() => []), wfu: 0 });
    return rows.get(focus);
  };

  // Each abbreviation is coloured by its own slot's load rather than by the
  // day's headline for that focus: a day that squats heavy and pause-squats
  // light should show both, not average them into one mark.
  days.forEach((day, i) => {
    for (const slot of day.slots || []) {
      const row = rowFor(focusOf(slot));
      row.wfu += slotFatigue(slot);
      row.cells[i].push({ ex: slot.ex, load: slot.load });
    }
    if (day.cardio) {
      rowFor(CARDIO_FOCUS).cells[i].push({
        ex: day.cardio.activity || "Cardio",
        load: day.cardio.load || "light",
        optional: Boolean(day.cardio.optional),
      });
    }
  });

  const ordered = [...rows.values()].sort((a, b) => {
    const ai = FOCUS_ORDER.indexOf(a.focus);
    const bi = FOCUS_ORDER.indexOf(b.focus);
    if (ai !== bi) return (ai < 0 ? FOCUS_ORDER.length : ai) - (bi < 0 ? FOCUS_ORDER.length : bi);
    if (a.focus === CARDIO_FOCUS) return 1;
    if (b.focus === CARDIO_FOCUS) return -1;
    return b.wfu - a.wfu;
  });

  const table = $("#hml-grid");
  table.querySelector("thead").innerHTML = `<tr>
    <th>Movement</th>
    ${days
      .map((d) => {
        const resting = Boolean(d.rest) || !(d.slots || []).length;
        return `<th class="plan-grid-day${resting ? " plan-grid-day-rest" : ""}"${
          resting ? ' title="rest day"' : ""
        }>${escapeHtml(d.name.slice(0, 3))}</th>`;
      })
      .join("")}
  </tr>`;

  table.querySelector("tbody").innerHTML = ordered
    .map(
      (row) => `<tr>
        <td class="plan-grid-focus">${escapeHtml(row.focus)}</td>
        ${row.cells
          .map(
            (cell) =>
              `<td class="plan-grid-cell">${
                cell.length
                  ? cell
                      .map(
                        (c) =>
                          `<span class="plan-grid-mark load-${escapeHtml(c.load || "light")}${
                            c.optional ? " plan-grid-mark-optional" : ""
                          }"${c.optional ? ' title="optional"' : ""}>${escapeHtml(c.ex)}</span>`
                      )
                      .join("")
                  : ""
              }</td>`
          )
          .join("")}
      </tr>`
    )
    .join("");

  renderGridGaps(ordered);
}

// Names the goal movements missing one of the three exposures, because an
// empty cell is only obvious once you know which row was supposed to be full.
function renderGridGaps(ordered) {
  const gaps = [];
  for (const row of ordered) {
    if (!FOCUS_ORDER.includes(row.focus)) continue;
    const loads = new Set();
    for (const cell of row.cells) for (const c of cell) loads.add(c.load === "technique" ? "light" : c.load);
    const missing = ["heavy", "medium", "light"].filter((l) => !loads.has(l));
    if (missing.length) gaps.push(`${row.focus} has no ${missing.join(" or ")} day`);
  }
  const el = $("#grid-gaps");
  if (!el) return;
  el.textContent = gaps.length
    ? `Gaps: ${gaps.join("; ")}.`
    : "Every goal movement has a heavy, a medium and a light day.";
  el.className = gaps.length ? "status err" : "status ok";
}

function renderExerciseOptions() {
  let list = $("#weekly-exercise-options");
  if (!list) {
    list = document.createElement("datalist");
    list.id = "weekly-exercise-options";
    document.body.appendChild(list);
  }
  list.innerHTML = Object.keys(state.names)
    .sort()
    .map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(labelOf(a))}</option>`)
    .join("");
}

function render() {
  renderChips();
  renderStats();
  renderDays();
  renderGrid();
  renderDirtyFlag();
}

// ---------- editing ----------

function slotAt(dayIndex, slotIndex) {
  return state.plan.days[dayIndex]?.slots?.[slotIndex];
}

async function applyFieldChange(target) {
  const dayIndex = Number(target.dataset.day);
  const field = target.dataset.field;

  if (target.dataset.cardio) {
    const day = state.plan.days[dayIndex];
    if (!day.cardio) return;
    const key = target.dataset.cardio;
    day.cardio[key] = key === "optional" ? target.checked : target.value.trim();
    savePlan();
    render();
    return;
  }

  const slot = slotAt(dayIndex, Number(target.dataset.slot));
  if (!slot || !field) return;

  if (field === "sets" || field === "reps") {
    const n = Number(target.value);
    if (Number.isFinite(n) && n > 0) slot[field] = Math.round(n);
  } else if (field === "pctLo" || field === "pctHi") {
    const n = Number(target.value);
    slot[field] = Number.isFinite(n) ? n / 100 : 0;
    if (slot.pctLo > slot.pctHi) slot.pctLo = slot.pctHi;
  } else if (field === "ex" || field === "ref") {
    slot[field] = target.value.trim();
    if (field === "ref" && !slot.ref) delete slot.ref;
  } else {
    slot[field] = target.value.trim();
  }

  savePlan();
  // A new abbreviation may need a max fetched before it can show a weight.
  await loadMaxes();
  render();
}

function wireEvents() {
  for (const btn of document.querySelectorAll(".week-btn")) {
    btn.addEventListener("click", () => {
      state.weekType = btn.dataset.week;
      savePrefs();
      render();
    });
  }

  for (const btn of document.querySelectorAll(".basis-btn")) {
    btn.addEventListener("click", async () => {
      state.basis = btn.dataset.basis;
      savePrefs();
      renderChips();
      await loadMaxes();
      render();
    });
  }

  $("#edit-toggle").addEventListener("click", () => {
    state.editing = !state.editing;
    setStatus("");
    render();
  });

  $("#plan-reset").addEventListener("click", () => {
    if (!confirm("Throw away your edits and restore the default routine?")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored to remove; the in-memory reset below is what matters.
    }
    state.plan = clone(DEFAULT_PLAN);
    state.customized = false;
    setStatus("Restored the default routine.", "ok");
    loadMaxes().then(render);
  });

  $("#plan-export").addEventListener("click", async () => {
    const text = JSON.stringify(state.plan, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Plan copied to the clipboard as JSON.", "ok");
    } catch {
      // Clipboard access is denied outside a secure context — prompt() at
      // least puts the text somewhere it can be selected by hand.
      window.prompt("Copy this plan:", text);
    }
  });

  $("#plan-import").addEventListener("click", () => {
    const text = window.prompt("Paste a plan as JSON:");
    if (!text) return;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      setStatus("That isn't valid JSON.", "err");
      return;
    }
    if (!parsed || !Array.isArray(parsed.days)) {
      setStatus("A plan needs a `days` array.", "err");
      return;
    }
    parsed.version = DEFAULT_PLAN.version;
    state.plan = parsed;
    savePlan();
    setStatus("Plan replaced.", "ok");
    loadMaxes().then(render);
  });

  // Every editable control is rendered fresh on each pass, so the handlers
  // are delegated from the container rather than bound per element.
  const days = $("#week-days");

  days.addEventListener("change", (e) => {
    const target = e.target;
    if (target.dataset && (target.dataset.field || target.dataset.cardio)) applyFieldChange(target);
  });

  days.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const dayIndex = Number(btn.dataset.day);

    if (btn.classList.contains("plan-remove")) {
      state.plan.days[dayIndex].slots.splice(Number(btn.dataset.slot), 1);
      savePlan();
      render();
    } else if (btn.classList.contains("plan-add-slot")) {
      const day = state.plan.days[dayIndex];
      day.rest = false;
      (day.slots ||= []).push({ ex: "", group: "", load: "medium", sets: 3, reps: 5, pctLo: 0.7, pctHi: 0.8 });
      savePlan();
      render();
    } else if (btn.classList.contains("plan-toggle-rest")) {
      const day = state.plan.days[dayIndex];
      day.rest = !day.rest;
      if (day.rest) day.slots = [];
      savePlan();
      render();
    } else if (btn.classList.contains("plan-remove-day")) {
      state.plan.days.splice(dayIndex, 1);
      savePlan();
      render();
    } else if (btn.classList.contains("plan-add-cardio")) {
      state.plan.days[dayIndex].cardio = { activity: "Run", load: "light", detail: "30-40 min easy" };
      savePlan();
      render();
    } else if (btn.classList.contains("plan-remove-cardio")) {
      delete state.plan.days[dayIndex].cardio;
      savePlan();
      render();
    } else if (btn.id === "plan-add-day") {
      state.plan.days.push({ name: "New day", title: "", note: "", slots: [] });
      savePlan();
      render();
    }
  });
}

// ---------- boot ----------

const WFU_EXPLAINER_SHORT = "same units as the Volume page";

async function init() {
  loadPrefs();
  loadPlan();
  wireEvents();
  render();

  await loadDictionary();
  renderExerciseOptions();
  await Promise.all([loadMaxes(), loadActualLoad()]);
  render();
}

init();
