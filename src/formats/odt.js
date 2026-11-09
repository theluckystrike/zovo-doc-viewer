// ODT: OpenDocument text converted to safe HTML with the browser's own XML parser. No innerHTML with file content.
import JSZip from 'jszip';
import { guardZip, pagedController } from './common.js';

const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
};
const IMG = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
const MAX_DEPTH = 200;

export const ODT_CSS = `.zdv-odt{display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px;background:var(--zdv-desk)}
.zdv-odt-page{background:#fff;color:#000;width:min(21cm,100%);box-sizing:border-box;padding:2cm;box-shadow:0 1px 4px rgba(0,0,0,.25);font:12pt/1.4 "Liberation Serif","Times New Roman",serif}
.zdv-odt-page table{border-collapse:collapse;margin:6pt 0}.zdv-odt-page td{border:1px solid #999;padding:3pt 5pt;vertical-align:top}
.zdv-odt-page img{max-width:100%;height:auto}.zdv-odt-page p{margin:0 0 6pt}`;

function parse(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The ODT file has damaged XML.');
  return doc;
}

// Text style properties from <style:style> elements (automatic and common styles).
function readStyles(...docs) {
  const map = new Map();
  for (const d of docs) {
    if (!d) continue;
    for (const s of d.getElementsByTagNameNS(NS.style, 'style')) {
      const name = s.getAttributeNS(NS.style, 'name');
      const parent = s.getAttributeNS(NS.style, 'parent-style-name');
      const css = {};
      const tp = s.getElementsByTagNameNS(NS.style, 'text-properties')[0];
      if (tp) {
        if (tp.getAttributeNS(NS.fo, 'font-weight') === 'bold') css['font-weight'] = 'bold';
        if (tp.getAttributeNS(NS.fo, 'font-style') === 'italic') css['font-style'] = 'italic';
        const u = tp.getAttributeNS(NS.style, 'text-underline-style');
        if (u && u !== 'none') css['text-decoration'] = 'underline';
        const lt = tp.getAttributeNS(NS.style, 'text-line-through-style');
        if (lt && lt !== 'none') css['text-decoration'] = (css['text-decoration'] ? css['text-decoration'] + ' ' : '') + 'line-through';
        const color = tp.getAttributeNS(NS.fo, 'color');
        if (/^#[0-9a-f]{6}$/i.test(color)) css.color = color;
        const bg = tp.getAttributeNS(NS.fo, 'background-color');
        if (/^#[0-9a-f]{6}$/i.test(bg)) css['background-color'] = bg;
        const fs = tp.getAttributeNS(NS.fo, 'font-size');
        if (/^\d+(\.\d+)?(pt|%)$/.test(fs)) css['font-size'] = fs;
      }
      const pp = s.getElementsByTagNameNS(NS.style, 'paragraph-properties')[0];
      if (pp) {
        const al = pp.getAttributeNS(NS.fo, 'text-align');
        const AL = { start: 'left', end: 'right', left: 'left', right: 'right', center: 'center', justify: 'justify' };
        if (AL[al]) css['text-align'] = AL[al];
        for (const k of ['margin-left', 'margin-top', 'margin-bottom', 'text-indent']) {
          const v = pp.getAttributeNS(NS.fo, k);
          if (/^-?\d+(\.\d+)?(cm|mm|in|pt)$/.test(v)) css[k] = v;
        }
      }
      map.set(name, { parent, css });
    }
  }
  return (name) => {
    const out = {};
    const chain = [];
    for (let n = name, i = 0; n && map.has(n) && i < 20; n = map.get(n).parent, i++) chain.unshift(map.get(n).css);
    for (const c of chain) Object.assign(out, c);
    return out;
  };
}

export async function odtToDom(bytes, zip) {
  const content = parse(await zip.file('content.xml').async('string'));
  const stylesFile = zip.file('styles.xml');
  const styles = stylesFile ? parse(await stylesFile.async('string')) : null;
  const css = readStyles(styles, content);
  const images = new Map();
  for (const f of Object.values(zip.files)) {
    const ext = f.name.split('.').pop().toLowerCase();
    if (!f.dir && IMG[ext] && ext !== 'svg') images.set(f.name, f);
  }
  const page = document.createElement('div');
  page.className = 'zdv-odt-page';
  const pending = [];
  const apply = (el, styleName) => {
    const c = css(styleName);
    for (const [k, v] of Object.entries(c)) el.style.setProperty(k, v);
  };
  function walk(node, parent, depth) {
    if (depth > MAX_DEPTH) return;
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { parent.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      const ns = n.namespaceURI, ln = n.localName;
      let el = null;
      if (ns === NS.text) {
        if (ln === 'h') {
          const lvl = Math.min(6, Math.max(1, parseInt(n.getAttributeNS(NS.text, 'outline-level') || '1', 10) || 1));
          el = document.createElement('h' + lvl);
          apply(el, n.getAttributeNS(NS.text, 'style-name'));
        } else if (ln === 'p') { el = document.createElement('p'); apply(el, n.getAttributeNS(NS.text, 'style-name')); }
        else if (ln === 'span') { el = document.createElement('span'); apply(el, n.getAttributeNS(NS.text, 'style-name')); }
        else if (ln === 'list') { el = document.createElement('ul'); }
        else if (ln === 'list-item' || ln === 'list-header') { el = document.createElement('li'); }
        else if (ln === 'a') {
          el = document.createElement('a');
          const href = n.getAttributeNS(NS.xlink, 'href') || '';
          if (/^(https?:|mailto:)/i.test(href)) { el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer nofollow'; }
        } else if (ln === 'line-break') { parent.appendChild(document.createElement('br')); continue; }
        else if (ln === 'tab') { parent.appendChild(document.createTextNode('\t')); continue; }
        else if (ln === 's') { parent.appendChild(document.createTextNode(' '.repeat(Math.min(100, parseInt(n.getAttributeNS(NS.text, 'c') || '1', 10) || 1)))); continue; }
        else if (ln === 'note') {
          const cit = n.getElementsByTagNameNS(NS.text, 'note-citation')[0];
          const sup = document.createElement('sup');
          sup.textContent = cit ? cit.textContent : '*';
          parent.appendChild(sup);
          continue;
        } else if (ln === 'tracked-changes' || ln === 'sequence-decls' || ln === 'variable-decls') continue;
      } else if (ns === NS.table) {
        if (ln === 'table') el = document.createElement('table');
        else if (ln === 'table-row') el = document.createElement('tr');
        else if (ln === 'table-cell') {
          el = document.createElement('td');
          const cs = parseInt(n.getAttributeNS(NS.table, 'number-columns-spanned') || '1', 10);
          const rs = parseInt(n.getAttributeNS(NS.table, 'number-rows-spanned') || '1', 10);
          if (cs > 1) el.colSpan = Math.min(cs, 1000);
          if (rs > 1) el.rowSpan = Math.min(rs, 1000);
        } else if (ln === 'covered-table-cell' || ln === 'table-columns' || ln === 'table-column') continue;
      } else if (ns === NS.draw) {
        if (ln === 'image') {
          const href = n.getAttributeNS(NS.xlink, 'href') || '';
          const f = images.get(href.replace(/^\.\//, ''));
          if (f) {
            const img = document.createElement('img');
            img.alt = '';
            const ext = f.name.split('.').pop().toLowerCase();
            pending.push(f.async('base64').then((b64) => { img.src = `data:${IMG[ext]};base64,${b64}`; }));
            const frame = n.parentNode;
            const w = frame && frame.getAttributeNS && frame.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0', 'width');
            if (/^\d+(\.\d+)?(cm|mm|in|pt)$/.test(w || '')) img.style.width = w;
            parent.appendChild(img);
          }
          continue;
        }
        if (ln === 'frame' || ln === 'text-box' || ln === 'a') { walk(n, parent, depth + 1); continue; }
        continue;
      }
      if (el) { walk(n, el, depth + 1); parent.appendChild(el); }
      else walk(n, parent, depth + 1);
    }
  }
  const body = content.getElementsByTagNameNS(NS.office, 'text')[0];
  if (body) walk(body, page, 0);
  await Promise.all(pending);
  return page;
}

export async function render(ctx) {
  await guardZip(ctx);
  ctx.mode('doc');
  ctx.addStyle('odt', ODT_CSS);
  const zip = await JSZip.loadAsync(ctx.bytes);
  if (!zip.file('content.xml')) throw new Error('This ODT file has no content.xml.');
  const wrap = document.createElement('div');
  wrap.className = 'zdv-odt';
  const page = await odtToDom(ctx.bytes, zip);
  wrap.appendChild(page);
  ctx.body.appendChild(wrap);
  return pagedController(ctx, wrap, [page], 'Page', ODT_CSS);
}
