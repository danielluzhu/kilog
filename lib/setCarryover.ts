// Some legacy rows shorthand a repeated weight: after an explicit "WxR" set,
// a later bare integer in the same row inherits that same weight as its
// rep count — e.g. "52x8, 9, 8, 5" means all four sets were at 52 (kg):
// "52x8, 52x9, 52x8, 52x5". Bare "A/B" and "A+B" pairs carry over the same
// way (completed/attempted or bonus-rep notation riding the same weight).
// A bare set with nothing yet to carry over from (the first set of the
// session has no weight designated) seeds at 0 — bodyweight, no added load —
// rather than being left unresolved; every bare set after it, weighted or
// not, still carries the most recent weight forward the same way.
//
// But under real external load, a bare number well above any plausible rep
// count (say, 130) is essentially never a rep count — it's almost always a
// NEW weight for a single rep, from a heavy-singles "ladder" common in
// Olympic lifting: "125x2, 130, 125, 100x4" means 2 reps at 125, a single at
// 130, a single back off at 125, then 4 reps at 100 — not "125kg for 130
// reps". This distinction doesn't apply with no load (0kg or nothing carried
// yet), where a high bare number is a perfectly ordinary rep count (e.g. a
// 100-rep bodyweight set).
//
// Anything already written as "Nx..." is left untouched, regardless of what
// follows the "x" (bonus reps, a trailing "?", etc.) — only its weight is
// read off to seed `lastWeight`. Free text (run/hike notes tokenized by
// comma, decimal split times like "10.69", malformed entries) never matches
// any bare shape and is left completely alone.
//
// The Olympic lifts are the exception to all of the above: they're logged as
// a ladder of *weights*, each a single completed rep, so a bare number there
// is always a weight and never a rep count — "60, 61, 61, 61" is four
// singles at those loads. Rep counts on these are always written explicitly
// with an "x". Callers opt in via `singlesLadder`, since this module has no
// exercise context of its own.
//
// A starting-weight prefix ("S+", "S63+", "B+") names equipment the whole
// session sits in, not one set's load: a sled is bolted to the machine and a
// landmine's bar does not come off between sets. It gets written once on the
// first set and dropped from the rest, so it is carried across the session
// here — and split off before the weight logic runs, since "S+310x16" fits
// none of the shapes below and would leave the bare "16" after it inheriting
// no weight at all.
//
// Scoped to the session. A sled's weight is a property of one machine, and
// the same exercise meets different machines, so an explicit "S63+" governs
// its own day and nothing carries between days.
//
// Mirrored in public/utils.js for runtime use (new workouts logged through
// the app) — keep both copies in sync if this logic changes.
const MAX_PLAUSIBLE_REPS_UNDER_LOAD = 50;
const LOAD_PREFIX_RE = /^[sb]\d*(?:\.\d+)?\+/i;
const LOAD_PREFIX_PARTS_RE = /^([sb])(\d+(?:\.\d+)?)?\+/i;

function sessionLoadPrefix(sets: string[]): string | null {
  let prefix: string | null = null;
  for (const raw of sets) {
    const m = String(raw).trim().match(LOAD_PREFIX_PARTS_RE);
    if (!m) continue;
    // An explicit weight wins over a bare "S+" written earlier in the day.
    if (m[2]) return m[0];
    if (!prefix) prefix = m[0];
  }
  return prefix;
}

export function resolveWeightCarryover(sets: string[], singlesLadder = false): string[] {
  const sessionPrefix = sessionLoadPrefix(sets);
  let lastWeight: string | null = null;
  return sets.map((rawInput) => {
    const trimmed = String(rawInput).trim();
    const own = trimmed.match(LOAD_PREFIX_RE);
    const raw = own ? trimmed.slice(own[0].length) : rawInput;
    const carried = own ? own[0] : sessionPrefix;
    const withPrefix = (out: string): string =>
      carried && /^\d/.test(out) ? carried + out : out;
    const value = String(raw).trim();

    const weighted = value.match(/^(\d+(?:\.\d+)?)\s*x/i);
    if (weighted) {
      lastWeight = weighted[1];
      return withPrefix(value);
    }

    if (singlesLadder) {
      const bareWeight = value.match(/^(\d+(?:\.\d+)?)$/);
      if (bareWeight) {
        lastWeight = bareWeight[1];
        return withPrefix(`${bareWeight[1]}x1`);
      }
    }

    const bareInt = value.match(/^(\d+)$/);
    if (bareInt) {
      // The first unweighted set of the session has nothing to carry over
      // from — it's bodyweight-only (0 added weight), not unknown.
      if (lastWeight === null) {
        lastWeight = "0";
        return withPrefix(`0x${value}`);
      }
      const reps = parseInt(bareInt[1], 10);
      const isUnderLoad = parseFloat(lastWeight) > 0;
      if (isUnderLoad && reps > MAX_PLAUSIBLE_REPS_UNDER_LOAD) {
        lastWeight = bareInt[1]; // treat as a new weight, implicitly 1 rep
        return withPrefix(`${bareInt[1]}x1`);
      }
      return withPrefix(`${lastWeight}x${value}`);
    }

    // Completed/attempted ratios and bonus-rep pairs stay reps-shaped
    // regardless of magnitude — both halves are small by construction in
    // every example seen, so the load-implausibility check doesn't apply.
    if (/^\d+\/\d+$/.test(value) || /^\d+\+\d+$/.test(value)) {
      if (lastWeight === null) lastWeight = "0";
      return withPrefix(`${lastWeight}x${value}`);
    }

    return rawInput;
  });
}
