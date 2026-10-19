// Spreadsheet apps run a cell that starts with = + - @ (or a tab or return) as a formula.
// Event titles and names come from people, so the export neutralises those cells; a
// leading apostrophe makes Excel and Sheets show the text as it is.
export function safeCsvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
}
