const $ = (sel) => document.querySelector(sel);

// Two accepted shapes, freely mixable line by line:
//  1. Block form: a line with just a date, followed by one line per
//     exercise ("ABBREV set1, set2, ..." — comma, tab, or space separated
//     after the abbreviation, and freely mixable) until the next date line.
//     Matches how a workout actually gets jotted down: write the day once,
//     then list what got done.
//       2026-07-30
//       FSQ 135x5, 140x5, 145x3
//       BP 95x8, 100x6
//  2. Old single-row form, still supported for spreadsheet pastes:
//       date, exercise, set1, set2, ...
function isDateOnlyLine(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s);
}

function parseWorkoutRows(text) {
  const rows = [];
  let currentDate = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue; // blank lines are just spacing — keep the current date

    if (isDateOnlyLine(line)) {
      currentDate = line;
      continue;
    }

    const sep = line.includes("\t") ? "\t" : ",";
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));

    // Single-row form: first column is itself a date.
    if (cols.length > 1 && isDateOnlyLine(cols[0])) {
      const [date, exercise, ...rest] = cols;
      if (exercise) rows.push({ date, exercise, sets: rest.flatMap(splitSetTokens) });
      continue;
    }

    // Otherwise this is an exercise line under the current block date:
    // first whitespace-delimited token is the abbreviation, the rest is the
    // set list — comma, tab, and space are all equivalent set separators.
    if (!currentDate) continue; // no date established yet — nothing to attach this to
    const m = line.match(/^(\S+):?\s*(.*)$/);
    if (!m || !m[1]) continue;
    const exercise = m[1];
    const sets = splitSetTokens(m[2]);
    rows.push({ date: currentDate, exercise, sets });
  }

  return rows;
}

$("#workout-csv-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("#workout-csv-text").value = await file.text();
});

$("#workout-import-btn").addEventListener("click", async () => {
  const status = $("#workout-import-status");
  const rows = parseWorkoutRows($("#workout-csv-text").value);
  if (rows.length === 0) {
    status.textContent = "Nothing to import — check the format (date, exercise, sets... per line).";
    status.className = "status err";
    return;
  }

  const res = await fetch("/api/workouts/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  const data = await res.json();
  if (!res.ok) {
    status.textContent = data.error || "Import failed";
    status.className = "status err";
    return;
  }

  // The log this just changed is a page away now, so the result has to say
  // what landed and offer the way to go and look at it.
  const summary = data.skipped
    ? `Imported ${data.imported} workouts, skipped ${data.skipped} row(s) missing a date or exercise.`
    : `Imported ${data.imported} workouts.`;
  status.innerHTML = `${escapeHtml(summary)} <a href="/index.html">See them in the log</a>`;
  status.className = "status ok";
  $("#workout-csv-text").value = "";
  $("#workout-csv-file").value = "";
});
