// Parquet through hyparquet (MIT) and hyparquet-compressors (MIT): Snappy, Gzip, Brotli, Zstd, LZ4.
import { parquetMetadata, parquetReadObjects, parquetSchema } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { gridController } from './gridview.js';

export function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().replace('T00:00:00.000Z', '');
  if (v instanceof Uint8Array) {
    let s = '';
    for (let i = 0; i < Math.min(v.length, 32); i++) s += v[i].toString(16).padStart(2, '0');
    return '0x' + s + (v.length > 32 ? '…' : '');
  }
  if (typeof v === 'object') {
    try { return JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x)); } catch { return String(v); }
  }
  return String(v);
}

function typeOf(el) {
  const t = el.logical_type && el.logical_type.type ? el.logical_type.type : el.converted_type || el.type || (el.num_children ? 'GROUP' : '');
  return String(t);
}

// DOM-free: Parquet bytes to a Data tab and a Schema tab. Tested in Node.
export async function parquetTabs(bytes, limits) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  let meta;
  try { meta = parquetMetadata(ab); } catch (e) { throw Object.assign(new Error('This Parquet file is damaged: ' + ((e && e.message) || e)), { code: 'parquet' }); }
  const total = Number(meta.num_rows);
  const end = Math.min(total, limits.parquetMaxRows);
  const schema = parquetSchema(meta);
  const cols = schema.children.map((c) => c.element.name);
  const rows = end > 0 ? await parquetReadObjects({ file: ab, metadata: meta, compressors, rowStart: 0, rowEnd: end }) : [];
  const note = total > end ? `Showing the first ${end.toLocaleString()} of ${total.toLocaleString()} rows.` : `${total.toLocaleString()} rows, ${cols.length} columns.`;
  const schemaRows = schema.children.map((c) => [c.element.name, typeOf(c.element), c.element.repetition_type || '', String(c.children.length || '')]);
  const codecs = new Set();
  for (const rg of meta.row_groups) for (const cc of rg.columns) if (cc.meta_data) codecs.add(cc.meta_data.codec);
  const info = `${meta.row_groups.length} row groups, codec ${[...codecs].join(', ') || 'none'}${meta.created_by ? ', written by ' + meta.created_by : ''}.`;
  return [
    { name: 'Data', note, model: () => ({ columns: cols, rowCount: rows.length, cell: (r, c) => cellText(rows[r][cols[c]]) }) },
    { name: 'Schema', note: info, model: () => ({ columns: ['Column', 'Type', 'Repetition', 'Children'], rowCount: schemaRows.length, cell: (r, c) => schemaRows[r][c] }) },
  ];
}

export async function render(ctx) {
  return gridController(ctx, await parquetTabs(ctx.bytes, ctx.limits), 'View');
}
