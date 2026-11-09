// XLSX, XLSM, XLSB, XLS and ODS through SheetJS Community Edition (Apache-2.0).
import { read, utils } from 'xlsx';
import { guardZip } from './common.js';
import { gridController } from './gridview.js';
import { colName } from '../ui/grid.js';

// DOM-free: the workbook as a list of tabs with lazy grid models. Tested in Node.
export function sheetTabs(bytes, limits) {
  const max = limits.sheetMaxRows;
  const wb = read(bytes, { type: 'array', dense: true, sheetRows: max + 1, cellDates: true, cellHTML: false, cellStyles: false, bookVBA: false, WTF: false });
  const hidden = new Map(((wb.Workbook && wb.Workbook.Sheets) || []).map((s) => [s.name, s.Hidden]));
  const tabs = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    let cache = null;
    const note = [];
    const fullRef = ws['!fullref'] || ws['!ref'];
    return {
      name: hidden.get(name) ? `${name} (hidden)` : name,
      get note() { return note.join(' '); },
      model() {
        if (cache) return cache;
        const ref = ws['!ref'] ? utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: -1, c: -1 } };
        const rows = ws['!ref'] ? utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true, dateNF: 'yyyy-mm-dd' }) : [];
        const full = fullRef ? utils.decode_range(fullRef) : ref;
        const total = full.e.r - full.s.r + 1;
        if (rows.length > max) rows.length = max;
        if (total > rows.length) note.push(`Showing the first ${rows.length.toLocaleString()} of ${total.toLocaleString()} rows.`);
        let ncol = Math.max(0, ref.e.c - ref.s.c + 1);
        if (ncol > limits.sheetMaxCols) { note.push(`Showing the first ${limits.sheetMaxCols} of ${ncol} columns.`); ncol = limits.sheetMaxCols; }
        const columns = [];
        for (let c = 0; c < ncol; c++) columns.push(colName(ref.s.c + c));
        cache = {
          columns,
          rowCount: rows.length,
          cell: (r, c) => { const row = rows[r]; const v = row ? row[c] : ''; return v == null ? '' : String(v); },
          rowLabel: (r) => String(ref.s.r + r + 1),
        };
        return cache;
      },
    };
  });
  if (!tabs.length) throw new Error('This workbook has no sheets.');
  return tabs;
}

export async function render(ctx) {
  if (ctx.format !== 'xls') await guardZip(ctx);
  return gridController(ctx, sheetTabs(ctx.bytes, ctx.limits), 'Sheet');
}
