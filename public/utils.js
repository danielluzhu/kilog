// Shared helpers used across all four tabs. Loaded before each page's own
// script via a plain <script> tag (no build step / bundler in this app).

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function parseDateParts(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDate(iso, opts) {
  const d = parseDateParts(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, opts ?? { year: "numeric", month: "short", day: "numeric" });
}

function formatShortDate(iso) {
  return formatDate(iso, { month: "short", day: "numeric" });
}

// ---------- "today" ----------
// This log's day boundary is Pacific, not the browser's timezone and not UTC.
// A session finished at 6pm in Los Angeles belongs to that day whether the
// device is set to LA, London or UTC — where `new Date().toISOString()` calls
// it tomorrow from 5pm onwards, pre-filling the wrong date on the add form
// every evening. Everything that asks "what is today" goes through here.
//
// Stored dates carry no time of day, so this is only ever about which
// calendar day "now" falls on; displaying a stored date needs no timezone at
// all (parseDateParts builds it at local midnight and it renders as itself).
const APP_TIME_ZONE = "America/Los_Angeles";

// Intl gets the DST shift right, which hand-rolled offset arithmetic doesn't
// twice a year. Read part by part rather than trusting a locale to emit
// year-month-day in that order.
const APP_TZ_DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function todayIso() {
  const p = Object.fromEntries(
    APP_TZ_DATE_PARTS.formatToParts(new Date()).map((part) => [part.type, part.value])
  );
  return `${p.year}-${p.month}-${p.day}`;
}

// The current Pacific day as a Date at local midnight — the same shape
// parseDateParts() gives stored dates, so the two compare as whole days.
function todayDate() {
  return parseDateParts(todayIso());
}

// Start of a trailing window, counted in whole days back from today rather
// than from the current clock time: "last 90 days" means 90 calendar days,
// so it doesn't quietly shrink as the day goes on.
function daysAgoDate(days) {
  const d = todayDate();
  d.setDate(d.getDate() - days);
  return d;
}

// Start of the current calendar year. Unlike the trailing windows above,
// year-to-date is anchored to a date rather than a day count: it is a few
// days wide in January and nearly a full year wide in December, which is the
// whole reason to offer it alongside "last year".
function startOfYearIso() {
  return `${todayIso().slice(0, 4)}-01-01`;
}

function startOfYearDate() {
  return parseDateParts(startOfYearIso());
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Every weight in this app is kilograms (sets logged before 2025-04-15 were
// in lbs and were converted in place — see lib/units.ts). Weights are shown
// rounded to the nearest whole kg: sub-kg precision is noise here, and the
// legacy conversion left long decimals (225lb -> 102.1kg) that read as false
// precision.
function roundKg(n) {
  return Math.round(n);
}

function formatKg(n) {
  return `${roundKg(n)} kg`;
}

// Once an exercise has been named, the full name is how it should read —
// the abbreviation becomes a secondary note rather than the lead. Falls
// back to the abbreviation alone for anything not named yet.
function exerciseDisplayLabel(abbreviation, fullName) {
  return fullName ? `${fullName} (${abbreviation})` : abbreviation;
}

// Splits a blob of set values on either commas or whitespace — sets get
// typed/pasted with either delimiter depending on where the text came from
// (a comma-separated paste vs. a quick space-separated jot like "1 1" for a
// rep on each side of a one-arm pull-up), and both should split the same way.
function splitSetTokens(text) {
  return String(text)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

// The starting-weight prefix grammar — a kind letter ("s" sled, "b" bar), an
// optional explicit weight for it, then "+": "S+", "S25+", "B+", "B15+".
// One source of truth, so the tokenizer, the set counter and the scorer
// can't drift apart. What the prefixes MEAN, and what they weigh, lives in
// the starting-weight section further down.
const LOAD_PREFIX_PATTERN = "[sb]\\d*(?:\\.\\d+)?\\+";
const LOAD_PREFIX_RE = new RegExp(`^(?:${LOAD_PREFIX_PATTERN})`, "i");
const LOAD_PREFIX_PARTS_RE = /^([sb])(\d+(?:\.\d+)?)?\+/i;
const LOAD_PREFIX_LABELS = { s: "Sled", b: "Bar" };

// A weight×reps set as typed: "135x5", "60 x 3", "56x3/5", "52x8+2",
// optionally carrying a starting-weight prefix ("S+", "S25+", "B+").
// Trailing "?" (an unsure entry) is kept as part of the token rather than
// blocking the split.
const WEIGHTED_SET_TOKEN = new RegExp(
  `^(?:${LOAD_PREFIX_PATTERN})?\\d+(?:\\.\\d+)?\\s*x\\s*\\d+(?:[/+]\\d+)?\\??$`,
  "i"
);
// A set written without its own weight: a bare rep count, or a
// completed/attempted or bonus-rep pair. These inherit the previous set's
// weight (see resolveWeightCarryover).
const BARE_SET_TOKEN = /^\d+(?:\.\d+)?(?:[/+]\d+)?\??$/;

// One set field can end up holding several sets — typed that way out of
// habit ("135x5, 140x5, 145x3", the same shorthand the bulk importer takes)
// or pasted in from a spreadsheet row. Saved verbatim that becomes a single
// unparseable set, so it gets broken back apart into one value per set.
//
// Conservative on purpose: it only splits when every token is set-shaped AND
// at least one carries an explicit weight. That keeps packed bare reps as the
// one set they were logged as — "1 1" on a one-arm pull-up is a rep per side,
// not two sets — and leaves free text (run notes, malformed entries)
// completely alone.
function splitCombinedSetValue(text) {
  const value = String(text ?? "").trim();
  if (value === "") return [];

  // Commas win where present, so "135 x 5, 140 x 5" stays two sets rather
  // than six whitespace tokens.
  const tokens = value.includes(",")
    ? value.split(",").map((t) => t.trim()).filter((t) => t !== "")
    : splitSetTokens(value);

  if (tokens.length < 2) return [value];
  const allSetShaped = tokens.every((t) => WEIGHTED_SET_TOKEN.test(t) || BARE_SET_TOKEN.test(t));
  const anyWeighted = tokens.some((t) => WEIGHTED_SET_TOKEN.test(t));
  return allSetShaped && anyWeighted ? tokens : [value];
}

// Whether a logged set counts toward a set total. A set logged with zero
// completed reps is a miss — the bar was loaded and the attempt happened, but
// no rep landed — so it never counts. "93x0" is a miss; so is "75x0/3" (none
// of three attempts made), which is how the Olympic lifts log a failed
// triple. The row stays in the log either way: it's still a record of the
// attempt, it just doesn't inflate the day's set count.
//
// Reps are whatever follows the "x", so a 0 *weight* ("0x8" — bodyweight for
// eight) is untouched. Where a set carries a completed/attempted or bonus-rep
// pair, the first number is the completed one ("0/3" -> zero completed,
// "8+2" -> eight plus two). One field can hold several packed sets
// ("70.3x0/2, 61.2x1"), and one real rep anywhere in it keeps the whole row
// counted. Anything not rep-shaped (run/hike notes like "mile" or "7:30")
// is left counted, exactly as before — this rule only ever removes sets it
// can positively read as zero.
//
// Mirrored in lib/setCount.ts for the server — keep both copies in sync if
// this logic changes.
function countsAsSet(value) {
  const segments = String(value ?? "").split(",");
  for (const segment of segments) {
    const token = segment.trim().replace(LOAD_PREFIX_RE, "");
    if (token === "") continue;
    const weighted = token.match(/x\s*(.+)$/i);
    const repPart = weighted ? weighted[1] : token;
    const completed = repPart.match(/^\s*(\d+(?:\.\d+)?)/);
    if (!completed) return true; // free text — not a rep count to zero out
    if (parseFloat(completed[1]) > 0) return true;
  }
  return false;
}

function countSets(sets) {
  return (sets ?? []).filter(countsAsSet).length;
}

// ---------- cardio (runs & hikes) formatting ----------

// "1:32:05" or "45:20" -> seconds. Returns null if unparseable.
function parseDurationToSeconds(input) {
  const parts = String(input).trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => p === "" || isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (m >= 60 || s >= 60 || m < 0 || s < 0 || h < 0) return null;
  return h * 3600 + m * 60 + s;
}

// seconds -> "1:32:05" (omits the hours segment under an hour, e.g. "45:20").
function formatDuration(totalSeconds) {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Average pace as minutes:seconds per distance unit, e.g. "8:15/mi".
function formatPace(durationSeconds, distanceValue, distanceUnit) {
  if (!distanceValue) return null;
  const totalSec = Math.round(durationSeconds / distanceValue);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, "0");
  return `${m}:${ss}/${distanceUnit}`;
}

// Requires a clean "weight x reps" set with no extra notation (bonus reps
// like "1+3", fractions, etc. are left out rather than guessed at).
function parseSet(setValue) {
  const m = String(setValue).match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)\s*$/i);
  if (!m) return null;
  return { weight: parseFloat(m[1]), reps: parseInt(m[2], 10) };
}

// Epley is a linear extrapolation and only holds over low rep ranges; past
// about 10 reps it drifts from strength into muscular endurance and starts
// inventing maxes (a 40-rep bodyweight set would "prove" a 2.3x bodyweight
// single). Reps are therefore capped for scoring purposes: anything above 10
// is scored as 10. The set keeps its true rep count for display — only the
// estimate is clamped.
const MAX_SCORED_REPS = 10;

// Epley formula: 1RM = weight x (1 + reps/30). A single all-out rep IS the
// max, so reps === 1 skips the formula rather than slightly inflating it.
// 0 reps means the lift was attempted but not completed (a miss) — there's
// no successful rep to estimate a max from, so this returns null rather than
// crediting the attempted weight as if it had been lifted.
function epley1RM(weight, reps) {
  if (reps <= 0) return null;
  const scoredReps = Math.min(reps, MAX_SCORED_REPS);
  return scoredReps === 1 ? weight : weight * (1 + scoredReps / 30);
}

function weightForReps(oneRM, reps) {
  return reps <= 1 ? oneRM : oneRM / (1 + reps / 30);
}

// ---------- lift classification: category, compound vs. isolation, variation ----------
// Used to (a) decide which exercises get their top set highlighted with an
// estimated 1RM, (b) restrict Lapse to compound lifts, and (c) flag
// an exercise as a *variation* of its category (e.g. "Front Squat" is a squat
// variation; plain "Squat" is the base movement). The Exercise Dictionary
// full name is the primary signal for all three — fill one in to control
// exactly how an exercise is classified; a small set of very common
// abbreviations is the fallback for exercises that haven't been named yet.

// Every category here is a compound, multi-joint lift by definition. "words"
// are substrings matched against the lowercased full name to detect the
// category; "bare" lists the canonical unqualified name(s) of that movement
// (singular, no equipment/stance/style qualifier) — if the full name reduces
// to exactly one of those after normalizing case/punctuation/plurals, it's
// the base lift, not a variation.
const MAJOR_LIFT_CATEGORIES = [
  { key: "pullup", label: "Pull-up", words: ["pull up", "pull-up", "pullup"], bare: ["pull up"] },
  { key: "chinup", label: "Chin-up", words: ["chin up", "chin-up", "chinup"], bare: ["chin up"] },
  { key: "dip", label: "Dip", words: ["dip"], bare: ["dip"] },
  { key: "squat", label: "Squat", words: ["squat"], bare: ["squat"] },
  { key: "deadlift", label: "Deadlift", words: ["deadlift", "dead lift", "dead-lift"], bare: ["deadlift", "dead lift"] },
  { key: "clean", label: "Clean", words: ["clean"], bare: ["clean"] },
  { key: "jerk", label: "Jerk", words: ["jerk"], bare: ["jerk"] },
  { key: "snatch", label: "Snatch", words: ["snatch"], bare: ["snatch"] },
];
const MAJOR_LIFT_KEYS = new Set(MAJOR_LIFT_CATEGORIES.map((c) => c.key));

// Extends the same category approach to non-"major" compound movements —
// explicit isolation words (below) always win even if one of these also
// appears (e.g. "Calf Press" or "Incline Dumbbell Curl" should never count).
const COMPOUND_ONLY_CATEGORIES = [
  {
    key: "press", label: "Press",
    words: ["bench press", "overhead press", "shoulder press", "push press", "military press", "incline press", "decline press", "chest press", "leg press"],
    bare: ["bench press", "overhead press", "shoulder press", "press"],
  },
  { key: "row", label: "Row", words: ["row"], bare: ["row"] },
  { key: "lunge", label: "Lunge", words: ["lunge"], bare: ["lunge"] },
  { key: "thruster", label: "Thruster", words: ["thruster"], bare: ["thruster"] },
  { key: "hip thrust", label: "Hip Thrust", words: ["hip thrust"], bare: ["hip thrust"] },
  { key: "good morning", label: "Good Morning", words: ["good morning"], bare: ["good morning"] },
  // Matched by predicate rather than a word list: the spelling varies too much
  // ("Lat Pull Down", "Lat Pulldown", "Lateral Pull-down") to enumerate, and
  // the category has to beat the "pulldown" isolation keyword either way.
  { key: "pulldown", label: "Pulldown", test: (name) => isLatPulldown(name), words: [], bare: ["lat pull down", "lat pulldown"] },
];

const ALL_COMPOUND_CATEGORIES = [...MAJOR_LIFT_CATEGORIES, ...COMPOUND_ONLY_CATEGORIES];
const CATEGORY_LABELS = Object.fromEntries(ALL_COMPOUND_CATEGORIES.map((c) => [c.key, c.label]));

const CORE_ABBREV_MAJOR_LIFTS = {
  SQ: "squat", FSQ: "squat", BSQ: "squat", OHSQ: "squat", HSQ: "squat",
  DL: "deadlift", SDR: "deadlift", RDL: "deadlift", CDL: "deadlift", SDL: "deadlift",
  SN: "snatch",
  C: "clean", PC: "clean", CJ: "clean",
  J: "jerk", PJ: "jerk", SJ: "jerk",
  PLU: "pullup",
  CLU: "chinup",
};

const ISOLATION_KEYWORDS = [
  "curl", "extension", "fly", "flye", "raise", "pulldown", "pull down",
  "pushdown", "push down", "kickback", "shrug", "calf",
];

// "Pulldown" earns its place in that list because most pulldowns logged here
// are tricep work — but a LAT pulldown is a multi-joint vertical pull, the
// same movement as a pull-up with the load reversed, so it and every variant
// (single-arm, behind the head, machine, kneeling) is a compound lift. A
// tricep or straight-arm pulldown names no lat and stays isolation.
function isLatPulldown(name) {
  const text = String(name || "").toLowerCase();
  return /pull\s*-?\s*down/.test(text) && /\blat/.test(text);
}

// The isolation veto, in one place: an explicit isolation word ends the
// search for a compound category — unless it's one of the exceptions above,
// which are compound lifts that happen to contain an isolation word.
function namesIsolationWork(name) {
  const text = String(name || "").toLowerCase();
  if (!text) return false;
  if (isLatPulldown(text)) return false;
  return ISOLATION_KEYWORDS.some((w) => text.includes(w));
}

// Crude but effective for this vocabulary: lowercase, drop punctuation,
// collapse whitespace, strip a trailing plural "s" ("Squats" -> "squat",
// "Pull Ups" -> "pull up").
function normalizeLiftName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, "");
}

// Returns { key, label, isVariation } for the first matching category, or
// null if this exercise isn't a tracked compound lift at all.
function classifyLift(abbreviation, fullName) {
  const name = (fullName || "").toLowerCase();

  if (name) {
    const normalized = normalizeLiftName(fullName);
    for (const cat of ALL_COMPOUND_CATEGORIES) {
      if (cat.test ? cat.test(name) : cat.words.some((w) => name.includes(w))) {
        const isBare = cat.bare.some((b) => normalizeLiftName(b) === normalized);
        return { key: cat.key, label: cat.label, isVariation: !isBare };
      }
    }
  }

  // A name that plainly describes accessory work ends the search here. The
  // abbreviation fallback below reads two-letter codes as major lifts, and
  // without this it files "PC" (Preacher Curl) with the power cleans — which
  // then rates 39 sets of curls as Olympic work in the fatigue totals.
  if (namesIsolationWork(name)) return null;

  // No name yet (or name didn't match a category) — fall back to a small
  // list of well-known abbreviations. There's no full name to compare
  // against here, so base-vs-variation can't be determined; default to
  // "base" rather than guess.
  const tokens = String(abbreviation).toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  for (const t of tokens) {
    const key = CORE_ABBREV_MAJOR_LIFTS[t];
    if (key) return { key, label: CATEGORY_LABELS[key], isVariation: false };
  }
  return null;
}

// Returns a lift category string (e.g. "squat") or null if this isn't one of
// the tracked major lifts.
function classifyMajorLift(abbreviation, fullName) {
  const c = classifyLift(abbreviation, fullName);
  return c && MAJOR_LIFT_KEYS.has(c.key) ? c.key : null;
}

// Compound lifts (multi-joint, big muscle groups) vs. isolation/accessory work.
function isCompoundLift(abbreviation, fullName) {
  if (namesIsolationWork(fullName)) return false;
  return classifyLift(abbreviation, fullName) !== null;
}

// Human-readable badge text for the Exercise Dictionary's "Type" column,
// e.g. "Squat", "Squat variation", "Snatch variation". Returns null if this
// isn't a tracked compound lift.
function describeLiftCategory(abbreviation, fullName) {
  const c = classifyLift(abbreviation, fullName);
  if (!c) return null;
  return c.isVariation ? `${c.label} variation` : c.label;
}

// ---------- fatigue tier ----------
// Three tiers by rough systemic fatigue cost per set: Olympic-style
// "complex" lifts (technical, explosive, highest neural/systemic fatigue),
// other big "compound" lifts (squats, deadlifts, presses, pulls — still
// multi-joint but less technically taxing per rep), and "isolation" work
// (single muscle, lowest fatigue cost). Every exercise falls into exactly
// one tier — anything that isn't a recognized complex or compound lift
// defaults to isolation.
const COMPLEX_LIFT_KEYS = new Set(["snatch", "clean", "jerk"]);

// abbreviation -> tier, for exercises whose tier was set by hand. Populated
// from the dictionary API by each page via registerDictionary().
let FATIGUE_OVERRIDES = {};

// Conditioning. Checked first: a "row erg" or "bike sprint" is cardio, not
// the rowing or squatting the keywords would otherwise suggest.
const CARDIO_KEYWORDS = [
  "run", "jog", "sprint", "hike", "hiit", "erg", "bike", "cycling", "cycle",
  "swim", "elliptical", "jump rope", "skip rope", "stair", "treadmill",
  "conditioning", "row erg", "ski erg",
];

// Light Olympic-lift drills. These carry the name of a complex lift but are
// done at a fraction of the load to groove position and speed, so their
// systemic cost is nothing like a heavy snatch. Checked before the complex
// rule, or "tall snatch" is caught by "snatch".
const TECHNIQUE_KEYWORDS = [
  "snatch balance", "drop snatch", "tall snatch", "tall clean", "muscle snatch",
  "muscle clean", "press in squat", "snatch stretch", "position", "complex drill",
  "tempo", "pause snatch", "pause clean", "no foot", "no-foot", "from power",
];

// Keywords are matched as plain substrings against a full name, which is safe
// enough in prose ("Row Erg", "Bike Sprints"). An abbreviation is terser and
// far more collision-prone — "Crunch" contains "run" — so when it's all
// there is, each keyword has to start a word.
function abbreviationMentions(abbreviation, keywords) {
  const text = String(abbreviation || "").toLowerCase();
  return keywords.some((w) => new RegExp(`\\b${w}\\w*`).test(text));
}

// The tier this exercise's name and category imply, ignoring any override.
// The Exercise Dictionary shows this as the "Auto" option.
function autoFatigueTier(abbreviation, fullName) {
  const name = (fullName || "").toLowerCase();
  if (name && CARDIO_KEYWORDS.some((w) => name.includes(w))) return "cardio";
  if (name && TECHNIQUE_KEYWORDS.some((w) => name.includes(w))) return "technique";

  // Nothing named it, so the abbreviation is the only evidence: "Run",
  // "Run 1" and "Hike" are conditioning however little the entry says, and
  // reading them as accessory lifting put 148 sets of running into the
  // isolation tier.
  if (!name) {
    if (abbreviationMentions(abbreviation, CARDIO_KEYWORDS)) return "cardio";
    if (abbreviationMentions(abbreviation, TECHNIQUE_KEYWORDS)) return "technique";
  }

  const lift = classifyLift(abbreviation, fullName);
  if (lift && COMPLEX_LIFT_KEYS.has(lift.key)) return "complex";
  if (isCompoundLift(abbreviation, fullName)) return "compound";
  return "isolation";
}

// The tier actually in force: a value set by hand in the dictionary always
// wins. Overriding here rather than at each call site means the Log's day
// summaries, the Volume chart and Prilepin's table all honour it without
// having to thread the dictionary entry through.
function classifyFatigueTier(abbreviation, fullName) {
  const override = FATIGUE_OVERRIDES[abbreviation];
  if (override) return override;
  return autoFatigueTier(abbreviation, fullName);
}

// Stack/display order. Isolation deliberately sits between Compound and
// Technique: it's the one neutral-coloured tier, and keeping it there stops
// the warm hues (Complex red, Technique yellow) from landing next to each
// other in a stacked bar, where they're hard to tell apart in dark mode.
const FATIGUE_TIERS = ["complex", "compound", "isolation", "technique", "cardio"];

const FATIGUE_TIER_LABELS = {
  complex: "Complex",
  compound: "Compound",
  isolation: "Isolation",
  technique: "Technique",
  cardio: "Cardio",
};

// ---------- weighted fatigue units (WFU) ----------
// A set is not a set: a heavy clean & jerk costs the nervous system far more
// than a set of curls, so a raw set count flatters an accessory day and
// understates a weightlifting one. A WFU total weights every counted set by
// what it actually costs — sets x multiplier, summed — and is reported
// alongside the set count, never instead of it.
//
// The Olympic lifts are rated per lift rather than per tier: a clean & jerk
// is two maximal efforts inside one set (2.0), where a snatch, a clean or a
// jerk on its own is one (1.5) — pulls included, since they inherit their
// lift's classification. Everything else takes its tier's rate: heavy
// axially-loaded compounds are the 1.0 baseline, and isolation work is 0.4
// (the middle of its 0.3–0.5 band — minimal systemic and CNS cost).
//
// Technique drills take the 1.0 baseline: a tall-snatch primer is light, but
// it is still a set performed, and zeroing it made a technical session read as
// an empty day. Steady-state conditioning stays at 0 — a hike logged as "mile"
// isn't the kind of work this is measuring at all. Intervals are the exception
// to that, genuinely repeated hard efforts, and take the baseline too.
const FATIGUE_MULTIPLIERS = {
  cleanAndJerk: 2,
  olympic: 1.5,
  compound: 1,
  isolation: 0.4,
  technique: 1,
  intervals: 1,
  uncounted: 0,
};

const INTERVAL_KEYWORDS = ["interval", "hiit", "tabata", "fartlek", "sprint", "repeat"];

function isIntervalConditioning(abbreviation, fullName) {
  const text = `${fullName || ""} ${abbreviation || ""}`.toLowerCase();
  return INTERVAL_KEYWORDS.some((w) => text.includes(w));
}

// The full lift — both halves in one set. A name settles it where there is
// one ("Clean & Jerk", "Clean + Jerk"); without one the abbreviation has to
// spell out both halves ("C+J", "PC+PJ") or be the standard "CJ" shorthand.
// An unnamed abbreviation that does neither (e.g. "PCPJ") reads as whatever
// its dictionary entry says — name it to have it scored as the full lift.
function isCleanAndJerk(abbreviation, fullName) {
  const name = (fullName || "").toLowerCase();
  if (name) return name.includes("clean") && name.includes("jerk");
  const abbr = String(abbreviation || "").toUpperCase();
  const keys = new Set(
    abbr.split(/[^A-Z]+/).filter(Boolean).map((t) => CORE_ABBREV_MAJOR_LIFTS[t])
  );
  if (keys.has("clean") && keys.has("jerk")) return true;
  return /^[PH]?CJ$/.test(abbr);
}

// Olympic work the tier system reads as something else. Two shapes:
//
//   Pulls — a snatch or clean pull/deadlift lands in the Compound tier off
//   the word "deadlift", which is right for tiering but wrong for fatigue:
//   it's pulled from the floor at speed off the same setup as the lift.
//
//   Complexes — "Snatch + Overhead Squat", "Clean + Front Squat" tier as
//   whichever half the classifier matched first, but a complex built on an
//   Olympic lift costs what that lift costs.
//
// Technique drills are settled before this is ever consulted, so a light
// "Snatch Balance" primer can't be dragged up to the Olympic rate by it.
function isOlympicVariant(abbreviation, fullName) {
  const name = (fullName || "").toLowerCase();
  if (!name) return false;
  const olympic = /snatch|clean|jerk/.test(name);
  if (!olympic) return false;
  return /pull|deadlift|dead lift/.test(name) || name.includes("+");
}

// Fatigue cost of one counted set of this exercise. `tier` is an escape hatch
// for callers that already know it (the Volume page reads the dictionary's
// override off its own rows rather than through registerDictionary).
function fatigueMultiplier(abbreviation, fullName, tier = classifyFatigueTier(abbreviation, fullName)) {
  if (tier === "technique") return FATIGUE_MULTIPLIERS.technique;
  if (tier === "cardio") {
    return isIntervalConditioning(abbreviation, fullName)
      ? FATIGUE_MULTIPLIERS.intervals
      : FATIGUE_MULTIPLIERS.uncounted;
  }
  if (tier === "complex") {
    return isCleanAndJerk(abbreviation, fullName)
      ? FATIGUE_MULTIPLIERS.cleanAndJerk
      : FATIGUE_MULTIPLIERS.olympic;
  }
  if (isOlympicVariant(abbreviation, fullName)) return FATIGUE_MULTIPLIERS.olympic;
  if (tier === "compound") return FATIGUE_MULTIPLIERS.compound;
  return FATIGUE_MULTIPLIERS.isolation;
}

// A missed set produced no reps, so it produces no fatigue units either —
// the set count this multiplies is already the countsAsSet one.
function fatigueUnitsFor(sets, abbreviation, fullName) {
  return countSets(sets) * fatigueMultiplier(abbreviation, fullName);
}

// One decimal, but only where it says something: "12", not "12.0".
function formatFatigueUnits(units) {
  const rounded = Math.round(units * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// Shown wherever a WFU number appears, so the weighting is never a mystery
// number the reader has to take on faith.
const WFU_EXPLAINER =
  "Weighted fatigue units: counted sets x 2 (clean & jerk), x1.5 (snatch, clean, jerk, pulls), " +
  "x1 (compound, technique), x0.4 (isolation). Steady-state cardio doesn't score; intervals do, at x1.";

// ---------- Prilepin's table ----------
// Classic Soviet-weightlifting volume guidance by intensity. The first and
// last bands are open-ended in the original table ("<70%", "90%+") — 50%
// and 100% are used as practical floor/ceiling when converting a band into
// an actual weight range.
const PRILEPIN_ROWS = [
  { label: "<70%", pctMin: 0.5, pctMax: 0.7, repsPerSet: "3–6", optimalTotal: 24, rangeTotal: "18–30" },
  { label: "70–79%", pctMin: 0.7, pctMax: 0.8, repsPerSet: "3–6", optimalTotal: 18, rangeTotal: "12–24" },
  { label: "80–89%", pctMin: 0.8, pctMax: 0.9, repsPerSet: "2–4", optimalTotal: 15, rangeTotal: "10–20" },
  { label: "90%+", pctMin: 0.9, pctMax: 1.0, repsPerSet: "1–2", optimalTotal: 4, rangeTotal: "4–10" },
];

// ---------- equipment classification ----------
// Bodyweight, free weight (barbell/dumbbell/kettlebell), cable, or machine.
// Requires a dictionary full name — there's no reliable abbreviation
// fallback for equipment the way there is for lift category, so unnamed
// entries are simply unclassified (null) rather than guessed at.

const BODYWEIGHT_KEYWORDS = [
  "pull up", "pull-up", "pullup", "chin up", "chin-up", "chinup", "dip",
  "push up", "push-up", "pushup", "sit up", "sit-up", "situp", "plank",
  "muscle up", "muscle-up",
];
const CABLE_KEYWORDS = ["cable", "pulldown", "pull down", "pushdown", "push down", "face pull"];
const MACHINE_KEYWORDS = [
  "machine", "smith", "leg press", "hack squat", "leg curl", "leg extension",
  "pec deck", "hammer strength",
];
const FREE_WEIGHT_KEYWORDS = [
  "barbell", "dumbbell", "kettlebell", "trap bar", "ez bar", "ez-bar", "landmine", "plate",
];

// Lift categories that default to free weight (barbell) when the name gives
// no other equipment qualifier — restricted to movements that are
// overwhelmingly barbell by convention in this vocabulary (Olympic lifts,
// powerlifting lifts). "Press" and "row" are deliberately excluded: those
// vary too much by equipment (dumbbell, machine, cable) to guess.
const BARBELL_DEFAULT_LIFT_KEYS = new Set([
  "squat", "deadlift", "clean", "jerk", "snatch", "thruster", "good morning", "hip thrust",
]);

// Returns "bodyweight" | "free weight" | "cable" | "machine" | null.
function classifyEquipment(abbreviation, fullName) {
  const name = (fullName || "").toLowerCase();
  if (!name) return null;

  if (BODYWEIGHT_KEYWORDS.some((w) => name.includes(w))) return "bodyweight";
  if (CABLE_KEYWORDS.some((w) => name.includes(w))) return "cable";
  if (MACHINE_KEYWORDS.some((w) => name.includes(w))) return "machine";
  if (FREE_WEIGHT_KEYWORDS.some((w) => name.includes(w))) return "free weight";

  const lift = classifyLift(abbreviation, fullName);
  if (lift && BARBELL_DEFAULT_LIFT_KEYS.has(lift.key)) return "free weight";

  return null;
}

// ---------- movement pattern ----------
// Each exercise is bucketed by the movement it trains, not the muscle it
// happens to hit: Full (whole-body Olympic lifts), Push, Squat, Pulls, Hinge,
// plus Other for work that genuinely fits none of them (conditioning, calves).
//
// Rules are evaluated top to bottom and the first match wins, so ORDER
// MATTERS. The tricky cases, all load-bearing:
//   · "snatch deadlift" / "snatch pull" must hit Hinge before "snatch" sends
//     them to Full — they're hip-driven pulls off the floor.
//   · "clean & jerk" must hit Full before "jerk" sends it to Push.
//   · "rear delt fly" / "bent-over lateral raise" must hit Pulls before
//     "fly" / "lateral raise" send them to Push — those are posterior work.
//   · "tricep ... pulldown" must hit Push before "pulldown" sends it to Pulls.
//   · "leg curl" must hit Hinge before "curl" sends it to Pulls.
// Anything unmatched returns null and shows as unset rather than guessing.
const MOVEMENT_PATTERNS = ["full", "push", "squat", "pulls", "hinge", "leg", "core", "other"];

const MOVEMENT_PATTERN_LABELS = {
  full: "Full",
  push: "Push",
  squat: "Squat",
  pulls: "Pulls",
  hinge: "Hinge",
  leg: "Leg",
  core: "Core",
  other: "Other",
};

const MOVEMENT_PATTERN_RULES = [
  // Neither a lift pattern nor a muscle: conditioning and calf work.
  { pattern: "other", words: ["run", "jog", "sprint", "hike", "hiit", "erg", "bike", "cycling", "swim", "elliptical", "jump rope", "skip rope", "stair", "treadmill", "conditioning"] },
  // Hip-driven: deadlifts and their Olympic derivatives, plus hamstring and
  // low-back work. Ahead of Full so "snatch deadlift" lands here.
  { pattern: "hinge", words: ["deadlift", "dead lift", "snatch pull", "clean pull", "panda pull", "high pull", "pull through", "pull-through", "rdl", "romanian", "stiff leg", "stiff-leg", "good morning", "back extension", "hyperextension", "hip thrust", "glute bridge", "bridge", "swing"] },
  // Whole-body Olympic lifts. Ahead of Push so "clean & jerk" isn't a jerk.
  { pattern: "full", words: ["clean", "snatch"] },
  // Posterior shoulder work that would otherwise read as a press.
  { pattern: "pulls", words: ["rear delt", "delt fly", "face pull", "bent-over lateral raise", "bent over lateral raise", "bent-over raise"] },
  // Pressing, plus the shoulder and triceps work that trains alongside it.
  { pattern: "push", words: ["bench press", "chest press", "chest fly", "pec deck", "push up", "push-up", "pushup", "dip", "fly", "flye", "crossover", "incline press", "decline press", "shoulder press", "overhead press", "military press", "arnold", "push press", "pushpress", "ohp", "jerk", "handstand", "lateral raise", "lu raise", "front raise", "side raise", "delt raise", "tricep", "pushdown", "push down", "pressdown", "press down", "skull crusher", "skullcrusher", "close grip", "close-grip", "overhead extension", "jm press", "press in squat"] },
  // Trunk work. Every keyword here is qualified on purpose: a bare
  // "rotation" would swallow shoulder rotations, and a bare "ab" would take
  // "abduction" with it, so the rotations name their plane and "ab " keeps
  // its space.
  { pattern: "core", words: ["plank", "crunch", "sit up", "sit-up", "situp", "ab ", "abs", "ab wheel", "oblique", "russian twist", "cable twist", "torso twist", "trunk twist", "cable rotation", "torso rotation", "trunk rotation", "cross body rotation", "crossbody rotation", "pallof", "woodchop", "wood chop", "dead bug", "hollow", "l-sit", "leg raise", "knee raise", "toes to bar", "rollout", "side bend", "v-up"] },
  // Leg work that is neither a squat nor a hinge: knee flexion and
  // extension on their own, unilateral stepping, calves, and jumps. Ahead of
  // Pulls because "leg curl" has to beat the bare "curl" that lands there,
  // and after Other so "jump rope" stays conditioning.
  { pattern: "leg", words: ["leg curl", "lying curl", "seated curl", "nordic", "leg extension", "lunge", "step up", "step-up", "stepup", "calf", "glute kick", "kickback", "kick back", "abduction", "adduction", "box jump", "jump", "sled push"] },
  // Everything pulled toward the body.
  { pattern: "pulls", words: ["pull up", "pull-up", "pullup", "chin up", "chin-up", "chinup", "pulldown", "pull down", "pull-down", "lat ", "pullover", "pull over", "row", "muscle up", "muscle-up", "curl", "shrug"] },
  // Squat pattern proper: the bar (or the machine's pad) tracks over the
  // knees with the torso loaded. Leg press and wall sit belong here — same
  // pattern, different apparatus.
  { pattern: "squat", words: ["squat", "leg press", "thruster", "wall sit"] },
];

// Returns one of MOVEMENT_PATTERNS, or null when nothing matches confidently.
// A spelled-out abbreviation is a name in all but the field it's stored in:
// "SidePlank" and "CableRotation" describe themselves as well as any full
// name would, and 216 of the dictionary's entries have no name at all. Split
// on the case boundaries and read it as one.
//
// Only when it looks like prose: an all-caps code carries no words ("SB",
// "LPD"), and matching keywords inside one would be coincidence, not meaning.
function nameFromAbbreviation(abbreviation) {
  const a = String(abbreviation || "");
  if (a.length < 5 || !/[a-z]/.test(a) || !/^[A-Za-z]+$/.test(a)) return "";
  return a.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

// Anchored at the start of a word, not anywhere in the string: plain
// substring matching read "run" inside "crunch" and "row" inside "throw",
// filing a crunch under conditioning and a ball throw under pulls. The end
// stays unanchored so a keyword still covers its plurals — "dip" catches
// "dips", "row" catches "rows".
const patternWordCache = new Map();
function matchesPatternWord(name, word) {
  let re = patternWordCache.get(word);
  if (!re) {
    re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    patternWordCache.set(word, re);
  }
  return re.test(name);
}

function classifyMovementPattern(abbreviation, fullName) {
  const name = ((fullName || "").trim() || nameFromAbbreviation(abbreviation)).toLowerCase();
  if (!name) return null;
  for (const rule of MOVEMENT_PATTERN_RULES) {
    if (rule.words.some((w) => matchesPatternWord(name, w))) return rule.pattern;
  }
  return null;
}

// The pattern actually in force: a hand-assigned value always wins over the
// keyword guess. (`movement_pattern` on the dictionary entry.)
function movementPatternFor(entry) {
  if (entry?.movement_pattern) return entry.movement_pattern;
  return classifyMovementPattern(entry?.abbreviation, entry?.full_name);
}
// ---------- weight carry-over ----------
// Some rows shorthand a repeated weight: after an explicit "WxR" set, a
// later bare integer in the same row inherits that same weight as its rep
// count — e.g. "52x8, 9, 8, 5" means all four sets were at 52: "52x8, 52x9,
// 52x8, 52x5". Bare "A/B" and "A+B" pairs carry over the same way. A bare
// set with nothing yet to carry over from (the first set of the session has
// no weight designated) seeds at 0 — bodyweight, no added load — rather
// than being left unresolved.
//
// But under real external load, a bare number well above any plausible rep
// count (say, 130) is essentially never a rep count — it's almost always a
// NEW weight for a single rep, from a heavy-singles "ladder" common in
// Olympic lifting: "125x2, 130, 125, 100x4" means 2 reps at 125, a single at
// 130, a single back off at 125, then 4 reps at 100 — not "125kg for 130
// reps". This distinction doesn't apply with no load (0kg or nothing
// carried yet), where a high bare number is an ordinary rep count (e.g. a
// 100-rep bodyweight set).
//
// The Olympic lifts are the exception to all of the above: they're logged as
// a ladder of *weights*, each a single completed rep, so a bare number there
// is always a weight and never a rep count — "60, 61, 61, 61" is four
// singles at those loads, and "70, 60x3, 70x1/2" opens with a single at 70.
// Rep counts on these are always written explicitly with an "x". Without
// this the generic rule reads the leading bare number as a rep count against
// no carried weight and resolves it to "0x60", which then scores as nothing.
//
// Historical data has already been rewritten this way (see
// scripts/resolve-weight-carryover.ts) — this mirror stays here so newly
// logged workouts read correctly without another migration. Keep both
// copies in sync if this logic changes.
const MAX_PLAUSIBLE_REPS_UNDER_LOAD = 50;

function isSinglesLadderLift(abbreviation, fullName) {
  return classifyFatigueTier(abbreviation, fullName) === "complex";
}

function resolveWeightCarryover(sets, abbreviation, fullName) {
  const singlesLadder = isSinglesLadderLift(abbreviation, fullName);
  let lastWeight = null;
  return sets.map((raw) => {
    const value = String(raw).trim();
    const weighted = value.match(/^(\d+(?:\.\d+)?)\s*x/i);
    if (weighted) {
      lastWeight = weighted[1];
      return raw;
    }

    // Olympic lifts: a bare number is a weight lifted for one rep. Decimals
    // included — the lbs->kg conversion left plenty of them.
    if (singlesLadder) {
      const bareWeight = value.match(/^(\d+(?:\.\d+)?)$/);
      if (bareWeight) {
        lastWeight = bareWeight[1];
        return `${bareWeight[1]}x1`;
      }
    }

    const bareInt = value.match(/^(\d+)$/);
    if (bareInt) {
      // The first unweighted set of the session has nothing to carry over
      // from — it's bodyweight-only (0 added weight), not unknown.
      if (lastWeight === null) {
        lastWeight = "0";
        return `0x${value}`;
      }
      const reps = parseInt(bareInt[1], 10);
      const isUnderLoad = parseFloat(lastWeight) > 0;
      if (isUnderLoad && reps > MAX_PLAUSIBLE_REPS_UNDER_LOAD) {
        lastWeight = bareInt[1]; // treat as a new weight, implicitly 1 rep
        return `${bareInt[1]}x1`;
      }
      return `${lastWeight}x${value}`;
    }

    if (/^\d+\/\d+$/.test(value) || /^\d+\+\d+$/.test(value)) {
      if (lastWeight === null) lastWeight = "0";
      return `${lastWeight}x${value}`;
    }

    return raw;
  });
}

// ---------- single-arm vs. compound-lift "#/#" notation ----------
// For single-arm/unilateral exercises, "#/#" means left-arm/right-arm reps,
// not completed/attempted — there's no rule for combining the two sides into
// one score, so slash-suffixed sets are excluded from 1RM scoring for these
// rather than misread as an attempt ratio.
const SINGLE_ARM_KEYWORDS = ["single arm", "single-arm", "one arm", "1 arm"];
function isSingleArmExercise(abbreviation, fullName) {
  const name = (fullName || "").toLowerCase();
  return SINGLE_ARM_KEYWORDS.some((w) => name.includes(w));
}

// ---------- bodyweight load handling ----------
// For bodyweight movements, the number logged before "x" is *added* weight
// on top of bodyweight, not the total load — "52x3" means 52kg added for 3
// reps, and a bare rep count with no "x" at all (e.g. "6") means 6
// bodyweight-only reps. To estimate a real 1RM the total load lifted is
// bodyweight + added weight.
//
// BODYWEIGHT_KG is a flat placeholder (the user's actual bodyweight varies
// over time and hasn't been logged yet) — swap it for a real by-date lookup
// once that history is available.
const BODYWEIGHT_KG = 72;

// ---------- starting-weight load handling (S+ and B+) ----------
// Two kinds of equipment carry load of their own before anything is plated,
// and both are logged as a prefix on the set — the same idea as
// BODYWEIGHT_KG, just for a piece of equipment instead of a body:
//
//   S+  the sled/carriage of a machine (leg press, hack squat).
//       "S+61x12" is the sled plus 61kg for 12 reps.
//   B+  the barbell itself, for lifts logged by plate weight alone —
//       landmine work above all, where the bar is what's being held.
//       "B+30x8" is the bar plus 30kg of plates for 8 reps.
//
// A sled weight is a property of the machine, and machines differ, so it can
// be written into the set itself: "S25+61x12" is a 25kg carriage plus 61kg.
// Without a number the prefix falls back to the exercise's configured sled
// weight (exercise_dictionary.sled_weight_kg, editable in the Exercise
// Dictionary), and DEFAULT_SLED_WEIGHT_KG behind that. A bar is a bar, so B+
// takes a constant — though "B15+" is honoured if a lighter one gets used.
const DEFAULT_SLED_WEIGHT_KG = 20;
const BARBELL_WEIGHT_KG = 20;

// The grammar these are written in (LOAD_PREFIX_*) sits up with the set
// tokenizer, since that's the first thing to need it.

// abbreviation -> kg, populated from the dictionary API by each page via
// registerSledWeights(). Scoring runs in pure functions that only receive an
// abbreviation, so the lookup lives here rather than being threaded through
// every call site.
let SLED_WEIGHTS = {};

// Caches every per-exercise override the pure classifiers need. Call this
// whenever the dictionary is (re)loaded.
function registerDictionary(entries) {
  SLED_WEIGHTS = {};
  FATIGUE_OVERRIDES = {};
  for (const e of entries || []) {
    if (!e) continue;
    if (e.sled_weight_kg !== null && e.sled_weight_kg !== undefined) {
      SLED_WEIGHTS[e.abbreviation] = Number(e.sled_weight_kg);
    }
    if (e.fatigue_tier) FATIGUE_OVERRIDES[e.abbreviation] = e.fatigue_tier;
  }
}

function sledWeightFor(abbreviation) {
  const v = SLED_WEIGHTS[abbreviation];
  return Number.isFinite(v) ? v : DEFAULT_SLED_WEIGHT_KG;
}

// Pulls a leading "S+"/"B+" (with or without its own weight) off a raw set
// string. { kind, kg, rest } — `kind` is "s", "b" or null, `kg` is the
// explicitly written weight or null for "use the default", and `rest` is the
// same string with the prefix stripped, unchanged otherwise.
function splitLoadPrefix(raw) {
  const value = String(raw ?? "").trim();
  const m = value.match(LOAD_PREFIX_PARTS_RE);
  if (!m) return { kind: null, kg: null, rest: value };
  return {
    kind: m[1].toLowerCase(),
    kg: m[2] === undefined ? null : parseFloat(m[2]),
    rest: value.slice(m[0].length),
  };
}

// The inverse. An explicit weight is only written back out when there is one:
// a plain "S+" keeps meaning "whatever this exercise's sled weighs", so
// re-saving a set never freezes today's default into old data.
function combineLoadPrefix(kind, kg, rest) {
  if (!kind) return rest;
  const letter = kind.toUpperCase();
  return `${letter}${kg === null || kg === undefined || kg === "" ? "" : kg}+${rest}`;
}

// What a prefix actually adds, in kg: the weight written into the set if
// there is one, else the exercise's own sled weight, else the constant.
function startingWeightFor(kind, kg, abbreviation) {
  if (!kind) return 0;
  if (Number.isFinite(kg)) return kg;
  return kind === "s" ? sledWeightFor(abbreviation) : BARBELL_WEIGHT_KG;
}

// Renders a single raw set value as HTML with the starting-weight portion
// broken out into its own badge instead of showing the "S+"/"B+" text inline.
function renderSetLabel(raw, abbreviation) {
  const { kind, kg, rest } = splitLoadPrefix(raw);
  if (!kind) return escapeHtml(rest);
  // Spelled out as "Sled + 160x12" rather than the raw "S+160x12": the sled
  // (or bar) is a separate load added to what's plated, and the "+" says so.
  // A weight written into the set is shown, since it's the one case where
  // the badge would otherwise hide a number the user chose deliberately.
  const resolved = startingWeightFor(kind, kg, abbreviation);
  const label = LOAD_PREFIX_LABELS[kind];
  const shown = Number.isFinite(kg) ? `${label} ${roundKg(kg)}kg` : label;
  const source = Number.isFinite(kg) ? "logged with this set" : "default";
  return `<span class="sled-marker" title="${escapeHtml(
    `${label} starting weight (${resolved}kg, ${source}) added on top of what's plated`
  )}">${escapeHtml(shown)} +</span> ${escapeHtml(rest)}`;
}

// Which starting-weight toggle, if any, is worth offering for an exercise —
// "sled", "bar" or null. Most exercises need neither, so it stays hidden
// unless it applies: the exercise has already been logged with an "S+" set
// (`uses_sled`, from the dictionary API) or is a machine, where a carriage
// weight is plausible even if none has been logged yet; landmine work gets
// the bar, since that's what a landmine set is loaded on top of.
function startingLoadKindFor(dictionary, abbreviation, fullName) {
  const entry = (dictionary || []).find((d) => d.abbreviation === abbreviation);
  const name = fullName ?? entry?.full_name;
  // Landmine work is checked first, and beats an S+ history: a landmine row
  // logged with "S+" before B+ existed scores the same either way (both
  // starting weights are 20kg), and the bar is what it's actually loaded on.
  if (isLandmineExercise(abbreviation, name)) return "bar";
  return exerciseUsesSled(dictionary, abbreviation, fullName) ? "sled" : null;
}

// Whether an exercise has, or plausibly could have, a sled: it's already been
// logged with an "S+" set (`uses_sled`, from the dictionary API), or it's a
// machine, where a carriage weight is plausible even if none has been logged
// yet. Separate from startingLoadKindFor() on purpose — this answers "does a
// sled weight belong on this exercise", which is the Dictionary's question,
// and stays true for a landmine that carries older S+ sets.
function exerciseUsesSled(dictionary, abbreviation, fullName) {
  const entry = (dictionary || []).find((d) => d.abbreviation === abbreviation);
  if (entry?.uses_sled) return true;
  return classifyEquipment(abbreviation, fullName ?? entry?.full_name) === "machine";
}

function isLandmineExercise(abbreviation, fullName) {
  const text = `${fullName || ""} ${abbreviation || ""}`.toLowerCase();
  return text.includes("landmine") || /\blm\b/.test(text);
}

// ---------- reusable per-set editor ----------
// Same numbered-rows UI used everywhere sets are entered or edited: each row
// has a starting-weight checkbox as its own column, separate from the
// weight×reps text field, so "S+"/"B+" never has to be hand-typed. Returns a
// small controller object rather than raw markup since every caller needs to
// add rows, read values back out, and reset after a save.
//
// The toggle is hidden by default and revealed via setStartingLoadKind() with
// the kind that applies to the exercise — "sled" for machines, "bar" for
// landmine work — but a row whose value already carries a prefix always keeps
// its toggle, so an existing S+ set stays un-checkable even on an exercise
// this app wouldn't otherwise offer it for.
//
// Sled rows carry their own kg box next to the checkbox. Sled weights are a
// property of the machine and machines differ, so the number belongs to the
// session being logged rather than to the exercise forever; leaving it blank
// falls back to the exercise's configured weight. New rows inherit the last
// one typed, so a session on one machine only needs it entered once.
//
// The "+ Add set" button belongs to the editor rather than the page around
// it: every surface that edits an existing workout (the history rows, the
// Lapse table, the day panel) needs to be able to add sets too, not just the
// log-a-workout form.
function buildSetsEditor(values = [], { startingLoadKind = null } = {}) {
  const root = document.createElement("div");
  root.className = "sets-editor-root";

  const wrap = document.createElement("div");
  wrap.className = "sets-editor";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "small add-set-row";
  addBtn.textContent = "+ Add set";
  addBtn.addEventListener("click", () => {
    addRow();
    wrap.lastElementChild?.querySelector(".set-value").focus();
  });

  root.append(wrap, addBtn);

  function renumber() {
    [...wrap.children].forEach((row, i) => {
      row.querySelector(".set-row-num").textContent = `#${i + 1}`;
    });
  }

  // The kind of prefix this editor offers ("sled" / "bar" / null), and the
  // last sled weight typed into it — what a newly added row starts from, so
  // one machine's carriage weight is entered once per session, not per set.
  let loadKind = startingLoadKind;
  let lastSledKg = "";

  function kindLetter(kind) {
    return kind === "bar" ? "b" : kind === "sled" ? "s" : null;
  }

  function createRow(value = "") {
    const { kind, kg, rest } = splitLoadPrefix(value);
    // A row shows the toggle its own value carries, falling back to the one
    // the exercise calls for.
    const rowKind = kind === "b" ? "bar" : kind === "s" ? "sled" : loadKind;
    const checked = !!kind;
    const kgValue = kg === null ? (checked ? "" : lastSledKg) : String(kg);

    const row = document.createElement("div");
    row.className = checked ? "set-input-row has-sled" : "set-input-row";
    row.dataset.loadKind = rowKind ?? "";
    const label = rowKind === "bar" ? "Bar" : "Sled";
    const title =
      rowKind === "bar"
        ? `Bar (B+) — the barbell's own ${BARBELL_WEIGHT_KG}kg on top of what's plated, for landmine work`
        : "Sled (S+) — the machine's own carriage weight on top of what's plated";
    row.innerHTML = `
      <span class="set-row-num"></span>
      <label class="sled-toggle" title="${escapeHtml(title)}">
        <input type="checkbox" class="set-sled" ${checked ? "checked" : ""} /> ${label}
      </label>
      <input type="text" inputmode="decimal" class="set-sled-kg" value="${escapeHtml(kgValue)}"
             placeholder="kg" title="This machine's sled weight for these sets. Blank uses the exercise's configured weight." />
      <input type="text" class="set-value" placeholder="e.g. 135x5" value="${escapeHtml(rest)}" />
      <button type="button" class="small remove-set" title="Remove set">✕</button>
    `;
    row.querySelector(".remove-set").addEventListener("click", () => {
      row.remove();
      renumber();
    });
    // Several sets typed or pasted into one field become their own numbered
    // rows as soon as the field is committed, so what's about to be saved is
    // visible as distinct sets rather than only being split silently later.
    row.querySelector(".set-value").addEventListener("change", () => expandRow(row));
    // A sled weight is only meaningful on a sled row, and it's what the next
    // row should start from.
    const kgInput = row.querySelector(".set-sled-kg");
    kgInput.addEventListener("input", () => {
      if (row.dataset.loadKind !== "bar") lastSledKg = kgInput.value.trim();
    });
    syncRowLoadUi(row);
    row.querySelector(".set-sled").addEventListener("change", () => syncRowLoadUi(row));
    return row;
  }

  // The kg box belongs to sled rows that are actually switched on: the bar is
  // a constant, and an unchecked row has no starting weight to qualify.
  //
  // `has-sled` is deliberately left alone — it means "this row arrived with a
  // prefix", which is what keeps its toggle on screen for exercises the
  // column is hidden for. Clearing it on uncheck would take the checkbox away
  // the moment it was used.
  function syncRowLoadUi(row) {
    const checked = !!row.querySelector(".set-sled")?.checked;
    row.classList.toggle("sled-kg-hidden", !checked || row.dataset.loadKind === "bar");
  }

  function addRow(value = "") {
    wrap.appendChild(createRow(value));
    renumber();
  }

  // A row's own checkbox applies to every set split out of it, unless the
  // typed token already spells out its own prefix. The kg box rides along the
  // same way, so "S25+" lands on each set the row produces.
  function rowSetValues(row) {
    const raw = row.querySelector(".set-value").value;
    const rowChecked = !!row.querySelector(".set-sled")?.checked;
    const rowKind = row.dataset.loadKind || null;
    const rawKg = row.querySelector(".set-sled-kg")?.value.trim() ?? "";
    // A blank or unreadable box means "use the exercise's default", which is
    // exactly what a bare "S+" already says.
    const rowKg = rowKind === "bar" || rawKg === "" || !Number.isFinite(Number(rawKg))
      ? null
      : Number(rawKg);

    return splitCombinedSetValue(raw).map((token) => {
      const { kind, kg, rest } = splitLoadPrefix(token);
      const effectiveKind = kind ?? (rowChecked ? kindLetter(rowKind) : null);
      return combineLoadPrefix(effectiveKind, kind ? kg : rowKg, rest);
    });
  }

  function expandRow(row) {
    const parts = rowSetValues(row);
    if (parts.length < 2) return;
    row.replaceWith(...parts.map((v) => createRow(v)));
    renumber();
  }

  // Splits here as well as in expandRow: a field can be saved without ever
  // firing a change event (Enter-submitting the add form, a programmatic
  // fill), and either way the value has to reach the server as distinct sets.
  function values_() {
    return [...wrap.children].flatMap(rowSetValues).filter((v) => v !== "");
  }

  function reset(newValues = []) {
    wrap.innerHTML = "";
    (newValues.length > 0 ? newValues : [""]).forEach((v) => addRow(v));
  }

  // Switching exercise switches which toggle the rows offer — except on rows
  // that already carry a prefix of their own, which keep theirs.
  function setStartingLoadKind(kind) {
    const next = kind ?? null;
    // Called on every keystroke in the exercise field, so a no-op stays free
    // and half-typed rows aren't rebuilt out from under the user.
    if (next === loadKind) return;
    loadKind = next;
    wrap.classList.toggle("sled-hidden", !loadKind);
    const current = values_();
    wrap.innerHTML = "";
    (current.length > 0 ? current : [""]).forEach((v) => addRow(v));
  }

  reset(values);
  wrap.classList.toggle("sled-hidden", !loadKind);

  return { el: root, addRow, values: values_, reset, setStartingLoadKind };
}

// ---------- scoring a single set for 1RM purposes ----------
// Ties bodyweight/sled load, single-arm exclusion, and major-lift
// completed/attempted parsing into one entry point. Returns
// { weight, reps, attempted, addedWeight?, sled? } — addedWeight is only
// present for bodyweight/sled sets — or null if this exercise's rules say
// the set isn't scorable.
function parseScorableSet(raw, abbreviation, fullName) {
  let value = String(raw).trim();
  const equipment = classifyEquipment(abbreviation, fullName);
  const singleArm = isSingleArmExercise(abbreviation, fullName);
  const lift = classifyLift(abbreviation, fullName);
  const isMajor = !!(lift && MAJOR_LIFT_KEYS.has(lift.key));
  // "#/#" means completed/attempted only for non-single-arm major lifts
  // (e.g. a snatch: "56x3/5" = 56kg, made 3 of 5 attempts).
  const allowAttempts = isMajor && !singleArm;

  // Strip a leading "S+"/"B+" before parsing the rest as normal — it composes
  // with everything below rather than being its own separate shape.
  const prefix = splitLoadPrefix(value);
  const startingKind = prefix.kind;
  value = prefix.rest;

  const full = value.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)(?:\/(\d+))?\s*$/i);
  if (full) {
    const hasAttemptSuffix = full[3] !== undefined;
    if (hasAttemptSuffix && !allowAttempts) return null; // single-arm L/R or unspecified — ambiguous, skip
    const parsedWeight = parseFloat(full[1]);
    const reps = parseInt(full[2], 10);
    const attempted = hasAttemptSuffix ? parseInt(full[3], 10) : null;
    if (startingKind) {
      // The sled or the bar is external load that genuinely moved, so it's
      // part of the scored weight; `addedWeight` keeps what was plated, which
      // is the number actually written in the log.
      const startingKg = startingWeightFor(startingKind, prefix.kg, abbreviation);
      return {
        weight: startingKg + parsedWeight,
        addedWeight: parsedWeight,
        sled: true,
        startingKind,
        startingWeight: startingKg,
        reps,
        attempted,
      };
    }
    if (equipment === "bodyweight") {
      return { weight: BODYWEIGHT_KG + parsedWeight, addedWeight: parsedWeight, bodyweight: true, reps, attempted };
    }
    // A 0kg entry on a free-weight/cable/machine exercise is an
    // unloaded/technique set (e.g. an air squat), not a real strength
    // attempt — scoring it would report a misleading "0 1RM".
    if (parsedWeight === 0) return null;
    return { weight: parsedWeight, reps, attempted };
  }

  // Bare rep count(s) that weight carry-over didn't already resolve into a
  // "0x..." set — happens when multiple attempts are packed into one cell,
  // comma- or space-separated (e.g. a one-arm pull-up logged "1 1" for a rep
  // on each side). Only meaningful for bodyweight movements (0 added
  // weight); the highest packed value is the "top" attempt. A starting-weight
  // prefix with no recognizable "x reps" after it isn't a bodyweight bare-rep
  // set.
  if (!startingKind && equipment === "bodyweight") {
    const tokens = splitSetTokens(value);
    if (tokens.length > 0 && tokens.every((t) => /^\d+$/.test(t))) {
      const reps = Math.max(...tokens.map(Number));
      return { weight: BODYWEIGHT_KG, addedWeight: 0, bodyweight: true, reps, attempted: null };
    }
  }

  return null;
}

// Resolves weight carry-over once and scores every set in a workout against
// this specific exercise's rules. Returns an array aligned with `sets`: each
// entry is either null (not scorable) or
// { raw, resolvedRaw, weight, reps, attempted, addedWeight?, oneRM }.
// `raw` is what the user actually typed; `resolvedRaw` is that same set
// after carry-over (e.g. "9" -> "52x9") — display the former, explain with
// the latter.
function scoreSets(sets, abbreviation, fullName) {
  const resolved = resolveWeightCarryover(sets, abbreviation, fullName);
  return sets.map((raw, i) => {
    const parsed = parseScorableSet(resolved[i], abbreviation, fullName);
    if (!parsed) return null;
    const oneRM = epley1RM(parsed.weight, parsed.reps);
    if (oneRM === null) return null;
    return { raw, resolvedRaw: resolved[i], ...parsed, oneRM };
  });
}

// Picks the highest-1RM entry from scoreSets' output, or null.
function topScorableSetOf(sets, abbreviation, fullName) {
  const scored = scoreSets(sets, abbreviation, fullName);
  let best = null;
  for (const s of scored) {
    if (s && (!best || s.oneRM > best.oneRM)) best = s;
  }
  return best;
}

// Heaviest actual weight moved — ranked by raw `weight`, not estimated 1RM,
// so a 225x1 and a 225x3 tie on "heaviest weight moved" even though their
// Epley 1RMs differ. Reported all-time and within the trailing 365- and
// 90-day windows, so a long-standing PR can be read against recent form.
// `history` is the full array of { date, sets } sessions (not just one).
// Any window with no scorable sets comes back null.
function topWeightMovedStats(history, abbreviation, fullName) {
  const cutoff365 = daysAgoDate(365);
  const cutoff90 = daysAgoDate(90);

  let allTime = null,
    y365 = null,
    d90 = null;

  for (const h of history) {
    const when = parseDateParts(h.date);
    for (const s of scoreSets(h.sets, abbreviation, fullName)) {
      if (!s) continue;
      const entry = { ...s, date: h.date };
      if (!allTime || s.weight > allTime.weight) allTime = entry;
      if (when && when >= cutoff365 && (!y365 || s.weight > y365.weight)) y365 = entry;
      if (when && when >= cutoff90 && (!d90 || s.weight > d90.weight)) d90 = entry;
    }
  }

  return { allTime, y365, d90 };
}

// All-time only — the common case.
function topWeightMovedOf(history, abbreviation, fullName) {
  return topWeightMovedStats(history, abbreviation, fullName).allTime;
}

// ---------- composite lifts ----------
// A few exercises are logged as one entry but are really two lifts done back
// to back: a clean & jerk IS a clean and a jerk, "C+J" is one clean followed
// by a few jerks, "C+FSQ" one clean followed by front squats. Reviewing the
// individual lift should show that work — a clean pulled inside a C&J is
// still a clean, and leaving it out makes the clean's history look thinner
// than it was.
//
// This is a *view*, not a second log entry. The session stays filed under the
// composite everywhere else — the Log tab, set counts, volume, fatigue — so
// nothing is ever counted twice. Only the Lapse tab (lapse.js) reads this.
//
// `parts` maps each part exercise to which reps of a set belong to it:
//   "all"    — every rep counts for this part, because each rep IS this lift
//              (one C&J rep is one clean and one jerk)
//   "first"  — the first number of an "A+B" set: the single clean in "75x1+5"
//   "second" — the second number: the 5 front squats in "75x1+5"
const COMPOSITE_LIFTS = [
  { abbrev: "CJ", parts: { C: "all", J: "all" } },
  { abbrev: "C+J", parts: { C: "first", J: "second" } },
  { abbrev: "C+FSQ", parts: { C: "first", FSQ: "second" } },
];

// Which composites contain `abbreviation` as one of their parts.
function compositesContaining(abbreviation) {
  const target = String(abbreviation ?? "").toLowerCase();
  return COMPOSITE_LIFTS.filter((c) =>
    Object.keys(c.parts).some((p) => p.toLowerCase() === target)
  );
}

function compositePartRole(composite, abbreviation) {
  const target = String(abbreviation ?? "").toLowerCase();
  const key = Object.keys(composite.parts).find((p) => p.toLowerCase() === target);
  return key ? composite.parts[key] : null;
}

// "75x1+5" — the notation these composites are logged in, where the two rep
// counts are the two lifts. Distinct from "75x2/3" (made 2 of 3 attempts),
// which is a single lift's completed/attempted pair.
const COMPOSITE_PAIR_SET_RE = /^(\d+(?:\.\d+)?)\s*x\s*(\d+)\s*\+\s*(\d+)\s*$/i;
const COMPOSITE_PLAIN_SET_RE = /^(\d+(?:\.\d+)?\s*x\s*\d+(?:\/\d+)?)\s*$/i;

// Projects one composite session's sets onto one of its parts, returning the
// sets as that part would have been logged on its own ("75x1+5" -> "75x1" for
// the clean, "75x5" for the front squats).
//
// Anything that can't be read unambiguously is skipped rather than guessed at:
// a bare "75x1" in a C+J says a weight and a rep count but not which lift did
// them, and inventing an answer would put numbers in the clean's history that
// the log doesn't actually support. The count comes back so the UI can say so.
function compositePartSets(composite, sets, partAbbreviation, compositeFullName) {
  const role = compositePartRole(composite, partAbbreviation);
  if (!role) return { sets: [], skipped: 0 };

  // Carry-over is resolved against the composite's own rules, since that's the
  // exercise the sets were typed under (a bare "80" in a C&J is 80kg for one).
  const resolved = resolveWeightCarryover(sets, composite.abbrev, compositeFullName);

  const out = [];
  let skipped = 0;
  resolved.forEach((value, i) => {
    const raw = String(value).trim();

    const pair = raw.match(COMPOSITE_PAIR_SET_RE);
    if (pair) {
      const [, weight, a, b] = pair;
      // "all" sums the pair: on a combined lift both numbers are reps of it
      // ("75x2+1" = two C&Js and one more), where on an "A+B" composite they
      // are the two different lifts.
      const reps = role === "all" ? Number(a) + Number(b) : role === "first" ? a : b;
      out.push({ value: `${weight}x${reps}`, from: sets[i] });
      return;
    }

    // A plain "75x3" (or "80x0/3") only projects onto a part that owns every
    // rep of the set.
    const plain = raw.match(COMPOSITE_PLAIN_SET_RE);
    if (plain && role === "all") {
      out.push({ value: plain[1].replace(/\s+/g, ""), from: sets[i] });
      return;
    }

    skipped++;
  });

  return { sets: out, skipped };
}

// ---------- displaying a scored weight ----------
// Bodyweight movements are *scored* on total load (bodyweight + whatever's
// strapped on), because that's what actually determines how hard the rep is.
// But the number written in the log is the added weight alone, so reporting a
// total back — "~136 kg 1RM" for a pull-up — reads as a number the user never
// wrote and can't act on. Displayed weights for these are therefore converted
// back to the same terms the set was logged in: added weight, marked with a
// leading "+" so it's never mistaken for a total.
//
// Sled sets deliberately keep their total: unlike bodyweight, a sled's
// starting weight is external load that's genuinely part of what moved.
function displayWeightOf(s, totalWeight) {
  return s.bodyweight ? totalWeight - BODYWEIGHT_KG : totalWeight;
}

function formatScoredWeight(s, totalWeight) {
  const shown = roundKg(displayWeightOf(s, totalWeight));
  return s.bodyweight ? `+${shown} kg` : `${shown} kg`;
}

// The estimated 1RM as it should be shown for this set.
function formatOneRM(s) {
  return formatScoredWeight(s, s.oneRM);
}

// Tooltip text for a scored set (top-set badge or per-set hover).
function describeScoredSet(s) {
  const parts = [`Estimated 1RM (Epley) from ${s.resolvedRaw ?? s.raw}`];
  if (s.sled) {
    const what = s.startingKind === "b" ? "bar" : "sled";
    parts.push(`${what} (${s.startingWeight ?? DEFAULT_SLED_WEIGHT_KG}kg) + ${s.addedWeight}kg added`);
  } else if (s.addedWeight !== undefined) {
    parts.push(`bodyweight (${BODYWEIGHT_KG}kg default) + ${s.addedWeight}kg added`);
  }
  if (s.attempted !== null && s.attempted !== undefined) {
    parts.push(`${s.reps} of ${s.attempted} attempted`);
  }
  if (s.reps > MAX_SCORED_REPS) {
    parts.push(`scored as ${MAX_SCORED_REPS} reps (Epley is unreliable past ${MAX_SCORED_REPS})`);
  }
  parts.push(
    s.bodyweight
      ? `~${formatOneRM(s)} added 1RM (${formatKg(s.oneRM)} total)`
      : `~${formatOneRM(s)} 1RM`
  );
  return parts.join(" — ");
}

// Renders a workout's set list as HTML: every individually-scorable set
// carries a hover tooltip with its OWN estimated 1RM (not just the
// session's best), and the single best set is additionally bolded.
function setsHtmlWithHover(sets, abbreviation, fullName) {
  if (!sets || sets.length === 0) return '<span class="muted">—</span>';

  const scored = scoreSets(sets, abbreviation, fullName);
  let topIdx = -1;
  scored.forEach((s, i) => {
    if (s && (topIdx === -1 || s.oneRM > scored[topIdx].oneRM)) topIdx = i;
  });

  return sets
    .map((raw, i) => {
      const s = scored[i];
      const text = renderSetLabel(raw, abbreviation);
      if (!s) return text;
      const cls = i === topIdx ? "set-value top-set" : "set-value";
      return `<span class="${cls}" title="${escapeHtml(describeScoredSet(s))}">${text}</span>`;
    })
    .join(", ");
}
