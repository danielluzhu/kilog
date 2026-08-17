import { Database } from "bun:sqlite";

export const db = new Database(`${import.meta.dir}/data/workout.db`, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    exercise TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    set_number INTEGER NOT NULL,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sets_workout_id ON sets(workout_id);
  CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);

  CREATE TABLE IF NOT EXISTS exercise_dictionary (
    abbreviation TEXT PRIMARY KEY,
    full_name TEXT NOT NULL DEFAULT '',
    sled_weight_kg REAL
  );

  CREATE TABLE IF NOT EXISTS cardio_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    activity TEXT NOT NULL,
    distance_value REAL NOT NULL,
    distance_unit TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    elevation_value REAL,
    elevation_unit TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_cardio_date ON cardio_sessions(date);
`);

// Columns added after the tables above were first created — CREATE TABLE IF
// NOT EXISTS won't add them to a database that already exists, so each needs
// an explicit guarded ALTER.
const dictColumns = db.query("PRAGMA table_info(exercise_dictionary)").all() as { name: string }[];
if (!dictColumns.some((c) => c.name === "sled_weight_kg")) {
  // NULL means "no per-exercise value set" — the client falls back to its
  // default sled weight rather than treating a missing value as 0kg.
  db.exec("ALTER TABLE exercise_dictionary ADD COLUMN sled_weight_kg REAL");
}
// Exercises are bucketed by movement pattern (Full/Push/Squat/Pulls/Hinge/
// Other), not by muscle. The column started life as `muscle_group`, so an
// existing database gets renamed rather than gaining a second column — the
// values are re-derived by scripts/assign-movement-patterns.ts.
if (
  dictColumns.some((c) => c.name === "muscle_group") &&
  !dictColumns.some((c) => c.name === "movement_pattern")
) {
  db.exec("ALTER TABLE exercise_dictionary RENAME COLUMN muscle_group TO movement_pattern");
} else if (!dictColumns.some((c) => c.name === "movement_pattern")) {
  // NULL means "not assigned by hand" — the client falls back to its
  // keyword-based guess (classifyMovementPattern in public/utils.js).
  db.exec("ALTER TABLE exercise_dictionary ADD COLUMN movement_pattern TEXT");
}
if (!dictColumns.some((c) => c.name === "fatigue_tier")) {
  // NULL means "not overridden" — the client falls back to autoFatigueTier().
  db.exec("ALTER TABLE exercise_dictionary ADD COLUMN fatigue_tier TEXT");
}
