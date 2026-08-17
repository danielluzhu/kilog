// One-time import of the legacy "workout_log (1).xlsx" export into SQLite.
// CAUTION: this wipes and rebuilds workouts/sets from the static xlsx file
// only — it does NOT know about any workouts logged through the running app
// since the last import. Re-running it after the app has been used for real
// logging would silently discard that data. It only ever adds (never
// overwrites) rows in exercise_dictionary.
import { db } from "../db.ts";
import { normalizeDate } from "../lib/dates.ts";
import { KG_CUTOFF_DATE, convertSetToKg } from "../lib/units.ts";
import { resolveWeightCarryover } from "../lib/setCarryover.ts";

const XLSX_PATH = `${import.meta.dir}/../workout_log (1).xlsx`;

async function readSheetXml(): Promise<string> {
  const proc = Bun.spawn(["unzip", "-p", XLSX_PATH, "xl/worksheets/sheet1.xml"], {
    stdout: "pipe",
  });
  const xml = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`unzip failed with code ${exitCode}`);
  return xml;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function cellColumn(ref: string): string {
  return ref.match(/^[A-Z]+/)![0];
}

function parseRows(xml: string) {
  const rows: { date: string; exercise: string; sets: string[] }[] = [];
  const rowRe = /<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c r="([A-Z]+\d+)"[^>]*>(?:<is><t(?:\s[^>]*)?>([\s\S]*?)<\/t><\/is>)?<\/c>/g;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const rowNum = Number(rowMatch[1]);
    if (rowNum === 1) continue; // header

    const cells: Record<string, string> = {};
    let cellMatch: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    const rowXml = rowMatch[2];
    while ((cellMatch = cellRe.exec(rowXml))) {
      const col = cellColumn(cellMatch[1]);
      cells[col] = decodeXmlEntities(cellMatch[2] ?? "");
    }

    const date = normalizeDate((cells["A"] ?? "").trim());
    const exercise = (cells["B"] ?? "").trim();
    if (!date && !exercise) continue;

    const setCols = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    const sets = setCols.map((c) => (cells[c] ?? "").trim()).filter((v) => v !== "");

    rows.push({ date, exercise, sets });
  }
  return rows;
}

const xml = await readSheetXml();
const rows = parseRows(xml);
console.log(`Parsed ${rows.length} workout rows from xlsx.`);

db.exec("DELETE FROM sets");
db.exec("DELETE FROM workouts");
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('workouts', 'sets')");

const insertWorkout = db.prepare("INSERT INTO workouts (date, exercise) VALUES (?, ?)");
const insertSet = db.prepare(
  "INSERT INTO sets (workout_id, set_number, value) VALUES (?, ?, ?)"
);
const insertAbbrev = db.prepare(
  "INSERT OR IGNORE INTO exercise_dictionary (abbreviation, full_name) VALUES (?, '')"
);

const abbrevs = new Set<string>();

db.transaction(() => {
  for (const row of rows) {
    const { lastInsertRowid } = insertWorkout.run(row.date, row.exercise);
    const converted = row.date < KG_CUTOFF_DATE ? row.sets.map(convertSetToKg) : row.sets;
    const sets = resolveWeightCarryover(converted);
    sets.forEach((value, i) => insertSet.run(lastInsertRowid as number, i + 1, value));
    if (row.exercise) abbrevs.add(row.exercise);
  }
  for (const abbrev of abbrevs) insertAbbrev.run(abbrev);
})();

console.log(`Imported ${rows.length} workouts, ${abbrevs.size} distinct exercise abbreviations.`);
