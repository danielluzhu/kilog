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
// A starting-weight prefix ("S+", "S25+" for a sled, "B+" for the bar) is
// stripped before the reps are read — it's load, not a rep count.
//
// Mirrored in public/utils.js for the browser — keep both copies in sync if
// this logic changes.
const LOAD_PREFIX_RE = /^[sb]\d*(?:\.\d+)?\+/i;

export function countsAsSet(value: string): boolean {
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

export function countSets(sets: string[]): number {
  return sets.filter(countsAsSet).length;
}
