#!/usr/bin/env bash
# Refreshes the committed database snapshot at backups/workout.db.
#
# Uses VACUUM INTO rather than copying the file: the live database runs in WAL
# mode, so recent writes sit in workout.db-wal and a plain copy of workout.db
# alone would silently be missing them. VACUUM INTO writes one consistent file
# with everything folded in, and is safe to run while the server is up.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p backups
rm -f backups/workout.db

bun -e '
import { Database } from "bun:sqlite";
const db = new Database("data/workout.db", { readonly: true });
db.query("VACUUM INTO ?").run("backups/workout.db");
const check = new Database("backups/workout.db", { readonly: true })
  .query("PRAGMA integrity_check")
  .get().integrity_check;
if (check !== "ok") throw new Error(`snapshot failed integrity check: ${check}`);
const n = new Database("backups/workout.db", { readonly: true })
  .query("SELECT COUNT(*) c FROM workouts")
  .get().c;
console.log(`Snapshot written: ${n} workouts`);
'

echo "Commit backups/workout.db to publish it."
