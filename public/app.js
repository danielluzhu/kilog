const $ = (sel) => document.querySelector(sel);

// ---------- add-workout form ----------

const setsList = $("#sets-list");
const dateInput = $("#date");
dateInput.value = todayIso();

// One row to start: most entries are typed as a single "135x5x3" or pasted
// as a whole session, and rows that are wanted are one button away.
const setsEditor = buildSetsEditor([""]);
setsList.appendChild(setsEditor.el);
// The two things done at the end of an entry sit at the two ends of one row.
$(".add-actions").prepend(setsEditor.addButton);

let dictionary = [];

// The starting-weight column only appears once the typed exercise is one that
// has one — a machine's sled, a landmine's bar — so it follows along as the
// exercise field changes.
function syncAddFormSledVisibility() {
  const abbrev = $("#exercise").value.trim();
  setsEditor.setStartingLoadKind(startingLoadKindFor(dictionary, abbrev, nameFor(abbrev)));
}
$("#exercise").addEventListener("input", syncAddFormSledVisibility);

async function loadDictionaryOptions() {
  const res = await fetch("/api/dictionary");
  dictionary = await res.json();
  registerDictionary(dictionary);
  const datalist = $("#exercise-options");
  datalist.innerHTML = dictionary
    .map(
      (d) =>
        `<option value="${escapeHtml(d.abbreviation)}">${escapeHtml(
          exerciseDisplayLabel(d.abbreviation, d.full_name)
        )}</option>`
    )
    .join("");
  syncAddFormSledVisibility();
}

function nameFor(abbrev) {
  const match = dictionary.find((d) => d.abbreviation === abbrev);
  return match?.full_name || null;
}

$("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#add-status");
  status.textContent = "";
  status.className = "status";

  const date = dateInput.value;
  const exercise = $("#exercise").value.trim();
  const sets = setsEditor.values();

  if (!date || !exercise) {
    status.textContent = "Date and exercise are required.";
    status.className = "status err";
    return;
  }

  try {
    const res = await fetch("/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, exercise, sets }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to save");

    status.textContent = "Saved!";
    status.className = "status ok";
    $("#exercise").value = "";
    setsEditor.reset([""]);
    dateInput.value = date; // keep date for logging multiple exercises same day

    await loadDictionaryOptions();
    await refreshLog();
  } catch (err) {
    status.textContent = err.message;
    status.className = "status err";
  }
});

// ---------- history table / log (grouped by day, newest day first) ----------

const DAYS_PER_PAGE = 14;
let dayOffset = 0;
let currentSearch = "";

function formatDayHeading(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso; // unrecognized format, just show it as-is
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function fetchLog(reset) {
  if (reset) dayOffset = 0;
  const params = new URLSearchParams({ limit: DAYS_PER_PAGE, offset: dayOffset });
  if (currentSearch) params.set("search", currentSearch);
  const res = await fetch(`/api/workouts?${params}`);
  return res.json();
}

// A day's total set count, plus how those sets split across the three
// fatigue tiers. Counted per set, not per exercise: five sets of snatch is
// five complex sets, which is what actually drives the session's cost. Every
// set of an exercise inherits that exercise's tier. Missed sets (zero
// completed reps) aren't work done and don't count — see countsAsSet.
// The day's WFU total rides along: same sets, weighted by what each one
// actually costs (see WFU_EXPLAINER), so an accessory day and a heavy
// weightlifting day of the same set count read differently.
function summarizeDay(workouts) {
  const byTier = Object.fromEntries(FATIGUE_TIERS.map((t) => [t, 0]));
  let total = 0;
  let fatigueUnits = 0;
  for (const w of workouts) {
    const n = countSets(w.sets);
    total += n;
    fatigueUnits += n * fatigueMultiplier(w.exercise, w.exerciseName);
    byTier[classifyFatigueTier(w.exercise, w.exerciseName)] += n;
  }
  return { total, byTier, fatigueUnits };
}

function dayHeaderHtml(date, workouts) {
  const { total, byTier, fatigueUnits } = summarizeDay(workouts);
  // Zero-count tiers are left out — a row of "0 complex" on every accessory
  // day is noise, and their absence says the same thing.
  const tierPills = FATIGUE_TIERS
    .filter((tier) => byTier[tier] > 0)
    .map(
      (tier) =>
        `<span class="pill fatigue-${tier}">${byTier[tier]} ${escapeHtml(
          FATIGUE_TIER_LABELS[tier].toLowerCase()
        )}</span>`
    )
    .join("");

  // A day of nothing but technique or steady-state cardio scores no fatigue
  // units at all — omitted rather than shown as a "0".
  const wfuPill = fatigueUnits
    ? `<span class="day-wfu" title="${escapeHtml(WFU_EXPLAINER)}">${formatFatigueUnits(
        fatigueUnits
      )} WFU</span>`
    : "";

  return `
    <td colspan="3">
      <span class="day-heading">${escapeHtml(formatDayHeading(date))}</span>
      <span class="day-summary">
        <span class="day-set-count">${total} set${total === 1 ? "" : "s"}</span>${wfuPill}${tierPills}
      </span>
    </td>
  `;
}

function renderDays(days, append) {
  const tbody = $("#log-body");
  if (!append) tbody.innerHTML = "";
  for (const day of days) {
    const headerTr = document.createElement("tr");
    headerTr.className = "day-header-row";
    headerTr.innerHTML = dayHeaderHtml(day.date, day.workouts);
    tbody.appendChild(headerTr);

    for (const w of day.workouts) {
      const tr = document.createElement("tr");
      tr.dataset.id = w.id;
      tr.dataset.date = day.date;
      tr.dataset.exercise = w.exercise;
      tr.dataset.sets = JSON.stringify(w.sets);
      tr.innerHTML = rowHtml(w);
      tbody.appendChild(tr);
    }
  }
  attachRowHandlers();
}

function rowHtml(w) {
  const label = w.exerciseName ? escapeHtml(w.exerciseName) : escapeHtml(w.exercise);
  const abbrevNote = w.exerciseName ? `<span class="pill">${escapeHtml(w.exercise)}</span>` : "";
  const fatigueTier = classifyFatigueTier(w.exercise, w.exerciseName);
  const fatiguePill = `<span class="pill fatigue-${fatigueTier}">${escapeHtml(FATIGUE_TIER_LABELS[fatigueTier])}</span>`;

  // The movement pattern honours a hand-assigned value, so it reads off the
  // dictionary entry rather than re-deriving from the name alone.
  const entry = dictionary.find((d) => d.abbreviation === w.exercise);
  const pattern = entry
    ? movementPatternFor(entry)
    : classifyMovementPattern(w.exercise, w.exerciseName);
  const patternPill = pattern
    ? `<span class="pill pattern-${pattern}" title="Movement pattern">${escapeHtml(
        MOVEMENT_PATTERN_LABELS[pattern]
      )}</span>`
    : "";

  const isMajorLift = classifyMajorLift(w.exercise, w.exerciseName) !== null;
  const top = isMajorLift ? topScorableSetOf(w.sets, w.exercise, w.exerciseName) : null;

  const setsHtml = isMajorLift
    ? setsHtmlWithHover(w.sets, w.exercise, w.exerciseName)
    : w.sets.map((s) => renderSetLabel(s, w.exercise)).join(", ") || '<span class="muted">—</span>';
  const ormBadge = top
    ? `<span class="orm-badge" title="${escapeHtml(describeScoredSet(top))}">~${formatOneRM(top)} 1RM</span>`
    : "";

  // The exercise's own fatigue weighting hangs off the set count as a title
  // rather than a second visible number — the day header carries the total,
  // and a per-row pill on every line would drown the log.
  const n = countSets(w.sets);
  const mult = fatigueMultiplier(w.exercise, w.exerciseName);
  const setCountTitle = `x${mult} fatigue = ${formatFatigueUnits(n * mult)} WFU. ${WFU_EXPLAINER}`;
  const setCount = n
    ? `<span class="set-count" title="${escapeHtml(setCountTitle)}">${n} set${n === 1 ? "" : "s"}</span>`
    : "";

  return `
    <td class="cell-exercise">
      <a class="exercise-link" href="/lapse.html?exercise=${encodeURIComponent(w.exercise)}">${label}</a>${abbrevNote}${fatiguePill}${patternPill}${setCount}
    </td>
    <td class="cell-sets">${setsHtml}${ormBadge}</td>
    <td class="actions">
      <button class="small edit-btn">Edit</button>
    </td>
  `;
}

function attachRowHandlers() {
  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.onclick = () => startEdit(btn.closest("tr"));
  });
}

function startEdit(tr) {
  const id = tr.dataset.id;
  const date = tr.dataset.date;
  const exercise = tr.dataset.exercise;
  const sets = JSON.parse(tr.dataset.sets || "[]");

  tr.innerHTML = `
    <td>
      <div style="display:flex; gap:0.4rem;">
        <input type="date" class="edit-date" value="${escapeHtml(date)}" title="Date" style="max-width:9.5rem" />
        <input type="text" class="edit-exercise" value="${escapeHtml(exercise)}" title="Exercise" />
      </div>
    </td>
    <td class="cell-sets-edit"></td>
    <td class="actions">
      <button class="small primary save-btn">Save</button>
      <button class="small cancel-btn">Cancel</button>
    </td>
  `;
  const editor = buildSetsEditor(sets, {
    startingLoadKind: startingLoadKindFor(dictionary, exercise, nameFor(exercise)),
  });
  tr.querySelector(".cell-sets-edit").appendChild(editor.el);
  tr.querySelector(".save-btn").onclick = () => saveEdit(tr, id, editor);
  tr.querySelector(".cancel-btn").onclick = () => refreshLog();
}

async function saveEdit(tr, id, editor) {
  const date = tr.querySelector(".edit-date").value.trim();
  const exercise = tr.querySelector(".edit-exercise").value.trim();
  const sets = editor.values();

  const res = await fetch(`/api/workouts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, exercise, sets }),
  });
  if (!res.ok) {
    alert((await res.json()).error || "Failed to save");
    return;
  }
  await loadDictionaryOptions();
  await refreshLog();
}

async function refreshLog() {
  const { days, totalDays, totalWorkouts } = await fetchLog(true);
  renderDays(days, false);
  dayOffset = days.length;
  $("#count").textContent = `${totalWorkouts} entries across ${totalDays} days`;
  $("#load-more").style.display = dayOffset >= totalDays ? "none" : "";
}

$("#load-more").addEventListener("click", async () => {
  const { days, totalDays } = await fetchLog(false);
  renderDays(days, true);
  dayOffset += days.length;
  $("#load-more").style.display = dayOffset >= totalDays ? "none" : "";
});

let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentSearch = e.target.value.trim();
    refreshLog();
  }, 250);
});

loadDictionaryOptions();
loadFatigueRates().then(refreshLog);
