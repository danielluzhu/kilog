this is Dan's personal file storage. it will contain his workout log, favorite films, etc.

## Running it

```
bun run start
```

Serves the log at http://localhost:3000, reading and writing
`data/workout.db`. The database is gitignored and stays on this machine.

Set `KILOG_PASSWORD` to put every route behind HTTP Basic auth — needed for
any deployment reachable from the internet, and best left unset locally.

## The published snapshot

https://danielluzhu.github.io/kilog/ is a read-only copy, rebuilt by:

```
scripts/publish-static.sh
```

That regenerates `dist/` and force-pushes it to the `gh-pages` branch. **New
workouts do not appear on the published site until it is run again.**

`bun run build:static` alone rebuilds `dist/` without publishing.

## The database backup

`backups/workout.db` is a committed snapshot of the live database — the
exported JSON is a view of the log, not something you can restore from, so
this is the copy that can rebuild `data/workout.db` if the machine is lost:

```
scripts/backup-db.sh   # refresh the snapshot
git add -f backups/workout.db && git commit && git push
```

Restore with `cp backups/workout.db data/workout.db`.

### Published automatically, one commit per day

`workout-log-publish.path` watches the live database and runs
`scripts/commit-new-workouts.ts` whenever an entry is written. It commits
**one workout day per commit**, with the whole session written into the
message, and pushes to `master`. A rest day leaves no commit behind.

A day is published once, after it is over. While anything dated today
(Pacific) is still changing, a run holds everything back, so a session never
gets split across commits by the rests between sets. The finished day goes
out as a single commit on the first run after midnight, which is at the
latest the daily timer. That commit covers everything filed under the date:
new exercises, sets added to or corrected on existing ones, cardio, and any
dictionary entry the day used for the first time. A later edit to a day
that's already published gets one commit of its own (*Edit the … session*).

`workout-log-publish.timer` runs the same job once a day at about 3am
Pacific. It publishes the day that just ended and sweeps up anything the
watch missed: the machine asleep, a commit made by hand, a run that aborted
on a dirty tree.

```
systemctl status workout-log-publish.path         # is the watch armed
systemctl list-timers workout-log-publish.timer   # when the daily sweep runs
sudo journalctl -u workout-log-publish -n 50      # what it last did
bun run scripts/commit-new-workouts.ts            # run it now, no waiting
```

It stops rather than guess if the working tree is dirty, the branch is
behind `origin`, or a snapshot fails its integrity check, and it verifies
the published file byte-for-byte against a fresh vacuum before pushing. Any
of those leaves the tree exactly as it found it, and the next run picks
everything up.

**This publishes the snapshot, not the website.** https://danielluzhu.github.io/kilog/
still only changes when `scripts/publish-static.sh` is run.

The snapshot is public: anyone can read the log at that URL, and the JSON
under `gh-pages` remains in git history even after a branch is deleted.
Editing works only against the local server — the published copy answers
writes with a read-only error.
