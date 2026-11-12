// Publishes the workout log: refreshes the committed snapshot at
// backups/workout.db, one workout day per commit, and pushes.
//
// Run by workout-log-publish.path as entries are written and by
// workout-log-publish.timer once a day; safe to run by hand. Does nothing at
// all when the log hasn't moved, so a rest day leaves no trace in the history.
//
// A day is published once, whole, after it is over. While anything dated
// today (Pacific, the log's own day boundary) differs from the snapshot, the
// session is still being logged and the run holds everything back -- the
// path unit fires after every set, and publishing then would split one
// session across a string of commits. The first run after midnight, at the
// latest the daily timer's, picks the finished day up as a single commit.
//
// A day's commit carries everything that changed under that date: new
// exercises, sets added to or edited on existing ones, cardio, and the
// dictionary rows the day first used. The snapshot is one binary file, so its
// diff is unreadable; the message lists the day in full instead.
//
// Refuses to run rather than guess whenever the repository isn't in a state
// it fully understands: a dirty tree, a diverged branch, a snapshot that
// fails its integrity check. Every failure leaves the tree as it was found.
import { Database } from "bun:sqlite";
import { spawnSync } from "bun";
import { copyFileSync, rmSync, existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const REPO = join(import.meta.dir, "..");
const LIVE = join(REPO, "data/workout.db");
const TARGET = join(REPO, "backups/workout.db");
const BRANCH = "master";
const APP_TIME_ZONE = "America/Los_Angeles";

const log = (msg: string) => console.log(`[publish] ${msg}`);
const die = (msg: string): never => {
  console.error(`[publish] ABORT: ${msg}`);
  process.exit(1);
};

function git(args: string[], { check = true } = {}): string {
  const p = spawnSync(["git", ...args], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
  if (check && p.exitCode !== 0) {
    die(`git ${args.join(" ")}\n${p.stdout.toString()}${p.stderr.toString()}`);
  }
  return p.stdout.toString().trim();
}

// Same reading of "today" as public/utils.js: part by part, so no locale
// gets to choose the field order.
function todayIso(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// ---------- preflight ----------

if (!existsSync(LIVE)) die(`no live database at ${LIVE}`);

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== BRANCH) die(`on branch ${branch}, expected ${BRANCH}`);

// Anything uncommitted is someone's work in progress; committing around it
// would sweep it into a snapshot commit that says nothing about it.
if (git(["status", "--porcelain"])) die("working tree is dirty; leaving it alone");

git(["fetch", "--quiet", "origin", BRANCH]);
const behind = Number(git(["rev-list", "--count", `${BRANCH}..origin/${BRANCH}`]));
if (behind > 0) die(`local ${BRANCH} is ${behind} commit(s) behind origin; needs a manual look`);

// ---------- reading a day out of a database ----------

type Day = { workouts: any[]; sets: any[]; cardio: any[] };

function readDays(db: Database): Map<string, Day> {
  const days = new Map<string, Day>();
  const day = (d: string) => {
    if (!days.has(d)) days.set(d, { workouts: [], sets: [], cardio: [] });
    return days.get(d)!;
  };
  for (const w of db.query("SELECT * FROM workouts ORDER BY id").all() as any[]) day(w.date).workouts.push(w);
  for (const s of db
    .query("SELECT s.*, w.date AS _date FROM sets s JOIN workouts w ON w.id = s.workout_id ORDER BY s.id")
    .all() as any[]) {
    const { _date, ...set } = s;
    day(_date).sets.push(set);
  }
  for (const c of db.query("SELECT * FROM cardio_sessions ORDER BY id").all() as any[]) day(c.date).cardio.push(c);
  return days;
}

const sameDay = (a: Day | undefined, b: Day | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Every row of every table, for "is this the same database" -- the per-day
// view above doesn't see dictionary edits, fatigue rates or orphaned rows.
function contents(db: Database): string {
  const tables = (db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as any[]).map(
    (r) => r.name
  );
  return JSON.stringify(tables.map((t) => [t, db.query(`SELECT * FROM "${t}" ORDER BY rowid`).all()]));
}

function insert(db: Database, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  db.query(
    `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(", ")})`
  ).run(...(Object.values(row) as any[]));
}

// ---------- snapshot the live database ----------

const tmp = mkdtempSync(join(tmpdir(), "kilog-publish-"));
const fresh = join(tmp, "fresh.db");
const work = join(tmp, "work.db");
const cleanup = () => rmSync(tmp, { recursive: true, force: true });

try {
  // VACUUM INTO rather than a file copy: the live database runs in WAL mode,
  // so recent sets sit in the -wal file and a plain copy would miss them.
  new Database(LIVE, { readonly: true }).query("VACUUM INTO ?1").run(String(fresh));

  const freshDb = new Database(fresh, { readonly: true });
  const integrity = (freshDb.query("PRAGMA integrity_check").get() as any).integrity_check;
  if (integrity !== "ok") die(`fresh snapshot failed integrity check: ${integrity}`);

  // The committed snapshot, as the starting point to build forward from.
  const head = spawnSync(["git", "show", `HEAD:backups/workout.db`], { cwd: REPO, stdout: "pipe" });
  if (head.exitCode !== 0) die("cannot read the committed snapshot from HEAD");
  await Bun.write(work, head.stdout);

  const oldDb = new Database(work, { readonly: true });
  const oldDays = readDays(oldDb);
  const oldDict = new Set(
    (oldDb.query("SELECT abbreviation a FROM exercise_dictionary").all() as any[]).map((r) => r.a)
  );
  oldDb.close();

  const freshDays = readDays(freshDb);
  const freshDictRows = freshDb.query("SELECT * FROM exercise_dictionary").all() as any[];
  const newDict = freshDictRows.filter((d) => !oldDict.has(d.abbreviation));

  const changed = [...new Set([...oldDays.keys(), ...freshDays.keys()])]
    .filter((d) => !sameDay(oldDays.get(d), freshDays.get(d)))
    .sort();

  // Nothing new to snapshot doesn't mean nothing to push: a commit made by
  // hand earlier still needs to reach origin, and this job is what keeps the
  // two in step. Holding back an open day works the same way.
  const today = todayIso();
  const open = changed.filter((d) => d >= today);
  const snapshotUnchanged =
    Bun.hash(await Bun.file(fresh).arrayBuffer()) === Bun.hash(await Bun.file(TARGET).arrayBuffer());
  const hold = !snapshotUnchanged && open.length > 0;
  if (snapshotUnchanged) log("snapshot already current; checking for anything unpushed");
  if (hold) log(`${open.join(", ")} still being logged; publishing it once the day is over`);

  // ---------- one commit per workout day ----------

  const days = snapshotUnchanged || hold ? [] : changed;
  if (days.length) log(`${days.length} day(s) changed`);

  // A new dictionary row belongs with the day that first used it -- logging a
  // new abbreviation is what creates it. A workout can also name an exercise
  // the dictionary has no row for (rows get merged away while the workouts
  // keep their name), and there is nothing to carry over for those.
  const firstUse = new Map<string, string>();
  for (const d of days) {
    for (const w of freshDays.get(d)?.workouts ?? []) {
      if (!oldDict.has(w.exercise) && !firstUse.has(w.exercise)) firstUse.set(w.exercise, d);
    }
  }

  const freshContents = contents(freshDb);

  const commit = (message: string) => {
    // Once the rebuilt snapshot holds exactly what the live log does, publish
    // the live vacuum itself: the two differ in page layout even then, and
    // committing the rebuild would leave that churn for a commit of its own.
    const w = new Database(work, { readonly: true });
    const caughtUp = contents(w) === freshContents;
    rmSync(TARGET, { force: true });
    if (caughtUp) copyFileSync(fresh, TARGET);
    else w.query("VACUUM INTO ?1").run(String(TARGET));
    w.close();
    const chk = new Database(TARGET, { readonly: true });
    const ok = (chk.query("PRAGMA integrity_check").get() as any).integrity_check;
    chk.close();
    if (ok !== "ok") die(`built snapshot failed integrity check: ${ok}`);
    git(["add", "backups/workout.db"]);
    git(["commit", "--quiet", "-m", message]);
    log(`committed: ${message.split("\n")[0]}`);
  };

  for (const day of days) {
    const before = oldDays.get(day);
    const after = freshDays.get(day) ?? { workouts: [], sets: [], cardio: [] };
    const dictForDay = [...firstUse.entries()]
      .filter(([, d]) => d === day)
      .map(([a]) => a)
      .filter((a) => freshDictRows.some((d) => d.abbreviation === a));

    // Replace the day wholesale with what the live log now has for it.
    const db = new Database(work);
    db.transaction(() => {
      for (const w of before?.workouts ?? []) db.query("DELETE FROM sets WHERE workout_id=?1").run(w.id);
      db.query("DELETE FROM workouts WHERE date=?1").run(day);
      db.query("DELETE FROM cardio_sessions WHERE date=?1").run(day);
      for (const ab of dictForDay) insert(db, "exercise_dictionary", freshDictRows.find((d) => d.abbreviation === ab)!);
      for (const w of after.workouts) insert(db, "workouts", w);
      for (const s of after.sets) insert(db, "sets", s);
      for (const c of after.cardio) insert(db, "cardio_sessions", c);
    })();
    db.close();

    const oldIds = new Set((before?.workouts ?? []).map((w) => w.id));
    const names = [...after.workouts.map((w) => w.exercise), ...after.cardio.map((c) => c.activity)];
    const verb = !before
      ? "Log"
      : !names.length
        ? "Remove"
        : after.workouts.some((w) => !oldIds.has(w.id)) || after.cardio.length > before.cardio.length
          ? "Add to"
          : "Edit";

    // Subject names the exercises while they fit; the body always lists the
    // whole day as it now stands, since the diff itself is unreadable.
    let subject = `${verb} the ${day} session`;
    if (names.length) {
      subject += ": ";
      const parts: string[] = [];
      for (const n of names) {
        if ((subject + [...parts, n].join(", ")).length > 68) {
          parts.push("...");
          break;
        }
        parts.push(n);
      }
      subject += parts.join(", ");
    }

    const lines = after.workouts.map((w) => {
      const sets = after.sets
        .filter((s) => s.workout_id === w.id)
        .sort((a, b) => a.set_number - b.set_number)
        .map((s) => s.value)
        .join(", ");
      const full = freshDictRows.find((d) => d.abbreviation === w.exercise)?.full_name;
      const label = full ? `${w.exercise} (${full})` : w.exercise;
      return `  ${label}: ${sets || "no sets"}`;
    });
    for (const c of after.cardio) {
      const mins = Math.round(c.duration_seconds / 60);
      lines.push(`  ${c.activity}: ${c.distance_value} ${c.distance_unit} in ${mins} min`);
    }
    const body = lines.length ? lines.join("\n") : "  (the day no longer has any entries)";
    const dictNote = dictForDay.length
      ? `\n\nFirst use of ${dictForDay.join(", ")}, added to the exercise dictionary.`
      : "";

    commit(`${subject}\n\n${body}${dictNote}`);
  }

  // ---------- whatever else moved ----------
  // Dictionary and fatigue-rate edits, and anything else not filed under a
  // date. Committing the real vacuum output also guarantees the published
  // file is exactly what scripts/backup-db.sh produces.
  if (!snapshotUnchanged && !hold) copyFileSync(fresh, TARGET);
  if (git(["status", "--porcelain", "backups/workout.db"])) {
    const counts = freshDb.query("SELECT COUNT(*) c FROM workouts").get() as any;
    const dictNote = newDict.length
      ? `\n\nDictionary entries added: ${newDict.map((d) => d.abbreviation).join(", ")}.`
      : "";
    git(["add", "backups/workout.db"]);
    git([
      "commit", "--quiet", "-m",
      "Refresh the workout database snapshot\n\n" +
        "Dictionary and fatigue-rate changes -- everything outside the\n" +
        `per-day commits above. The snapshot now holds ${counts.c} workouts.${dictNote}`,
    ]);
    log("committed: Refresh the workout database snapshot");
  }

  freshDb.close();

  // The published file must be byte-identical to a straight vacuum of the
  // live database; anything else means the rebuild above drifted.
  if (!hold) {
    const a = Bun.hash(await Bun.file(fresh).arrayBuffer());
    const b = Bun.hash(await Bun.file(TARGET).arrayBuffer());
    if (a !== b) die("built snapshot differs from the live vacuum; not pushing");
  }

  const ahead = Number(git(["rev-list", "--count", `origin/${BRANCH}..${BRANCH}`]));
  if (ahead === 0) {
    log("nothing to push");
    cleanup();
    process.exit(0);
  }

  log(`pushing ${ahead} commit(s)`);
  git(["push", "origin", BRANCH]);
  log("pushed");
} finally {
  cleanup();
}
