// Serves the API out of the JSON files written by scripts/export-static.ts,
// so the static build runs the same page code as the live server.
//
// Only present in dist/ — export-static.ts injects the script tag. Running
// the real server never loads this file, so localhost keeps talking to the
// real API and stays writable.
(function () {
  // Resolved from this script's own URL so the build works at a site root or
  // under a project path like /kilog/ without knowing which at build time.
  const BASE = new URL(".", document.currentScript.src).href;

  // Captured before window.fetch is replaced below. The export files live
  // under BASE + "api/", so loading them through the patched fetch would be
  // caught by this shim's own /api/ routing and 404 against itself.
  const nativeFetch = window.fetch.bind(window);

  const cache = new Map();
  function load(name) {
    if (!cache.has(name)) {
      cache.set(
        name,
        nativeFetch(`${BASE}api/${name}.json`).then((res) => {
          if (!res.ok) throw new Error(`missing export: ${name}`);
          return res.json();
        })
      );
    }
    return cache.get(name);
  }

  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // SQLite's LIKE is case-insensitive for ASCII, which is what the server
  // relies on for search.
  function matches(haystack, needle) {
    return String(haystack ?? "").toLowerCase().includes(needle);
  }

  async function listWorkouts(params) {
    const search = params.get("search")?.trim().toLowerCase();
    const limit = Math.min(Number(params.get("limit") ?? 14), 90);
    const offset = Number(params.get("offset") ?? 0);
    const all = await load("workouts");

    if (!search) {
      return json({
        days: all.days.slice(offset, offset + limit),
        totalDays: all.totalDays,
        totalWorkouts: all.totalWorkouts,
      });
    }

    // Mirrors `WHERE exercise LIKE ? OR date LIKE ?`: when the day's date
    // matches, every workout on it matches too.
    const filtered = [];
    let totalWorkouts = 0;
    for (const day of all.days) {
      const dateHit = matches(day.date, search);
      const workouts = dateHit
        ? day.workouts
        : day.workouts.filter((w) => matches(w.exercise, search));
      if (workouts.length) {
        filtered.push({ date: day.date, workouts });
        totalWorkouts += workouts.length;
      }
    }

    return json({
      days: filtered.slice(offset, offset + limit),
      totalDays: filtered.length,
      totalWorkouts,
    });
  }

  async function listCardio(params) {
    const search = params.get("search")?.trim().toLowerCase();
    const limit = Math.min(Number(params.get("limit") ?? 20), 200);
    const offset = Number(params.get("offset") ?? 0);
    const all = await load("cardio");

    const sessions = search
      ? all.sessions.filter(
          (s) =>
            matches(s.activity, search) ||
            matches(s.date, search) ||
            matches(s.notes, search)
        )
      : all.sessions;

    return json({
      sessions: sessions.slice(offset, offset + limit),
      total: search ? sessions.length : all.total,
    });
  }

  const READ_ONLY = {
    error: "This is a read-only snapshot — open the log on the machine running the server to make changes.",
  };

  window.fetch = async function (input, init) {
    const url = new URL(
      typeof input === "string" ? input : input.url,
      window.location.href
    );
    if (!url.pathname.includes("/api/")) return nativeFetch(input, init);

    const method = (init?.method ?? (typeof input === "object" ? input.method : "GET")).toUpperCase();
    if (method !== "GET") return json(READ_ONLY, 405);

    // Matched from the end so the same route works at a site root or under a
    // project path.
    const path = url.pathname.slice(url.pathname.indexOf("/api/") + "/api/".length);

    try {
      if (path === "dictionary") return json(await load("dictionary"));
      if (path === "volume") return json(await load("volume"));
      if (path === "workouts") return listWorkouts(url.searchParams);
      if (path === "cardio") return listCardio(url.searchParams);

      const onDate = path.match(/^workouts\/on\/(\d{4}-\d{2}-\d{2})$/);
      if (onDate) return json(await load(`on/${onDate[1]}`));

      const history = path.match(/^exercises\/(.+)\/history$/);
      if (history) return json(await load(`exercises/${history[1]}`));
    } catch {
      return json({ error: "not found" }, 404);
    }

    return json({ error: "not found" }, 404);
  };
})();
