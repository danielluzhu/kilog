const $ = (sel) => document.querySelector(sel);

// ---------- exercise picker ----------

let dictionaryEntries = [];

async function loadExerciseOptions() {
  const res = await fetch("/api/dictionary");
  dictionaryEntries = await res.json();
  registerDictionary(dictionaryEntries);

  $("#lapse-exercise-options").innerHTML = dictionaryEntries
    .map(
      (e) =>
        `<option value="${escapeHtml(e.abbreviation)}">${escapeHtml(
          exerciseDisplayLabel(e.abbreviation, e.full_name)
        )}</option>`
    )
    .join("");

  // Quick-access chips stay focused on the common major lifts — a shortcut,
  // not a restriction on what's searchable above.
  const compound = dictionaryEntries.filter((e) => isCompoundLift(e.abbreviation, e.full_name));
  renderQuickAccess(compound);
}

const QUICK_ACCESS_LABELS = ["Squat", "Front Squat", "Deadlift", "Clean", "Jerk", "Clean & Jerk", "Snatch", "Pull Up", "Dip"];

function findBestMatch(entries, targetNormalized) {
  const candidates = entries.filter((e) => normalizeLiftName(e.full_name) === targetNormalized);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.usage_count - a.usage_count)[0];
}

function renderQuickAccess(compoundEntries) {
  const container = $("#lapse-quick-access");
  const chips = QUICK_ACCESS_LABELS.map((label) => {
    const match = findBestMatch(compoundEntries, normalizeLiftName(label));
    return match ? { label, abbreviation: match.abbreviation } : null;
  }).filter(Boolean);

  if (chips.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = chips
    .map(
      (c) =>
        `<button type="button" class="chip" data-exercise="${escapeHtml(c.abbreviation)}">${escapeHtml(c.label)}</button>`
    )
    .join("");

  markActiveChip(currentAbbreviation);
}

function markActiveChip(abbreviation) {
  document.querySelectorAll("#lapse-quick-access .chip").forEach((btn) => {
    btn.classList.toggle("chip-active", btn.dataset.exercise === abbreviation);
  });
}

// Delegated rather than bound per chip: renderQuickAccess() replaces the
// container's innerHTML (on every dictionary reload), which would otherwise
// throw away freshly-bound listeners along with the old nodes.
$("#lapse-quick-access").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  const abbrev = btn.dataset.exercise;
  // A debounced load from earlier typing is still pending here; left alone it
  // fires after this one and reverts the page to the typed exercise.
  clearTimeout(debounceTimer);
  $("#exercise-select").value = abbrev;
  loadHistory(abbrev);
});

let debounceTimer;
$("#exercise-select").addEventListener("input", (e) => {
  clearTimeout(debounceTimer);
  const value = e.target.value.trim();
  debounceTimer = setTimeout(() => {
    if (value) loadHistory(value);
    else showEmptyState();
  }, 250);
});

function showEmptyState() {
  $("#lapse-content").style.display = "none";
  $("#no-history-state").style.display = "none";
  $("#exercise-name-edit").style.display = "none";
  $("#empty-state").style.display = "";
}

function showNoHistoryState(abbreviation, fullName) {
  $("#lapse-content").style.display = "none";
  $("#empty-state").style.display = "none";
  $("#exercise-name-edit").style.display = "none";
  const el = $("#no-history-state");
  el.style.display = "";
  el.innerHTML = `No logged sets found for <strong>${escapeHtml(abbreviation)}</strong>${
    fullName ? ` ("${escapeHtml(fullName)}")` : ""
  } yet.`;
}

// ---------- click-to-edit full name ----------

let currentAbbreviation = null;
let currentFullName = null;

function renderTitle(abbreviation, fullName) {
  currentAbbreviation = abbreviation;
  currentFullName = fullName;
  $("#exercise-title-name").textContent = fullName || abbreviation;
  $("#exercise-title-abbrev").textContent = fullName ? ` (${abbreviation})` : " (click to name this exercise)";
  renderFatigueTier(abbreviation, fullName);
}

// ---------- fatigue tier ----------
// The same override the Exercise Dictionary offers, surfaced on the exercise
// you're actually looking at: the tier drives how a set is weighted (WFU) and
// whether bare numbers read as a singles ladder, so it's worth being able to
// fix it without leaving the page. Blank hands the exercise back to the
// classifier rather than freezing today's guess as a hand-set value.
function renderFatigueTier(abbreviation, fullName) {
  const entry = dictionaryEntries.find((e) => e.abbreviation === abbreviation);
  const override = entry?.fatigue_tier || null;
  const autoTier = autoFatigueTier(abbreviation, fullName);
  const effective = override || autoTier;

  const select = $("#exercise-fatigue");
  select.innerHTML =
    `<option value=""${override ? "" : " selected"}>${escapeHtml(
      FATIGUE_TIER_LABELS[autoTier]
    )} (auto)</option>` +
    FATIGUE_TIERS.map(
      (t) =>
        `<option value="${t}"${override === t ? " selected" : ""}>${escapeHtml(
          FATIGUE_TIER_LABELS[t]
        )}</option>`
    ).join("");

  // Colour and the is-set treatment match the Dictionary's column, so a tier
  // looks the same wherever it's shown.
  select.className = `tag-select fatigue-select fatigue-${effective}${override ? " is-set" : ""}`;
  select.title = override ? "Set by hand" : "Derived from the exercise type";
  $("#exercise-fatigue-note").textContent = override
    ? "set by hand"
    : `derived from the exercise name`;
}

$("#exercise-fatigue").addEventListener("change", async (e) => {
  const abbreviation = currentAbbreviation;
  if (!abbreviation) return;
  const select = e.target;
  select.disabled = true;
  try {
    await fetch("/api/dictionary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ abbreviation, fatigueTier: select.value || null }),
    });
  } finally {
    select.disabled = false;
  }
  // A tier change can move the numbers on this page — a complex lift reads
  // bare entries as a ladder of singles — so the dictionary is re-registered
  // and the history re-scored rather than just repainting the dropdown.
  await loadExerciseOptions();
  await loadHistory(abbreviation);
});

$("#exercise-title-abbrev").addEventListener("click", () => {
  $("#exercise-name-input").value = currentFullName || "";
  $("#exercise-name-edit").style.display = "";
  $("#exercise-name-input").focus();
});
$("#exercise-title-abbrev").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    $("#exercise-title-abbrev").click();
  }
});
$("#exercise-name-cancel").addEventListener("click", () => {
  $("#exercise-name-edit").style.display = "none";
});
$("#exercise-name-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveExerciseName();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    $("#exercise-name-edit").style.display = "none";
  }
});
$("#exercise-name-save").addEventListener("click", saveExerciseName);

async function saveExerciseName() {
  const fullName = $("#exercise-name-input").value.trim();
  await fetch("/api/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abbreviation: currentAbbreviation, fullName }),
  });
  $("#exercise-name-edit").style.display = "none";
  await loadExerciseOptions();
  await loadHistory(currentAbbreviation); // full refresh
}

// ---------- load + render ----------

// Two loads can be in flight at once (clicking one shortcut then another
// before the first responds). Responses aren't guaranteed to arrive in the
// order they were requested, so without this guard a slower earlier request
// can land last and repaint the page with the exercise you just moved off of
// — which looks exactly like the second click doing nothing.
let historyRequestToken = 0;

// Sessions of this exercise that were logged under a composite lift (a clean
// inside a C&J, the front squats inside a C+FSQ). Each entry looks like a
// normal history entry — same shape, sets rewritten as this lift alone — plus
// a `via` tag marking where it actually lives.
async function compositeHistoryFor(abbreviation) {
  const composites = compositesContaining(abbreviation);
  if (composites.length === 0) return { entries: [], skipped: 0, sources: [] };

  const fetched = await Promise.all(
    composites.map(async (composite) => {
      const res = await fetch(`/api/exercises/${encodeURIComponent(composite.abbrev)}/history`);
      if (!res.ok) return null;
      return { composite, data: await res.json() };
    })
  );

  const entries = [];
  const sources = [];
  let skipped = 0;

  for (const item of fetched) {
    if (!item) continue;
    const { composite, data } = item;
    let sessions = 0;

    for (const h of data.history) {
      const projected = compositePartSets(composite, h.sets, abbreviation, data.fullName);
      skipped += projected.skipped;
      if (projected.sets.length === 0) continue;
      sessions++;
      entries.push({
        id: h.id,
        date: h.date,
        sets: projected.sets.map((s) => s.value),
        via: {
          abbrev: data.abbreviation,
          fullName: data.fullName,
          label: exerciseDisplayLabel(data.abbreviation, data.fullName),
          // What was actually typed, for the hover explanation.
          originalSets: h.sets,
        },
      });
    }

    if (sessions > 0) sources.push({ abbrev: data.abbreviation, label: exerciseDisplayLabel(data.abbreviation, data.fullName), sessions });
  }

  return { entries, skipped, sources };
}

// Direct sessions and composite-derived ones on one timeline, oldest first.
// They stay separate rows even when they land on the same day: they're two
// different log entries, and only one of them is editable from here.
function mergeCompositeHistory(history, entries) {
  return [...history, ...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (!!a.via !== !!b.via) return a.via ? 1 : -1; // direct first within a day
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

function renderCompositeNote(directCount, composite) {
  const note = $("#composite-note");
  if (composite.sources.length === 0) {
    note.style.display = "none";
    return;
  }

  const list = composite.sources.map((s) => `${s.sessions} in ${s.label}`).join(", ");
  const skipped = composite.skipped > 0
    ? ` ${composite.skipped} set${composite.skipped === 1 ? "" : "s"} couldn't be split between the two lifts and were left out.`
    : "";
  note.textContent =
    `Includes work done inside a composite lift — ${list} — on top of ${directCount} logged on its own. ` +
    `Those sessions still belong to the composite: they're marked below, they aren't editable from here, ` +
    `and they stay counted under it for set volume and fatigue.${skipped}`;
  note.style.display = "";
}

async function loadHistory(abbreviation) {
  const token = ++historyRequestToken;
  markActiveChip(abbreviation);

  const res = await fetch(`/api/exercises/${encodeURIComponent(abbreviation)}/history`);
  const data = await res.json();
  if (token !== historyRequestToken) return; // superseded by a newer selection

  const composite = await compositeHistoryFor(data.abbreviation);
  if (token !== historyRequestToken) return; // ditto — composites are a second round trip

  const history = mergeCompositeHistory(data.history, composite.entries);

  // A lift only ever trained inside a composite still has a history worth
  // showing, so the empty state is decided after the merge, not before.
  if (history.length === 0) {
    showNoHistoryState(data.abbreviation, data.fullName);
    return;
  }

  $("#empty-state").style.display = "none";
  $("#no-history-state").style.display = "none";
  $("#exercise-name-edit").style.display = "none";
  $("#lapse-content").style.display = "";

  renderTitle(data.abbreviation, data.fullName);
  $("#stat-count").textContent = history.length;
  $("#stat-first").textContent = history[0] ? formatDate(history[0].date) : "—";
  $("#stat-last").textContent = history.at(-1) ? formatDate(history.at(-1).date) : "—";
  renderCompositeNote(data.timesLogged, composite);

  renderChart(history, data.abbreviation, data.fullName);
  renderHistoryTable(history, data.abbreviation, data.fullName);

  const url = new URL(location.href);
  url.searchParams.set("exercise", abbreviation);
  // `window.` is load-bearing: the merged session list above is also called
  // `history`, and it shadows the global inside this function.
  window.history.replaceState(null, "", url);
}

function renderHistoryTable(history, abbreviation, fullName) {
  const tbody = $("#lapse-history-body");
  tbody.innerHTML = [...history]
    .reverse()
    .map((h) => {
      const top = topScorableSetOf(h.sets, abbreviation, fullName);
      const setsHtml = setsHtmlWithHover(h.sets, abbreviation, fullName);

      const topCell = top
        ? `${escapeHtml(top.resolvedRaw ?? top.raw)} <span class="orm-badge" title="${escapeHtml(describeScoredSet(top))}">~${formatOneRM(top)} 1RM</span>`
        : '<span class="muted">—</span>';

      // The session holding the all-time heaviest lift gets called out in
      // the table too, so the banner's number is findable in context.
      const isHeaviestEver = h.date === heaviestEverDate;
      const recordBadge = isHeaviestEver
        ? ' <span class="record-badge" title="Heaviest weight ever moved for this exercise">🏆 heaviest ever</span>'
        : "";

      // Composite-derived rows say so, and say what was actually typed —
      // the sets shown here were rewritten for this lift and never existed
      // in the log in that form.
      const viaBadge = h.via
        ? ` <span class="composite-badge" title="Logged as ${escapeHtml(h.via.label)}: ${escapeHtml(
            h.via.originalSets.join(", ")
          )} — counted under ${escapeHtml(h.via.abbrev)} for volume and fatigue">part of ${escapeHtml(h.via.abbrev)}</span>`
        : "";

      // Editing is deliberately not offered on a derived row: saving it would
      // write the rewritten sets back over the composite's real entry. The
      // link opens the lift it belongs to instead.
      const actionCell = h.via
        ? `<a class="small composite-link" href="/lapse.html?exercise=${encodeURIComponent(
            h.via.abbrev
          )}&date=${encodeURIComponent(h.date)}">Open ${escapeHtml(h.via.abbrev)}</a>`
        : '<button class="small edit-btn">Edit</button>';

      return `
      <tr class="${isHeaviestEver ? "record-row" : ""}${h.via ? " composite-row" : ""}" data-id="${h.id}" data-date="${escapeHtml(h.date)}" data-sets='${escapeHtml(JSON.stringify(h.sets))}'>
        <td class="cell-date"><span class="date-link" title="Show/edit the whole day">${escapeHtml(
          formatDate(h.date)
        )}</span></td>
        <td class="cell-sets">${setsHtml}${viaBadge}${recordBadge}</td>
        <td class="cell-top">${topCell}</td>
        <td class="actions">${actionCell}</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.onclick = () => startHistoryEdit(btn.closest("tr"));
  });
  tbody.querySelectorAll(".date-link").forEach((el) => {
    el.addEventListener("click", () => toggleDayPanel(el.closest("tr")));
  });
}

// Jumps to a chart datapoint's date in the history table and opens it for
// editing — used when clicking a chart datapoint.
async function jumpToHistoryRow(date) {
  const tr = document.querySelector(`#lapse-history-body tr[data-date="${CSS.escape(date)}"]`);
  if (!tr) return;
  tr.classList.add("highlight");
  setTimeout(() => tr.classList.remove("highlight"), 1600);
  await toggleDayPanel(tr, true);
  (document.querySelector(".day-panel-row") ?? tr).scrollIntoView({ behavior: "smooth", block: "center" });
}

function startHistoryEdit(tr) {
  const id = tr.dataset.id;
  const date = tr.dataset.date;
  const sets = JSON.parse(tr.dataset.sets || "[]");

  tr.innerHTML = `
    <td><input type="date" class="edit-date" value="${escapeHtml(date)}" style="max-width:9.5rem" /></td>
    <td class="cell-sets-edit"></td>
    <td class="muted">—</td>
    <td class="actions">
      <button class="small primary save-btn">Save</button>
      <button class="small cancel-btn">Cancel</button>
    </td>
  `;
  const editor = buildSetsEditor(sets, {
    startingLoadKind: startingLoadKindFor(dictionaryEntries, currentAbbreviation, currentFullName),
  });
  tr.querySelector(".cell-sets-edit").appendChild(editor.el);
  tr.querySelector(".save-btn").onclick = () => saveHistoryEdit(tr, id, editor);
  tr.querySelector(".cancel-btn").onclick = () => loadHistory(currentAbbreviation);
}

async function saveHistoryEdit(tr, id, editor) {
  const date = tr.querySelector(".edit-date").value.trim();
  const sets = editor.values();

  const res = await fetch(`/api/workouts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, exercise: currentAbbreviation, sets }),
  });
  if (!res.ok) {
    alert((await res.json()).error || "Failed to save");
    return;
  }
  await loadHistory(currentAbbreviation); // full refresh: chart, stats, and table all depend on this data
}

// ---------- day panel: click a date to see/edit every exercise that day ----------

let dayPanelDirty = false;

// `forceOpen`: true means "ensure it's open" (used by the chart-click jump)
// rather than toggle — clicking the same datapoint twice shouldn't close the
// panel out from under you the way clicking the date link a second time does.
async function toggleDayPanel(tr, forceOpen = false) {
  const date = tr.dataset.date;
  const existing = tr.nextElementSibling;
  const alreadyOpenHere = existing && existing.classList.contains("day-panel-row") && existing.dataset.date === date;

  if (alreadyOpenHere && forceOpen) return;

  // Accordion: only one day panel open at a time. Closing one (or switching
  // to another) is when accumulated edits get folded back into the chart,
  // stats, and outer table — not after every individual save, which would
  // otherwise collapse the panel while fixing several typos in one session.
  document.querySelectorAll(".day-panel-row").forEach((row) => row.remove());
  if (dayPanelDirty) {
    dayPanelDirty = false;
    // Rebuilds the whole history table, so any row reference from before
    // this point (including `tr`) is stale afterward — re-look-up below.
    if (currentAbbreviation) await loadHistory(currentAbbreviation);
  }

  if (alreadyOpenHere && !forceOpen) return;

  const targetTr = document.querySelector(`#lapse-history-body tr[data-date="${CSS.escape(date)}"]`);
  if (!targetTr) return;

  const panelRow = document.createElement("tr");
  panelRow.className = "day-panel-row";
  panelRow.dataset.date = date;
  panelRow.innerHTML = `<td colspan="4"><div class="day-panel" id="day-panel">Loading…</div></td>`;
  targetTr.after(panelRow);

  loadDayPanel(date);
}

async function loadDayPanel(date) {
  const res = await fetch(`/api/workouts/on/${date}`);
  const data = await res.json();
  renderDayPanel(data);
}

function renderDayPanel(data) {
  const panel = $("#day-panel");
  if (!panel) return; // panel row was closed/replaced before this fetch resolved

  if (data.workouts.length === 0) {
    panel.innerHTML = '<p class="muted" style="margin:0;">No workouts found for this day.</p>';
    return;
  }

  panel.innerHTML = `
    <p class="muted" style="margin: 0 0 0.6rem;">All exercises logged on ${escapeHtml(formatDate(data.date))} — edit abbreviation, full name, or sets, then save each row.</p>
    <div class="day-panel-rows">
      ${data.workouts
        .map(
          (w) => `
        <div class="day-panel-item${w.exercise === currentAbbreviation ? " day-panel-item-current" : ""}" data-id="${w.id}">
          <div class="day-panel-item-top">
            <input type="text" class="day-abbrev" value="${escapeHtml(w.exercise)}" placeholder="Abbreviation" />
            <input type="text" class="day-name" value="${escapeHtml(w.exerciseName || "")}" placeholder="Full name" />
            <button type="button" class="small primary day-save-btn">Save</button>
            <span class="status day-status" style="margin:0;"></span>
          </div>
          <div class="day-sets-edit"></div>
        </div>`
        )
        .join("")}
    </div>
  `;

  panel.querySelectorAll(".day-panel-item").forEach((item) => {
    const id = Number(item.dataset.id);
    const w = data.workouts.find((x) => x.id === id);
    const editor = buildSetsEditor(w.sets, {
      startingLoadKind: startingLoadKindFor(dictionaryEntries, w.exercise, w.exerciseName),
    });
    item.querySelector(".day-sets-edit").appendChild(editor.el);
    item.querySelector(".day-save-btn").addEventListener("click", () => saveDayPanelItem(item, data.date, editor));
  });
}

async function saveDayPanelItem(item, date, editor) {
  const id = item.dataset.id;
  const abbreviation = item.querySelector(".day-abbrev").value.trim();
  const fullName = item.querySelector(".day-name").value.trim();
  const sets = editor.values();
  const status = item.querySelector(".day-status");

  if (!abbreviation) {
    status.textContent = "Abbreviation is required.";
    status.className = "status day-status err";
    return;
  }

  status.textContent = "Saving…";
  status.className = "status day-status";

  const workoutRes = await fetch(`/api/workouts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, exercise: abbreviation, sets }),
  });
  if (!workoutRes.ok) {
    status.textContent = (await workoutRes.json()).error || "Failed to save workout";
    status.className = "status day-status err";
    return;
  }

  await fetch("/api/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abbreviation, fullName }),
  });

  status.textContent = "Saved!";
  status.className = "status day-status ok";

  dayPanelDirty = true; // outer chart/stats/table refresh when the panel closes, not after every row
  await loadDayPanel(date); // refresh this day's panel with the saved values
  await loadExerciseOptions(); // dictionary may have changed (new/renamed abbreviation)
}

// ---------- chart ----------

function niceNumber(x) {
  if (x === 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  let nf;
  if (f < 1.5) nf = 1;
  else if (f < 3) nf = 2;
  else if (f < 7) nf = 5;
  else nf = 10;
  return nf * Math.pow(10, exp);
}

function computeTicks(min, max, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const step = niceNumber((max - min) / (count - 1) || 1);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { ticks, min: niceMin, max: niceMax };
}

// ---------- timeline range ----------
// Preset windows over the timeline. These only change which slice of the
// chart is drawn; the stat tiles and the all-time record banner always
// reflect the full history regardless of what's selected.
const RANGE_PRESETS = [
  { key: "30", days: 30, label: "Last 30 days" },
  { key: "90", days: 90, label: "Last 90 days" },
  { key: "365", days: 365, label: "Last year" },
  { key: "all", days: null, label: "All time" },
];
let currentRangeKey = "all";

function currentRangeLabel() {
  return (RANGE_PRESETS.find((r) => r.key === currentRangeKey) ?? RANGE_PRESETS.at(-1)).label;
}

function pointsInCurrentRange(points) {
  const preset = RANGE_PRESETS.find((r) => r.key === currentRangeKey);
  if (!preset || preset.days === null) return points;
  const cutoff = daysAgoDate(preset.days);
  return points.filter((p) => {
    const d = parseDateParts(p.date);
    return d && d >= cutoff;
  });
}

function computeMaxStats(points, valueOf) {
  const cutoff365 = daysAgoDate(365);
  const cutoff90 = daysAgoDate(90);

  let allTime = null,
    y365 = null,
    d90 = null;
  for (const p of points) {
    const d = parseDateParts(p.date);
    const v = valueOf(p);
    if (!allTime || v > valueOf(allTime)) allTime = p;
    if (d && d >= cutoff365 && (!y365 || v > valueOf(y365))) y365 = p;
    if (d && d >= cutoff90 && (!d90 || v > valueOf(d90))) d90 = p;
  }
  return { allTime, y365, d90 };
}

// What a chart plots on its y-axis. Estimated 1RM is the default, but a
// pure-bodyweight timeline holds weight constant (it's always just
// bodyweight), which makes its 1RM a plain rescaling of the rep count —
// so that chart plots reps directly instead, where the progress actually is.
const ONE_RM_METRIC = {
  valueOf: (p) => p.oneRM,
  describe: (p) => (p.bodyweight ? `~+${p.oneRM} kg added 1RM` : `~${p.oneRM} kg 1RM`),
  statSuffix: "1RM, kg",
  axisLabel: "Estimated one-rep max",
};
// Same metric, relabelled for the added-weight half of a bodyweight split —
// the numbers there are added weight, not total load.
const ADDED_WEIGHT_METRIC = { ...ONE_RM_METRIC, statSuffix: "added 1RM, kg" };
const REPS_METRIC = {
  valueOf: (p) => p.reps,
  describe: (p) => `${p.reps} reps`,
  statSuffix: "reps",
  axisLabel: "Reps",
};
// Weight actually moved, not an estimate — the y-value is a number that was
// really on the bar. Points carry the week they belong to so the tooltip can
// say which week a peak was, since the x position is the session's own date.
const TOP_WEIGHT_METRIC = {
  valueOf: (p) => p.weight,
  describe: (p) =>
    `${p.bodyweight ? "+" : ""}${p.weight} kg moved · week of ${formatShortDate(p.weekStart)}`,
  statSuffix: "kg",
  axisLabel: "Heaviest weight moved per week",
};

// A single self-contained chart: its own zoom state, its own PR-date
// tracking, its own DOM refs — so two of these can be mounted at once (the
// bodyweight/added-weight split) without clobbering each other.
// `dom` = { wrap, resetZoomBtn, noWeightMsg, statAll, stat365, stat90 }.
// `metric` picks what the y-axis measures (see ONE_RM_METRIC / REPS_METRIC).
function createChartInstance(dom, metric = ONE_RM_METRIC) {
  const valueOf = metric.valueOf;
  let fullPoints = [];
  // Record-holding dates for the three "highlight" stats — tracked by date
  // (not index) so they still resolve correctly after a zoom re-slices points.
  let prDates = { allTime: null, y365: null, d90: null };

  // Which "record" labels apply to a given date, de-duplicated so a single
  // session that holds all three records only reports its highest-priority one.
  function prLabelsFor(date) {
    const labels = [];
    if (date === prDates.allTime) labels.push("all-time max");
    if (date === prDates.y365 && date !== prDates.allTime) labels.push("1yr max");
    if (date === prDates.d90 && date !== prDates.allTime && date !== prDates.y365) labels.push("90d max");
    return labels;
  }

  // `points` is the exercise's whole history; `visible` is the slice the
  // timeline range currently shows. The stat tiles are deliberately computed
  // from the former — an all-time max that changed when you switched to a
  // 30-day view wouldn't be an all-time max. Only the chart is windowed.
  function render(points, visible = points) {
    fullPoints = visible;

    const noData = points.length === 0;
    const { allTime, y365, d90 } = noData
      ? { allTime: null, y365: null, d90: null }
      : computeMaxStats(points, valueOf);

    // Stat tiles are optional: a chart whose figures are already reported
    // elsewhere on the page (the heaviest-ever banner) mounts without them.
    const setStat = (el, detailEl, record) => {
      if (el) el.textContent = record ? valueOf(record) : "—";
      if (detailEl) detailEl.textContent = record ? setDetailText(record) : "";
    };
    setStat(dom.statAll, dom.detailAll, allTime);
    setStat(dom.stat365, dom.detail365, y365);
    setStat(dom.stat90, dom.detail90, d90);
    prDates = {
      allTime: allTime ? allTime.date : null,
      y365: y365 ? y365.date : null,
      d90: d90 ? d90.date : null,
    };

    if (visible.length === 0) {
      dom.wrap.innerHTML = "";
      dom.resetZoomBtn.style.display = "none";
      // Distinguish "this exercise has nothing scorable" from "nothing in the
      // window you picked" — the fixes for those are different.
      dom.noWeightMsg.textContent = noData
        ? dom.noWeightMsg.dataset.emptyMsg || dom.noWeightMsg.textContent
        : `No sessions in the ${currentRangeLabel().toLowerCase()} — pick a wider range above.`;
      dom.noWeightMsg.style.display = "";
      return;
    }

    dom.noWeightMsg.style.display = "none";
    draw(visible);
  }

  function draw(points) {
    const wrap = dom.wrap;
    dom.resetZoomBtn.style.display = points.length < fullPoints.length ? "" : "none";

    const W = 760, H = 220;
    const padL = 44, padR = 16, padT = 16, padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const rawMin = Math.min(...points.map(valueOf));
    const rawMax = Math.max(...points.map(valueOf));
    const { ticks, min: yMin, max: yMax } = computeTicks(rawMin * 0.95, rawMax * 1.05, 4);

    const n = points.length;

    // The x axis is a real time axis: a point sits where its date falls in the
    // range, so a six-month layoff opens a six-month gap and a week of daily
    // sessions bunches up. Spacing points evenly by index (the old behaviour)
    // made an irregular training history read as if it were regular.
    // Falls back to even spacing if any date is unparseable or every session
    // lands on the same day, where a time scale has nothing to spread over.
    const times = points.map((p) => {
      const d = parseDateParts(p.date);
      return d ? d.getTime() : null;
    });
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const timeScale = times.every((t) => t !== null) && tMax > tMin;

    const xFor = (i) => {
      if (n === 1) return padL + plotW / 2;
      if (!timeScale) return padL + (i / (n - 1)) * plotW;
      return padL + ((times[i] - tMin) / (tMax - tMin)) * plotW;
    };
    const xForTime = (t) => padL + ((t - tMin) / (tMax - tMin)) * plotW;
    const yFor = (v) => padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

    const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(valueOf(p)), ...p }));

    const gridlines = ticks
      .map((t) => {
        const y = yFor(t);
        return `<line class="chart-gridline" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" />
                <text class="chart-axis-text" x="${padL - 8}" y="${y + 3}" text-anchor="end">${Math.round(t)}</text>`;
      })
      .join("");

    // Axis labels always carry the year — sessions can span multiple years,
    // and "Jul 24" alone is ambiguous when the same month/day recurs across them.
    const AXIS_DATE_OPTS = { month: "short", day: "numeric", year: "numeric" };
    const axisLabelAt = (x, label) =>
      `<text class="chart-axis-text" x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle">${escapeHtml(
        label
      )}</text>`;

    let xLabels;
    if (timeScale) {
      // Ticks at even intervals along the *time* range rather than at every
      // Nth data point — on a time axis the latter clumps labels wherever
      // sessions happen to be dense and leaves long gaps unlabelled.
      const labelCount = Math.min(5, Math.max(2, n));
      const parts = [];
      for (let k = 0; k < labelCount; k++) {
        const t = tMin + (k / (labelCount - 1)) * (tMax - tMin);
        parts.push(
          axisLabelAt(xForTime(t), new Date(t).toLocaleDateString(undefined, AXIS_DATE_OPTS))
        );
      }
      xLabels = parts.join("");
    } else {
      const labelCount = Math.min(n, 5);
      const labelIdxs = new Set();
      for (let k = 0; k < labelCount; k++) {
        labelIdxs.add(Math.round((k / (labelCount - 1 || 1)) * (n - 1)));
      }
      xLabels = [...labelIdxs]
        .map((i) => axisLabelAt(coords[i].x, formatDate(coords[i].date, AXIS_DATE_OPTS)))
        .join("");
    }

    const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

    const dots = coords
      .map((c) => {
        const isPR = prLabelsFor(c.date).length > 0;
        return isPR
          ? `<circle class="chart-dot chart-dot-pr" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="6" />`
          : `<circle class="chart-dot" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" />`;
      })
      .join("");

    // A PR label above the endpoint would collide with the endpoint's own
    // value label, so only non-endpoint PRs get a standalone text label —
    // the endpoint's record status (if any) is already conveyed by the
    // larger dot and the stat tiles above the chart.
    const prMarkerLabels = coords
      .slice(0, -1)
      .map((c) => {
        const labels = prLabelsFor(c.date);
        if (labels.length === 0) return "";
        return `<text class="chart-pr-label" x="${c.x.toFixed(1)}" y="${(c.y - 12).toFixed(1)}" text-anchor="middle">${escapeHtml(
          labels.join(" / ")
        )}</text>`;
      })
      .join("");

    const last = coords[coords.length - 1];
    const endLabel = `<text class="chart-endlabel" x="${(n === 1 ? last.x : last.x - 10).toFixed(1)}" y="${(last.y - 12).toFixed(1)}" text-anchor="${n === 1 ? "middle" : "end"}">${valueOf(last)}</text>`;

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(metric.axisLabel)} over time, ${n} sessions">
        ${gridlines}
        ${n > 1 ? `<path class="chart-line" d="${linePath}" />` : ""}
        ${dots}
        ${prMarkerLabels}
        ${endLabel}
        ${xLabels}
        <rect class="chart-brush" data-brush x="0" y="${padT}" width="0" height="${plotH}" />
        <line class="chart-crosshair" data-crosshair x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" />
      </svg>
      <div class="chart-tooltip"></div>
      ${n > 4 ? '<p class="muted" style="margin: 0.4rem 0 0; font-size: 0.75rem;">Drag across the chart to zoom in; double-click or "Reset zoom" to zoom back out.</p>' : ""}
    `;

    attachInteractivity(coords, { padL, padR, padT, plotH, W, H });
  }

  function zoomTo(startIdx, endIdx) {
    const lo = Math.max(0, Math.min(startIdx, endIdx));
    const hi = Math.min(fullPoints.length - 1, Math.max(startIdx, endIdx));
    if (hi - lo < 1) return; // need at least 2 points to draw a zoomed range
    draw(fullPoints.slice(lo, hi + 1));
  }

  function resetZoom() {
    draw(fullPoints);
  }

  dom.resetZoomBtn.addEventListener("click", resetZoom);

  function attachInteractivity(coords, geom) {
    const svg = dom.wrap.querySelector("svg");
    const crosshair = dom.wrap.querySelector("[data-crosshair]");
    const brush = dom.wrap.querySelector("[data-brush]");
    const tooltip = dom.wrap.querySelector(".chart-tooltip");

    function svgXFromEvent(evt) {
      const rect = svg.getBoundingClientRect();
      const fracX = Math.min(1, Math.max(0, (evt.clientX - rect.left) / rect.width));
      return { svgX: fracX * geom.W, rect };
    }

    function nearestIndex(svgX) {
      let best = 0;
      let bestDist = Infinity;
      coords.forEach((c, i) => {
        const d = Math.abs(c.x - svgX);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      return best;
    }

    function showTooltipAt(idx, rect) {
      const c = coords[idx];
      crosshair.setAttribute("x1", c.x.toFixed(1));
      crosshair.setAttribute("x2", c.x.toFixed(1));
      crosshair.style.opacity = "1";

      const prLabels = prLabelsFor(c.date);
      const prSuffix = prLabels.length ? ` (${prLabels.join(", ")})` : "";
      const attemptSuffix = c.attempted !== null && c.attempted !== undefined ? ` (${c.reps} of ${c.attempted} attempted)` : "";
      // Says where a derived point came from, so a clean pulled inside a C&J
      // is never mistaken for a session of cleans on their own.
      const viaSuffix = c.via ? ` · part of ${c.via.abbrev}` : "";

      tooltip.innerHTML = `<span class="tt-date"></span><span class="tt-value"></span>`;
      tooltip.querySelector(".tt-date").textContent = formatDate(c.date);
      tooltip.querySelector(".tt-value").textContent = `${c.raw}${attemptSuffix} → ${metric.describe(c)}${prSuffix}${viaSuffix}`;

      const leftPx = (c.x / geom.W) * rect.width;
      const topPx = (c.y / geom.H) * rect.height;
      tooltip.style.left = `${leftPx}px`;
      tooltip.style.top = `${Math.max(0, topPx - 10)}px`;
      tooltip.style.opacity = "1";
    }

    function hideHover() {
      crosshair.style.opacity = "0";
      tooltip.style.opacity = "0";
    }

    function hideBrush() {
      brush.style.opacity = "0";
    }

    let dragging = false;
    let dragStartSvgX = 0;
    let dragStartClientX = 0;

    svg.addEventListener("pointerdown", (evt) => {
      dragging = true;
      dragStartSvgX = svgXFromEvent(evt).svgX;
      dragStartClientX = evt.clientX;
      hideHover();
      svg.setPointerCapture(evt.pointerId);
    });

    svg.addEventListener("pointermove", (evt) => {
      if (dragging) {
        const { svgX } = svgXFromEvent(evt);
        const x1 = Math.max(geom.padL, Math.min(dragStartSvgX, svgX));
        const x2 = Math.min(geom.W - geom.padR, Math.max(dragStartSvgX, svgX));
        brush.setAttribute("x", x1.toFixed(1));
        brush.setAttribute("width", Math.max(0, x2 - x1).toFixed(1));
        brush.style.opacity = "1";
        return;
      }
      const { svgX, rect } = svgXFromEvent(evt);
      showTooltipAt(nearestIndex(svgX), rect);
    });

    function endDrag(evt) {
      if (!dragging) return;
      dragging = false;
      hideBrush();
      if (Math.abs(evt.clientX - dragStartClientX) < 8) {
        // too small to be a zoom drag — treat as a click on that datapoint
        const { svgX } = svgXFromEvent(evt);
        const idx = nearestIndex(svgX);
        jumpToHistoryRow(coords[idx].date);
        return;
      }

      const { svgX } = svgXFromEvent(evt);
      zoomTo(nearestIndex(dragStartSvgX), nearestIndex(svgX));
    }

    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", () => {
      dragging = false;
      hideBrush();
    });
    svg.addEventListener("pointerleave", () => {
      if (!dragging) hideHover();
    });
    svg.addEventListener("dblclick", resetZoom);
  }

  return { render };
}

const defaultChartInstance = createChartInstance({
  wrap: $("#chart-wrap"),
  resetZoomBtn: $("#chart-reset-zoom"),
  noWeightMsg: $("#no-weight-msg"),
  statAll: $("#stat-max-all"),
  stat365: $("#stat-max-365"),
  stat90: $("#stat-max-90"),
  detailAll: $("#stat-max-all-detail"),
  detail365: $("#stat-max-365-detail"),
  detail90: $("#stat-max-90-detail"),
});

// ---------- bodyweight vs. added-weight split ----------
// For bodyweight movements, a single session can mix pure-bodyweight sets
// (0 added weight) and added-weight sets (belt/vest/plate on top). Plotting
// both on one 1RM timeline conflates two different kinds of progress, so an
// exercise that has logged both kinds gets two chart sections instead of
// the single default one.

// `oneRM` here is the *displayed* one-rep max: for bodyweight movements that
// is added weight, matching how the set was logged (see displayWeightOf).
// Scoring and ranking still happen on total load upstream of this.
function toPoint(date, s, via = null) {
  return {
    date,
    oneRM: roundKg(displayWeightOf(s, s.oneRM)),
    bodyweight: !!s.bodyweight,
    raw: s.resolvedRaw ?? s.raw,
    weight: s.weight,
    reps: s.reps,
    attempted: s.attempted,
    via,
  };
}

function pointsFromHistory(history, abbreviation, fullName) {
  return history
    .map((h) => {
      const top = topScorableSetOf(h.sets, abbreviation, fullName);
      return top ? toPoint(h.date, top, h.via ?? null) : null;
    })
    .filter(Boolean);
}

// Returns { bwPoints, addedPoints } if this exercise has logged both pure
// bodyweight and added-weight sets, or null if a split doesn't apply (not a
// bodyweight exercise, or only ever logged one way).
function bodyweightSplitPoints(history, abbreviation, fullName) {
  if (classifyEquipment(abbreviation, fullName) !== "bodyweight") return null;

  const bwPoints = [];
  const addedPoints = [];
  for (const h of history) {
    const scored = scoreSets(h.sets, abbreviation, fullName).filter(Boolean);
    let bwTop = null,
      addedTop = null;
    for (const s of scored) {
      if (s.addedWeight === 0 && (!bwTop || s.oneRM > bwTop.oneRM)) bwTop = s;
      if (s.addedWeight > 0 && (!addedTop || s.oneRM > addedTop.oneRM)) addedTop = s;
    }
    if (bwTop) bwPoints.push(toPoint(h.date, bwTop, h.via ?? null));
    if (addedTop) addedPoints.push(toPoint(h.date, addedTop, h.via ?? null));
  }

  if (bwPoints.length === 0 || addedPoints.length === 0) return null;
  return { bwPoints, addedPoints };
}

function chartSectionTemplate(title, subtitle, metric) {
  return `
    <section class="card">
      <div style="display:flex; align-items:baseline; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
        <h2 style="margin-top:0">${escapeHtml(title)}</h2>
        <button type="button" class="small chart-reset-zoom" style="display:none;">Reset zoom</button>
      </div>
      <p class="muted" style="margin-top:0">${escapeHtml(subtitle)}</p>
      <div class="stats-row" style="margin-bottom:0.75rem;">
        <div class="stat"><span class="stat-value chart-stat-max-all">—</span><span class="stat-label">all-time max (${escapeHtml(metric.statSuffix)})</span><span class="stat-detail chart-stat-detail-all"></span></div>
        <div class="stat"><span class="stat-value chart-stat-max-365">—</span><span class="stat-label">max, last 365 days</span><span class="stat-detail chart-stat-detail-365"></span></div>
        <div class="stat"><span class="stat-value chart-stat-max-90">—</span><span class="stat-label">max, last 90 days</span><span class="stat-detail chart-stat-detail-90"></span></div>
      </div>
      <div class="chart-wrap"></div>
      <p class="muted chart-no-weight-msg" style="display:none; margin-bottom:0;"
         data-empty-msg="No scorable sets in this group yet.">No scorable sets in this group yet.</p>
    </section>
  `;
}

function chartInstanceFromSection(section, metric) {
  return createChartInstance(
    {
      wrap: section.querySelector(".chart-wrap"),
      resetZoomBtn: section.querySelector(".chart-reset-zoom"),
      noWeightMsg: section.querySelector(".chart-no-weight-msg"),
      statAll: section.querySelector(".chart-stat-max-all"),
      stat365: section.querySelector(".chart-stat-max-365"),
      stat90: section.querySelector(".chart-stat-max-90"),
      detailAll: section.querySelector(".chart-stat-detail-all"),
      detail365: section.querySelector(".chart-stat-detail-365"),
      detail90: section.querySelector(".chart-stat-detail-90"),
    },
    metric
  );
}

function renderSplitCharts(splitPoints) {
  const singleSection = $("#chart-section-single");
  const container = $("#chart-split-sections");

  if (!splitPoints) {
    singleSection.style.display = "";
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  singleSection.style.display = "none";
  container.style.display = "";
  // Added weight leads: it's the loaded, progressive-overload half of the
  // exercise and the one that moves week to week, so it's what gets looked
  // at first. Pure-bodyweight rep volume follows underneath.
  container.innerHTML =
    chartSectionTemplate(
      "Added weight",
      "Sets with weight added on top of bodyweight — each point is that session's best estimated one-rep max (Epley formula), shown as added weight.",
      ADDED_WEIGHT_METRIC
    ) +
    chartSectionTemplate(
      "Bodyweight reps",
      "Sets with no added weight — the load is always bodyweight, so this plots the session's best rep count.",
      REPS_METRIC
    );

  const [addedSection, bwSection] = container.querySelectorAll(".card");
  chartInstanceFromSection(addedSection, ADDED_WEIGHT_METRIC).render(
    splitPoints.addedPoints,
    pointsInCurrentRange(splitPoints.addedPoints)
  );
  chartInstanceFromSection(bwSection, REPS_METRIC).render(
    splitPoints.bwPoints,
    pointsInCurrentRange(splitPoints.bwPoints)
  );
}

// ---------- heaviest weight per week ----------
// A second timeline alongside the 1RM one, plotting the single biggest weight
// moved in each training week. Where the 1RM chart is an estimate that a high-
// rep set can inflate, this is a number that was literally on the bar — and
// weekly buckets smooth out the fact that a heavy day and a light day in the
// same week say more together than either does alone.

// Monday-start week containing `iso`, as its own ISO date.
function weekStartIsoOf(iso) {
  const d = parseDateParts(iso);
  if (!d) return null;
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // getDay: Sun=0 -> Mon=0
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// One point per week that has at least one scorable set: the heaviest set of
// that week, kept at its own session date so the x axis, the tooltip and the
// click-to-jump all still point at the day it actually happened.
// Ties on weight go to the set with more reps — same bar, more work.
function weeklyTopWeightPoints(history, abbreviation, fullName) {
  const byWeek = new Map();

  for (const h of history) {
    const week = weekStartIsoOf(h.date);
    if (!week) continue;
    for (const s of scoreSets(h.sets, abbreviation, fullName)) {
      if (!s) continue;
      const best = byWeek.get(week);
      if (!best || s.weight > best.set.weight || (s.weight === best.set.weight && s.reps > best.set.reps)) {
        byWeek.set(week, { set: s, date: h.date, via: h.via ?? null });
      }
    }
  }

  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([week, { set, date, via }]) => ({
      date,
      weekStart: week,
      via,
      // Shown in the terms the set was logged in (added weight for bodyweight
      // movements), matching every other weight on this page.
      weight: roundKg(displayWeightOf(set, set.weight)),
      bodyweight: !!set.bodyweight,
      raw: set.resolvedRaw ?? set.raw,
      reps: set.reps,
      attempted: set.attempted,
    }));
}

const weeklyChartInstance = createChartInstance(
  {
    wrap: $("#weekly-chart-wrap"),
    resetZoomBtn: $("#weekly-reset-zoom"),
    noWeightMsg: $("#weekly-no-weight-msg"),
    // No stat tiles: all-time / 365d / 90d heaviest already have the record
    // banner at the top of the page.
    statAll: null,
    stat365: null,
    stat90: null,
    detailAll: null,
    detail365: null,
    detail90: null,
  },
  TOP_WEIGHT_METRIC
);

function renderWeeklyTopWeightChart(history, abbreviation, fullName) {
  const section = $("#chart-section-weekly");
  const points = weeklyTopWeightPoints(history, abbreviation, fullName);

  // A bodyweight-only movement never varies in weight — every week would plot
  // +0 kg. The bodyweight-reps chart is where that progress lives, so this
  // section stays out of the way entirely.
  if (points.length > 0 && points.every((p) => p.bodyweight && p.weight === 0)) {
    section.style.display = "none";
    return;
  }

  section.style.display = "";
  weeklyChartInstance.render(points, pointsInCurrentRange(points));
}

// The single heaviest weight ever moved for this exercise, called out in its
// own banner rather than buried among the 1RM tiles — it's a real, actually
// lifted number, not an estimate, so it deserves top billing.
let heaviestEverDate = null;

// The set a highlight came from, written the way the log and the history
// table write it. An estimated 1RM is only as meaningful as the weight and
// reps behind it — a heavy single and a long set of fives can land on the
// same estimate — so every highlight names its own set.
function rawSetOf(s) {
  return s.resolvedRaw ?? s.raw ?? "";
}

function setDetailText(s) {
  const raw = rawSetOf(s);
  return raw ? `${raw} · ${formatDate(s.date)}` : formatDate(s.date);
}

function describeRecordSet(s) {
  const detail = setDetailText(s);
  const logged = s.bodyweight
    ? `Logged as "${s.resolvedRaw ?? s.raw}" — ${formatKg(s.weight)} total with bodyweight`
    : `Logged as "${s.resolvedRaw ?? s.raw}"`;
  return { detail, logged };
}

function renderMaxWeightStat(history, abbreviation, fullName) {
  const { allTime, y365, d90 } = topWeightMovedStats(history, abbreviation, fullName);
  const banner = $("#stat-max-weight-banner");
  heaviestEverDate = allTime ? allTime.date : null;

  if (!allTime) {
    banner.style.display = "none";
    return;
  }

  banner.style.display = "";
  // Shown in the same terms as the 1RM figures — added weight for bodyweight
  // movements — so every number on this page is directly comparable.
  const { detail, logged } = describeRecordSet(allTime);
  $("#stat-max-weight").textContent = formatScoredWeight(allTime, allTime.weight);
  $("#stat-max-weight-detail").textContent = detail;
  banner.title = logged;

  // A window with nothing logged in it shows a dash rather than falling back
  // to the all-time figure, which would imply recent work that didn't happen.
  for (const [el, record] of [
    ["#stat-max-weight-365", y365],
    ["#stat-max-weight-90", d90],
  ]) {
    const node = $(el);
    const detailNode = $(`${el}-detail`);
    if (!record) {
      node.textContent = "—";
      node.title = "Nothing logged in this window";
      detailNode.textContent = "";
      node.classList.remove("is-record");
      continue;
    }
    const d = describeRecordSet(record);
    node.textContent = formatScoredWeight(record, record.weight);
    // The set was only in the tooltip before, which left the two recent
    // figures as bare numbers with no way to see what produced them.
    detailNode.textContent = d.detail;
    node.title = d.logged;
    // Flagged when the window matches the all-time best *weight*, not the
    // same session — hitting your best again on a later day is still current
    // form, and comparing dates would miss it.
    node.classList.toggle("is-record", record.weight >= allTime.weight);
  }
}

// Kept so the range buttons can redraw without refetching the history.
let lastCharted = null;

function renderChart(history, abbreviation, fullName) {
  lastCharted = { history, abbreviation, fullName };
  renderMaxWeightStat(history, abbreviation, fullName);

  const points = pointsFromHistory(history, abbreviation, fullName);

  // On a bodyweight movement these figures are added weight, so say so
  // rather than leaving a bare "1RM" that reads as total load.
  const isBodyweight = classifyEquipment(abbreviation, fullName) === "bodyweight";
  $("#stat-max-all-label").textContent = isBodyweight
    ? "all-time max (added 1RM, kg)"
    : "all-time max (1RM, kg)";
  $("#chart-single-sub").textContent = isBodyweight
    ? "Each point is that session's best estimated one-rep max (Epley formula), shown as weight added on top of bodyweight."
    : "Each point is the best set that session's estimated one-rep max (Epley formula).";

  defaultChartInstance.render(points, pointsInCurrentRange(points));
  renderSplitCharts(bodyweightSplitPoints(history, abbreviation, fullName));
  renderWeeklyTopWeightChart(history, abbreviation, fullName);
}

// ---------- range buttons ----------

function markActiveRange() {
  document.querySelectorAll("#chart-range .range-btn").forEach((btn) => {
    btn.classList.toggle("chip-active", btn.dataset.range === currentRangeKey);
  });
}

$("#chart-range").addEventListener("click", (e) => {
  const btn = e.target.closest(".range-btn");
  if (!btn || btn.dataset.range === currentRangeKey) return;
  currentRangeKey = btn.dataset.range;
  markActiveRange();
  // Redraw from data already in hand — the range is a view, not a new query.
  if (lastCharted) renderChart(lastCharted.history, lastCharted.abbreviation, lastCharted.fullName);
});

markActiveRange();

loadExerciseOptions();

const presetParams = new URLSearchParams(location.search);
const presetExercise = presetParams.get("exercise");
const presetDate = presetParams.get("date");

if (presetExercise) {
  $("#exercise-select").value = presetExercise;
  // `?date=` (used by the Exercise Dictionary's "last used" link) opens that
  // session's day panel once the history table exists to jump into.
  loadHistory(presetExercise).then(() => {
    if (!presetDate) return;
    jumpToHistoryRow(presetDate);
    // Drop it from the URL once used, so switching to another exercise doesn't
    // leave a date behind that belongs to the one you came from.
    const url = new URL(location.href);
    url.searchParams.delete("date");
    history.replaceState(null, "", url);
  });
} else {
  showEmptyState();
}
