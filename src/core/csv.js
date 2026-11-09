// CSV/TSV parser (RFC 4180 quotes, any of , ; TAB |) with row and cell limits.
import { LIMITS } from './limits.js';

export function guessDelimiter(text, hint) {
  if (hint === 'tsv') return '\t';
  const sample = text.slice(0, 65536).split(/\r?\n/).slice(0, 20).filter((l) => l.length);
  let best = ',', bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.map((l) => {
      let n = 0, q = false;
      for (const ch of l) { if (ch === '"') q = !q; else if (ch === d && !q) n++; }
      return n;
    });
    if (!counts.length || counts[0] === 0) continue;
    const same = counts.filter((c) => c === counts[0]).length;
    const score = same * 1000 + counts[0];
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

// parseCsv(text, { delimiter, maxRows, maxCells }) -> { rows: string[][], delimiter, truncated, columns }
export function parseCsv(text, opts = {}) {
  const maxRows = opts.maxRows ?? LIMITS.csvMaxRows;
  const maxCells = opts.maxCells ?? LIMITS.csvMaxCells;
  const d = opts.delimiter || guessDelimiter(text, opts.hint);
  const rows = [];
  let row = [], field = '', i = 0, q = false, cells = 0, truncated = false, columns = 0;
  const n = text.length;
  const endRow = () => {
    row.push(field); field = '';
    cells += row.length;
    if (row.length > columns) columns = row.length;
    rows.push(row); row = [];
    if (rows.length >= maxRows || cells >= maxCells) truncated = true;
  };
  while (i < n && !truncated) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { q = true; i++; continue; }
    if (c === d) { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { endRow(); i += text[i + 1] === '\n' ? 2 : 1; continue; }
    if (c === '\n') { endRow(); i++; continue; }
    field += c; i++;
  }
  if (!truncated && (field !== '' || row.length)) endRow();
  if (i >= n) truncated = false; // the limit was reached exactly at the end of the file
  return { rows, delimiter: d, truncated, columns };
}
