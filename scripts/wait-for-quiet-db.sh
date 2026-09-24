#!/usr/bin/env bash
# Waits until the live database has stopped being written to.
#
# workout-log-publish.path fires the moment a set lands, which is the middle
# of a session rather than the end of one. Holding here until the database has
# been quiet for a few minutes lets a session's worth of entries publish as one
# run -- and so as one commit per day -- instead of one run per set.
#
# This is an ExecStartPre, so the daily timer's run waits here too: at 3am
# Pacific the database has been quiet for hours and this returns at once.
set -euo pipefail

QUIET_SECONDS=${QUIET_SECONDS:-180}
MAX_WAIT_SECONDS=${MAX_WAIT_SECONDS:-1800}
POLL_SECONDS=${POLL_SECONDS:-15}

cd "$(dirname "$0")/.."

started=$(date +%s)

while :; do
  # The log runs in WAL mode: a new set touches workout.db-wal, and the
  # database file itself only moves on a checkpoint. The newest of the two is
  # the real answer to "when was this last written to".
  newest=0
  for f in data/workout.db data/workout.db-wal; do
    [[ -e "$f" ]] || continue
    m=$(stat -c %Y "$f")
    if (( m > newest )); then newest=$m; fi
  done

  now=$(date +%s)
  if (( now - newest >= QUIET_SECONDS )); then
    break
  fi

  if (( now - started >= MAX_WAIT_SECONDS )); then
    echo "database still being written after ${MAX_WAIT_SECONDS}s of waiting; publishing anyway"
    break
  fi

  sleep "$POLL_SECONDS"
done
