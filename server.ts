import { timingSafeEqual } from "node:crypto";
import { db } from "./db.ts";
import { normalizeDate } from "./lib/dates.ts";
import { countSets } from "./lib/setCount.ts";

const PORT = Number(process.env.PORT ?? 3000);

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 });
}

// ---------- exercise abbreviations ----------

// An abbreviation is the same exercise however it gets capitalized: "Fsq"
// typed in a hurry is the same front squat as "FSQ", and letting the two
// coexist splits an exercise's history in half — two dictionary entries, two
// Lapse charts, two sets of PRs. So anything naming an exercise resolves to
// the casing already on file, and only a genuinely new abbreviation is stored
// as typed. The dictionary is the primary source (every logged exercise gets
// an entry), with `workouts` as a fallback for anything logged before that
// was true.
function canonicalExercise(exercise: string) {
  const typed = exercise.trim();
  if (!typed) return typed;

  const known = db
    .query(
      `SELECT name FROM (
         SELECT abbreviation AS name, 0 AS source FROM exercise_dictionary WHERE abbreviation = ? COLLATE NOCASE
         UNION ALL
         SELECT exercise AS name, 1 AS source FROM workouts WHERE exercise = ? COLLATE NOCASE
       ) ORDER BY source LIMIT 1`
    )
    .get(typed, typed) as { name: string } | null;

  return known?.name ?? typed;
}

// ---------- workouts ----------

// Groups workouts by day (newest day first); within a day, exercises stay in
// the order they were logged. Pagination is in units of days, not rows, so
// "load more" always reveals whole days at a time.
function listWorkoutsGrouped(url: URL) {
  const search = url.searchParams.get("search")?.trim();
  const dayLimit = Math.min(Number(url.searchParams.get("limit") ?? 14), 90);
  const dayOffset = Number(url.searchParams.get("offset") ?? 0);

  const where = search ? "WHERE exercise LIKE ? OR date LIKE ?" : "";
  const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

  const totalDays = (
    db.query(`SELECT COUNT(DISTINCT date) as c FROM workouts ${where}`).get(...searchParams) as {
      c: number;
    }
  ).c;
  const totalWorkouts = (
    db.query(`SELECT COUNT(*) as c FROM workouts ${where}`).get(...searchParams) as { c: number }
  ).c;

  const dateRows = db
    .query(
      `SELECT DISTINCT date FROM workouts ${where} ORDER BY date DESC LIMIT ? OFFSET ?`
    )
    .all(...searchParams, dayLimit, dayOffset) as { date: string }[];

  if (dateRows.length === 0) return { days: [], totalDays, totalWorkouts };

  const dates = dateRows.map((r) => r.date);
  const datePlaceholders = dates.map(() => "?").join(",");
  const extraFilter = search ? "AND (exercise LIKE ? OR date LIKE ?)" : "";

  const workouts = db
    .query(
      `SELECT id, date, exercise FROM workouts
       WHERE date IN (${datePlaceholders}) ${extraFilter}
       ORDER BY date DESC, id ASC`
    )
    .all(...dates, ...searchParams) as { id: number; date: string; exercise: string }[];

  const ids = workouts.map((w) => w.id);
  const setRows = ids.length
    ? (db
        .query(
          `SELECT workout_id, set_number, value FROM sets WHERE workout_id IN (${ids
            .map(() => "?")
            .join(",")}) ORDER BY set_number`
        )
        .all(...ids) as { workout_id: number; set_number: number; value: string }[])
    : [];

  const dictRows = db.query("SELECT abbreviation, full_name FROM exercise_dictionary").all() as {
    abbreviation: string;
    full_name: string;
  }[];
  const dict = new Map(dictRows.map((d) => [d.abbreviation, d.full_name]));

  const setsByWorkout = new Map<number, string[]>();
  for (const s of setRows) {
    if (!setsByWorkout.has(s.workout_id)) setsByWorkout.set(s.workout_id, []);
    setsByWorkout.get(s.workout_id)!.push(s.value);
  }

  const workoutsByDate = new Map<string, any[]>();
  for (const w of workouts) {
    if (!workoutsByDate.has(w.date)) workoutsByDate.set(w.date, []);
    workoutsByDate.get(w.date)!.push({
      id: w.id,
      exercise: w.exercise,
      exerciseName: dict.get(w.exercise) || null,
      sets: setsByWorkout.get(w.id) ?? [],
    });
  }

  const days = dates
    .filter((date) => workoutsByDate.has(date))
    .map((date) => ({ date, workouts: workoutsByDate.get(date)! }));

  return { days, totalDays, totalWorkouts };
}

// One exercise on one day is one workout. Logging the same exercise again
// later that day appends to the existing row rather than creating a second
// one — two rows for the same session would split the day's sets, and every
// per-workout calculation (top set, estimated 1RM, the Lapse chart's
// one-point-per-session) would only ever see one half of the work.
// Returns the workout id, the canonical exercise, and the sets it now holds,
// in order.
function appendSetsToWorkout(date: string, typedExercise: string, sets: string[]) {
  const exercise = canonicalExercise(typedExercise);
  const existing = db
    .query("SELECT id FROM workouts WHERE date = ? AND exercise = ? ORDER BY id LIMIT 1")
    .get(date, exercise) as { id: number } | null;

  const workoutId =
    existing?.id ??
    (db.prepare("INSERT INTO workouts (date, exercise) VALUES (?, ?)").run(date, exercise)
      .lastInsertRowid as number);

  const startAt = existing
    ? ((db.query("SELECT COALESCE(MAX(set_number), 0) n FROM sets WHERE workout_id = ?").get(workoutId) as {
        n: number;
      }).n)
    : 0;

  const insertSet = db.prepare("INSERT INTO sets (workout_id, set_number, value) VALUES (?, ?, ?)");
  sets.forEach((value, i) => insertSet.run(workoutId, startAt + i + 1, value));

  db.prepare("INSERT OR IGNORE INTO exercise_dictionary (abbreviation, full_name) VALUES (?, '')").run(
    exercise
  );

  const allSets = (
    db.query("SELECT value FROM sets WHERE workout_id = ? ORDER BY set_number").all(workoutId) as {
      value: string;
    }[]
  ).map((r) => r.value);

  return { id: workoutId, exercise, sets: allSets };
}

function createWorkout(body: any) {
  const date = normalizeDate(String(body?.date ?? "").trim());
  const exercise = String(body?.exercise ?? "").trim();
  const sets: string[] = Array.isArray(body?.sets)
    ? body.sets.map((s: unknown) => String(s ?? "").trim()).filter((s: string) => s !== "")
    : [];

  if (!date || !exercise) throw new Error("date and exercise are required");

  const {
    id,
    exercise: savedExercise,
    sets: allSets,
  } = db.transaction(() => appendSetsToWorkout(date, exercise, sets))();

  return { id, date, exercise: savedExercise, sets: allSets };
}

function updateWorkout(id: number, body: any) {
  const date = normalizeDate(String(body?.date ?? "").trim());
  const typedExercise = String(body?.exercise ?? "").trim();
  const sets: string[] = Array.isArray(body?.sets)
    ? body.sets.map((s: unknown) => String(s ?? "").trim()).filter((s: string) => s !== "")
    : [];
  if (!date || !typedExercise) throw new Error("date and exercise are required");

  const exists = db.query("SELECT id FROM workouts WHERE id = ?").get(id);
  if (!exists) throw new Error("not found");

  // Retyping an abbreviation in a different case ("Fsq" over "FSQ") means the
  // same exercise, not a new one — and because the collision check below is
  // case-sensitive, resolving it here is also what makes such an edit fold
  // into the day's existing workout instead of sitting beside it.
  const exercise = canonicalExercise(typedExercise);

  return db.transaction(() => {
    db.prepare("UPDATE workouts SET date = ?, exercise = ? WHERE id = ?").run(date, exercise, id);
    db.prepare("DELETE FROM sets WHERE workout_id = ?").run(id);
    const insertSet = db.prepare("INSERT INTO sets (workout_id, set_number, value) VALUES (?, ?, ?)");
    sets.forEach((value, i) => insertSet.run(id, i + 1, value));

    // Retargeting a row's date/exercise onto a day that already logs that
    // exercise would recreate the split this app just merged away, so the
    // two collapse into one workout (this row keeps the sets of both).
    const collisions = db
      .query("SELECT id FROM workouts WHERE date = ? AND exercise = ? AND id != ? ORDER BY id")
      .all(date, exercise, id) as { id: number }[];

    let finalSets = sets;
    if (collisions.length > 0) {
      for (const c of collisions) {
        const extra = (
          db.query("SELECT value FROM sets WHERE workout_id = ? ORDER BY set_number").all(c.id) as {
            value: string;
          }[]
        ).map((r) => r.value);
        finalSets = finalSets.concat(extra);
        db.prepare("DELETE FROM workouts WHERE id = ?").run(c.id);
      }
      db.prepare("DELETE FROM sets WHERE workout_id = ?").run(id);
      finalSets.forEach((value, i) => insertSet.run(id, i + 1, value));
    }

    return { id, date, exercise, sets: finalSets };
  })();
}

// Bulk-imports workout rows pasted/uploaded from a spreadsheet (date,
// exercise, set1, set2, ... per row) — same shape as migrate.ts's xlsx
// import, but driven by the request body instead of the static xlsx file.
// Rows missing a date or exercise are skipped rather than rejecting the
// whole batch, since a bad paste shouldn't lose the good rows alongside it.
function bulkCreateWorkouts(body: any) {
  const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];

  let imported = 0;
  let skipped = 0;
  let mergedIntoExisting = 0;

  db.transaction(() => {
    for (const row of rows) {
      const date = normalizeDate(String(row?.date ?? "").trim());
      const exercise = String(row?.exercise ?? "").trim();
      const sets: string[] = Array.isArray(row?.sets)
        ? row.sets.map((s: unknown) => String(s ?? "").trim()).filter((s: string) => s !== "")
        : [];
      if (!date || !exercise) {
        skipped++;
        continue;
      }

      // Same rule as single-entry logging: a repeat of an exercise already
      // logged that day extends it instead of starting a second row. Also
      // makes re-pasting an overlapping range additive rather than duplicating.
      const alreadyLogged = db
        .query("SELECT 1 FROM workouts WHERE date = ? AND exercise = ? COLLATE NOCASE LIMIT 1")
        .get(date, exercise);
      if (alreadyLogged) mergedIntoExisting++;

      appendSetsToWorkout(date, exercise, sets);
      imported++;
    }
  })();

  return { imported, skipped, mergedIntoExisting };
}

function deleteWorkout(id: number) {
  const result = db.prepare("DELETE FROM workouts WHERE id = ?").run(id);
  if (result.changes === 0) throw new Error("not found");
}

// One lean row per logged workout for the Volume chart: enough to bucket by
// date and classify by exercise, without shipping every set value. The
// fatigue-tier classification itself stays client-side (public/utils.js), so
// there's only ever one copy of those rules.
function listVolume() {
  // Set values are concatenated (on a separator no set value contains, since
  // a single value can hold commas) only to be counted here — they're
  // dropped before the response, so the chart still ships one number per
  // workout rather than every set.
  const rows = db
    .query(
      `SELECT w.date, w.exercise, d.full_name AS exerciseName,
              d.movement_pattern AS movementPattern, d.fatigue_tier AS fatigueTier,
              GROUP_CONCAT(s.value, char(31)) AS setValues
       FROM workouts w
       LEFT JOIN sets s ON s.workout_id = w.id
       LEFT JOIN exercise_dictionary d ON d.abbreviation = w.exercise
       GROUP BY w.id
       ORDER BY w.date`
    )
    .all() as ({ setValues: string | null } & Record<string, unknown>)[];

  return rows
    .map(({ setValues, ...row }) => ({
      ...row,
      setCount: countSets(setValues === null ? [] : setValues.split("\x1f")),
    }))
    .filter((row) => row.setCount > 0);
}

// ---------- exercise dictionary ----------

function listDictionary() {
  return db
    .query(
      `SELECT
         d.abbreviation,
         d.full_name,
         d.sled_weight_kg,
         d.movement_pattern,
         d.fatigue_tier,
         COUNT(w.id) as usage_count,
         MAX(w.date) as last_used,
         -- A sled set is "S+..." or "S25+..." — the second form names the
         -- machine's own carriage weight inline, so GLOB matches the digits
         -- LIKE can't. LIKE is already case-insensitive here; GLOB isn't,
         -- hence the upper().
         EXISTS (
           SELECT 1 FROM workouts sw
           JOIN sets ss ON ss.workout_id = sw.id
           WHERE sw.exercise = d.abbreviation
             AND (ss.value LIKE 'S+%' OR upper(ss.value) GLOB 'S[0-9]*+*')
         ) as uses_sled
       FROM exercise_dictionary d
       LEFT JOIN workouts w ON w.exercise = d.abbreviation
       GROUP BY d.abbreviation
       ORDER BY usage_count DESC, last_used DESC, d.abbreviation COLLATE NOCASE`
    )
    .all();
}

// Parses a sled weight off a request body. Returns `undefined` when the
// caller didn't mention the field at all (leave it alone), or `null` for an
// explicit clear (fall back to the client's default sled weight).
function parseSledWeight(body: any): number | null | undefined {
  if (!(body && Object.prototype.hasOwnProperty.call(body, "sledWeightKg"))) return undefined;
  const raw = body.sledWeightKg;
  if (raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error("sledWeightKg must be a non-negative number");
  return n;
}

// Same present-vs-absent contract as parseSledWeight: `undefined` means the
// caller didn't mention it, `null` means clear it back to the auto guess.
const MOVEMENT_PATTERNS = ["full", "push", "squat", "pulls", "hinge", "leg", "core", "other"];

function parseMovementPattern(body: any): string | null | undefined {
  if (!(body && Object.prototype.hasOwnProperty.call(body, "movementPattern"))) return undefined;
  const raw = body.movementPattern;
  if (raw === null || String(raw).trim() === "") return null;
  const v = String(raw).trim().toLowerCase();
  if (!MOVEMENT_PATTERNS.includes(v))
    throw new Error(`movementPattern must be one of: ${MOVEMENT_PATTERNS.join(", ")}`);
  return v;
}

const FATIGUE_TIERS = ["complex", "compound", "isolation", "technique", "cardio"];

function parseFatigueTier(body: any): string | null | undefined {
  if (!(body && Object.prototype.hasOwnProperty.call(body, "fatigueTier"))) return undefined;
  const raw = body.fatigueTier;
  if (raw === null || String(raw).trim() === "") return null;
  const v = String(raw).trim().toLowerCase();
  if (!FATIGUE_TIERS.includes(v)) throw new Error(`fatigueTier must be one of: ${FATIGUE_TIERS.join(", ")}`);
  return v;
}

function upsertDictionaryEntry(body: any) {
  const typedAbbreviation = String(body?.abbreviation ?? "").trim();
  // Same present-vs-absent contract as every other field here: omitting
  // `fullName` leaves the existing name alone. Sending an empty string still
  // clears it, so the name editor can blank a name on purpose — but a caller
  // that only means to set a tag can't wipe one by accident.
  const hasFullName = !!body && Object.prototype.hasOwnProperty.call(body, "fullName");
  const fullName = hasFullName ? String(body.fullName ?? "").trim() : undefined;
  if (!typedAbbreviation) throw new Error("abbreviation is required");

  // Naming "Fsq" names the existing "FSQ" rather than starting a second entry
  // for the same exercise.
  const abbreviation = canonicalExercise(typedAbbreviation);

  const sledWeightKg = parseSledWeight(body);
  const movementPattern = parseMovementPattern(body);
  const fatigueTier = parseFatigueTier(body);

  db.prepare(
    `INSERT INTO exercise_dictionary (abbreviation, full_name) VALUES (?, ?)
     ON CONFLICT(abbreviation) DO NOTHING`
  ).run(abbreviation, fullName ?? "");
  if (fullName !== undefined) {
    db.prepare("UPDATE exercise_dictionary SET full_name = ? WHERE abbreviation = ?").run(
      fullName,
      abbreviation
    );
  }

  // Only touched when the caller actually sent the field — the name-only
  // callers (Lapse title, day panel) must not clear a configured sled weight.
  if (sledWeightKg !== undefined) {
    db.prepare("UPDATE exercise_dictionary SET sled_weight_kg = ? WHERE abbreviation = ?").run(
      sledWeightKg,
      abbreviation
    );
  }
  if (movementPattern !== undefined) {
    db.prepare("UPDATE exercise_dictionary SET movement_pattern = ? WHERE abbreviation = ?").run(
      movementPattern,
      abbreviation
    );
  }
  if (fatigueTier !== undefined) {
    db.prepare("UPDATE exercise_dictionary SET fatigue_tier = ? WHERE abbreviation = ?").run(
      fatigueTier,
      abbreviation
    );
  }

  return { abbreviation, fullName, sledWeightKg, movementPattern, fatigueTier };
}

function bulkUpsertDictionary(body: any) {
  const entries: { abbreviation: string; fullName: string }[] = Array.isArray(body?.entries)
    ? body.entries
    : [];
  let count = 0;
  const stmt = db.prepare(
    `INSERT INTO exercise_dictionary (abbreviation, full_name) VALUES (?, ?)
     ON CONFLICT(abbreviation) DO UPDATE SET full_name = excluded.full_name`
  );
  db.transaction(() => {
    for (const e of entries) {
      const typed = String(e?.abbreviation ?? "").trim();
      const fullName = String(e?.fullName ?? "").trim();
      if (!typed) continue;
      const abbreviation = canonicalExercise(typed);
      stmt.run(abbreviation, fullName);
      count++;
    }
  })();
  return { imported: count };
}

function deleteDictionaryEntry(abbreviation: string) {
  const result = db.prepare("DELETE FROM exercise_dictionary WHERE abbreviation = ?").run(
    abbreviation
  );
  if (result.changes === 0) throw new Error("not found");
}

// Folds every same-day pair of workouts for one exercise into a single row,
// the way logging already does — needed after reassigning workouts onto
// another abbreviation, since both sides may have logged the same day.
// Earliest row (by id, i.e. insertion order) keeps the merged sets.
// Returns how many rows were absorbed. Caller supplies the transaction.
function foldSameDayWorkouts(exercise: string) {
  const dupeDates = db
    .query(
      `SELECT date FROM workouts WHERE exercise = ? GROUP BY date HAVING COUNT(*) > 1`
    )
    .all(exercise) as { date: string }[];

  const selectSets = db.prepare("SELECT value FROM sets WHERE workout_id = ? ORDER BY set_number");
  const insertSet = db.prepare("INSERT INTO sets (workout_id, set_number, value) VALUES (?, ?, ?)");
  let absorbed = 0;

  for (const { date } of dupeDates) {
    const ids = (
      db.query("SELECT id FROM workouts WHERE date = ? AND exercise = ? ORDER BY id").all(date, exercise) as {
        id: number;
      }[]
    ).map((r) => r.id);

    const values = ids.flatMap((id) => (selectSets.all(id) as { value: string }[]).map((r) => r.value));

    // `sets` cascades on workout delete, so the redundant rows go first and
    // the keeper is then rewritten with the full, renumbered list.
    for (const id of ids.slice(1)) db.prepare("DELETE FROM workouts WHERE id = ?").run(id);
    db.prepare("DELETE FROM sets WHERE workout_id = ?").run(ids[0]);
    values.forEach((value, i) => insertSet.run(ids[0], i + 1, value));
    absorbed += ids.length - 1;
  }

  return absorbed;
}

// Folds one or more "duplicate" abbreviations into a single canonical one:
// every logged workout under the merged-away abbreviations is reassigned to
// `keep`, and their exercise_dictionary rows are removed. `keep`'s own row is
// preserved (optionally renaming it via `fullName` in the same transaction).
function mergeDictionaryEntries(body: any) {
  const keep = String(body?.keep ?? "").trim();
  if (!keep) throw new Error("keep is required");

  const merge: string[] = Array.isArray(body?.merge)
    ? [...new Set(body.merge.map((s: unknown) => String(s ?? "").trim()).filter(Boolean))]
    : [];
  const toMerge = merge.filter((m) => m !== keep);
  if (toMerge.length === 0) throw new Error("select at least one other abbreviation to merge");

  const keepExists = db.query("SELECT 1 FROM exercise_dictionary WHERE abbreviation = ?").get(keep);
  if (!keepExists) throw new Error(`"${keep}" is not a known abbreviation`);

  // A blank "full name" box on the merge panel means "keep what's there" —
  // treating it as an instruction to clear the name silently destroyed the
  // kept exercise's name whenever the field was left empty.
  const rawFullName = body?.fullName !== undefined ? String(body.fullName).trim() : "";
  const fullName = rawFullName === "" ? undefined : rawFullName;

  let workoutsReassigned = 0;
  let workoutsFolded = 0;
  db.transaction(() => {
    if (fullName !== undefined) {
      db.prepare("UPDATE exercise_dictionary SET full_name = ? WHERE abbreviation = ?").run(
        fullName,
        keep
      );
    }
    for (const m of toMerge) {
      const result = db.prepare("UPDATE workouts SET exercise = ? WHERE exercise = ?").run(keep, m);
      workoutsReassigned += result.changes;
      db.prepare("DELETE FROM exercise_dictionary WHERE abbreviation = ?").run(m);
    }
    // Both abbreviations may have been logged on the same day — one session,
    // so one row.
    workoutsFolded = foldSameDayWorkouts(keep);
  })();

  return { keep, merged: toMerge, workoutsReassigned, workoutsFolded };
}

// ---------- exercise history (Lapse tab) ----------

function exerciseHistory(typedAbbreviation: string) {
  // A Lapse link or bookmark written with different capitalization still
  // opens the exercise it names, rather than an empty chart.
  const abbreviation = canonicalExercise(typedAbbreviation);
  const workouts = db
    .query("SELECT id, date FROM workouts WHERE exercise = ? COLLATE NOCASE ORDER BY date ASC, id ASC")
    .all(abbreviation) as { id: number; date: string }[];

  const ids = workouts.map((w) => w.id);
  const setRows = ids.length
    ? (db
        .query(
          `SELECT workout_id, set_number, value FROM sets WHERE workout_id IN (${ids
            .map(() => "?")
            .join(",")}) ORDER BY set_number`
        )
        .all(...ids) as { workout_id: number; set_number: number; value: string }[])
    : [];

  const setsByWorkout = new Map<number, string[]>();
  for (const s of setRows) {
    if (!setsByWorkout.has(s.workout_id)) setsByWorkout.set(s.workout_id, []);
    setsByWorkout.get(s.workout_id)!.push(s.value);
  }

  const history = workouts.map((w) => ({
    id: w.id,
    date: w.date,
    sets: setsByWorkout.get(w.id) ?? [],
  }));

  const dictRow = db
    .query("SELECT full_name FROM exercise_dictionary WHERE abbreviation = ?")
    .get(abbreviation) as { full_name: string } | null;

  return {
    abbreviation,
    fullName: dictRow?.full_name || null,
    history,
    timesLogged: history.length,
    firstDate: history[0]?.date ?? null,
    lastDate: history[history.length - 1]?.date ?? null,
  };
}

// Every workout logged on one specific day, with each exercise's dictionary
// name attached — powers the "click a date" expanded day panel.
function workoutsOnDate(date: string) {
  const workouts = db
    .query("SELECT id, exercise FROM workouts WHERE date = ? ORDER BY id ASC")
    .all(date) as { id: number; exercise: string }[];

  const ids = workouts.map((w) => w.id);
  const setRows = ids.length
    ? (db
        .query(
          `SELECT workout_id, set_number, value FROM sets WHERE workout_id IN (${ids
            .map(() => "?")
            .join(",")}) ORDER BY set_number`
        )
        .all(...ids) as { workout_id: number; set_number: number; value: string }[])
    : [];

  const dictRows = db.query("SELECT abbreviation, full_name FROM exercise_dictionary").all() as {
    abbreviation: string;
    full_name: string;
  }[];
  const dict = new Map(dictRows.map((d) => [d.abbreviation, d.full_name]));

  const setsByWorkout = new Map<number, string[]>();
  for (const s of setRows) {
    if (!setsByWorkout.has(s.workout_id)) setsByWorkout.set(s.workout_id, []);
    setsByWorkout.get(s.workout_id)!.push(s.value);
  }

  return {
    date,
    workouts: workouts.map((w) => ({
      id: w.id,
      exercise: w.exercise,
      exerciseName: dict.get(w.exercise) || null,
      sets: setsByWorkout.get(w.id) ?? [],
    })),
  };
}

// ---------- cardio (runs & hikes) ----------

const CARDIO_ACTIVITIES = new Set(["run", "hike"]);
const DISTANCE_UNITS = new Set(["mi", "km"]);
const ELEVATION_UNITS = new Set(["ft", "m"]);

function listCardioGrouped(url: URL) {
  const search = url.searchParams.get("search")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 200);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const where = search ? "WHERE activity LIKE ? OR date LIKE ? OR notes LIKE ?" : "";
  const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

  const total = (
    db.query(`SELECT COUNT(*) as c FROM cardio_sessions ${where}`).get(...searchParams) as {
      c: number;
    }
  ).c;

  const sessions = db
    .query(
      `SELECT id, date, activity, distance_value, distance_unit, duration_seconds,
              elevation_value, elevation_unit, notes
       FROM cardio_sessions ${where}
       ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...searchParams, limit, offset);

  return { sessions, total };
}

function readCardioBody(body: any) {
  const date = normalizeDate(String(body?.date ?? "").trim());
  const activity = String(body?.activity ?? "").trim().toLowerCase();
  const distanceValue = Number(body?.distanceValue);
  const distanceUnit = String(body?.distanceUnit ?? "").trim().toLowerCase();
  const durationSeconds = Number(body?.durationSeconds);
  const hasElevation = body?.elevationValue !== undefined && body?.elevationValue !== null && body?.elevationValue !== "";
  const elevationValue = hasElevation ? Number(body.elevationValue) : null;
  const elevationUnit = hasElevation ? String(body?.elevationUnit ?? "").trim().toLowerCase() : null;
  const notes = String(body?.notes ?? "").trim();

  if (!date) throw new Error("date is required");
  if (!CARDIO_ACTIVITIES.has(activity)) throw new Error("activity must be 'run' or 'hike'");
  if (!Number.isFinite(distanceValue) || distanceValue <= 0) throw new Error("distance is required");
  if (!DISTANCE_UNITS.has(distanceUnit)) throw new Error("distance unit must be 'mi' or 'km'");
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("duration is required");
  if (hasElevation) {
    if (!Number.isFinite(elevationValue) || (elevationValue as number) < 0) {
      throw new Error("elevation must be a non-negative number");
    }
    if (!elevationUnit || !ELEVATION_UNITS.has(elevationUnit)) {
      throw new Error("elevation unit must be 'ft' or 'm'");
    }
  }

  return { date, activity, distanceValue, distanceUnit, durationSeconds, elevationValue, elevationUnit, notes };
}

function createCardio(body: any) {
  const c = readCardioBody(body);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO cardio_sessions
         (date, activity, distance_value, distance_unit, duration_seconds, elevation_value, elevation_unit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(c.date, c.activity, c.distanceValue, c.distanceUnit, c.durationSeconds, c.elevationValue, c.elevationUnit, c.notes);

  return { id: lastInsertRowid, ...c };
}

function updateCardio(id: number, body: any) {
  const c = readCardioBody(body);
  const exists = db.query("SELECT id FROM cardio_sessions WHERE id = ?").get(id);
  if (!exists) throw new Error("not found");

  db.prepare(
    `UPDATE cardio_sessions
     SET date = ?, activity = ?, distance_value = ?, distance_unit = ?, duration_seconds = ?,
         elevation_value = ?, elevation_unit = ?, notes = ?
     WHERE id = ?`
  ).run(c.date, c.activity, c.distanceValue, c.distanceUnit, c.durationSeconds, c.elevationValue, c.elevationUnit, c.notes, id);

  return { id, ...c };
}

function deleteCardio(id: number) {
  const result = db.prepare("DELETE FROM cardio_sessions WHERE id = ?").run(id);
  if (result.changes === 0) throw new Error("not found");
}

// ---------- auth ----------

// The log is personal, so any publicly-reachable deployment sets KILOG_PASSWORD
// and everything behind it requires HTTP Basic auth. Left unset (the local
// default) the check is skipped entirely, so running on localhost is unchanged.
const PASSWORD = process.env.KILOG_PASSWORD ?? "";

function authorized(req: Request) {
  if (!PASSWORD) return true;

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return false;
  }

  // Any username is accepted; only the password half is checked.
  const supplied = decoded.slice(decoded.indexOf(":") + 1);
  const a = Buffer.from(supplied);
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- server ----------

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (!authorized(req)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="kilog", charset="UTF-8"' },
      });
    }

    try {
      if (pathname === "/api/workouts" && req.method === "GET") {
        return json(listWorkoutsGrouped(url));
      }
      if (pathname === "/api/volume" && req.method === "GET") {
        return json(listVolume());
      }
      if (pathname === "/api/workouts" && req.method === "POST") {
        return json(createWorkout(await req.json()), { status: 201 });
      }
      if (pathname === "/api/workouts/bulk" && req.method === "POST") {
        return json(bulkCreateWorkouts(await req.json()));
      }
      const workoutMatch = pathname.match(/^\/api\/workouts\/(\d+)$/);
      if (workoutMatch && req.method === "PUT") {
        return json(updateWorkout(Number(workoutMatch[1]), await req.json()));
      }
      if (workoutMatch && req.method === "DELETE") {
        deleteWorkout(Number(workoutMatch[1]));
        return json({ ok: true });
      }
      const dateMatch = pathname.match(/^\/api\/workouts\/on\/(\d{4}-\d{2}-\d{2})$/);
      if (dateMatch && req.method === "GET") {
        return json(workoutsOnDate(dateMatch[1]));
      }

      if (pathname === "/api/cardio" && req.method === "GET") {
        return json(listCardioGrouped(url));
      }
      if (pathname === "/api/cardio" && req.method === "POST") {
        return json(createCardio(await req.json()), { status: 201 });
      }
      const cardioMatch = pathname.match(/^\/api\/cardio\/(\d+)$/);
      if (cardioMatch && req.method === "PUT") {
        return json(updateCardio(Number(cardioMatch[1]), await req.json()));
      }
      if (cardioMatch && req.method === "DELETE") {
        deleteCardio(Number(cardioMatch[1]));
        return json({ ok: true });
      }

      if (pathname === "/api/dictionary" && req.method === "GET") {
        return json(listDictionary());
      }
      if (pathname === "/api/dictionary" && req.method === "POST") {
        return json(upsertDictionaryEntry(await req.json()), { status: 201 });
      }
      if (pathname === "/api/dictionary/bulk" && req.method === "POST") {
        return json(bulkUpsertDictionary(await req.json()));
      }
      if (pathname === "/api/dictionary/merge" && req.method === "POST") {
        return json(mergeDictionaryEntries(await req.json()));
      }
      const historyMatch = pathname.match(/^\/api\/exercises\/([^/]+)\/history$/);
      if (historyMatch && req.method === "GET") {
        return json(exerciseHistory(decodeURIComponent(historyMatch[1])));
      }
      const dictMatch = pathname.match(/^\/api\/dictionary\/([^/]+)$/);
      if (dictMatch && req.method === "DELETE") {
        deleteDictionaryEntry(decodeURIComponent(dictMatch[1]));
        return json({ ok: true });
      }

      // static files
      let filePath = pathname === "/" ? "/index.html" : pathname;
      if (!filePath.includes(".")) filePath += ".html";
      const file = Bun.file(`${import.meta.dir}/public${filePath}`);
      if (await file.exists()) return new Response(file);

      return new Response("Not found", { status: 404 });
    } catch (err: any) {
      const message = err?.message ?? "Internal error";
      const status = message === "not found" ? 404 : 400;
      return json({ error: message }, { status });
    }
  },
});

console.log(`Workout log server running at http://localhost:${server.port}`);
