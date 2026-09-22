const $ = (sel) => document.querySelector(sel);

function formatLastUsed(iso) {
  if (!iso) return "never";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

let entries = [];
const selected = new Set();

// The hand-set tier rates, exactly as the API holds them: only the ones that
// have been changed. The built-in numbers stay in utils.js, and the inputs
// show them as placeholders.
let rateOverrides = {};

async function loadDictionary() {
  const res = await fetch("/api/dictionary");
  entries = await res.json();
  registerDictionary(entries);
  render();
}

async function loadRates() {
  const res = await fetch("/api/fatigue-rates");
  rateOverrides = await res.json();
  registerFatigueRates(rateOverrides);
  renderRates();
}

buildFilterOptions();

// ---------- default WFU per set ----------

function renderRates() {
  $("#rate-grid").innerHTML = FATIGUE_RATE_NAMES.map((name) => {
    const set = rateOverrides[name] !== null && rateOverrides[name] !== undefined;
    return `<label>
        ${escapeHtml(FATIGUE_RATE_LABELS[name])}
        <input type="text" inputmode="decimal" class="rate-input${set ? " is-set" : ""}"
               data-rate="${escapeHtml(name)}"
               value="${escapeHtml(set ? rateOverrides[name] : "")}"
               placeholder="${escapeHtml(formatFatigueUnits(DEFAULT_FATIGUE_MULTIPLIERS[name]))}" />
        <span class="rate-note">${escapeHtml(FATIGUE_RATE_NOTES[name])}</span>
      </label>`;
  }).join("");

  $("#rate-grid")
    .querySelectorAll(".rate-input")
    .forEach((input) => {
      input.addEventListener("change", () => saveRate(input.dataset.rate, input.value.trim()));
    });
}

async function saveRate(name, raw) {
  const status = $("#rates-status");
  const n = Number(raw);
  if (raw !== "" && !(Number.isFinite(n) && n >= 0 && n <= MAX_FATIGUE_MULTIPLIER)) {
    status.textContent = `A rate must be a number between 0 and ${MAX_FATIGUE_MULTIPLIER}, or blank for the built-in one.`;
    status.className = "status err";
    renderRates();
    return;
  }

  const res = await fetch("/api/fatigue-rates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, multiplier: raw === "" ? null : n }),
  });
  const data = await res.json();
  if (!res.ok) {
    status.textContent = data.error || "Could not save that rate";
    status.className = "status err";
    renderRates();
    return;
  }

  if (raw === "") delete rateOverrides[name];
  else rateOverrides[name] = n;
  registerFatigueRates(rateOverrides);

  status.textContent =
    raw === ""
      ? `${FATIGUE_RATE_LABELS[name]} is back to ${formatFatigueUnits(
          DEFAULT_FATIGUE_MULTIPLIERS[name]
        )} WFU per set.`
      : `${FATIGUE_RATE_LABELS[name]} now costs ${formatFatigueUnits(n)} WFU per set.`;
  status.className = "status ok";

  renderRates();
  // Every row's placeholder is a rate that just moved.
  render();
}

$("#rates-reset-btn").addEventListener("click", async () => {
  const changed = FATIGUE_RATE_NAMES.filter((n) => rateOverrides[n] !== undefined);
  if (!changed.length) return;
  if (!confirm(`Put ${changed.length} changed rate${changed.length === 1 ? "" : "s"} back to the built-in numbers?`))
    return;
  for (const name of changed) {
    await fetch("/api/fatigue-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, multiplier: null }),
    });
  }
  rateOverrides = {};
  registerFatigueRates(rateOverrides);
  $("#rates-status").textContent = "Every rate is back to its built-in number.";
  $("#rates-status").className = "status ok";
  renderRates();
  render();
});

function sortEntries(list, mode) {
  const copy = [...list];
  if (mode === "alpha") {
    copy.sort((a, b) => a.abbreviation.localeCompare(b.abbreviation, undefined, { sensitivity: "base" }));
  } else {
    copy.sort(
      (a, b) =>
        b.usage_count - a.usage_count ||
        (b.last_used || "").localeCompare(a.last_used || "") ||
        a.abbreviation.localeCompare(b.abbreviation, undefined, { sensitivity: "base" })
    );
  }
  return copy;
}

// Built from the shared vocabularies so a new tier or pattern shows up in the
// filters without a second list to maintain.
function buildFilterOptions() {
  $("#dict-fatigue").innerHTML =
    '<option value="">All</option>' +
    FATIGUE_TIERS.map((t) => `<option value="${t}">${escapeHtml(FATIGUE_TIER_LABELS[t])}</option>`).join("");
  $("#dict-pattern").innerHTML =
    '<option value="">All</option>' +
    MOVEMENT_PATTERNS.map((p) => `<option value="${p}">${escapeHtml(MOVEMENT_PATTERN_LABELS[p])}</option>`).join("") +
    '<option value="__unset">— not set —</option>';
}

function render() {
  const search = $("#dict-search").value.trim().toLowerCase();
  const unnamedOnly = $("#unnamed-only").checked;
  const sortMode = $("#dict-sort").value;
  const tierFilter = $("#dict-fatigue").value;
  const patternFilter = $("#dict-pattern").value;

  let filtered = entries.filter((e) => {
    if (unnamedOnly && e.full_name) return false;
    // Both filters match on the *effective* value — a hand-set override where
    // there is one, otherwise the derived guess — so filtering agrees with
    // what the row's dropdowns actually show.
    if (tierFilter && classifyFatigueTier(e.abbreviation, e.full_name) !== tierFilter) return false;
    if (patternFilter) {
      const pattern = movementPatternFor(e);
      if (patternFilter === "__unset" ? !!pattern : pattern !== patternFilter) return false;
    }
    if (!search) return true;
    return (
      e.abbreviation.toLowerCase().includes(search) || e.full_name.toLowerCase().includes(search)
    );
  });
  filtered = sortEntries(filtered, sortMode);

  $("#dict-count").textContent = `${filtered.length} / ${entries.length} entries`;

  const tbody = $("#dict-body");
  tbody.innerHTML = filtered
    .map((e) => {
      const typeLabel = describeLiftCategory(e.abbreviation, e.full_name);
      const typeCell = typeLabel
        ? `<span class="pill">${escapeHtml(typeLabel)}</span>`
        : '<span class="muted">—</span>';
      const equipment = classifyEquipment(e.abbreviation, e.full_name);
      const equipmentCell = equipment
        ? `<span class="pill">${escapeHtml(equipment)}</span>`
        : '<span class="muted">—</span>';
      // Same Auto-vs-override contract as the muscle column: the select shows
      // the hand-set tier if there is one, otherwise the derived one, and the
      // blank option hands the row back to the classifier.
      const autoTier = autoFatigueTier(e.abbreviation, e.full_name);
      const effectiveTier = e.fatigue_tier || autoTier;
      const fatigueCell = `<select class="tag-select fatigue-select fatigue-${effectiveTier}${
        e.fatigue_tier ? " is-set" : ""
      }" title="${e.fatigue_tier ? "Set by hand" : "Derived from the exercise type"}">
          <option value=""${e.fatigue_tier ? "" : " selected"}>${escapeHtml(
            FATIGUE_TIER_LABELS[autoTier]
          )} (auto)</option>
          ${FATIGUE_TIERS
            .map(
              (t) =>
                `<option value="${t}"${e.fatigue_tier === t ? " selected" : ""}>${escapeHtml(
                  FATIGUE_TIER_LABELS[t]
                )}</option>`
            )
            .join("")}
        </select>`;
      // The dropdown shows the hand-assigned pattern if there is one, otherwise
      // the keyword guess. "Auto" clears the override and hands the row back
      // to the classifier, so the two states stay distinguishable.
      const autoPattern = classifyMovementPattern(e.abbreviation, e.full_name);
      const patternCell = `<select class="tag-select pattern-select${e.movement_pattern ? " is-set" : ""}" title="${
        e.movement_pattern ? "Set by hand" : autoPattern ? "Auto-detected from the name" : "Not detected — pick one"
      }">
          <option value=""${e.movement_pattern ? "" : " selected"}>${
            autoPattern ? `${escapeHtml(MOVEMENT_PATTERN_LABELS[autoPattern])} (auto)` : "— (auto)"
          }</option>
          ${MOVEMENT_PATTERNS.map(
            (g) =>
              `<option value="${g}"${e.movement_pattern === g ? " selected" : ""}>${escapeHtml(
                MOVEMENT_PATTERN_LABELS[g]
              )}</option>`
          ).join("")}
        </select>`;

      // The rate this exercise's sets are billed at. Blank shows what its
      // tier prices it at and follows the tier from then on; a number here
      // outranks the tier, so the placeholder is what "clear this" gets you.
      const autoMultiplier = autoFatigueMultiplier(e.abbreviation, e.full_name, effectiveTier);
      const hasMultiplier = e.fatigue_multiplier !== null && e.fatigue_multiplier !== undefined;
      const wfuCell = `<input type="text" inputmode="decimal" class="wfu-input${
        hasMultiplier ? " is-set" : ""
      }" value="${escapeHtml(hasMultiplier ? e.fatigue_multiplier : "")}" placeholder="${escapeHtml(
        formatFatigueUnits(autoMultiplier)
      )}" title="${
        hasMultiplier
          ? `Set by hand: every counted set bills ${formatFatigueUnits(
              Number(e.fatigue_multiplier)
            )} WFU. Clear the box to go back to ${formatFatigueUnits(autoMultiplier)} from the ${
              FATIGUE_TIER_LABELS[effectiveTier]
            } tier.`
          : `From the ${FATIGUE_TIER_LABELS[effectiveTier]} tier: ${formatFatigueUnits(
              autoMultiplier
            )} WFU per counted set. Type a number to price this exercise yourself.`
      }" />`;

      // Only offered where a sled is plausible — an input on every one of the
      // 400+ rows would be noise. Blank means "use the default". This is the
      // fallback for sets logged as a plain "S+"; a set that names its own
      // weight ("S25+61x12", one machine among several) always wins.
      const sledCell = exerciseUsesSled(entries, e.abbreviation, e.full_name)
        ? `<input type="text" inputmode="decimal" class="sled-input" value="${escapeHtml(
            e.sled_weight_kg ?? ""
          )}" placeholder="${DEFAULT_SLED_WEIGHT_KG}" title="Default sled/carriage weight in kg for this exercise, used by sets logged as a plain S+. A set can override it inline (S25+61x12). Blank uses the ${DEFAULT_SLED_WEIGHT_KG}kg default." />`
        : '<span class="muted">—</span>';
      return `
    <tr data-abbrev="${escapeHtml(e.abbreviation)}">
      <td><input type="checkbox" class="row-select" ${selected.has(e.abbreviation) ? "checked" : ""} /></td>
      <td class="col-abbrev"><a class="exercise-link" href="/lapse.html?exercise=${encodeURIComponent(
        e.abbreviation
      )}" title="Open this exercise in Lapse">${escapeHtml(e.abbreviation)}</a></td>
      <td><input type="text" class="name-input" value="${escapeHtml(e.full_name)}" placeholder="(not set)"${
        e.full_name ? ` title="${escapeHtml(e.full_name)}"` : ""
      } /></td>
      <td>${typeCell}</td>
      <td>${equipmentCell}</td>
      <td>${fatigueCell}</td>
      <td class="col-wfu">${wfuCell}</td>
      <td class="col-pattern">${patternCell}</td>
      <td class="col-sled">${sledCell}</td>
      <td class="muted">${e.usage_count}</td>
      <td class="muted col-date">${
        e.last_used
          ? `<a class="date-link" href="/lapse.html?exercise=${encodeURIComponent(
              e.abbreviation
            )}&date=${encodeURIComponent(e.last_used)}" title="Open that day's session">${escapeHtml(
              formatLastUsed(e.last_used)
            )}</a>`
          : escapeHtml(formatLastUsed(e.last_used))
      }</td>
      <td class="actions"><button class="small danger delete-btn">Delete</button></td>
    </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".row-select").forEach((cb) => {
    cb.addEventListener("change", () => {
      const abbreviation = cb.closest("tr").dataset.abbrev;
      if (cb.checked) selected.add(abbreviation);
      else selected.delete(abbreviation);
      updateMergeButton();
    });
  });
  tbody.querySelectorAll(".name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const abbreviation = input.closest("tr").dataset.abbrev;
      await saveEntry(abbreviation, input.value.trim());
    });
  });
  tbody.querySelectorAll(".fatigue-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const abbreviation = sel.closest("tr").dataset.abbrev;
      // "" is the Auto option: clears the override rather than storing a blank.
      await saveFatigueTier(abbreviation, sel.value || null);
      await loadDictionary(); // the pill colour keys off the effective tier
    });
  });
  tbody.querySelectorAll(".pattern-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const abbreviation = sel.closest("tr").dataset.abbrev;
      // "" is the Auto option: clears the override rather than storing a blank.
      await saveMovementPattern(abbreviation, sel.value || null);
      sel.classList.toggle("is-set", !!sel.value);
    });
  });
  tbody.querySelectorAll(".wfu-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const abbreviation = input.closest("tr").dataset.abbrev;
      const raw = input.value.trim();
      const n = Number(raw);
      if (raw !== "" && !(Number.isFinite(n) && n >= 0 && n <= MAX_FATIGUE_MULTIPLIER)) {
        input.value = "";
        alert(
          `WFU per set must be a number between 0 and ${MAX_FATIGUE_MULTIPLIER} ` +
            "(or blank to use the fatigue tier's rate)."
        );
        return;
      }
      await saveFatigueMultiplier(abbreviation, raw === "" ? null : n);
      // Re-rendered rather than patched in place: the cell's title and
      // placeholder both describe the rate that is now in force.
      render();
    });
  });
  tbody.querySelectorAll(".sled-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const row = input.closest("tr");
      const abbreviation = row.dataset.abbrev;
      const raw = input.value.trim();
      if (raw !== "" && !(Number(raw) >= 0)) {
        input.value = "";
        alert("Sled weight must be a non-negative number (or blank for the default).");
        return;
      }
      await saveSledWeight(abbreviation, raw === "" ? null : Number(raw));
    });
  });
  tbody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const abbreviation = btn.closest("tr").dataset.abbrev;
      if (!confirm(`Delete dictionary entry "${abbreviation}"?`)) return;
      await fetch(`/api/dictionary/${encodeURIComponent(abbreviation)}`, { method: "DELETE" });
      selected.delete(abbreviation);
      await loadDictionary();
    });
  });

  updateMergeButton();
}

// `sledWeightKg` of null clears the per-exercise value and falls back to the
// default. The full name is sent unchanged so the upsert doesn't blank it.
async function saveSledWeight(abbreviation, sledWeightKg) {
  const existing = entries.find((e) => e.abbreviation === abbreviation);
  await fetch("/api/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abbreviation, sledWeightKg }),
  });
  if (existing) existing.sled_weight_kg = sledWeightKg;
  registerDictionary(entries);
}

// `fatigueMultiplier` of null clears the hand-set rate and falls back to the
// one the fatigue tier implies. Registered back into the shared lookup so
// anything else on the page scores with the new rate immediately.
async function saveFatigueMultiplier(abbreviation, fatigueMultiplier) {
  const existing = entries.find((e) => e.abbreviation === abbreviation);
  await fetch("/api/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abbreviation, fatigueMultiplier }),
  });
  if (existing) existing.fatigue_multiplier = fatigueMultiplier;
  registerDictionary(entries);
}

// `fatigueTier` of null clears the override and falls back to the derived
// tier. The full name rides along so the upsert doesn't blank it.
async function saveFatigueTier(abbreviation, fatigueTier) {
  const existing = entries.find((e) => e.abbreviation === abbreviation);
  await fetch("/api/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abbreviation, fatigueTier }),
  });
  if (existing) existing.fatigue_tier = fatigueTier;
}

// `movementPattern` of null clears the override and falls back to the keyword
// guess. The full name rides along so the upsert doesn't blank it.
async function saveMovementPattern(abbreviation, movementPattern) {
  const existing = entries.find((e) => e.abbreviation === abbreviation);
  await fetch("/api/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abbreviation, movementPattern }),
  });
  if (existing) existing.movement_pattern = movementPattern;
}

async function saveEntry(abbreviation, fullName) {
  await fetch("/api/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abbreviation, fullName }),
  });
  const existing = entries.find((e) => e.abbreviation === abbreviation);
  if (existing) existing.full_name = fullName;
  else entries.push({ abbreviation, full_name: fullName, usage_count: 0, last_used: null });
}

$("#dict-fatigue").addEventListener("change", render);
$("#dict-pattern").addEventListener("change", render);
$("#dict-search").addEventListener("input", render);
$("#unnamed-only").addEventListener("change", render);
$("#dict-sort").addEventListener("change", render);

// ---------- merge abbreviations ----------

function updateMergeButton() {
  const btn = $("#merge-selected-btn");
  $("#merge-selected-count").textContent = selected.size;
  btn.style.display = selected.size >= 2 ? "" : "none";
}

function openMergePanel() {
  const chosen = entries.filter((e) => selected.has(e.abbreviation));
  if (chosen.length < 2) return;

  const defaultKeep = [...chosen].sort((a, b) => b.usage_count - a.usage_count)[0].abbreviation;
  const defaultName = chosen.find((e) => e.full_name)?.full_name || "";

  $("#merge-count").textContent = chosen.length;
  $("#merge-options").innerHTML = chosen
    .map(
      (e) => `
      <label style="display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0;">
        <input type="radio" name="merge-keep" value="${escapeHtml(e.abbreviation)}" ${
          e.abbreviation === defaultKeep ? "checked" : ""
        } />
        <strong>${escapeHtml(e.abbreviation)}</strong>
        <span class="muted">${e.full_name ? escapeHtml(e.full_name) : "(no name)"} — ${e.usage_count} use${
          e.usage_count === 1 ? "" : "s"
        }</span>
      </label>`
    )
    .join("");
  $("#merge-name").value = defaultName;
  $("#merge-status").textContent = "";
  $("#merge-status").className = "status";
  $("#merge-panel").style.display = "";
  $("#merge-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeMergePanel() {
  $("#merge-panel").style.display = "none";
}

$("#merge-selected-btn").addEventListener("click", openMergePanel);
$("#merge-cancel-btn").addEventListener("click", closeMergePanel);

$("#merge-confirm-btn").addEventListener("click", async () => {
  const chosen = entries.filter((e) => selected.has(e.abbreviation));
  const keepInput = document.querySelector('input[name="merge-keep"]:checked');
  if (!keepInput || chosen.length < 2) return;

  const keep = keepInput.value;
  const mergeList = chosen.map((e) => e.abbreviation).filter((a) => a !== keep);
  const fullName = $("#merge-name").value.trim();

  const status = $("#merge-status");
  status.textContent = "Merging…";
  status.className = "status";

  const res = await fetch("/api/dictionary/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keep, merge: mergeList, fullName }),
  });
  const data = await res.json();
  if (!res.ok) {
    status.textContent = data.error || "Merge failed";
    status.className = "status err";
    return;
  }

  selected.clear();
  closeMergePanel();
  await loadDictionary();

  const summary = $("#dict-count");
  const folded = data.workoutsFolded
    ? `, ${data.workoutsFolded} same-day entr${data.workoutsFolded === 1 ? "y" : "ies"} combined`
    : "";
  summary.textContent = `Merged ${mergeList.join(", ")} into ${keep} — ${data.workoutsReassigned} workout${
    data.workoutsReassigned === 1 ? "" : "s"
  } moved${folded}. ${summary.textContent}`;
});

// ---------- add single entry ----------

$("#add-entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#add-entry-status");
  const abbreviation = $("#abbrev").value.trim();
  const fullName = $("#fullname").value.trim();
  if (!abbreviation || !fullName) return;

  await saveEntry(abbreviation, fullName);
  status.textContent = `Saved "${abbreviation}" → "${fullName}"`;
  status.className = "status ok";
  $("#abbrev").value = "";
  $("#fullname").value = "";
  render();
});

// ---------- bulk import ----------

function parseRows(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.includes("\t") ? "\t" : ",";
      const idx = line.indexOf(sep);
      if (idx === -1) return null;
      const abbreviation = line.slice(0, idx).trim().replace(/^"|"$/g, "");
      const fullName = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
      if (!abbreviation) return null;
      return { abbreviation, fullName };
    })
    .filter(Boolean);
}

$("#csv-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("#csv-text").value = await file.text();
});

$("#import-btn").addEventListener("click", async () => {
  const status = $("#import-status");
  const rows = parseRows($("#csv-text").value);
  if (rows.length === 0) {
    status.textContent = "Nothing to import — check the format (abbreviation,full name per line).";
    status.className = "status err";
    return;
  }

  const res = await fetch("/api/dictionary/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries: rows }),
  });
  const data = await res.json();
  if (!res.ok) {
    status.textContent = data.error || "Import failed";
    status.className = "status err";
    return;
  }
  status.textContent = `Imported ${data.imported} entries.`;
  status.className = "status ok";
  $("#csv-text").value = "";
  $("#csv-file").value = "";
  await loadDictionary();
});

loadRates().then(loadDictionary);
