import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect, formatFromName, extOf, MODULE, FORMATS } from '../src/core/detect.js';
import { fixture, makeZip } from './helpers.js';

const cases = [
  ['sample.docx', 'docx', 'zip'], ['pictures.docx', 'docx', 'zip'], ['report.odt', 'odt', 'zip'],
  ['sample.xlsx', 'xlsx', 'zip'], ['formulas.xlsx', 'xlsx', 'zip'], ['sample.ods', 'ods', 'zip'], ['sample.xls', 'xls', 'magic'],
  ['sample.csv', 'csv', 'extension'], ['sample.tsv', 'tsv', 'extension'], ['semicolon.csv', 'csv', 'extension'],
  ['sample.parquet', 'parquet', 'magic'], ['sample-zstd.parquet', 'parquet', 'magic'], ['nested.parquet', 'parquet', 'magic'],
  ['sample.pdf', 'pdf', 'magic'], ['quarterly-review.pptx', 'pptx', 'zip'],
];
for (const [file, format, by] of cases) {
  test(`detect ${file} -> ${format} by ${by}`, () => {
    const r = detect(fixture(file), file);
    assert.equal(r.format, format);
    assert.equal(r.by, by);
    assert.equal(r.mismatch, false);
  });
}

test('magic bytes win over a wrong extension', () => {
  const r = detect(fixture('sample.pdf'), 'report.docx');
  assert.equal(r.format, 'pdf');
  assert.equal(r.mismatch, true);
  const p = detect(fixture('renamed-pptx.ppt'), 'renamed-pptx.ppt');
  assert.equal(p.format, 'pptx');
  assert.equal(p.by, 'zip');
});

test('content without a name is still detected', () => {
  assert.equal(detect(fixture('sample.docx')).format, 'docx');
  assert.equal(detect(fixture('sample.parquet')).format, 'parquet');
  assert.equal(detect(fixture('sample.xls')).format, 'xls');
  assert.equal(detect(new TextEncoder().encode('a,b,c\n1,2,3\n4,5,6\n')).format, 'csv');
  assert.equal(detect(new TextEncoder().encode('a\tb\tc\n1\t2\t3\n')).format, 'tsv');
});

test('unsupported and damaged files give a reason', () => {
  const nz = detect(fixture('not-a-zip.docx'), 'not-a-zip.docx');
  assert.equal(nz.format, null);
  assert.match(nz.reason, /not a DOCX/);
  const legacy = detect(fixture('legacy.doc'), 'legacy.doc');
  assert.equal(legacy.format, null);
  assert.match(legacy.reason, /Legacy \.doc/);
  const zip = detect(makeZip([{ name: 'hello.txt', data: Buffer.from('hi') }]), 'x.zip');
  assert.equal(zip.format, null);
  const bin = detect(new Uint8Array([0, 1, 2, 3, 0, 0, 7, 8]), 'blob.bin');
  assert.equal(bin.format, null);
  assert.equal(detect(fixture('hostile-not-parquet.parquet'), 'x.parquet').format, null);
});

test('PDF with junk before the header is still a PDF', () => {
  const pdf = fixture('sample.pdf');
  const junk = new Uint8Array(100 + pdf.length);
  junk.set(pdf, 100);
  assert.equal(detect(junk, 'x.bin').format, 'pdf');
});

test('ODS and ODT read the stored mimetype entry', () => {
  const ods = makeZip([{ name: 'mimetype', data: Buffer.from('application/vnd.oasis.opendocument.spreadsheet'), method: 0 }, { name: 'content.xml', data: Buffer.from('<x/>') }]);
  assert.equal(detect(ods).format, 'ods');
  const odt = makeZip([{ name: 'mimetype', data: Buffer.from('application/vnd.oasis.opendocument.text'), method: 0 }]);
  assert.equal(detect(odt).format, 'odt');
});

test('extension helpers', () => {
  assert.equal(extOf('https://x.test/a/b/Report.Final.DOCX?x=1#p'), 'docx');
  assert.equal(extOf('noext'), '');
  assert.equal(formatFromName('a.xlsm'), 'xlsx');
  assert.equal(formatFromName('a.pq'), 'parquet');
  assert.equal(formatFromName('a.ppsx'), 'pptx');
  for (const f of FORMATS) assert.ok(MODULE[f], f);
});
