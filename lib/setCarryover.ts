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
// Mirrored in public/utils.js for runtime use (new workouts logged through
// the app) — keep both copies in sync if this logic changes.
const MAX_PLAUSIBLE_REPS_UNDER_LOAD = 50;

export function resolveWeightCarryover(sets: string[], singlesLadder = false): string[] {
  let lastWeight: string | null = null;
  return sets.map((raw) => {
    const value = raw.trim();

    const weighted = value.match(/^(\d+(?:\.\d+)?)\s*x/i);
    if (weighted) {
      lastWeight = weighted[1];
      return raw;
    }

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

    // Completed/attempted ratios and bonus-rep pairs stay reps-shaped
    // regardless of magnitude — both halves are small by construction in
    // every example seen, so the load-implausibility check doesn't apply.
    if (/^\d+\/\d+$/.test(value) || /^\d+\+\d+$/.test(value)) {
      if (lastWeight === null) lastWeight = "0";
      return `${lastWeight}x${value}`;
    }

    return raw;
  });
}
