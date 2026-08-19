const $ = (sel) => document.querySelector(sel);

const dateInput = $("#date");
dateInput.value = todayIso();

const ACTIVITY_LABELS = { run: "Run", hike: "Hike" };

$("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("#add-status");
  status.textContent = "";
  status.className = "status";

  const date = dateInput.value;
  const activity = $("#activity").value;
  const distanceValue = parseFloat($("#distance-value").value);
  const distanceUnit = $("#distance-unit").value;
  const durationSeconds = parseDurationToSeconds($("#duration").value);
  const rawElevation = $("#elevation-value").value.trim();
  const elevationValue = rawElevation === "" ? null : parseFloat(rawElevation);
  const elevationUnit = rawElevation === "" ? null : $("#elevation-unit").value;
  const notes = $("#notes").value.trim();

  if (!date || !Number.isFinite(distanceValue) || distanceValue <= 0) {
    status.textContent = "Date and a positive distance are required.";
    status.className = "status err";
    return;
  }
  if (durationSeconds === null) {
    status.textContent = "Duration must be MM:SS or H:MM:SS.";
    status.className = "status err";
    return;
  }
  if (rawElevation !== "" && (!Number.isFinite(elevationValue) || elevationValue < 0)) {
    status.textContent = "Elevation gain must be a non-negative number.";
    status.className = "status err";
    return;
  }

  try {
    const res = await fetch("/api/cardio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date, activity, distanceValue, distanceUnit, durationSeconds, elevationValue, elevationUnit, notes,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to save");

    status.textContent = "Saved!";
    status.className = "status ok";
    $("#duration").value = "";
    $("#elevation-value").value = "";
    $("#notes").value = "";
    dateInput.value = date;

    await refreshLog();
  } catch (err) {
    status.textContent = err.message;
    status.className = "status err";
  }
});

// ---------- history table ----------

const PAGE_SIZE = 20;
let offset = 0;
let currentSearch = "";

async function fetchLog(reset) {
  if (reset) offset = 0;
  const params = new URLSearchParams({ limit: PAGE_SIZE, offset });
  if (currentSearch) params.set("search", currentSearch);
  const res = await fetch(`/api/cardio?${params}`);
  return res.json();
}

function rowHtml(s) {
  const pace = formatPace(s.duration_seconds, s.distance_value, s.distance_unit);
  const elevation = s.elevation_value != null ? `${s.elevation_value} ${s.elevation_unit}` : '<span class="muted">—</span>';
  return `
    <td>${escapeHtml(formatShortDate(s.date))}</td>
    <td>${escapeHtml(ACTIVITY_LABELS[s.activity] || s.activity)}</td>
    <td>${s.distance_value} ${escapeHtml(s.distance_unit)}</td>
    <td>${escapeHtml(formatDuration(s.duration_seconds))}</td>
    <td class="muted">${pace ? escapeHtml(pace) : "—"}</td>
    <td>${elevation}</td>
    <td>${s.notes ? escapeHtml(s.notes) : '<span class="muted">—</span>'}</td>
    <td class="actions">
      <button class="small edit-btn">Edit</button>
      <button class="small danger delete-btn">Delete</button>
    </td>
  `;
}

function renderRows(sessions, append) {
  const tbody = $("#cardio-body");
  if (!append) tbody.innerHTML = "";
  for (const s of sessions) {
    const tr = document.createElement("tr");
    tr.dataset.session = JSON.stringify(s);
    tr.innerHTML = rowHtml(s);
    tbody.appendChild(tr);
  }
  attachRowHandlers();
}

function attachRowHandlers() {
  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.onclick = () => startEdit(btn.closest("tr"));
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.onclick = () => deleteRow(btn.closest("tr"));
  });
}

function startEdit(tr) {
  const s = JSON.parse(tr.dataset.session);
  tr.innerHTML = `
    <td><input type="date" class="edit-date" value="${escapeHtml(s.date)}" style="max-width:9.5rem" /></td>
    <td>
      <select class="edit-activity">
        <option value="run" ${s.activity === "run" ? "selected" : ""}>Run</option>
        <option value="hike" ${s.activity === "hike" ? "selected" : ""}>Hike</option>
      </select>
    </td>
    <td>
      <div style="display:flex; gap:0.3rem;">
        <input type="text" class="edit-distance" value="${s.distance_value}" style="max-width:5rem" />
        <select class="edit-distance-unit">
          <option value="mi" ${s.distance_unit === "mi" ? "selected" : ""}>mi</option>
          <option value="km" ${s.distance_unit === "km" ? "selected" : ""}>km</option>
        </select>
      </div>
    </td>
    <td><input type="text" class="edit-duration" value="${escapeHtml(formatDuration(s.duration_seconds))}" style="max-width:6rem" /></td>
    <td class="muted">—</td>
    <td>
      <div style="display:flex; gap:0.3rem;">
        <input type="text" class="edit-elevation" value="${s.elevation_value ?? ""}" placeholder="optional" style="max-width:5rem" />
        <select class="edit-elevation-unit">
          <option value="ft" ${s.elevation_unit === "m" ? "" : "selected"}>ft</option>
          <option value="m" ${s.elevation_unit === "m" ? "selected" : ""}>m</option>
        </select>
      </div>
    </td>
    <td><input type="text" class="edit-notes" value="${escapeHtml(s.notes ?? "")}" /></td>
    <td class="actions">
      <button class="small primary save-btn">Save</button>
      <button class="small cancel-btn">Cancel</button>
    </td>
  `;
  tr.querySelector(".save-btn").onclick = () => saveEdit(tr, s.id);
  tr.querySelector(".cancel-btn").onclick = () => refreshLog();
}

async function saveEdit(tr, id) {
  const date = tr.querySelector(".edit-date").value.trim();
  const activity = tr.querySelector(".edit-activity").value;
  const distanceValue = parseFloat(tr.querySelector(".edit-distance").value);
  const distanceUnit = tr.querySelector(".edit-distance-unit").value;
  const durationSeconds = parseDurationToSeconds(tr.querySelector(".edit-duration").value);
  const rawElevation = tr.querySelector(".edit-elevation").value.trim();
  const elevationValue = rawElevation === "" ? null : parseFloat(rawElevation);
  const elevationUnit = rawElevation === "" ? null : tr.querySelector(".edit-elevation-unit").value;
  const notes = tr.querySelector(".edit-notes").value.trim();

  if (durationSeconds === null) {
    alert("Duration must be MM:SS or H:MM:SS.");
    return;
  }

  const res = await fetch(`/api/cardio/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date, activity, distanceValue, distanceUnit, durationSeconds, elevationValue, elevationUnit, notes,
    }),
  });
  if (!res.ok) {
    alert((await res.json()).error || "Failed to save");
    return;
  }
  await refreshLog();
}

async function deleteRow(tr) {
  const s = JSON.parse(tr.dataset.session);
  if (!confirm(`Delete this ${ACTIVITY_LABELS[s.activity] || s.activity} from ${s.date}?`)) return;
  const res = await fetch(`/api/cardio/${s.id}`, { method: "DELETE" });
  if (!res.ok) {
    alert((await res.json()).error || "Failed to delete");
    return;
  }
  await refreshLog();
}

async function refreshLog() {
  const { sessions, total } = await fetchLog(true);
  renderRows(sessions, false);
  offset = sessions.length;
  $("#count").textContent = `${total} entries`;
  $("#load-more").style.display = offset >= total ? "none" : "";
}

$("#load-more").addEventListener("click", async () => {
  const { sessions, total } = await fetchLog(false);
  renderRows(sessions, true);
  offset += sessions.length;
  $("#load-more").style.display = offset >= total ? "none" : "";
});

let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentSearch = e.target.value.trim();
    refreshLog();
  }, 250);
});

refreshLog();
