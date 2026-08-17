#!/usr/bin/env bash
# Rebuilds dist/ and republishes it to the gh-pages branch.
#
# The snapshot is only as current as the last run — new workouts do not appear
# on the published site until this is run again.
#
# gh-pages holds generated output only, so it is rebuilt from scratch and
# force-pushed rather than committed onto. Nothing on master is touched.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_URL=$(git remote get-url origin)

bun run build:static

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp -r dist/. "$STAGE"/
# Without this, Pages runs the output through Jekyll and drops any path
# beginning with an underscore.
touch "$STAGE/.nojekyll"

git -C "$STAGE" init -q -b gh-pages
git -C "$STAGE" config user.name "$(git config user.name)"
git -C "$STAGE" config user.email "$(git config user.email)"
git -C "$STAGE" add -A
git -C "$STAGE" commit -q -m "Publish static snapshot of kilog"
git -C "$STAGE" remote add origin "$REPO_URL"
git -C "$STAGE" push -q --force origin gh-pages

echo "Published. Live in a minute or two at https://danielluzhu.github.io/kilog/"
