// One-time fix-up: rewrites bare reps-only set values ("9", "8/5", "1+3")
// that follow an explicit weighted set in the same workout row into their
// full "WxR" form, e.g. "52x8, 9, 8, 5" -> "52x8, 52x9, 52x8, 52x5". See
// lib/setCarryover.ts for the exact rule and what's deliberately left alone.
// Updates the live database in place (never wipes/re-imports).
import { db } from "../db.ts";
import { resolveWeightCarryover } from "../lib/setCarryover.ts";

const rows = db
  .query(
    `SELECT s.id, s.workout_id, s.set_number, s.value
     FROM sets s
     ORDER BY s.workout_id, s.set_number`
  )
  .all() as { id: number; workout_id: number; set_number: number; value: string }[];

const byWorkout = new Map<number, { id: number; value: string }[]>();
for (const r of rows) {
  if (!byWorkout.has(r.workout_id)) byWorkout.set(r.workout_id, []);
  byWorkout.get(r.workout_id)!.push({ id: r.id, value: r.value });
}

console.log(`Examining ${rows.length} sets across ${byWorkout.size} workouts...`);

const updateStmt = db.prepare("UPDATE sets SET value = ? WHERE id = ?");
let changed = 0;
const samples: { workoutId: number; before: string[]; after: string[] }[] = [];

db.transaction(() => {
  for (const [workoutId, setRows] of byWorkout) {
    const before = setRows.map((r) => r.value);
    const after = resolveWeightCarryover(before);

    let rowChanged = false;
    after.forEach((value, i) => {
      if (value !== before[i]) {
        updateStmt.run(value, setRows[i].id);
        changed++;
        rowChanged = true;
      }
    });

    if (rowChanged && samples.length < 10) samples.push({ workoutId, before, after });
  }
})();

console.log(`Rewrote ${changed} set values with an inherited weight.`);
console.log("Sample rewrites:");
for (const s of samples) {
  console.log(`  workout ${s.workoutId}: [${s.before.join(", ")}] -> [${s.after.join(", ")}]`);
}
