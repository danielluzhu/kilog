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

Restore with `cp backups/workout.db data/workout.db`. Like the published
site, the snapshot is only current as of the last run.

The snapshot is public: anyone can read the log at that URL, and the JSON
under `gh-pages` remains in git history even after a branch is deleted.
Editing works only against the local server — the published copy answers
writes with a read-only error.
