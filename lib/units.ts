// The user logged in lbs until 2025-04-15, then switched to kg. This is the
// single source of truth for that cutoff and the conversion, shared by the
// one-off historical fix-up (scripts/convert-legacy-lbs-to-kg.ts) and the
// xlsx importer (scripts/migrate.ts), so a full re-import stays consistent
// with the live database.
export const KG_CUTOFF_DATE = "2025-04-15";
const LBS_TO_KG = 0.45359237;

// A handful of legacy rows pack multiple sub-sets into one comma-separated
// cell (e.g. "125x3,100x8" — two attempts logged in a single spreadsheet
// cell). Each comma-separated segment is converted independently.
export function convertSetToKg(raw: string): string {
  return String(raw)
    .split(",")
    .map(convertSingleSegmentToKg)
    .join(",");
}

// Only the leading number before an "x" counts as a weight, matching how
// public/utils.js's parseSet() reads sets elsewhere in the app — bare numbers
// ("30", "1+5") are reps/bonus-rep notation, not weight, and are left as-is.
function convertSingleSegmentToKg(segment: string): string {
  const m = segment.match(/^(\d+(?:\.\d+)?)(\s*x.*)$/i);
  if (!m) return segment;
  const lbs = parseFloat(m[1]);
  const kg = Math.round(lbs * LBS_TO_KG * 10) / 10;
  const kgStr = Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
  return `${kgStr}${m[2]}`;
}
