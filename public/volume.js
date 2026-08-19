const $ = (sel) => document.querySelector(sel);

// ---------- date helpers ----------
// All bucket maths runs on whole-day integers derived from UTC midnight, so
// a daylight-saving shift can never move a workout into the wrong bucket the
// way local-midnight millisecond arithmetic can.
const MS_PER_DAY = 86400000;

function dayNumber(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY;
}

function isoFromDayNumber(n) {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

// ---------- series definitions ----------

// Shared with the rest of the app (utils.js) so a new tier shows up here
// without a second list to keep in sync.
const TIER_SERIES = FATIGUE_TIERS;
const TIER_LABELS = FATIGUE_TIER_LABELS;

// The five movement patterns get a FIXED slot order, so a colour always means
// the same pattern no matter which range is selected — colour follows the
// entity, never its rank in the current view. "Other" (conditioning, calves,
// core) takes a neutral rather than a sixth hue, since it's a catch-all.
const PATTERN_SERIES = ["full", "push", "squat", "pulls", "hinge"];
const OTHER_KEY = "other";
// Kept separate from "Other" on purpose. "Other" is a real bucket for work
// that fits none of the five patterns; "Unassigned" is an exercise with no
// name in the dictionary, so nothing can classify it. Folding the two together
// would hide how much of the log is simply unlabelled behind a category.
const UNASSIGNED_KEY = "unassigned";
const PATTERN_STACK = [...PATTERN_SERIES, OTHER_KEY, UNASSIGNED_KEY];

function patternSeriesOf(row) {
  const p = row.movementPattern || classifyMovementPattern(row.exercise, row.exerciseName);
  if (!p) return UNASSIGNED_KEY;
  return PATTERN_SERIES.includes(p) ? p : OTHER_KEY;
}

function patternLabel(key) {
  if (key === UNASSIGNED_KEY) return "Unassigned";
  return MOVEMENT_PATTERN_LABELS[key] ?? key;
}

// ---------- state ----------

let rows = [];
let bucketMode = "week";
let rangeKey = "365";
let customDays = 14;

async function loadVolume() {
  const res = await fetch("/api/volume");
  const raw = await res.json();
  rows = raw
    .map((r) => {
      // This page never loads the dictionary, so overrides ride along on the
      // volume rows themselves rather than through registerDictionary() —
      // which is also why the tier is handed to fatigueMultiplier explicitly.
      const tier = r.fatigueTier || classifyFatigueTier(r.exercise, r.exerciseName);
      return {
        ...r,
        day: dayNumber(r.date),
        tier,
        pattern: patternSeriesOf(r),
        // Weighted volume rides alongside the raw count, never instead of it:
        // the charts stay in sets, WFUs surface in the stat tiles and the
        // tier table.
        wfu: r.setCount * fatigueMultiplier(r.exercise, r.exerciseName, tier),
      };
    })
    // A malformed date can't be placed on a timeline; dropping it beats
    // silently bucketing it under today.
    .filter((r) => r.day !== null && r.setCount > 0);
  render();
}

// ---------- bucketing ----------

function bucketSizeDays() {
  if (bucketMode === "day") return 1;
  if (bucketMode === "week") return 7;
  if (bucketMode === "30") return 30;
  return Math.max(1, Math.min(365, Math.round(customDays) || 1));
}

function rowsInRange() {
  if (rangeKey === "all") return rows;
  // Counted back from the Pacific calendar day, so the range doesn't gain or
  // lose a day depending on what timezone the browser happens to be in.
  // Year-to-date is the one window pinned to a date instead of a count.
  const cutoff =
    rangeKey === "ytd"
      ? dayNumber(startOfYearIso())
      : dayNumber(todayIso()) - Number(rangeKey);
  return rows.filter((r) => r.day >= cutoff);
}

// day 4 (1970-01-05) was a Monday, so it anchors every week-aligned grid.
const EPOCH_MONDAY = 4;

// Buckets are anchored on the most recent logged day and walk backwards, so
// the newest bucket always ends on the latest session rather than on an
// arbitrary calendar boundary. Anything measured in whole weeks is the
// exception: a 7-, 14- or 21-day block starts on a Monday, because a week
// means a calendar week to anyone reading it — no matter whether it was
// picked with the Week button or typed into Custom.
function bucketStartFor(day, latestDay, size) {
  if (size % 7 === 0) {
    const idx = Math.floor((day - EPOCH_MONDAY) / size);
    return EPOCH_MONDAY + idx * size;
  }
  if (size === 1) return day;
  const idx = Math.floor((latestDay - day) / size);
  return latestDay - (idx + 1) * size + 1;
}

// One pass, every breakdown: each bucket carries a total plus a per-series
// tally for every series list handed in. A spec's `value` names the row field
// being summed — "setCount" for the raw charts, "wfu" for the weighted one —
// so the same split (by tier) can be counted two different ways without a
// second pass over the rows.
function buildBuckets(seriesSpecs) {
  const inRange = rowsInRange();
  if (inRange.length === 0) return [];

  const size = bucketSizeDays();
  const latestDay = Math.max(...inRange.map((r) => r.day));
  const byStart = new Map();

  for (const r of inRange) {
    const start = bucketStartFor(r.day, latestDay, size);
    let b = byStart.get(start);
    if (!b) {
      b = { start, size, total: 0, wfu: 0, days: new Set() };
      for (const spec of seriesSpecs) {
        b[spec.name] = Object.fromEntries(spec.keys.map((k) => [k, 0]));
      }
      byStart.set(start, b);
    }
    for (const spec of seriesSpecs) b[spec.name][r[spec.field]] += r[spec.value || "setCount"];
    b.total += r.setCount;
    b.wfu += r.wfu;
    b.days.add(r.day);
  }

  return [...byStart.values()].sort((a, b) => a.start - b.start);
}

function bucketLabel(b, opts = {}) {
  const startIso = isoFromDayNumber(b.start);
  if (b.size === 1) return formatDate(startIso, opts.long ? undefined : { month: "short", day: "numeric" });
  const endIso = isoFromDayNumber(b.start + b.size - 1);
  const fmt = { month: "short", day: "numeric" };
  return `${formatDate(startIso, fmt)} – ${formatDate(endIso, fmt)}`;
}

function bucketNoun() {
  if (bucketMode === "day") return "day";
  if (bucketMode === "week") return "week";
  if (bucketMode === "30") return "30-day block";
  return `${bucketSizeDays()}-day block`;
}

// ---------- stacked chart ----------

function niceStep(x) {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * Math.pow(10, exp);
}

// Tick values stay unrounded — a weighted axis tops out at fractions where a
// set-count axis never does, and the caller's formatter decides how to print
// them.
function yTicks(max, count = 4) {
  const step = niceStep(max / count || 1);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return { ticks, top: top || 1 };
}

const formatSets = (v) => String(Math.round(v));

// `seriesName` is the key on each bucket holding its per-series tallies;
// `stack` is the bottom-to-top order; `classFor` maps a series key to the CSS
// class carrying its fill. `totalKey`/`format`/`unit` let a chart plot a
// weighted total instead of a set count without a second renderer.
function renderStacked(
  wrap,
  emptyEl,
  buckets,
  {
    seriesName,
    stack,
    classFor,
    labelFor,
    totalKey = "total",
    format = formatSets,
    unit = "Sets",
    totalText = (v) => `${v} set${v === 1 ? "" : "s"}`,
    selected,
  }
) {
  // Unselected series stay in the stack rather than being dropped: the bar
  // keeps its true height, so a selected pattern is still read against the
  // whole session's volume instead of against a silently rescaled axis.
  const isDimmed = dimmerFor({ selected });
  if (buckets.length === 0) {
    wrap.innerHTML = "";
    emptyEl.style.display = "";
    return;
  }
  emptyEl.style.display = "none";

  const W = 760, H = 280;
  const padL = 40, padR = 12, padT = 12, padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxTotal = Math.max(...buckets.map((b) => b[totalKey]));
  const { ticks, top } = yTicks(maxTotal);
  const yFor = (v) => padT + plotH - (v / top) * plotH;

  const n = buckets.length;
  const slot = plotW / n;
  // Bars stay hairline-thin rather than disappearing when a long range is
  // bucketed by day; the gap shrinks with the slot so dense views stay solid.
  const barW = Math.max(1, Math.min(46, slot * 0.78));

  const gridlines = ticks
    .map(
      (t) =>
        `<line class="chart-gridline" x1="${padL}" x2="${W - padR}" y1="${yFor(t)}" y2="${yFor(t)}" />
         <text class="chart-axis-text" x="${padL - 8}" y="${yFor(t) + 3}" text-anchor="end">${format(t)}</text>`
    )
    .join("");

  const bars = buckets
    .map((b, i) => {
      const x = padL + slot * (i + 0.5) - barW / 2;
      let yCursor = padT + plotH;
      const segs = stack
        .map((key) => {
          const v = b[seriesName][key] || 0;
          if (v <= 0) return "";
          const h = (v / top) * plotH;
          yCursor -= h;
          const dimmed = isDimmed && isDimmed(key) ? " vol-dimmed" : "";
          return `<rect class="vol-bar ${classFor(key)}${dimmed}" x="${x.toFixed(1)}" y="${yCursor.toFixed(
            1
          )}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"><title>${escapeHtml(
            `${labelFor(key)}: ${format(v)}`
          )}</title></rect>`;
        })
        .join("");
      return `<g>${segs}</g>`;
    })
    .join("");

  // Label as many bars as fit without colliding, always including the newest
  // bucket so the right edge is dated.
  const maxLabels = Math.max(2, Math.floor(plotW / 78));
  const stride = Math.ceil(n / maxLabels);
  const xLabels = buckets
    .map((b, i) => {
      if (i % stride !== 0 && i !== n - 1) return "";
      const cx = padL + slot * (i + 0.5);
      return `<text class="chart-axis-text" x="${cx.toFixed(1)}" y="${H - 26}" text-anchor="middle">${escapeHtml(
        bucketLabel(b)
      )}</text>`;
    })
    .join("");

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
         aria-label="${escapeHtml(unit)} per ${escapeHtml(bucketNoun())}, ${n} buckets">
      ${gridlines}
      ${bars}
      ${xLabels}
      <line class="chart-crosshair" data-crosshair x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" />
    </svg>
    <div class="chart-tooltip"></div>
  `;

  attachHover(
    wrap,
    buckets,
    { padL, plotH, W, H, slot, padT, top },
    { seriesName, stack, labelFor, totalKey, format, totalText, selected }
  );
}

function attachHover(wrap, buckets, geom, spec) {
  const svg = wrap.querySelector("svg");
  const tooltip = wrap.querySelector(".chart-tooltip");
  const crosshair = wrap.querySelector("[data-crosshair]");

  svg.addEventListener("pointermove", (evt) => {
    const rect = svg.getBoundingClientRect();
    const fracX = Math.min(1, Math.max(0, (evt.clientX - rect.left) / rect.width));
    const svgX = fracX * geom.W;
    const i = Math.max(0, Math.min(buckets.length - 1, Math.floor((svgX - geom.padL) / geom.slot)));
    const b = buckets[i];
    const cx = geom.padL + geom.slot * (i + 0.5);

    crosshair.setAttribute("x1", cx.toFixed(1));
    crosshair.setAttribute("x2", cx.toFixed(1));
    crosshair.style.opacity = "1";

    const total = b[spec.totalKey];
    const dimmed = dimmerFor(spec);
    // With a selection up, the breakdown lists only what was picked and the
    // headline reads "12 of 45 sets" — the comparison the selection is for.
    const parts = spec.stack
      .filter((k) => (b[spec.seriesName][k] || 0) > 0 && !(dimmed && dimmed(k)))
      .map((k) => `${spec.format(b[spec.seriesName][k])} ${spec.labelFor(k).toLowerCase()}`);
    const headline = dimmed
      ? `${spec.format(selectedTotal(b, spec))} of ${spec.totalText(total)}`
      : spec.totalText(total);

    tooltip.innerHTML = `<span class="tt-date"></span><span class="tt-value"></span>`;
    tooltip.querySelector(".tt-date").textContent = bucketLabel(b, { long: true });
    tooltip.querySelector(".tt-value").textContent =
      `${headline}${parts.length ? ` — ${parts.join(", ")}` : ""}`;

    const barTopY = geom.padT + geom.plotH - (total / geom.top) * geom.plotH;
    tooltip.style.left = `${(cx / geom.W) * rect.width}px`;
    tooltip.style.top = `${Math.max(0, (barTopY / geom.H) * rect.height - 10)}px`;
    tooltip.style.opacity = "1";
  });

  svg.addEventListener("pointerleave", () => {
    tooltip.style.opacity = "0";
    crosshair.style.opacity = "0";
  });
}

// ---------- legends & tables ----------

// Only the series actually present in the current view, in fixed stack order —
// so a legend shrinks with the data but never reassigns a colour, and a tier
// you haven't trained in the selected range doesn't claim space.
function renderLegend(sel, buckets, spec) {
  const { seriesName, stack, classFor, labelFor, selectable, selected } = spec;
  const present = stack.filter((k) => buckets.some((b) => (b[seriesName][k] || 0) > 0));
  const dimmed = dimmerFor(spec);

  // A selectable legend is the filter control, so its entries are buttons —
  // a click target that reads as one, and reachable from the keyboard.
  const keys = present
    .map((k) => {
      const swatch = `<i class="vol-swatch ${classFor(k)}"></i>${escapeHtml(labelFor(k))}`;
      if (!selectable) return `<span class="vol-key">${swatch}</span>`;
      const off = dimmed && dimmed(k);
      const on = selected.has(k);
      return `<button type="button" class="vol-key vol-key-toggle${off ? " is-dimmed" : ""}${
        on ? " is-selected" : ""
      }" data-key="${escapeHtml(k)}" aria-pressed="${on}">${swatch}</button>`;
    })
    .join("");

  const clear = selectable && dimmed
    ? `<button type="button" class="vol-key vol-key-clear" data-clear="1">Show all</button>`
    : "";

  $(sel).innerHTML = keys + clear;
}

// `showWfu` adds the weighted total as a final column — the tier table only,
// since the weighting is a property of the tier and repeating it against
// movement patterns would just be the same number sliced a way it doesn't
// come from.
function renderTable(tbodySel, buckets, spec) {
  const { seriesName, stack, labelFor, headSel, showWfu } = spec;
  const present = stack.filter((k) => buckets.some((b) => (b[seriesName][k] || 0) > 0));
  // The table sits under the chart it describes, so a selection has to reach
  // it too — otherwise the two disagree about what's being looked at.
  const dimmed = dimmerFor(spec);
  const cls = (k) => (dimmed && dimmed(k) ? ' class="col-dimmed"' : "");
  if (headSel) {
    $(headSel).innerHTML =
      `<th>Period</th>${present
        .map((k) => `<th${cls(k)}>${escapeHtml(labelFor(k))}</th>`)
        .join("")}<th>Total</th>` +
      (showWfu ? `<th title="${escapeHtml(WFU_EXPLAINER)}">WFU</th>` : "");
  }
  $(tbodySel).innerHTML = [...buckets]
    .reverse()
    .map(
      (b) => `
      <tr>
        <td>${escapeHtml(bucketLabel(b, { long: true }))}</td>
        ${present
          .map((k) => `<td>${b[seriesName][k] || '<span class="muted">—</span>'}</td>`)
          .join("")}
        <td><strong>${b.total}</strong></td>
        ${showWfu ? `<td>${b.wfu ? formatFatigueUnits(b.wfu) : '<span class="muted">—</span>'}</td>` : ""}
      </tr>`
    )
    .join("");
}

function patternClass(key) {
  if (key === UNASSIGNED_KEY) return "vol-unassigned";
  const idx = PATTERN_SERIES.indexOf(key);
  return idx === -1 ? "vol-other" : `vol-s${idx + 1}`;
}

// ---------- render ----------

function renderStats(buckets) {
  const total = buckets.reduce((a, b) => a + b.total, 0);
  const totalWfu = buckets.reduce((a, b) => a + b.wfu, 0);
  const trainingDays = new Set();
  for (const b of buckets) for (const d of b.days) trainingDays.add(d);

  $("#vol-total").textContent = total || "—";
  $("#vol-sessions").textContent = trainingDays.size || "—";
  $("#vol-per-bucket").textContent = buckets.length ? Math.round(total / buckets.length) : "—";
  $("#vol-per-bucket-label").textContent = `avg sets per ${bucketNoun()}`;
  $("#vol-wfu").textContent = totalWfu ? formatFatigueUnits(totalWfu) : "—";
  $("#vol-wfu-per-bucket").textContent = buckets.length
    ? formatFatigueUnits(totalWfu / buckets.length)
    : "—";
  $("#vol-wfu-per-bucket-label").textContent = `avg WFU per ${bucketNoun()}`;

  // The heaviest bucket in the range, and how much a set cost on average —
  // the two numbers a set count can't tell you.
  const peak = buckets.reduce((best, b) => (best && best.wfu >= b.wfu ? best : b), null);
  $("#wfu-peak").textContent = peak && peak.wfu ? formatFatigueUnits(peak.wfu) : "—";
  $("#wfu-peak-label").textContent =
    peak && peak.wfu ? `heaviest ${bucketNoun()} (${bucketLabel(peak)})` : `heaviest ${bucketNoun()}`;
  $("#wfu-per-set").textContent = total ? formatFatigueUnits(totalWfu / total) : "—";
}

function render() {
  const buckets = buildBuckets([
    { name: "tier", field: "tier", keys: TIER_SERIES },
    { name: "pattern", field: "pattern", keys: PATTERN_STACK },
    { name: "tierWfu", field: "tier", keys: TIER_SERIES, value: "wfu" },
  ]);

  renderStats(buckets);

  const tierSpec = {
    seriesName: "tier",
    stack: TIER_SERIES,
    classFor: (k) => `vol-${k}`,
    labelFor: (k) => TIER_LABELS[k],
  };
  const patternSpec = {
    seriesName: "pattern",
    stack: PATTERN_STACK,
    classFor: patternClass,
    labelFor: patternLabel,
  };

  // The same tier split, weighted: bar height is fatigue cost rather than set
  // count, so a week of curls reads as the easy week it was next to a week of
  // cleans that had the same number of sets in it.
  const wfuSpec = {
    seriesName: "tierWfu",
    stack: TIER_SERIES,
    classFor: (k) => `vol-${k}`,
    labelFor: (k) => TIER_LABELS[k],
    totalKey: "wfu",
    format: formatFatigueUnits,
    unit: "Weighted fatigue units",
    totalText: (v) => `${formatFatigueUnits(v)} WFU`,
  };

  renderStacked($("#vol-chart-wrap"), $("#vol-empty"), buckets, tierSpec);
  renderStacked($("#muscle-chart-wrap"), $("#muscle-empty"), buckets, patternSpec);
  renderStacked($("#wfu-chart-wrap"), $("#wfu-empty"), buckets, wfuSpec);
  renderLegend("#tier-legend", buckets, tierSpec);
  renderLegend("#muscle-legend", buckets, patternSpec);
  renderLegend("#wfu-legend", buckets, wfuSpec);

  renderTable("#vol-table-body", buckets, { ...tierSpec, headSel: "#vol-table-head", showWfu: true });
  renderTable("#muscle-table-body", buckets, { ...patternSpec, headSel: "#muscle-table-head" });
}

// ---------- controls ----------

function markActive() {
  document.querySelectorAll(".bucket-btn").forEach((b) =>
    b.classList.toggle("chip-active", b.dataset.bucket === bucketMode)
  );
  document.querySelectorAll(".vrange-btn").forEach((b) =>
    b.classList.toggle("chip-active", b.dataset.range === rangeKey)
  );
  $("#custom-days-wrap").style.display = bucketMode === "custom" ? "inline-flex" : "none";
}

document.querySelectorAll(".bucket-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    bucketMode = btn.dataset.bucket;
    markActive();
    render();
  });
});

document.querySelectorAll(".vrange-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    rangeKey = btn.dataset.range;
    markActive();
    render();
  });
});

$("#custom-days").addEventListener("input", (e) => {
  const n = parseInt(e.target.value, 10);
  if (!Number.isFinite(n) || n < 1) return; // mid-typing / cleared — leave the charts alone
  customDays = n;
  if (bucketMode === "custom") render();
});

markActive();
loadVolume();
