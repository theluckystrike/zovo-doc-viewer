import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { sheetTabs } from '../src/formats/sheet.js';
import { parquetTabs, cellText } from '../src/formats/parquet.js';
import { LIMITS } from '../src/core/limits.js';
import { fixture } from './helpers.js';

test('XLSX: sheets, column letters, row numbers', () => {
  const tabs = sheetTabs(fixture('sample.xlsx'), LIMITS);
  assert.ok(tabs.length >= 1);
  const m = tabs[0].model();
  assert.equal(m.columns[0], 'A');
  assert.equal(m.rowLabel(0), '1');
  assert.ok(m.rowCount > 0);
});

test('XLS and ODS open through the same path', () => {
  for (const f of ['sample.xls', 'sample.ods', 'formulas.xlsx']) {
    const tabs = sheetTabs(fixture(f), LIMITS);
    assert.ok(tabs[0].model().rowCount > 0, f);
  }
});

test('XLSX row limit: parses only the first N rows and says how many there are', () => {
  const ws = XLSX.utils.aoa_to_sheet(Array.from({ length: 300 }, (_, i) => [i, 'row ' + i, i * 2]));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Big');
  const buf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const tabs = sheetTabs(buf, { ...LIMITS, sheetMaxRows: 100 });
  const m = tabs[0].model();
  assert.equal(m.rowCount, 100);
  assert.equal(m.cell(99, 1), 'row 99');
  assert.match(tabs[0].note, /first 100 of 300 rows/);
});

test('XLSX column limit', () => {
  const ws = XLSX.utils.aoa_to_sheet([Array.from({ length: 40 }, (_, i) => i)]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Wide');
  const buf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const tabs = sheetTabs(buf, { ...LIMITS, sheetMaxCols: 10 });
  assert.equal(tabs[0].model().columns.length, 10);
  assert.match(tabs[0].note, /first 10 of 40 columns/);
});

test('Parquet: data and schema tabs, row limit', async () => {
  const tabs = await parquetTabs(fixture('sample.parquet'), LIMITS);
  assert.deepEqual(tabs.map((t) => t.name), ['Data', 'Schema']);
  const data = tabs[0].model();
  assert.ok(data.rowCount > 0 && data.columns.length > 0);
  const lim = await parquetTabs(fixture('sample.parquet'), { ...LIMITS, parquetMaxRows: 3 });
  assert.equal(lim[0].model().rowCount, 3);
  assert.match(lim[0].note, /first 3 of/);
  const z = await parquetTabs(fixture('sample-zstd.parquet'), LIMITS);
  assert.ok(z[0].model().rowCount > 0);
  const nested = await parquetTabs(fixture('nested.parquet'), LIMITS);
  assert.ok(nested[1].model().rowCount > 0);
});

test('Parquet: damaged file gives a clear error', async () => {
  await assert.rejects(() => parquetTabs(fixture('hostile-not-parquet.parquet'), LIMITS), /damaged/);
});

test('Parquet cell text', () => {
  assert.equal(cellText(null), '');
  assert.equal(cellText(12n), '12');
  assert.equal(cellText(new Date('2026-01-02T00:00:00Z')), '2026-01-02');
  assert.equal(cellText(new Uint8Array([1, 255])), '0x01ff');
  assert.equal(cellText({ a: 1n, b: [1, 2] }), '{"a":"1","b":[1,2]}');
});
