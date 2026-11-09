import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const has = existsSync(join(dist, 'zovo-doc-viewer.js'));

test('core is within 25 KB gzip', { skip: !has && 'run npm run build first' }, () => {
  for (const f of ['zovo-doc-viewer.js', 'zovo-doc-viewer.iife.js']) {
    const gz = gzipSync(readFileSync(join(dist, f)), { level: 9 }).length;
    assert.ok(gz <= 25 * 1024, `${f} ${gz} B`);
  }
});

test('every format file is built', { skip: !has && 'run npm run build first' }, () => {
  for (const n of ['docx', 'odt', 'sheet', 'csv', 'parquet', 'pdf', 'pptx', 'ed25519']) assert.ok(existsSync(join(dist, 'formats', n + '.js')), n);
  assert.ok(existsSync(join(dist, 'formats/pdf.worker.min.mjs')));
  assert.ok(existsSync(join(dist, 'formats/pdfjs/cmaps')));
});

test('core makes no requests of its own: no analytics, beacons or third-party hosts', { skip: !has && 'run npm run build first' }, () => {
  const core = readFileSync(join(dist, 'zovo-doc-viewer.js'), 'utf8');
  assert.ok(!/sendBeacon|XMLHttpRequest|WebSocket|EventSource|google-analytics|gtag\(/.test(core));
  const hosts = new Set([...core.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]));
  for (const h of hosts) assert.ok(['theluckystrike.github.io', 'cdn.jsdelivr.net', 'github.com', 'www.w3.org'].includes(h), h);
  assert.equal((core.match(/\bfetch\(/g) || []).length, 1, 'one fetch: the src file');
  assert.ok(!/console\.(log|warn|info)/.test(core), 'no console output');
});

test('licence files are present', () => {
  for (const f of ['LICENSE', 'COMMERCIAL.md', 'THIRD-PARTY-NOTICES.md', 'PPTX.md']) assert.ok(existsSync(join(root, f)), f);
  assert.match(readFileSync(join(root, 'LICENSE'), 'utf8'), /GNU GENERAL PUBLIC LICENSE\s+Version 3/);
  const notices = readFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  for (const lib of ['docx-preview', 'jszip', 'SheetJS', 'hyparquet', 'hyparquet-compressors', 'pdf.js', 'pptx-preview', '@noble/ed25519', 'echarts', 'lodash', 'uuid', 'tslib']) assert.ok(notices.includes(lib), lib);
});
