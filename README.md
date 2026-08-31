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

### Published automatically, once a day

`workout-log-publish.timer` runs `scripts/commit-new-workouts.ts` every
morning: it refreshes the snapshot, commits **one workout day per commit**
with the session written into the message, and pushes to `master`. A rest
day leaves no commit behind.

```
systemctl list-timers workout-log-publish.timer   # when it next runs
sudo journalctl -u workout-log-publish -n 50      # what it last did
bun run scripts/commit-new-workouts.ts            # run it now
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
