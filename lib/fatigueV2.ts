// Fatigue v2 for the Log, priced on the server.
//
// v2 reads every set against the lift's max over the prior year, and every
// tier against its average effort across the whole log, so a page of the Log
// can't be priced from that page alone. The Log used to download the whole
// log to do it, on every load and after every save, which was most of what
// made it slow on a phone. The server prices it instead and hands each page
// its numbers with the workouts.
//
// There is one pricing, and it lives in public/utils.js: that file is run
// here as it is in the browser, so the Log can't drift from the Volume and
// Routine pages, which still price in the browser.
//
// The result is kept until something changes: a write through this server,
// a write by another process (the scripts in scripts/ — PRAGMA data_version
// moves), or an edit to utils.js itself.
import vm from "vm";
import { statSync, readFileSync } from "fs";
import { db } from "../db.ts";

const UTILS_PATH = `${import.meta.dir}/../public/utils.js`;

export type FatigueV2Prices = { byId: Map<number, number> };

export type FatigueV2Inputs = {
  rows: unknown[]; // /api/volume rows
  dictionary: unknown[]; // /api/dictionary entries
  rates: Record<string, number>; // /api/fatigue-rates
};

let writes = 0;
let utils: { mtime: number; ctx: any } | null = null;
let cached: { key: string; prices: FatigueV2Prices } | null = null;

// Called after any request that may have changed the log, the dictionary or
// the rates.
export function noteFatigueWrite() {
  writes++;
}

function loadUtils() {
  const mtime = statSync(UTILS_PATH).mtimeMs;
  if (utils?.mtime === mtime) return utils.ctx;
  // The page script wires up the nav menu as it loads; that's the one thing
  // it reaches for in a browser, and there's no menu here to wire.
  const ctx: any = { console, document: { addEventListener() {} } };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(UTILS_PATH, "utf8"), ctx, { filename: "public/utils.js" });
  utils = { mtime, ctx };
  return ctx;
}

export function fatigueV2Prices(load: () => FatigueV2Inputs): FatigueV2Prices {
  const ctx = loadUtils();
  const { data_version } = db.query("PRAGMA data_version").get() as { data_version: number };
  const key = `${writes}:${data_version}:${utils!.mtime}`;
  if (cached?.key === key) return cached.prices;

  const { rows, dictionary, rates } = load();
  ctx.registerDictionary(dictionary);
  ctx.registerFatigueRates(rates);
  const priced = ctx.priceVolumeRows(rows).rows as { id: number; wfuV2: number }[];
  const prices = { byId: new Map(priced.map((r) => [r.id, r.wfuV2])) };
  cached = { key, prices };
  return prices;
}
