import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, guessDelimiter } from '../src/core/csv.js';
import { decodeText } from '../src/core/text.js';
import { csvTab, headerRow } from '../src/formats/csv.js';
import { LIMITS } from '../src/core/limits.js';
import { fixture } from './helpers.js';

test('quotes, escaped quotes, embedded commas and newlines', () => {
  const r = parseCsv(decodeText(fixture('sample.csv')));
  assert.deepEqual(r.rows[0], ['id', 'name', 'price', 'active', 'joined']);
  assert.equal(r.rows[2][1], 'Bob, Jr.');
  assert.equal(r.rows[3][1], 'Say "hi"');
  assert.ok(r.rows[4][1].includes('\n'));
  assert.equal(r.truncated, false);
});

test('delimiter guess: comma, semicolon, tab, pipe', () => {
  assert.equal(guessDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(guessDelimiter('a;b;c\n1,5;2;3'), ';');
  assert.equal(guessDelimiter('a\tb\n1\t2'), '\t');
  assert.equal(guessDelimiter('a|b|c\n1|2|3'), '|');
  assert.equal(parseCsv(decodeText(fixture('semicolon.csv'))).delimiter, ';');
  assert.equal(parseCsv(decodeText(fixture('sample.tsv')), { hint: 'tsv' }).delimiter, '\t');
});

test('CRLF, ragged rows and a missing final newline', () => {
  const r = parseCsv('a,b\r\n1\r\n2,3,4');
  assert.deepEqual(r.rows, [['a', 'b'], ['1'], ['2', '3', '4']]);
  assert.equal(r.columns, 3);
});

test('row limit: truncates and says so', () => {
  const text = Array.from({ length: 1000 }, (_, i) => `${i},x`).join('\n');
  const r = parseCsv(text, { maxRows: 100 });
  assert.equal(r.rows.length, 100);
  assert.equal(r.truncated, true);
});

test('row limit reached exactly at the end is not a truncation', () => {
  const r = parseCsv('a\nb\nc\n', { maxRows: 3 });
  assert.equal(r.rows.length, 3);
  assert.equal(r.truncated, false);
});

test('cell limit stops a very wide file', () => {
  const wide = Array.from({ length: 50 }, () => Array.from({ length: 1000 }, () => 'v').join(',')).join('\n');
  const r = parseCsv(wide, { maxCells: 10000 });
  assert.equal(r.rows.length, 10);
  assert.equal(r.truncated, true);
});

test('default limits: 1,000,000 rows, 20,000,000 cells, 150 MB', () => {
  assert.equal(LIMITS.csvMaxRows, 1000000);
  assert.equal(LIMITS.csvMaxCells, 20000000);
  assert.equal(LIMITS.csvMaxBytes, 150 * 1024 * 1024);
});

test('csvTab refuses files over the byte limit', () => {
  assert.throws(() => csvTab(new Uint8Array(2048), 'csv', { ...LIMITS, csvMaxBytes: 1024 }), (e) => e.code === 'too-large');
});

test('csvTab: header row, row count and note', () => {
  const t = csvTab(fixture('sample.csv'), 'csv', LIMITS, 'sample.csv');
  const m = t.model();
  assert.deepEqual(m.columns, ['id', 'name', 'price', 'active', 'joined']);
  assert.equal(m.cell(0, 1), 'Alice');
  assert.match(t.note, /rows, 5 columns, comma separated/);
  const lim = csvTab(new TextEncoder().encode('h1,h2\n' + Array.from({ length: 50 }, (_, i) => `${i},y`).join('\n')), 'csv', { ...LIMITS, csvMaxRows: 10 });
  assert.equal(lim.truncated, true);
  assert.match(lim.note, /more rows than the limit/);
});

test('header heuristic', () => {
  assert.equal(headerRow([['a', 'b'], ['1', '2']]), true);
  assert.equal(headerRow([['1', '2'], ['3', '4']]), false);
  assert.equal(headerRow([['a', 'a'], ['1', '2']]), false);
  assert.equal(headerRow([['a', 'b']]), false);
});

test('text decoding: BOM, UTF-16, Windows-1252', () => {
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])), 'a');
  assert.equal(decodeText(new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x62, 0x00])), 'ab');
  assert.equal(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9])), 'café');
});
