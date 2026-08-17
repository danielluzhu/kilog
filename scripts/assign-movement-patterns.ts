// Assigns an explicit movement pattern to every named exercise. Replaces the
// earlier body-part assignment (scripts/assign-muscle-groups.ts) — the column
// was renamed muscle_group -> movement_pattern in db.ts, and every value is
// re-derived here rather than machine-translated from the old buckets, since
// the two taxonomies don't map one-to-one (deltoid work splits across Push and
// Pulls depending on whether it's a raise or a rear-delt movement).
//
// The four judgement calls, all confirmed:
//   · Lateral / Lu raises -> Push (conventional push/pull/legs), but
//     Bent-over Lateral Raise -> Pulls, since it's a rear-delt movement.
//   · Calf Raise, Run, Hike -> Other. They fit none of the five patterns and
//     forcing them would conflate conditioning with lifting.
//   · Jerk and Push Press -> Push. The overhead lockout is the limiting
//     factor; Full stays reserved for the complete Olympic lifts.
//   · Panda Pull and Snatch Deadlift -> Hinge. Hip-driven pulls off the
//     floor, mechanically a deadlift.
import { db } from "../db.ts";

const ASSIGNMENTS: Record<string, string> = {
  // --- Full: whole-body Olympic lifts ---
  C: "full",          // Clean
  Clean: "full",
  S: "full",          // Snatch
  TS: "full",         // Tall Snatch
  CJ: "full",         // Clean & Jerk
  "C+J": "full",      // Clean + Jerk
  "C+FSQ": "full",    // Clean + Front Squat
  "SN+OHSQ": "full",  // Snatch + Overhead Squat

  // --- Push: presses, plus the shoulder/triceps work that trains with them ---
  BP: "push",         // Bench Press
  DBP: "push",        // Dumbbell Bench Press
  IBP: "push",        // Incline Bench Press
  IDBP: "push",       // Incline Dumbbell Bench Press
  CF: "push",         // Chest Fly
  D: "push",          // Dips
  SP: "push",         // Shoulder Press
  BHSP: "push",       // Behind Head Shoulder Press
  PushPress: "push",
  J: "push",          // Jerk
  PiSq: "push",       // Press in Squat
  LR: "push",         // Lateral Raise
  PLR: "push",        // Plate Lateral Raise
  LuR: "push",        // Lu Raise
  PLuR: "push",       // Plate Lu Raise
  TCPD: "push",       // Tricep Cable Pulldown
  MSP: "push",        // Machine Shoulder Press
  OHTE: "push",       // Over Head Tricep Extension

  // --- Squat: knee-dominant ---
  SQ: "squat",
  FSQ: "squat",       // Front Squat
  OHSQ: "squat",      // Overhead Squat
  HSQ: "squat",       // Hacksquat
  HS: "squat",        // Hack Squat
  SSQ: "squat",       // Single Leg Squat
  "(Fast)SQ": "squat",
  SQJ: "squat",       // Squat Jump
  LP: "squat",        // Leg Press
  LE: "squat",        // Leg Extension
  SLE: "squat",       // Single Leg Extension
  SLP: "squat",       // Single Leg Press
  BJ: "squat",        // Box Jump

  // --- Pulls: everything drawn toward the body ---
  PLU: "pulls",       // Pull Ups
  NPLU: "pulls",      // Neutral Pull Up
  CLU: "pulls",       // Chin Up
  SPLU: "pulls",      // Single Arm Pull Up
  OAPLU: "pulls",     // One Arm Pull Up
  LPD: "pulls",       // Lat Pull Down
  SLPD: "pulls",      // Single Arm Lat Pull Down
  SCR: "pulls",       // Seated Cable Row
  SSCR: "pulls",      // Single Arm Seated Cable Row
  BR: "pulls",        // Barbell Row
  DR: "pulls",        // Dumbbell Row
  TBR: "pulls",       // T-Bar Row
  BLR: "pulls",       // Barbell Landmine Row
  SDR: "pulls",       // Side Delt Row
  RDF: "pulls",       // Rear Delt Fly
  DRDF: "pulls",      // Dumbell Rear Delt Fly
  BOLR: "pulls",      // Bent-over Lateral Raise — rear delt, not a press
  HC: "pulls",        // Hammer Curl
  IDC: "pulls",       // Incline Dumbbell Curl
  BC: "pulls",        // Bicep Curl
  PC: "pulls",        // Preacher Curl
  BHLPD: "pulls",     // Behind Head Lat Pull Down
  PRDF: "pulls",      // Plate Rear Delt Fly

  // --- Hinge: hip-dominant ---
  DL: "hinge",        // Dead Lift
  SDL: "hinge",       // Snatch Deadlift
  PP: "hinge",        // Panda Pull
  PandaPull: "hinge",
  SLC: "hinge",       // Seated Leg Curl
  LLC: "hinge",       // Lying Leg Curl
  LC: "hinge",        // Leg Curl
  SSLC: "hinge",      // Single Seated Leg Curl
  BE: "hinge",        // Back Extension
  BEH: "hinge",       // Back Extension Holds

  // --- Other: fits none of the five ---
  CR: "other",        // Calf Raise
  Run: "other",
  R: "other",         // Run
  Hike: "other",
  LL: "other",        // Leg Lift — core work, which none of the five cover
};

const VALID = new Set(["full", "push", "squat", "pulls", "hinge", "other"]);

const existing = new Set(
  (db.query("SELECT abbreviation FROM exercise_dictionary").all() as { abbreviation: string }[]).map(
    (r) => r.abbreviation
  )
);

// Anything previously assigned under the old body-part taxonomy is cleared
// first: leaving "deltoid" behind would fail validation and silently persist
// a value from a vocabulary that no longer exists.
db.exec("UPDATE exercise_dictionary SET movement_pattern = NULL");

const update = db.prepare("UPDATE exercise_dictionary SET movement_pattern = ? WHERE abbreviation = ?");
let assigned = 0;
const missing: string[] = [];

db.transaction(() => {
  for (const [abbrev, pattern] of Object.entries(ASSIGNMENTS)) {
    if (!VALID.has(pattern)) throw new Error(`invalid pattern "${pattern}" for ${abbrev}`);
    if (!existing.has(abbrev)) {
      missing.push(abbrev);
      continue;
    }
    update.run(pattern, abbrev);
    assigned++;
  }
})();

console.log(`Assigned ${assigned} exercises.`);
if (missing.length) console.log(`Not in the dictionary (skipped): ${missing.join(", ")}`);

const rows = db
  .query(
    `SELECT movement_pattern AS p, COUNT(*) AS c FROM exercise_dictionary
     WHERE movement_pattern IS NOT NULL GROUP BY movement_pattern ORDER BY c DESC`
  )
  .all() as { p: string; c: number }[];
console.log("\nStored assignments by pattern:");
for (const r of rows) console.log(`  ${r.p.padEnd(8)} ${r.c}`);

const unassigned = db
  .query(
    `SELECT abbreviation, full_name FROM exercise_dictionary
     WHERE movement_pattern IS NULL AND full_name <> '' ORDER BY abbreviation`
  )
  .all() as { abbreviation: string; full_name: string }[];
console.log(`\nNamed exercises left on the auto guess: ${unassigned.length}`);
for (const u of unassigned) console.log(`  ${u.abbreviation.padEnd(12)} ${u.full_name}`);
