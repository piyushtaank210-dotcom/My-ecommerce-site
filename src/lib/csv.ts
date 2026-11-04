/**
 * CSV reading and writing.
 *
 * A spreadsheet is a plain text file with commas between the columns, and
 * the rules for when a comma is really a comma are fiddly: a field may be
 * quoted, a quoted field may contain commas and newlines, and a quote
 * inside a quoted field is written twice. Everything here follows those
 * rules, so a description with a comma in it survives the round trip.
 *
 * This module holds no data and imports nothing, so a client component is
 * free to use it.
 */

/** One row of a file, as the column name and what was in it. */
export type CsvRow = Record<string, string>;

export type CsvParseResult = {
  /** The column names, in the order they were written. */
  headers: string[];
  /** The rows, keyed by column name. */
  rows: CsvRow[];
  /** Rows that could not be read at all. */
  errors: { row: number; message: string }[];
};

/**
 * Splits a file into records and fields.
 *
 * The work is done a character at a time, because a quoted field may hold
 * a newline — which means a line of the file is not necessarily a row of
 * the table.
 */
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  // A file saved by some spreadsheets begins with a byte-order mark.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  while (i < text.length) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        // Two quotes in a row are one quote.
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === ",") {
      record.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Whatever is left at the end is the last row.
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }

  return records;
}

/**
 * Reads a CSV file.
 *
 * The first row is the column names. A row with fewer columns than the
 * file has is padded with blanks; one with more is reported, because it
 * means the file is not what it says it is.
 */
export function parseCsv(text: string): CsvParseResult {
  const records = parseRecords(text);

  if (!records.length) {
    return { headers: [], rows: [], errors: [{ row: 0, message: "The file is empty." }] };
  }

  const headers = records[0].map((h) => h.trim());
  const rows: CsvRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let r = 1; r < records.length; r++) {
    const record = records[r];
    if (record.length === 1 && record[0].trim() === "") continue; // a blank line

    if (record.length > headers.length) {
      errors.push({
        row: r + 1,
        message: `This row has ${record.length} columns but the file has ${headers.length}.`,
      });
    }

    const row: CsvRow = {};
    headers.forEach((header, i) => {
      row[header] = (record[i] ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows, errors };
}

/** One field, written the way a spreadsheet expects to read it back. */
function csvCell(value: string): string {
  const v = String(value ?? "");
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/**
 * Writes a CSV file.
 *
 * The line endings are the ones spreadsheets expect on every platform, and
 * the file ends with a newline so that opening it does not leave an empty
 * last row.
 */
export function toCsv(headers: string[], rows: CsvRow[]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h] ?? "")).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
