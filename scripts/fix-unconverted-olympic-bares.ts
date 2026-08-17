// One-time fix-up: a handful of pre-2025-04-15 Olympic-lift sets were logged
// as a bare weight ("175") rather than "WxR". The lbs->kg conversion
// (lib/units.ts) only rewrites the number *before an "x"* — bare values were
// deliberately skipped there because at the time they were read as rep
// counts. Now that a bare number on an Olympic lift is correctly read as a
// weight lifted for one rep, those leftovers would be interpreted as
// kilograms and invent all-time PRs (a 175kg clean, a 125kg snatch).
//
// Only the values below are touched. They're identified by hand, not by rule,
// because pre-cutoff bare values are NOT uniformly unconverted: 2024-04-27's
// 43/52/61 already are kilograms (that session's explicit sets are 43.1 and
// 52.2kg), so a blanket "convert everything before the cutoff" pass would
// wreck them. Each entry here sits far above its own session's already
// converted kg sets, which is what makes lbs unambiguous.
import { db } from "../db.ts";

const LBS_TO_KG = 0.45359237;

const TARGETS = [
  { date: "2024-11-10", exercise: "C", values: ["175", "165"] },
  { date: "2024-11-04", exercise: "S", values: ["125"] },
  { date: "2024-10-22", exercise: "CJ", values: ["125"] },
  { date: "2024-10-22", exercise: "J", values: ["125"] },
];

function toKg(lbs: string): string {
  const kg = Math.round(parseFloat(lbs) * LBS_TO_KG * 10) / 10;
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

const selectSets = db.prepare(
  `SELECT s.id, s.value FROM sets s
   JOIN workouts w ON w.id = s.workout_id
   WHERE w.date = ? AND w.exercise = ?
   ORDER BY s.set_number`
);
const updateStmt = db.prepare("UPDATE sets SET value = ? WHERE id = ?");

let converted = 0;
let skipped = 0;

db.transaction(() => {
  for (const t of TARGETS) {
    const rows = selectSets.all(t.date, t.exercise) as { id: number; value: string }[];
    for (const row of rows) {
      const value = String(row.value).trim();
      if (!t.values.includes(value)) continue;
      const next = toKg(value);
      updateStmt.run(next, row.id);
      console.log(`  ${t.date} ${t.exercise.padEnd(3)} ${value} lbs -> ${next} kg`);
      converted++;
    }
    const found = rows.filter((r) => t.values.includes(String(r.value).trim())).length;
    if (found !== t.values.length) {
      skipped += t.values.length - found;
      console.log(
        `  !! ${t.date} ${t.exercise}: expected ${t.values.length} value(s) ${t.values.join(",")}, matched ${found} (already converted?)`
      );
    }
  }
})();

console.log(`\nConverted ${converted} value(s); ${skipped} expected value(s) not found.`);
