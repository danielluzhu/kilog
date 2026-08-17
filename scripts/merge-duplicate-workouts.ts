// One-time fix-up: the same exercise logged twice on the same day used to
// land as two separate `workouts` rows (nothing stopped a second INSERT), so
// the log showed it as two entries and every per-workout calculation — top
// set, estimated 1RM, the Lapse chart's one-point-per-session — only ever saw
// one of them. A day's work on an exercise is one session, so those rows get
// folded into a single workout carrying all the sets.
//
// The server now appends to an existing (date, exercise) workout instead of
// inserting a duplicate, so this only needs running once over legacy data.
//
// Sets keep their original order: earliest workout row first (by id, which is
// insertion order), then by set_number within it.
import { db } from "../db.ts";

const groups = db
  .query(
    `SELECT date, exercise, COUNT(*) n FROM workouts
     GROUP BY date, exercise HAVING n > 1
     ORDER BY date, exercise`
  )
  .all() as { date: string; exercise: string; n: number }[];

if (groups.length === 0) {
  console.log("No duplicate (date, exercise) workouts found — nothing to do.");
  process.exit(0);
}

console.log(`Found ${groups.length} duplicated (date, exercise) group(s).`);

const selectIds = db.prepare("SELECT id FROM workouts WHERE date = ? AND exercise = ? ORDER BY id");
const selectSets = db.prepare("SELECT value FROM sets WHERE workout_id = ? ORDER BY set_number");
const repointSets = db.prepare("UPDATE sets SET workout_id = ? WHERE workout_id = ?");
const deleteWorkout = db.prepare("DELETE FROM workouts WHERE id = ?");
const clearSets = db.prepare("DELETE FROM sets WHERE workout_id = ?");
const insertSet = db.prepare("INSERT INTO sets (workout_id, set_number, value) VALUES (?, ?, ?)");

let merged = 0;
let removedRows = 0;

db.transaction(() => {
  for (const g of groups) {
    const ids = (selectIds.all(g.date, g.exercise) as { id: number }[]).map((r) => r.id);
    const keeper = ids[0];
    const absorbed = ids.slice(1);

    // Gather every set in order across all the rows before touching anything.
    const values: string[] = [];
    for (const id of ids) {
      for (const row of selectSets.all(id) as { value: string }[]) values.push(row.value);
    }

    // Re-point first, then delete: `sets` cascades on workout delete, so
    // removing a row while its sets still hang off it would drop them.
    for (const id of absorbed) repointSets.run(keeper, id);
    for (const id of absorbed) deleteWorkout.run(id);

    // Rewrite the keeper's sets with a clean 1..n numbering.
    clearSets.run(keeper);
    values.forEach((value, i) => insertSet.run(keeper, i + 1, value));

    console.log(
      `  ${g.date}  ${g.exercise.padEnd(6)} ${ids.length} rows -> workout ${keeper}: ${values.join(", ")}`
    );
    merged++;
    removedRows += absorbed.length;
  }
})();

console.log(`\nMerged ${merged} group(s); removed ${removedRows} redundant workout row(s).`);

const leftover = db
  .query(`SELECT COUNT(*) c FROM (SELECT 1 FROM workouts GROUP BY date, exercise HAVING COUNT(*) > 1)`)
  .get() as { c: number };
console.log(`Remaining duplicate groups: ${leftover.c}`);
