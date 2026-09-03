#!/usr/bin/env bash
# Renders each page in headless Chromium and reports console errors plus
# whether the page actually painted data.
#
# Checking the exported JSON alone is not enough: static-api.js only behaves
# like the server once it is installed as window.fetch, and the bug this
# script was written for — the shim fetching its own export files through
# itself — is invisible outside a real browser.
#
# Usage: scripts/check-static.sh http://localhost:4455/kilog
BASE="$1"
TMP=$(mktemp -d)
FAIL=0

check() {
  local page="$1" probe="$2" label="$3"
  local dom="$TMP/$(echo "$page" | tr '/?=&' '____').html"
  local err="$dom.err"
  timeout 90 chromium --headless --no-sandbox --disable-gpu \
    --enable-logging=stderr --v=0 --virtual-time-budget=20000 \
    --dump-dom "$BASE$page" >"$dom" 2>"$err"

  local console
  console=$(grep -oE 'CONSOLE:[0-9]+\] ".*' "$err" | grep -viE 'dbus|DevTools|Fontconfig' | head -3)
  local hits
  hits=$(grep -cE "$probe" "$dom")

  if [ -n "$console" ]; then
    echo "FAIL  $label"
    echo "      $console"
    FAIL=1
  elif [ "$hits" -eq 0 ]; then
    echo "FAIL  $label — rendered but no match for /$probe/"
    FAIL=1
  else
    echo "PASS  $label ($hits matches)"
  fi
}

check "/"               'entries across [0-9]+ days' "index — log renders"
check "/index.html"     '20[0-9]{2}-[0-9]{2}-[0-9]{2}' "index — dates present"
check "/weekly.html"    '[0-9]+.[0-9]+ kg' "weekly — prescribed weights"
check "/dictionary.html" '<tr' "dictionary — rows"
check "/volume.html"    '<svg|<canvas|chart' "volume — chart"
check "/lapse.html"     '<option|<tr|<svg' "lapse — content"
check "/cardio.html"    '<table|no sessions|<tr' "cardio — table"
check "/onerm.html"     '<option|<input' "1RM — form"
check "/prilepin.html"  '<table|<option' "prilepin — table"
check "/snatch.html"    '<img' "snatch — image"

echo
[ "$FAIL" -eq 0 ] && echo "ALL PAGES OK" || echo "FAILURES PRESENT"
exit $FAIL
