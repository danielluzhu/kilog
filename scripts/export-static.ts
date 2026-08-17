// Builds a read-only, static copy of the site into dist/.
//
// The API responses are captured from the real server rather than
// reimplemented against the database, so the JSON the static site serves is
// byte-identical to what the live server would return. Reimplementing the
// queries here would mean maintaining a second copy of the sled GLOB
// detection, the set-counting rules, and the dictionary ordering — and any
// drift between the two would show up as a silently wrong chart.
//
// Endpoints with unbounded query parameters (workouts and cardio both accept
// a free-text `search`) cannot be enumerated, so those are exported in full
// and static-api.js applies the search and pagination in the browser.

import { readdir, mkdir, rm, writeFile, copyFile } from "node:fs/promises";

const PORT = 4321;
const BASE = `http://localhost:${PORT}`;
const OUT = `${import.meta.dir}/../dist`;
const PUBLIC = `${import.meta.dir}/../public`;

const server = Bun.spawn(["bun", "run", `${import.meta.dir}/../server.ts`], {
  env: { ...process.env, PORT: String(PORT), KILOG_PASSWORD: "" },
  stdout: "pipe",
  stderr: "pipe",
});

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/api/dictionary`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await Bun.sleep(100);
  }
  throw new Error("server did not start");
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function write(relPath: string, data: unknown) {
  const full = `${OUT}/${relPath}`;
  await mkdir(full.slice(0, full.lastIndexOf("/")), { recursive: true });
  await writeFile(full, JSON.stringify(data));
}

try {
  await waitForServer();

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // ---------- static assets ----------

  // Every page lives at the root of the site, so a project page served from
  // /<repo>/ only needs absolute asset paths turned into relative ones.
  // static-api.js is injected first so it patches fetch before any page
  // script has a chance to call it.
  const entries = await readdir(PUBLIC);
  for (const name of entries) {
    if (name.endsWith(".html")) {
      let html = await Bun.file(`${PUBLIC}/${name}`).text();
      html = html.replaceAll('href="/', 'href="./').replaceAll('src="/', 'src="./');
      html = html.replace("<head>", '<head>\n<script src="./static-api.js"></script>');
      await writeFile(`${OUT}/${name}`, html);
    } else if (name === "site.webmanifest") {
      const manifest = await Bun.file(`${PUBLIC}/${name}`).text();
      await writeFile(`${OUT}/${name}`, manifest.replaceAll('"/', '"./'));
    } else {
      await copyFile(`${PUBLIC}/${name}`, `${OUT}/${name}`);
    }
  }

  // ---------- fixed endpoints ----------

  const dictionary = (await get("/api/dictionary")) as { abbreviation: string }[];
  await write("api/dictionary.json", dictionary);
  await write("api/volume.json", await get("/api/volume"));

  // ---------- paginated endpoints, exported whole ----------

  // The server caps `limit` at 90 days, so walk the offsets until a page
  // comes back short.
  const days: unknown[] = [];
  let totalDays = 0;
  let totalWorkouts = 0;
  for (let offset = 0; ; offset += 90) {
    const page = (await get(`/api/workouts?limit=90&offset=${offset}`)) as {
      days: unknown[];
      totalDays: number;
      totalWorkouts: number;
    };
    days.push(...page.days);
    totalDays = page.totalDays;
    totalWorkouts = page.totalWorkouts;
    if (page.days.length < 90) break;
  }
  await write("api/workouts.json", { days, totalDays, totalWorkouts });

  const sessions: unknown[] = [];
  let cardioTotal = 0;
  for (let offset = 0; ; offset += 200) {
    const page = (await get(`/api/cardio?limit=200&offset=${offset}`)) as {
      sessions: unknown[];
      total: number;
    };
    sessions.push(...page.sessions);
    cardioTotal = page.total;
    if (page.sessions.length < 200) break;
  }
  await write("api/cardio.json", { sessions, total: cardioTotal });

  // ---------- per-key endpoints ----------

  // Both of these take a key from a set the export already knows, so each
  // response can be written out as its own file and fetched directly.
  for (const entry of dictionary) {
    const abbrev = entry.abbreviation;
    await write(
      `api/exercises/${encodeURIComponent(abbrev)}.json`,
      await get(`/api/exercises/${encodeURIComponent(abbrev)}/history`)
    );
  }

  for (const day of days as { date: string }[]) {
    await write(`api/on/${day.date}.json`, await get(`/api/workouts/on/${day.date}`));
  }

  console.log(
    `Exported ${totalWorkouts} workouts across ${totalDays} days, ` +
      `${cardioTotal} cardio sessions, ${dictionary.length} exercises to dist/`
  );
} finally {
  server.kill();
}
