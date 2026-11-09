// Format detection: magic bytes first, then the ZIP directory, then the file extension.
import { isZip, listZip, readStored } from './zip.js';

export const FORMATS = ['docx', 'odt', 'xlsx', 'xls', 'ods', 'csv', 'tsv', 'parquet', 'pdf', 'pptx'];

const EXT = {
  docx: 'docx', docm: 'docx', dotx: 'docx', dotm: 'docx',
  odt: 'odt', ott: 'odt',
  xlsx: 'xlsx', xlsm: 'xlsx', xltx: 'xlsx', xltm: 'xlsx', xlsb: 'xlsx',
  xls: 'xls', ods: 'ods', ots: 'ods',
  csv: 'csv', tsv: 'tsv', tab: 'tsv',
  parquet: 'parquet', pq: 'parquet', parq: 'parquet',
  pdf: 'pdf',
  pptx: 'pptx', pptm: 'pptx', ppsx: 'pptx', potx: 'pptx',
};

// Which code module draws each format.
export const MODULE = { docx: 'docx', odt: 'odt', xlsx: 'sheet', xls: 'sheet', ods: 'sheet', csv: 'csv', tsv: 'csv', parquet: 'parquet', pdf: 'pdf', pptx: 'pptx' };

export function extOf(name) {
  const clean = String(name || '').split(/[?#]/)[0];
  const base = clean.slice(clean.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function formatFromName(name) {
  return EXT[extOf(name)] || null;
}

const has = (b, sig, at = 0) => sig.every((v, i) => b[at + i] === v);

function looksLikeText(b) {
  const n = Math.min(b.length, 8192);
  if (n === 0) return false;
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return true; // UTF-16 BOM
  let ctrl = 0;
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32)) ctrl++;
  }
  return ctrl / n < 0.01;
}

function sniffDelimited(b) {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, 8192));
  const lines = head.split(/\r?\n/).filter((l) => l.length).slice(0, 10);
  if (lines.length < 1) return null;
  const tabs = lines.filter((l) => l.includes('\t')).length;
  const commas = lines.filter((l) => /[,;|]/.test(l)).length;
  if (tabs >= Math.ceil(lines.length * 0.8) && tabs >= commas) return 'tsv';
  if (commas >= Math.ceil(lines.length * 0.8)) return 'csv';
  return null;
}

function fromZip(b) {
  let entries;
  try { entries = listZip(b).entries; } catch { return null; }
  const names = new Set(entries.map((e) => e.name));
  const mt = entries.find((e) => e.name === 'mimetype');
  if (mt) {
    const m = readStored(b, mt).trim();
    if (/^application\/vnd\.oasis\.opendocument\.text/.test(m)) return 'odt';
    if (/^application\/vnd\.oasis\.opendocument\.spreadsheet/.test(m)) return 'ods';
  }
  if (names.has('word/document.xml')) return 'docx';
  if (names.has('xl/workbook.xml') || names.has('xl/workbook.bin')) return 'xlsx';
  if (names.has('ppt/presentation.xml')) return 'pptx';
  for (const n of names) {
    if (/^word\/document\d*\.xml$/.test(n)) return 'docx';
  }
  return 'zip';
}

// detect(bytes, name?, mime?) -> { format, by, mismatch } ; format null when unknown.
// by: 'magic' | 'zip' | 'text' | 'extension' | 'mime'
export function detect(bytes, name = '', mime = '') {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const byName = formatFromName(name);
  const out = (format, by) => ({ format, by, mismatch: !!(byName && format && byName !== format && !(byName === 'tsv' && format === 'csv') && !(byName === 'csv' && format === 'tsv')) });

  const pdfAt = (() => { const n = Math.min(b.length - 5, 1024); for (let i = 0; i <= n; i++) if (has(b, [0x25, 0x50, 0x44, 0x46, 0x2d], i)) return i; return -1; })();
  if (pdfAt >= 0) return out('pdf', 'magic');
  if (b.length >= 8 && has(b, [0x50, 0x41, 0x52, 0x31])) return out('parquet', 'magic');
  if (isZip(b)) {
    const z = fromZip(b);
    if (z && z !== 'zip') return out(z, 'zip');
    return { format: null, by: 'zip', mismatch: false, reason: 'This ZIP file is not a DOCX, XLSX, PPTX, ODT or ODS document.' };
  }
  if (b.length >= 8 && has(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    const ext = extOf(name);
    if (ext === 'doc' || ext === 'ppt' || ext === 'dot' || ext === 'pps') return { format: null, by: 'magic', mismatch: false, reason: `Legacy .${ext} files are not supported. Save the file as .${ext}x and try again.` };
    return out('xls', 'magic');
  }
  if (byName === 'csv' || byName === 'tsv') return out(byName, 'extension');
  if (!byName && looksLikeText(b)) {
    const t = sniffDelimited(b);
    if (t) return out(t, 'text');
  }
  // Many "xls" exports are really HTML or XML spreadsheets. SheetJS reads those too.
  if (byName === 'xls') return out('xls', 'extension');
  if (/text\/csv/i.test(mime)) return out('csv', 'mime');
  if (/tab-separated/i.test(mime)) return out('tsv', 'mime');
  return { format: null, by: 'none', mismatch: false, reason: byName ? `This file is named .${extOf(name)} but its content is not a ${byName.toUpperCase()} file.` : 'This file type is not supported.' };
}
