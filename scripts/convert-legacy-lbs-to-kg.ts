// One-time fix-up: the user logged in lbs before 2025-04-15 and kg from then
// on. Converts weight values on sets belonging to pre-cutoff workouts, in
// place on the live database (never wipes/re-imports — see migrate.ts's
// header for why that would be unsafe to run casually).
import { db } from "../db.ts";
import { KG_CUTOFF_DATE, convertSetToKg } from "../lib/units.ts";

const rows = db
  .query(
    `SELECT s.id, s.value FROM sets s
     JOIN workouts w ON w.id = s.workout_id
     WHERE w.date < ?`
  )
  .all(KG_CUTOFF_DATE) as { id: number; value: string }[];

console.log(`Examining ${rows.length} sets from workouts before ${KG_CUTOFF_DATE}...`);

const updateStmt = db.prepare("UPDATE sets SET value = ? WHERE id = ?");
let converted = 0;
let unchanged = 0;
const samples: { before: string; after: string }[] = [];

db.transaction(() => {
  for (const row of rows) {
    const next = convertSetToKg(row.value);
    if (next === row.value) {
      unchanged++;
      continue;
    }
    if (samples.length < 8) samples.push({ before: row.value, after: next });
    updateStmt.run(next, row.id);
    converted++;
  }
})();

console.log(`Converted ${converted} sets from lbs to kg. Left ${unchanged} unchanged (no leading weight).`);
console.log("Sample conversions:");
for (const s of samples) console.log(`  ${s.before}  ->  ${s.after}`);
