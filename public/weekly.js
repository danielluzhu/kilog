// Weekly routine planner.
//
// The page renders a plan object: days, each holding slots, each slot naming
// an exercise, a load level (heavy/medium/light/technique), sets, reps and an
// intensity band expressed as a percentage of an estimated 1RM. Rest is not
// prescribed: it is the lifter's to judge, and a number here would only be a
// guess dressed up as an instruction. The actual
// kilograms are never written down here — they are computed from the log, so
// the plan tracks the lifter instead of going stale the week after it's
// written.
//
// DEFAULT_PLAN below is the plan "Reset to default" restores. Edit it to
// change the shipped routine; edit the page itself (Customize) to change the
// copy saved in this browser.

// ---------- the default routine ----------
//
// Six training days and one rest day, built around two priorities:
//
//   Primary   snatch, clean & jerk — each gets a heavy day of its own, a
//             shared medium day on Friday, and a light technique dose on
//             Tuesday, Thursday and Saturday. The heavy days also close on
//             that lift's technique drills. Every technique session is the
//             full drill list for its lift (SNATCH_TECHNIQUE, CLEAN_TECHNIQUE).
//   Secondary weighted pull-up, weighted dip — one heavy day together on
//             Thursday, and light volume on Saturday.
//
// Snatch and front squat are heavy Monday, with the medium strict press after
// them, and clean & jerk Wednesday, with an easy Tuesday of technique, a light
// press, bodybuilding and core between them. Thursday is
// the heavy pull-up and dip — after the clean & jerk rather than the day
// before it, so tired triceps and grip never meet a heavy jerk. The row goes
// with it, after the pull-ups. Friday runs all three Olympic lifts at medium and finishes on
// the heavy back squat, Saturday is the two Olympic pulls, the bodyweight
// volume and the run, and Sunday is off.
//
// Tuesday and Thursday cost the legs little. Wednesday's pause front squat,
// Friday's back squat and Saturday's pulls and run are what they carry in the
// back half of the week, with the rest day straight after the pulls.
//
// The squat is the one movement carrying two heavy days (Monday's front
// squat, Friday's back squat) with the pause front squat medium between them
// on Wednesday. Two heavy squat days would normally cost the snatch and the
// clean & jerk their third exposure; the technique doses on Tuesday and
// Thursday are what buy it back, at a weight light enough not to show up in
// what the day costs. The three squat days land two days apart each and the
// weekend squats nothing, so the longest gap in the rotation is the one that
// runs into the rest day — Friday's back squat to Monday's front squat, a
// full three days.
//
// Every slot's `group` is what the week grid and the day strips are built
// from — two slots sharing a group are two exposures of the same movement.
// `ref` pegs a slot's percentages to a different lift, so the snatch high
// pull is prescribed off the snatch rather than off its own best pull.

// A technique session is a menu, not a list to work through: pick two or
// three of these and do two or three sets of each (MENUS.technique). The drills
// run pull to turnover to receiving to the squat out of it, and the
// percentages are of the competition lift, so they follow it as it moves.
const SNATCH_TECHNIQUE = [
  { ex: "MS", group: "Snatch", load: "technique", sets: 2, reps: 3, pctLo: 0.4, pctHi: 0.5, ref: "S",
    note: "Bar close, elbows high and out, punch through. No rebend." },
  { ex: "TS", group: "Snatch", load: "technique", sets: 2, reps: 3, pctLo: 0.4, pctHi: 0.55, ref: "S" },
  { ex: "DropSnatch", group: "Snatch", load: "technique", sets: 2, reps: 3, pctLo: 0.4, pctHi: 0.5, ref: "S" },
  { ex: "SB", group: "Snatch", load: "technique", sets: 2, reps: 2, pctLo: 0.55, pctHi: 0.7, ref: "S",
    note: "Drive under, don't press out." },
  { ex: "OHSQ", group: "Snatch", load: "technique", sets: 2, reps: 3, pctLo: 0.55, pctHi: 0.7, ref: "S",
    note: "Pause three seconds in the bottom on alternate sessions." },
];
const CLEAN_TECHNIQUE = [
  { ex: "FRM", group: "Clean & Jerk", load: "technique", sets: 2, reps: 1,
    note: "Lat, triceps and wrist stretches in the rack position, 30–60 s each." },
  { ex: "MC", group: "Clean & Jerk", load: "technique", sets: 2, reps: 3, pctLo: 0.4, pctHi: 0.5, ref: "CJ" },
  { ex: "TC", group: "Clean & Jerk", load: "technique", sets: 2, reps: 2, pctLo: 0.45, pctHi: 0.55, ref: "CJ" },
  { ex: "HHC", group: "Clean & Jerk", load: "technique", sets: 2, reps: 3, pctLo: 0.5, pctHi: 0.6, ref: "CJ",
    note: "Fast elbows, meet the bar in the rack. From the knee (hang clean) on alternate sessions." },
  { ex: "C+FSQ", group: "Clean & Jerk", load: "technique", sets: 2, reps: "1+2", pctLo: 0.55, pctHi: 0.65, ref: "CJ",
    note: "One clean, stand, then two front squats." },
];

// Core work is a menu too: three to five of these, two or three sets each,
// marked by how hard the movement is rather than by a percentage.
const CORE_WORK = [
  { ex: "DeadBug", group: "Core", menu: "core", level: "easy", load: "light", sets: 3, reps: "8/side",
    note: "Low back pinned to the floor the whole time." },
  { ex: "SidePlank", group: "Core", menu: "core", level: "moderate", load: "light", sets: 3, reps: "30–45 s/side" },
  { ex: "HollowHold", group: "Core", menu: "core", level: "moderate", load: "light", sets: 3, reps: "20–30 s",
    note: "The position the jerk and the snatch receive in." },
  { ex: "LL", group: "Core", menu: "core", level: "hard", load: "light", sets: 3, reps: 10,
    note: "Hanging, legs straight, no swing." },
  { ex: "AbWheel", group: "Core", menu: "core", level: "hard", load: "light", sets: 3, reps: 8,
    note: "Only as far out as the back stays flat." },
];

const DEFAULT_PLAN = {
  version: 1,
  days: [
    {
      name: "Monday",
      title: "Heavy snatch · heavy front squat · medium press · snatch technique",
      note: "Two heavy lifts on one day, in that order: the squat is the one that can afford to go second.",
      slots: [
        { ex: "S", group: "Snatch", load: "heavy", sets: 5, reps: 2, pctLo: 0.82, pctHi: 0.9,
          note: "Two misses at the same weight ends the exercise for the day." },
        { ex: "SHP", group: "Snatch", load: "medium", sets: 3, reps: 3, pctLo: 0.95, pctHi: 1.05, ref: "S",
          note: "Finish the extension; this is not a shrug." },
        { ex: "FSQ", group: "Squat", load: "heavy", sets: 4, reps: 2, pctLo: 0.85, pctHi: 0.9 },
        { ex: "SP", group: "Press", load: "medium", sets: 4, reps: 5, pctLo: 0.7, pctHi: 0.78,
          note: "Strict press. Here rather than Tuesday, so the shoulders get 48 hours before the jerk." },
        ...SNATCH_TECHNIQUE,
      ],
    },
    {
      name: "Tuesday",
      title: "Technique touch · light press · bodybuilding · core",
      note: "The easy day between the two heavy Olympic days: technique, a light press, bodybuilding and core — nothing taken near failure, nothing that leaves the arms, the back or the legs tired for Wednesday's clean & jerk.",
      slots: [
        ...SNATCH_TECHNIQUE,
        ...CLEAN_TECHNIQUE,
        { ex: "SP", group: "Press", load: "light", sets: 3, reps: 8, pctLo: 0.6, pctHi: 0.68,
          note: "Strict press, well short of failure — the jerk is tomorrow." },
        { ex: "BB", group: "Pulls", load: "light", sets: 3, reps: 12,
          note: "Pulling bodybuilding — curls, rear delts. Nothing to failure." },
        { ex: "BB", group: "Press", load: "light", sets: 3, reps: 12,
          note: "Pressing bodybuilding — side raises, triceps. Nothing to failure." },
        ...CORE_WORK,
      ],
    },
    {
      name: "Wednesday",
      title: "Heavy clean & jerk · pause front squat · clean technique",
      note: "If the cleans start suffering, the squat is what comes down, not the clean & jerk.",
      slots: [
        { ex: "CJ", group: "Clean & Jerk", load: "heavy", sets: 5, reps: 1, pctLo: 0.85, pctHi: 0.93,
          note: "Stop on the second miss." },
        { ex: "CHP", group: "Clean & Jerk", load: "medium", sets: 3, reps: 3, pctLo: 0.95, pctHi: 1.05, ref: "CJ" },
        { ex: "PFSQ", group: "Squat", load: "medium", sets: 4, reps: 3, pctLo: 0.72, pctHi: 0.8, ref: "FSQ",
          note: "Two seconds in the hole." },
        ...CLEAN_TECHNIQUE,
      ],
    },
    {
      name: "Thursday",
      title: "Technique touch · heavy pull-up + dip · row · press volume",
      note: "The secondary goals get their own hard day — after the heavy clean & jerk rather than in front of it, and on a day that costs the legs nothing before Friday's squat.",
      slots: [
        ...SNATCH_TECHNIQUE,
        ...CLEAN_TECHNIQUE,
        { ex: "PLU", group: "Pull-up", load: "heavy", sets: 4, reps: 3, pctLo: 0.88, pctHi: 0.93,
          note: "Dead hang to chin over the bar, no kip." },
        { ex: "D", group: "Dip", load: "heavy", sets: 4, reps: 3, pctLo: 0.88, pctHi: 0.93,
          note: "Full depth, controlled turnaround." },
        { ex: "BR", group: "Accessory", load: "medium", sets: 3, reps: 8, pctLo: 0.6, pctHi: 0.68,
          note: "After the pull-ups, so it never takes anything out of them." },
        { ex: "SP", group: "Press", load: "light", sets: 3, reps: 8, pctLo: 0.6, pctHi: 0.68,
          note: "Strict press." },
      ],
    },
    {
      name: "Friday",
      title: "Medium Olympic lifts · heavy back squat",
      note: "The last heavy day of the week: three lifts at a weight that can be made every rep, then the top set of squats.",
      slots: [
        { ex: "S", group: "Snatch", load: "medium", sets: 4, reps: 2, pctLo: 0.75, pctHi: 0.82,
          note: "Speed under the bar, not another top end." },
        { ex: "CJ", group: "Clean & Jerk", load: "medium", sets: 4, reps: 2, pctLo: 0.72, pctHi: 0.8,
          note: "Both halves, every rep." },
        { ex: "J", group: "Jerk", load: "medium", sets: 3, reps: 2, pctLo: 0.75, pctHi: 0.82, ref: "CJ",
          note: "From the rack. First thing to cut if the squat behind it is what's suffering." },
        { ex: "PP", group: "Press", load: "medium", sets: 3, reps: 3, pctLo: 0.75, pctHi: 0.82 },
        { ex: "SQ", group: "Squat", load: "heavy", sets: 5, reps: 3, pctLo: 0.8, pctHi: 0.87,
          note: "Back squat." },
      ],
    },
    {
      name: "Saturday",
      title: "Olympic technique · Olympic pulls · bodyweight volume · bodybuilding · run",
      note: "Nothing heavy — a technique touch on both lifts and the two Olympic pulls, then the volume and the isolation work the hard days had no room for, in front of the rest day.",
      slots: [
        ...SNATCH_TECHNIQUE,
        ...CLEAN_TECHNIQUE,
        { ex: "SDL", group: "Pulls", load: "medium", sets: 4, reps: 3, pctLo: 0.8, pctHi: 0.88 },
        { ex: "CDL", group: "Pulls", load: "medium", sets: 3, reps: 3, pctLo: 0.8, pctHi: 0.88 },
        { ex: "NPLU", group: "Pull-up", load: "light", sets: 3, reps: 10,
          note: "Neutral grip, bodyweight, two reps short of failure." },
        { ex: "D", group: "Dip", load: "light", sets: 3, reps: 10, pctLo: 0.55, pctHi: 0.62 },
        { ex: "BE", group: "Accessory", load: "light", sets: 3, reps: 10, note: "Unloaded." },
        { ex: "BB", group: "Pulls", load: "medium", sets: 3, reps: 12,
          note: "Pulling bodybuilding — curls, rows, rear delts, whatever's free." },
        { ex: "BB", group: "Press", load: "medium", sets: 3, reps: 12,
          note: "Pressing bodybuilding — triceps, flyes, raises, whatever's free." },
        { ex: "TCPD", group: "Accessory", load: "light", sets: 3, reps: 12 },
      ],
      cardio: { activity: "Run", load: "light", detail: "25-35 min easy" },
    },
    {
      name: "Sunday",
      rest: true,
      title: "Rest",
      note: "At the end of four straight days that ask something of the legs.",
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

// The movements the week exists to move. Only these are checked for coverage
// — an accessory is not owed a heavy day, and saying so about it every load
// would bury the one line that matters.
const GOAL_FOCUSES = ["Snatch", "Clean & Jerk", "Squat", "Pull-up", "Dip"];

// The grid is a coarser view than the day strips: it answers "where does this
// movement sit in the week", so it rows the week up by movement family rather
// than by lift, and a pattern row that only repeats what a named row already
// shows is left out.
//
// The pull-up sits with the other pulling (rows, deadlifts, the high pulls)
// and the dip with the other pressing. The jerk from the rack sits in the
// clean & jerk's row, inline with the lift it's half of. Push and Hinge are
// dropped outright: the pressing is already on the Press row, and the hinging
// on the Pulls and Squat rows — a second row of the same marks is noise, not
// information. Both still count everywhere else on the page.
const GRID_ROW_ALIASES = { "Pull-up": "Pulls", Dip: "Press", Jerk: "Clean & Jerk" };
// Exercises that train a lift (and count toward it) but are drawn in another
// row: the snatch and clean high pulls are pulls, whatever they're for.
const GRID_ROW_BY_EXERCISE = { SHP: "Pulls", CHP: "Pulls" };
const GRID_HIDDEN_FOCUSES = new Set(["Push", "Hinge"]);
const gridRowFor = (focus) => GRID_ROW_ALIASES[focus] || focus;
const GRID_TECHNIQUE_LABELS = { Snatch: "S", "Clean & Jerk": "CJ" };

// Grid row order: the goal movements lead, then the named support blocks,
// then everything else by how much of the week it takes up.
const FOCUS_ORDER = [...new Set([...GOAL_FOCUSES, "Jerk", "Press", "Pulls"].map(gridRowFor))];

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
  openMenus: new Set(), // "day:menu" keys whose menu block is open
  openDays: new Set(), // day indexes whose card is open
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

// Names for exercises the plan uses that the dictionary doesn't have yet —
// drills not logged so far, and "BB", a block of bodybuilding work filled
// with whatever isolation is on hand. A dictionary name always wins.
const PLAN_ONLY_NAMES = {
  BB: "Bodybuilding",
  MS: "Muscle Snatch",
  MC: "Muscle Clean",
  FRM: "Front Rack Mobility",
  DeadBug: "Dead Bug",
  HollowHold: "Hollow Hold",
  AbWheel: "Ab Wheel Rollout",
};

function nameOf(abbrev) {
  return state.names[abbrev] || PLAN_ONLY_NAMES[abbrev] || "";
}

function labelOf(abbrev) {
  return exerciseDisplayLabel(abbrev, nameOf(abbrev));
}

// Set counts scale with the week type, but never below one working set: a
// week type is meant to lighten an exercise, not delete it.
function scaledSets(slot) {
  return Math.max(1, Math.round(slot.sets * weekType().volume));
}

// Menus: blocks of options to pick from rather than lists to work through.
// Each is projected at the middle of its pick — technique two or three drills
// at two or three sets (six sets), core three to five exercises at two or
// three sets (ten) — and scaled by the week type like everything else.
const MENUS = {
  technique: { label: "Technique", pick: "2–3", sets: "2–3", projectedSets: 6 },
  core: { label: "Core", pick: "3–5", sets: "2–3", projectedSets: 10 },
};

function menuOf(slot) {
  if (slot.load === "technique") return "technique";
  return MENUS[slot.menu] ? slot.menu : null;
}

function menuBlockSets(menu) {
  return Math.max(1, Math.round(MENUS[menu].projectedSets * weekType().volume));
}

// The sets a slot is counted as in the day's totals. An option on a menu
// carries an even share of the block's projected sets rather than its own.
function countedSets(slot, day) {
  const menu = menuOf(slot);
  if (!menu) return scaledSets(slot);
  const options = (day.slots || []).filter((s) => menuOf(s) === menu).length;
  return menuBlockSets(menu) / options;
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
    entry.sets += countedSets(slot, day);
    entry.wfu += slotFatigue(slot, day);
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

function slotFatigue(slot, day) {
  return countedSets(slot, day) * fatigueMultiplier(slot.ex, nameOf(slot.ex));
}

function dayTotals(day) {
  let sets = 0;
  let wfu = 0;
  for (const slot of day.slots || []) {
    sets += countedSets(slot, day);
    wfu += slotFatigue(slot, day);
  }
  return { sets: Math.round(sets), wfu };
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
      const units =
        row.setCount *
        fatigueMultiplier(row.exercise, row.exerciseName, tier, row.fatigueMultiplier);
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
  note.title = WFU_EXPLAINER;
  if (state.actualWfuPerWeek === null) {
    note.textContent = "";
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
  note.textContent = verdict;
}

function loadBadge(load) {
  if (!load) return "";
  return `<span class="load-badge load-${escapeHtml(load)}">${escapeHtml(LOAD_LABELS[load] || load)}</span>`;
}

function levelBadge(level) {
  return `<span class="level-badge level-${escapeHtml(level)}">${escapeHtml(level)}</span>`;
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
  const detail = [maxNote(slot), slot.note || ""]
    .filter(Boolean)
    .join(" · ");
  return `<tr>
    <td class="plan-col-name">
      <a class="exercise-link" href="/lapse.html?exercise=${encodeURIComponent(slot.ex)}">${escapeHtml(
        menuOf(slot) === "core" ? nameOf(slot.ex) || slot.ex : labelOf(slot.ex)
      )}</a>
      ${slot.level ? levelBadge(slot.level) : loadBadge(slot.load)}
      <div class="plan-slot-note">${escapeHtml(detail)}</div>
    </td>
    <td class="plan-col-num">${
      menuOf(slot) ? MENUS[menuOf(slot)].sets : scaledSets(slot)
    } × ${escapeHtml(String(slot.reps))}</td>
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
      <input type="text" inputmode="numeric" class="plan-num" ${at} data-field="reps"
             value="${escapeHtml(String(slot.reps))}" aria-label="Reps" />
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

const PLAN_TABLE_HEAD = (weightLabel) =>
  `<thead><tr><th>Exercise</th><th class="plan-col-num">Sets</th><th class="plan-col-num">Intensity</th><th class="plan-col-num">${weightLabel}</th></tr></thead>`;

function editTable(day, dayIndex) {
  const rows = (day.slots || []).map((slot, i) => slotRowEdit(slot, dayIndex, i)).join("");
  return rows ? `<table class="plan-table">${PLAN_TABLE_HEAD("")}<tbody>${rows}</tbody></table>` : "";
}

// Each menu on the day — technique drills, core work — folds into one
// disclosure, placed where its first option sits in the session: these are
// the parts of a day read once and then picked from, and closed they still
// name every option.
function readTables(day, dayIndex) {
  const slots = day.slots || [];
  const parts = [];
  const placed = new Set();
  let pending = [];
  let headed = false;
  const flush = () => {
    if (!pending.length) return;
    parts.push(
      `<table class="plan-table">${headed ? "" : PLAN_TABLE_HEAD("Weight")}<tbody>${pending.join("")}</tbody></table>`
    );
    headed = true;
    pending = [];
  };
  for (const slot of slots) {
    const menu = menuOf(slot);
    if (!menu) {
      pending.push(slotRowRead(slot));
      continue;
    }
    if (placed.has(menu)) continue;
    placed.add(menu);
    flush();
    const options = slots.filter((s) => menuOf(s) === menu);
    const m = MENUS[menu];
    const key = `${dayIndex}:${menu}`;
    const open = state.openMenus.has(key) ? " open" : "";
    parts.push(`<details class="plan-menu plan-menu-${menu}" data-menu="${key}"${open}>
      <summary><span class="plan-menu-label">${escapeHtml(m.label)}</span>
        <span class="plan-menu-pick" title="Pick ${m.pick}, ${m.sets} sets each">pick ${m.pick} × ${m.sets} sets</span>
        <span class="plan-menu-list">${options
          // Drills read by their codes, as they're logged; core by name, since
          // most of it has no code worth knowing.
          .map((t) => escapeHtml(menu === "core" ? nameOf(t.ex) || t.ex : t.ex))
          .join(" · ")}</span>
        <span class="plan-menu-sets">~${menuBlockSets(menu)} sets</span></summary>
      <table class="plan-table"><tbody>${options.map(slotRowRead).join("")}</tbody></table>
    </details>`);
  }
  flush();
  return parts.join("");
}

function renderDay(day, dayIndex) {
  const totals = dayTotals(day);
  const isRest = Boolean(day.rest) || (day.slots || []).length === 0;
  const meta = isRest
    ? "no lifting"
    : `${totals.sets} sets · ${round1(totals.wfu)} fatigue units`;

  const table = state.editing ? editTable(day, dayIndex) : readTables(day, dayIndex);

  const editControls = state.editing
    ? `<div class="plan-day-actions">
        <button type="button" class="chip plan-add-slot" data-day="${dayIndex}">Add an exercise</button>
        <button type="button" class="chip plan-toggle-rest" data-day="${dayIndex}">${
          day.rest ? "Make a training day" : "Make a rest day"
        }</button>
        <button type="button" class="chip plan-remove-day" data-day="${dayIndex}">Remove day</button>
      </div>`
    : "";

  // Closed by default so the whole week fits a phone screen as seven
  // headlines: name, what the session is, what it costs and what it trains.
  // Customize opens every day — the editor is no use folded away.
  const open = state.editing || state.openDays.has(dayIndex) ? " open" : "";
  return `<details class="card plan-day${isRest ? " plan-day-rest" : ""}" data-day="${dayIndex}"${open}>
    <summary>
      <div class="plan-day-head">
        <h2 class="plan-day-name">${escapeHtml(day.name)}</h2>
        <span class="plan-day-title">${escapeHtml(day.title || "")}</span>
        <span class="plan-day-meta">${escapeHtml(meta)}</span>
        <span class="plan-day-chevron" aria-hidden="true">\u203A</span>
      </div>
      ${focusStrip(day)}
    </summary>
    ${day.note ? `<p class="muted plan-day-note">${escapeHtml(day.note)}</p>` : ""}
    ${table}
    ${cardioBlock(day, dayIndex)}
    ${editControls}
  </details>`;
}

// "toggle" doesn't bubble, so it's caught on the way down.
document.addEventListener(
  "toggle",
  (evt) => {
    const el = evt.target;
    if (!el.classList) return;
    let set = null;
    let key = null;
    if (el.classList.contains("plan-menu")) {
      set = state.openMenus;
      key = el.dataset.menu;
    } else if (el.classList.contains("plan-day") && !state.editing) {
      set = state.openDays;
      key = Number(el.dataset.day);
    }
    if (!set) return;
    if (el.open) set.add(key);
    else set.delete(key);
  },
  true
);

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
    if (!rows.has(focus)) rows.set(focus, { focus, cells: days.map(() => []), wfu: 0, sets: 0 });
    return rows.get(focus);
  };

  // Each abbreviation is coloured by its own slot's load rather than by the
  // day's headline for that focus: a day that squats heavy and pause-squats
  // light should show both, not average them into one mark.
  days.forEach((day, i) => {
    for (const slot of day.slots || []) {
      const focus = focusOf(slot);
      if (GRID_HIDDEN_FOCUSES.has(focus)) continue;
      const row = rowFor(GRID_ROW_BY_EXERCISE[slot.ex] || gridRowFor(focus));
      row.wfu += slotFatigue(slot, day);
      row.sets += countedSets(slot, day);
      // A menu is marked once for the day, as what it serves — a yellow S or
      // CJ for technique, "Core" for core work — rather than option by
      // option: the grid says where the work lands, the day card what it is.
      const menu = menuOf(slot);
      const menuLabel =
        menu === "technique" ? GRID_TECHNIQUE_LABELS[focus] : menu ? MENUS[menu].label : null;
      if (menuLabel) {
        if (!row.cells[i].some((c) => c.menu && c.ex === menuLabel)) {
          row.cells[i].push({ ex: menuLabel, load: slot.load, focus, menu: true });
        }
        continue;
      }
      row.cells[i].push({ ex: slot.ex, load: slot.load, focus });
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
    <th class="plan-grid-sets">Sets</th>
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
        <td class="plan-grid-sets">${Math.round(row.sets) || "—"}</td>
      </tr>`
    )
    .join("");

  // Projected sets for the week type picked above: per movement in the last
  // column, per day along the bottom, the week's total in the corner.
  let tfoot = table.querySelector("tfoot");
  if (!tfoot) tfoot = table.appendChild(document.createElement("tfoot"));
  const daySets = days.map((d) => (d.rest ? 0 : dayTotals(d).sets));
  tfoot.innerHTML = `<tr>
    <td class="plan-grid-focus">Sets</td>
    ${daySets.map((n) => `<td class="plan-grid-cell plan-grid-sets">${n || ""}</td>`).join("")}
    <td class="plan-grid-sets plan-grid-total">${daySets.reduce((a, b) => a + b, 0)}</td>
  </tr>`;

  renderGridGaps(ordered);
}

// How the week actually covers the goal movements. This is a description,
// not a verdict: a two-exposure snatch or a second heavy squat day can be a
// deliberate trade, and a red warning on every load would be the page
// arguing with a decision that has already been made. It states what the
// distribution is and leaves the judgement to the reader — the one case it
// calls a win is full heavy/medium/light coverage, because that is the rule
// the default was built on.
function renderGridGaps(ordered) {
  const notes = new Map();
  const note = (text, focus) => {
    if (!notes.has(text)) notes.set(text, []);
    notes.get(text).push(focus);
  };

  // Judged per goal lift, not per grid row: a row mixes a lift with the
  // accessories drawn beside it, and those don't cover for the lift.
  let checked = 0;
  for (const goal of GOAL_FOCUSES) {
    const days = state.plan.days.map((_, i) =>
      ordered.flatMap((row) => row.cells[i].filter((c) => c.focus === goal))
    );
    if (!days.some((cell) => cell.length)) continue;
    const row = { focus: goal, cells: days };
    checked += 1;
    // Technique work counts as the light exposure — it is the lightest thing
    // a lift is ever asked for, not a fourth category needing its own day.
    // Heavy is counted in days, not in marks: a day that squats heavy twice is
    // still one heavy day.
    const loads = [];
    let heavy = 0;
    for (const cell of row.cells) {
      const onTheDay = cell.map((c) => (c.load === "technique" ? "light" : c.load));
      if (onTheDay.includes("heavy")) heavy += 1;
      loads.push(...onTheDay);
    }
    if (heavy > 1) note(`${heavy} heavy days`, row.focus);
    const missing = ["heavy", "medium", "light"].filter((l) => !loads.includes(l));
    if (missing.length) note(`no ${missing.join(" or ")} day`, row.focus);
  }

  const el = $("#grid-gaps");
  if (!el) return;

  if (!checked) {
    el.textContent = "";
    el.className = "status";
    return;
  }
  if (!notes.size) {
    el.textContent = "Every goal movement has a heavy, a medium and a light day.";
    el.className = "status ok";
    return;
  }
  el.textContent = [...notes.entries()]
    .map(([text, focuses]) => `${listOf(focuses)}: ${text}`)
    .join(" · ");
  el.className = "status plan-coverage";
}

// "Snatch and Clean & Jerk", "Squat, Pull-up and Dip".
function listOf(names) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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

  if (field === "reps" && /^\s*\d+(\s*\+\s*\d+)+\s*$/.test(target.value)) {
    // A complex's reps, one count per lift: "1+2" is a clean then two squats.
    slot.reps = target.value.replace(/\s+/g, "");
  } else if (field === "sets" || field === "reps") {
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

  await loadFatigueRates();
  await loadDictionary();
  renderExerciseOptions();
  await Promise.all([loadMaxes(), loadActualLoad()]);
  render();
}

init();
