const $ = (sel) => document.querySelector(sel);

// ---------- calculator ----------

function currentInputs() {
  const weight = parseFloat($("#orm-weight").value);
  const reps = parseFloat($("#orm-reps").value);
  return { weight, reps };
}

function recalc() {
  const { weight, reps } = currentInputs();
  const resultEl = $("#orm-result");
  const tbody = $("#orm-table-body");

  const capNote = $("#orm-cap-note");

  if (!(weight > 0) || !(reps > 0)) {
    resultEl.textContent = "—";
    tbody.innerHTML = "";
    capNote.style.display = "none";
    return;
  }

  const oneRM = epley1RM(weight, reps);
  resultEl.textContent = formatKg(oneRM);

  // The estimate silently clamps past 10 reps, so say so rather than leaving
  // a number that doesn't match the reps entered.
  if (reps > MAX_SCORED_REPS) {
    capNote.textContent = `Scored as ${MAX_SCORED_REPS} reps — Epley is unreliable past ${MAX_SCORED_REPS}, so higher rep counts don't raise the estimate.`;
    capNote.style.display = "";
  } else {
    capNote.style.display = "none";
  }

  const enteredReps = Math.round(reps);
  tbody.innerHTML = Array.from({ length: 10 }, (_, i) => i + 1)
    .map((r) => {
      const w = weightForReps(oneRM, r);
      const isEntered = r === enteredReps;
      return `<tr class="${isEntered ? "highlight" : ""}"><td>${r}</td><td>${roundKg(w)}</td></tr>`;
    })
    .join("");
}

$("#orm-weight").addEventListener("input", recalc);
$("#orm-reps").addEventListener("input", recalc);

// ---------- pull a set from logged history ----------

async function loadExerciseOptions() {
  const res = await fetch("/api/dictionary");
  const entries = await res.json();
  registerDictionary(entries);
  $("#orm-exercise-options").innerHTML = entries
    .map(
      (e) =>
        `<option value="${escapeHtml(e.abbreviation)}">${escapeHtml(
          exerciseDisplayLabel(e.abbreviation, e.full_name)
        )}</option>`
    )
    .join("");
}

let exerciseDebounce;
$("#orm-exercise").addEventListener("input", (e) => {
  clearTimeout(exerciseDebounce);
  const value = e.target.value.trim();
  exerciseDebounce = setTimeout(() => {
    if (value) loadRecentSets(value);
    else {
      $("#orm-recent-sets").innerHTML = "";
      $("#orm-recent-hint").textContent = "";
    }
  }, 250);
});

async function loadRecentSets(abbreviation) {
  const res = await fetch(`/api/exercises/${encodeURIComponent(abbreviation)}/history`);
  const data = await res.json();
  const hint = $("#orm-recent-hint");
  const container = $("#orm-recent-sets");

  if (data.timesLogged === 0) {
    hint.textContent = `No logged history for "${abbreviation}" yet.`;
    container.innerHTML = "";
    return;
  }

  const chips = [];
  for (let i = data.history.length - 1; i >= 0 && chips.length < 12; i--) {
    const day = data.history[i];
    for (const setValue of day.sets) {
      const parsed = parseSet(setValue);
      if (parsed) chips.push({ ...parsed, date: day.date, raw: setValue });
      if (chips.length >= 12) break;
    }
  }

  if (chips.length === 0) {
    hint.textContent = `Found ${data.timesLogged} logged session(s) for "${abbreviation}", but none have a plain "weight x reps" set to pull from.`;
    container.innerHTML = "";
    return;
  }

  hint.textContent = `Most recent sets for ${exerciseDisplayLabel(abbreviation, data.fullName)} — click one to fill the calculator.`;
  container.innerHTML = chips
    .map(
      (c) => `<button type="button" class="chip" data-weight="${c.weight}" data-reps="${c.reps}">
        ${escapeHtml(c.raw)}<span class="chip-date">${escapeHtml(formatDate(c.date))}</span>
      </button>`
    )
    .join("");

  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $("#orm-weight").value = chip.dataset.weight;
      $("#orm-reps").value = chip.dataset.reps;
      recalc();
    });
  });
}

loadExerciseOptions();

const presetParams = new URLSearchParams(location.search);
if (presetParams.has("weight")) $("#orm-weight").value = presetParams.get("weight");
if (presetParams.has("reps")) $("#orm-reps").value = presetParams.get("reps");
if (presetParams.has("weight") || presetParams.has("reps")) recalc();
