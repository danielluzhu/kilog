// Normalizes both legacy "M/D/YYYY" (from the original xlsx export) and the
// ISO "YYYY-MM-DD" produced by <input type="date">/edit forms into ISO, so
// dates sort and group correctly as plain text in SQLite.
export function normalizeDate(input: string): string {
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, da, yr] = m;
    return `${yr}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`;
  }
  return s;
}
