const $ = (sel) => document.querySelector(sel);

const DEFAULT_HINT =
  "Pulls the all-time best estimated 1RM for this exercise and converts each intensity row into an actual weight.";

async function loadExerciseOptions() {
  const res = await fetch("/api/dictionary");
  const entries = await res.json();
  registerDictionary(entries);
  $("#prilepin-exercise-options").innerHTML = entries
    .map(
      (e) =>
        `<option value="${escapeHtml(e.abbreviation)}">${escapeHtml(
          exerciseDisplayLabel(e.abbreviation, e.full_name)
        )}</option>`
    )
    .join("");
}

function showHint(text) {
  $("#prilepin-result").style.display = "none";
  const hint = $("#prilepin-hint");
  hint.textContent = text;
  hint.style.display = "";
}

let debounceTimer;
$("#prilepin-exercise").addEventListener("input", (e) => {
  clearTimeout(debounceTimer);
  const value = e.target.value.trim();
  debounceTimer = setTimeout(() => {
    if (value) loadForExercise(value);
    else showHint(DEFAULT_HINT);
  }, 250);
});

async function loadForExercise(abbreviation) {
  const res = await fetch(`/api/exercises/${encodeURIComponent(abbreviation)}/history`);
  const data = await res.json();

  if (data.timesLogged === 0) {
    showHint(`No logged history for "${abbreviation}" yet.`);
    return;
  }

  let best = null;
  for (const h of data.history) {
    const top = topScorableSetOf(h.sets, data.abbreviation, data.fullName);
    if (top && (!best || top.oneRM > best.oneRM)) best = top;
  }

  if (!best) {
    showHint(
      `Found ${data.timesLogged} logged session(s) for "${abbreviation}", but none have a scorable "weight x reps" set.`
    );
    return;
  }

  const tier = classifyFatigueTier(data.abbreviation, data.fullName);

  $("#prilepin-hint").style.display = "none";
  $("#prilepin-result").style.display = "";
  $("#prilepin-title").textContent = exerciseDisplayLabel(data.abbreviation, data.fullName);
  $("#prilepin-tier").textContent = FATIGUE_TIER_LABELS[tier];
  $("#prilepin-1rm").textContent = formatKg(best.oneRM);

  $("#prilepin-table-body").innerHTML = PRILEPIN_ROWS.map((row) => {
    const lo = roundKg(best.oneRM * row.pctMin);
    const hi = roundKg(best.oneRM * row.pctMax);
    return `<tr><td>${row.label}</td><td>${lo}–${hi}</td><td>${row.repsPerSet}</td><td>${row.optimalTotal}</td><td>${row.rangeTotal}</td></tr>`;
  }).join("");
}

loadExerciseOptions();
showHint(DEFAULT_HINT);
