// Publishes newly logged workouts: refreshes the committed snapshot at
// backups/workout.db, commits one workout day at a time, and pushes.
//
// Run by workout-log-publish.timer once a day, and safe to run by hand.
// Does nothing at all when the log hasn't moved, so a rest day leaves no
// trace in the history.
//
// The snapshot is one binary file, so a day's commit can't be a readable
// diff. Each commit therefore carries the session in its message -- every
// exercise and its sets -- which is the only human-readable record of what
// the blob changed.
//
// Refuses to run rather than guess whenever the repository isn't in a state
// it fully understands: a dirty tree, a diverged branch, a snapshot that
// fails its integrity check. Every failure leaves the tree as it was found.
import { Database } from "bun:sqlite";
import { spawnSync } from "bun";
import { copyFileSync, rmSync, existsSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const REPO = "/workspace";
const LIVE = join(REPO, "data/workout.db");
const TARGET = join(REPO, "backups/workout.db");
const BRANCH = "master";

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
  const oldWorkoutIds = new Set(
    (oldDb.query("SELECT id FROM workouts").all() as any[]).map((r) => r.id)
  );
  const oldDates = new Set((oldDb.query("SELECT DISTINCT date d FROM workouts").all() as any[]).map((r) => r.d));
  const oldDict = new Set(
    (oldDb.query("SELECT abbreviation a FROM exercise_dictionary").all() as any[]).map((r) => r.a)
  );
  oldDb.close();

  const newWorkouts = (
    freshDb.query("SELECT id, date, exercise, created_at FROM workouts ORDER BY date, id").all() as any[]
  ).filter((w) => !oldWorkoutIds.has(w.id));

  const freshDictRows = freshDb.query("SELECT * FROM exercise_dictionary").all() as any[];
  const newDict = freshDictRows.filter((d) => !oldDict.has(d.abbreviation));

  // Nothing new to snapshot doesn't mean nothing to push: a commit made by
  // hand earlier still needs to reach origin, and this job is what keeps the
  // two in step. So this only skips the snapshot work, and still falls
  // through to the push at the end.
  const snapshotUnchanged =
    Bun.hash(await Bun.file(fresh).arrayBuffer()) === Bun.hash(await Bun.file(TARGET).arrayBuffer());
  if (snapshotUnchanged) log("snapshot already current; checking for anything unpushed");

  // ---------- one commit per workout day ----------

  const days = snapshotUnchanged ? [] : [...new Set(newWorkouts.map((w) => w.date))].sort();
  if (days.length) log(`${newWorkouts.length} new workout(s) across ${days.length} day(s)`);

  // A new dictionary row belongs with the day that first used it -- logging a
  // new abbreviation is what creates it.
  const firstUse = new Map<string, string>();
  for (const w of newWorkouts) {
    if (!oldDict.has(w.exercise) && !firstUse.has(w.exercise)) firstUse.set(w.exercise, w.date);
  }

  const setsOf = (id: number) =>
    freshDb
      .query("SELECT id, workout_id, set_number, value FROM sets WHERE workout_id=?1 ORDER BY set_number")
      .all(id) as any[];

  const commit = (message: string) => {
    rmSync(TARGET, { force: true });
    const w = new Database(work, { readonly: true });
    w.query("VACUUM INTO ?1").run(String(TARGET));
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
    const ws = newWorkouts.filter((w) => w.date === day);
    const dictForDay = [...firstUse.entries()].filter(([, d]) => d === day).map(([a]) => a);

    const db = new Database(work);
    for (const ab of dictForDay) {
      const r = freshDictRows.find((d) => d.abbreviation === ab)!;
      db.query(
        `INSERT INTO exercise_dictionary
           (abbreviation, full_name, sled_weight_kg, movement_pattern, fatigue_tier)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      ).run(r.abbreviation, r.full_name, r.sled_weight_kg, r.movement_pattern, r.fatigue_tier);
    }
    for (const w of ws) {
      db.query("INSERT INTO workouts (id, date, exercise, created_at) VALUES (?1, ?2, ?3, ?4)").run(
        w.id, w.date, w.exercise, w.created_at
      );
      for (const s of setsOf(w.id)) {
        db.query("INSERT INTO sets (id, workout_id, set_number, value) VALUES (?1, ?2, ?3, ?4)").run(
          s.id, s.workout_id, s.set_number, s.value
        );
      }
    }
    db.close();

    // Subject names the exercises while they fit; the body always lists them
    // in full with their sets, since the diff itself is unreadable.
    const verb = oldDates.has(day) ? "Add to" : "Log";
    let subject = `${verb} the ${day} session: `;
    const parts: string[] = [];
    for (const w of ws) {
      if ((subject + [...parts, w.exercise].join(", ")).length > 68) {
        parts.push("...");
        break;
      }
      parts.push(w.exercise);
    }
    subject += parts.join(", ");

    const body = ws
      .map((w) => {
        const sets = setsOf(w.id).map((s) => s.value).join(", ");
        const full = freshDictRows.find((d) => d.abbreviation === w.exercise)?.full_name;
        const label = full ? `${w.exercise} (${full})` : w.exercise;
        return `  ${label}: ${sets || "no sets"}`;
      })
      .join("\n");
    const dictNote = dictForDay.length
      ? `\n\nFirst use of ${dictForDay.join(", ")}, added to the exercise dictionary.`
      : "";

    commit(`${subject}\n\n${body}${dictNote}`);
  }

  // ---------- whatever else moved ----------
  // Edits to older sessions, dictionary changes not tied to a new day, and
  // the page-level churn a re-save leaves behind. Committing the real vacuum
  // output also guarantees the published file is exactly what
  // scripts/backup-db.sh produces, rather than something rebuilt here.
  if (!snapshotUnchanged) copyFileSync(fresh, TARGET);
  if (git(["status", "--porcelain", "backups/workout.db"])) {
    const counts = freshDb.query("SELECT COUNT(*) c FROM workouts").get() as any;
    const dictNote = newDict.length
      ? `\n\nDictionary entries added: ${newDict.map((d) => d.abbreviation).join(", ")}.`
      : "";
    git(["add", "backups/workout.db"]);
    git([
      "commit", "--quiet", "-m",
      "Refresh the workout database snapshot\n\n" +
        "Edits to earlier sessions, dictionary changes, and the row churn a\n" +
        "re-save leaves behind -- everything the per-day commits above don't\n" +
        `cover. The snapshot now holds ${counts.c} workouts.${dictNote}`,
    ]);
    log("committed: Refresh the workout database snapshot");
  }

  freshDb.close();

  // The published file must be byte-identical to a straight vacuum of the
  // live database; anything else means the rebuild above drifted.
  const a = Bun.hash(await Bun.file(fresh).arrayBuffer());
  const b = Bun.hash(await Bun.file(TARGET).arrayBuffer());
  if (a !== b) die("built snapshot differs from the live vacuum; not pushing");

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
