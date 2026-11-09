// Build: core (ESM + IIFE) and one ESM file per format with shared chunks. Writes dist/SIZES.json.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const banner = `/*! Zovo Doc Viewer v${pkg.version} | GPL-3.0-or-later or commercial licence (COMMERCIAL.md) | https://github.com/theluckystrike/zovo-doc-viewer */`;
const common = {
  bundle: true, minify: true, target: ['es2022'], platform: 'browser', logLevel: 'warning',
  define: { __VERSION__: JSON.stringify(pkg.version) }, absWorkingDir: root,
};

await build({ ...common, entryPoints: ['src/index.js'], format: 'esm', outfile: 'dist/zovo-doc-viewer.js', banner: { js: banner }, legalComments: 'none' });
await build({ ...common, entryPoints: ['src/index.js'], format: 'iife', globalName: 'ZovoDocViewer', outfile: 'dist/zovo-doc-viewer.iife.js', banner: { js: banner }, legalComments: 'none', logOverride: { 'empty-import-meta': 'silent' } });
const fmt = await build({
  ...common, metafile: true,
  entryPoints: ['docx', 'odt', 'sheet', 'csv', 'parquet', 'pdf', 'pptx', 'ed25519'].map((n) => `src/formats/${n}.js`),
  format: 'esm', splitting: true, outdir: 'dist/formats', chunkNames: 'chunks/[name]-[hash]', legalComments: 'eof',
  banner: { js: banner },
});

// Every npm package that ended up in a format file, for THIRD-PARTY-NOTICES.md (scripts/notices.mjs).
const pkgs = new Set();
for (const input of Object.keys(fmt.metafile.inputs)) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (m) pkgs.add(m[1]);
}
pkgs.add('pdfjs-dist'); // the worker and pdf.js data files are copied, not bundled
writeFileSync(join(root, 'scripts/bundled-packages.json'), JSON.stringify([...pkgs].sort(), null, 1) + '\n');

const pdfjs = join(root, 'node_modules/pdfjs-dist');
cpSync(join(pdfjs, 'build/pdf.worker.min.mjs'), join(dist, 'formats/pdf.worker.min.mjs'));
for (const d of ['cmaps', 'standard_fonts', 'wasm']) if (existsSync(join(pdfjs, d))) cpSync(join(pdfjs, d), join(dist, 'formats/pdfjs', d), { recursive: true });
for (const f of ['LICENSE', 'COMMERCIAL.md', 'THIRD-PARTY-NOTICES.md', 'PPTX.md']) if (existsSync(join(root, f))) cpSync(join(root, f), join(dist, f));

const sizes = {};
function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (!p.includes('pdfjs')) walk(p); continue; }
    if (!/\.(m?js)$/.test(n)) continue;
    const b = readFileSync(p);
    sizes[relative(dist, p)] = { bytes: b.length, gzip: gzipSync(b, { level: 9 }).length };
  }
}
walk(dist);
const core = sizes['zovo-doc-viewer.js'];
const out = { version: pkg.version, core_gzip_budget: 25 * 1024, core_ok: core.gzip <= 25 * 1024, files: sizes };
writeFileSync(join(dist, 'SIZES.json'), JSON.stringify(out, null, 1) + '\n');
for (const [k, v] of Object.entries(sizes).sort()) console.log(k.padEnd(48), String(v.bytes).padStart(9), String(v.gzip).padStart(9));
console.log(`core gzip ${core.gzip} B (budget 25600): ${out.core_ok ? 'OK' : 'OVER'}`);
if (!out.core_ok) process.exit(1);
