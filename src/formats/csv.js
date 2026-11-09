// CSV and TSV with our own parser (no dependency): quotes, delimiter guess, encodings, row limits.
import { parseCsv } from '../core/csv.js';
import { decodeText } from '../core/text.js';
import { gridController } from './gridview.js';
import { colName } from '../ui/grid.js';

const NUMLIKE = /^\s*[-+]?[\d.,]+\s*$/;

export function headerRow(rows) {
  if (rows.length < 2) return false;
  const h = rows[0];
  if (!h.length || h.some((v) => !v || NUMLIKE.test(v))) return false;
  return new Set(h).size === h.length;
}

// DOM-free: CSV bytes to one grid tab. Tested in Node.
export function csvTab(bytes, format, limits, name = 'CSV') {
  if (bytes.length > limits.csvMaxBytes) {
    throw Object.assign(new Error(`This CSV file is larger than ${Math.round(limits.csvMaxBytes / 1048576)} MB.`), { code: 'too-large' });
  }
  const text = decodeText(bytes);
  const res = parseCsv(text, { hint: format, maxRows: limits.csvMaxRows, maxCells: limits.csvMaxCells });
  const hasHeader = headerRow(res.rows);
  const rows = hasHeader ? res.rows.slice(1) : res.rows;
  const columns = [];
  for (let c = 0; c < res.columns; c++) columns.push(hasHeader ? res.rows[0][c] ?? colName(c) : colName(c));
  const D = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' };
  const note = `${rows.length.toLocaleString()} rows, ${columns.length} columns, ${D[res.delimiter]} separated.` + (res.truncated ? ' The file has more rows than the limit; showing the first part.' : '');
  return { name, note, truncated: res.truncated, model: () => ({ columns, rowCount: rows.length, cell: (r, c) => rows[r][c] ?? '' }) };
}

export async function render(ctx) {
  return gridController(ctx, [csvTab(ctx.bytes, ctx.format, ctx.limits, ctx.name || 'CSV')], 'Table');
}
