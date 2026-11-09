import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkZip, listZip } from '../src/core/zip.js';
import { realZipCheck } from '../src/core/inflate.js';
import { LIMITS } from '../src/core/limits.js';
import { fixture, makeZip } from './helpers.js';

test('limits are 500 MB and 10,000 entries', () => {
  assert.equal(LIMITS.zipMaxBytes, 500 * 1024 * 1024);
  assert.equal(LIMITS.zipMaxEntries, 10000);
});

test('real documents pass both guards', async () => {
  for (const f of ['sample.docx', 'pictures.docx', 'sample.xlsx', 'report.odt', 'quarterly-review.pptx']) {
    const b = fixture(f);
    const d = checkZip(b);
    assert.equal(d.ok, true, f);
    const r = await realZipCheck(b, d.entries);
    assert.equal(r.ok, true, f);
    assert.ok(r.total >= d.total * 0.99, f);
  }
});

test('refuses more than 10,000 entries before reading them', () => {
  const z = makeZip([{ name: 'a', data: Buffer.from('x') }], { zip64Count: 10001 });
  const r = checkZip(z);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'zip-entries');
});

test('accepts exactly 10,000 entries', () => {
  const entries = Array.from({ length: 10000 }, (_, i) => ({ name: 'f' + i, data: Buffer.alloc(0), method: 0 }));
  const r = checkZip(makeZip(entries));
  assert.equal(r.ok, true);
  assert.equal(r.entries.length, 10000);
});

test('refuses a declared uncompressed total over 500 MB', () => {
  const z = makeZip([
    { name: 'word/document.xml', data: Buffer.from('<w/>'), declaredSize: 300 * 1024 * 1024 },
    { name: 'word/x.xml', data: Buffer.from('<w/>'), declaredSize: 300 * 1024 * 1024 },
  ]);
  const r = checkZip(z);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'zip-size');
});

test('refuses an archive that lies about its sizes (real inflate count)', async () => {
  const z = makeZip([{ name: 'word/document.xml', data: Buffer.alloc(3 * 1024 * 1024), declaredSize: 1000 }]);
  const d = checkZip(z, { maxBytes: 1024 * 1024 });
  assert.equal(d.ok, true, 'the declared size is small, so the first guard passes');
  const r = await realZipCheck(z, d.entries, { maxBytes: 1024 * 1024 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'zip-size');
});

test('damaged ZIP files are reported, not thrown', () => {
  const r = checkZip(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0]));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'zip-corrupt');
  const b = fixture('sample.docx').slice();
  const view = Buffer.from(b.buffer);
  const eocd = view.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
  view.writeUInt32LE(b.length + 1000, eocd + 16);
  assert.equal(checkZip(b).code, 'zip-corrupt');
});

test('listZip reads names and methods', () => {
  const z = makeZip([{ name: 'mimetype', data: Buffer.from('x'), method: 0 }, { name: 'a/b.xml', data: Buffer.from('<a/>') }]);
  const l = listZip(z);
  assert.deepEqual(l.entries.map((e) => [e.name, e.method]), [['mimetype', 0], ['a/b.xml', 8]]);
});
