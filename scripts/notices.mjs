// Writes THIRD-PARTY-NOTICES.md from scripts/bundled-packages.json (made by the build) with each licence text.
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgs = JSON.parse(readFileSync(join(root, 'scripts/bundled-packages.json'), 'utf8'));
const WHERE = {
  'docx-preview': 'dist/formats/docx.js', jszip: 'shared chunk for DOCX, ODT, PPTX', xlsx: 'dist/formats/sheet.js (SheetJS Community Edition)',
  hyparquet: 'dist/formats/parquet.js', 'hyparquet-compressors': 'dist/formats/parquet.js', 'pdfjs-dist': 'dist/formats/pdf.js, pdf.worker.min.mjs and dist/formats/pdfjs/ (pdf.js)',
  'pptx-preview': 'dist/formats/pptx.js (see PPTX.md)', '@noble/ed25519': 'dist/formats/ed25519.js (only for browsers without WebCrypto Ed25519)',
};
let out = `# Third-party notices

Zovo Doc Viewer is licensed under GPL-3.0-or-later (LICENSE), or under a commercial licence (COMMERCIAL.md).
The built files in \`dist/\` include the open-source packages below. Each keeps its own licence. This list is made by
\`scripts/notices.mjs\` from the esbuild metafile, so it names every package that is in the build.

| Package | Version | Licence | Where |
|---|---|---|---|
`;
const body = [];
for (const name of pkgs) {
  const dir = join(root, 'node_modules', name);
  const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const lic = typeof pj.license === 'string' ? pj.license : (pj.license && pj.license.type) || 'see below';
  const label = name === 'pdfjs-dist' ? 'pdf.js (pdfjs-dist)' : name === 'xlsx' ? 'SheetJS CE (xlsx)' : name;
  out += `| ${label} | ${pj.version} | ${lic} | ${WHERE[name] || 'bundled as a dependency of the packages above'} |\n`;
  const files = [];
  for (const f of readdirSync(dir).filter((x) => /^(licen[cs]es?|copying|notice)/i.test(x))) {
    if (statSync(join(dir, f)).isDirectory()) for (const g of readdirSync(join(dir, f))) files.push(join(f, g));
    else files.push(f);
  }
  body.push(`## ${label} ${pj.version}\n\nLicence: ${lic}.${pj.homepage ? ' Home: ' + pj.homepage : ''}\n`);
  if (!files.length) body.push(name === 'pptx-preview' ? 'The npm package states licence ISC and ships no licence file. See PPTX.md.\n' : 'The npm package ships no licence file; its package.json states the licence above.\n');
  for (const f of files) body.push(`${f}:\n\n` + '```text\n' + readFileSync(join(dir, f), 'utf8').trim() + '\n```\n');
}
out += '\n' + body.join('\n');
writeFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), out);
console.log(`THIRD-PARTY-NOTICES.md: ${pkgs.length} packages`);
