// One-time fix-up: the same exercise logged under different capitalizations
// ("FSQ" and "Fsq", "LuR" and "LUR") used to become two separate exercises —
// two dictionary entries, two Lapse charts, two sets of PRs, each holding
// half the history. They're one exercise, so each case-variant group folds
// into a single abbreviation.
//
// The canonical spelling is the one actually used most (by logged workouts,
// then by a filled-in full name) rather than a mechanical upper-casing:
// "LuR" with 237 workouts is the real spelling, "LUR" with 9 is the typo.
//
// The server now resolves a typed abbreviation against the casing already on
// file (canonicalExercise in server.ts), so this only needs running once over
// legacy data.
import { db } from "../db.ts";

type DictRow = {
  abbreviation: string;
  full_name: string;
  sled_weight_kg: number | null;
  muscle_group: string | null;
};

// Every abbreviation known to either table — an exercise can predate the
// dictionary, and a dictionary entry can exist with nothing logged under it.
const names = (
  db
    .query(
      `SELECT abbreviation AS name FROM exercise_dictionary
       UNION
       SELECT exercise AS name FROM workouts`
    )
    .all() as { name: string }[]
).map((r) => r.name);

const groups = new Map<string, string[]>();
for (const name of names) {
  const key = name.toLowerCase();
  groups.set(key, [...(groups.get(key) ?? []), name]);
}

const collisions = [...groups.values()].filter((variants) => variants.length > 1);

if (collisions.length === 0) {
  console.log("No case-variant abbreviations found — nothing to do.");
  process.exit(0);
}

console.log(`Found ${collisions.length} abbreviation(s) logged under more than one capitalization.\n`);

const countWorkouts = db.prepare("SELECT COUNT(*) c FROM workouts WHERE exercise = ?");
const getDictRow = db.prepare("SELECT * FROM exercise_dictionary WHERE abbreviation = ?");
const selectSets = db.prepare("SELECT value FROM sets WHERE workout_id = ? ORDER BY set_number");
const insertSet = db.prepare("INSERT INTO sets (workout_id, set_number, value) VALUES (?, ?, ?)");

let reassigned = 0;
let foldedRows = 0;

db.transaction(() => {
  for (const variants of collisions) {
    const scored = variants
      .map((name) => ({
        name,
        workouts: (countWorkouts.get(name) as { c: number }).c,
        dict: (getDictRow.get(name) as DictRow | null) ?? null,
      }))
      .sort(
        (a, b) =>
          b.workouts - a.workouts ||
          Number(!!b.dict?.full_name) - Number(!!a.dict?.full_name) ||
          a.name.localeCompare(b.name)
      );

    const keep = scored[0];
    const absorbed = scored.slice(1);

    // The dictionary entry keeps whatever any variant had filled in — the
    // losing spellings often carry the full name or sled weight.
    const fullName = scored.find((v) => v.dict?.full_name)?.dict?.full_name ?? "";
    const sledWeight = scored.find((v) => v.dict?.sled_weight_kg != null)?.dict?.sled_weight_kg ?? null;
    const muscleGroup = scored.find((v) => v.dict?.muscle_group != null)?.dict?.muscle_group ?? null;

    for (const v of absorbed) {
      const result = db.prepare("UPDATE workouts SET exercise = ? WHERE exercise = ?").run(keep.name, v.name);
      reassigned += result.changes;
      db.prepare("DELETE FROM exercise_dictionary WHERE abbreviation = ?").run(v.name);
    }

    db.prepare(
      `INSERT INTO exercise_dictionary (abbreviation, full_name, sled_weight_kg, muscle_group)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(abbreviation) DO UPDATE SET
         full_name = excluded.full_name,
         sled_weight_kg = excluded.sled_weight_kg,
         muscle_group = excluded.muscle_group`
    ).run(keep.name, fullName, sledWeight, muscleGroup);

    // Both spellings may have been logged on the same day; that's one
    // session, so those rows collapse into one workout carrying all the sets.
    const dupeDates = db
      .query("SELECT date FROM workouts WHERE exercise = ? GROUP BY date HAVING COUNT(*) > 1")
      .all(keep.name) as { date: string }[];

    for (const { date } of dupeDates) {
      const ids = (
        db
          .query("SELECT id FROM workouts WHERE date = ? AND exercise = ? ORDER BY id")
          .all(date, keep.name) as { id: number }[]
      ).map((r) => r.id);

      const values = ids.flatMap((id) => (selectSets.all(id) as { value: string }[]).map((r) => r.value));

      // `sets` cascades on workout delete, so the redundant rows go first and
      // the keeper is rewritten with the full, renumbered list.
      for (const id of ids.slice(1)) db.prepare("DELETE FROM workouts WHERE id = ?").run(id);
      db.prepare("DELETE FROM sets WHERE workout_id = ?").run(ids[0]);
      values.forEach((value, i) => insertSet.run(ids[0], i + 1, value));
      foldedRows += ids.length - 1;
      console.log(`    ${date}: folded ${ids.length} same-day rows into workout ${ids[0]}`);
    }

    console.log(
      `  ${keep.name} (${keep.workouts} workouts) <- ${absorbed
        .map((v) => `${v.name} (${v.workouts})`)
        .join(", ")}${fullName ? `  [${fullName}]` : ""}`
    );
  }
})();

console.log(
  `\nReassigned ${reassigned} workout(s); folded ${foldedRows} same-day row(s) after merging.`
);

const leftover = (
  db
    .query(
      `SELECT COUNT(*) c FROM (
         SELECT 1 FROM (SELECT abbreviation AS name FROM exercise_dictionary
                        UNION SELECT exercise FROM workouts)
         GROUP BY LOWER(name) HAVING COUNT(*) > 1
       )`
    )
    .get() as { c: number }
).c;
console.log(`Remaining case-variant groups: ${leftover}`);
