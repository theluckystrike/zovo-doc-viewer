// Virtual-scroll grid shared by CSV, XLSX/XLS/ODS and Parquet. Draws only the rows and columns on screen,
// so a million-row file scrolls as fast as a ten-row one. Sort by column, find, copy a cell.
import { esc } from './esc.js';
import { LIMITS } from '../core/limits.js';

export const GRID_CSS = `
.zg{position:relative;height:100%;overflow:auto;outline:none;font:var(--zdv-grid-font,13px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);color:var(--zdv-fg);background:var(--zdv-bg)}
.zg:focus-visible{box-shadow:inset 0 0 0 2px var(--zdv-accent)}
.zg-head{position:sticky;top:0;z-index:2;height:var(--rh);background:var(--zdv-head);border-bottom:1px solid var(--zdv-line)}
.zg-body{position:relative}
.zg-c{position:absolute;top:0;height:var(--rh);line-height:var(--rh);padding:0 6px;box-sizing:border-box;overflow:hidden;white-space:pre;text-overflow:ellipsis;border-right:1px solid var(--zdv-line);border-bottom:1px solid var(--zdv-line)}
.zg-h{font-weight:600;cursor:pointer;user-select:none;background:var(--zdv-head)}
.zg-h:hover{background:var(--zdv-hover)}
.zg-h[aria-sort=ascending]::after{content:" \\25B2";font-size:.75em}
.zg-h[aria-sort=descending]::after{content:" \\25BC";font-size:.75em}
.zg-n{z-index:1;color:var(--zdv-muted);text-align:right;background:var(--zdv-head)}
.zg-corner{z-index:3}
.zg-num{text-align:right}
.zg-hit{background:var(--zdv-hit)}
.zg-cur{background:var(--zdv-hit-cur);outline:2px solid var(--zdv-accent);outline-offset:-2px}
.zg-sel{outline:2px solid var(--zdv-accent);outline-offset:-2px}
.zg-row{position:absolute;left:0;height:var(--rh)}
`;

const NUM = /^\s*[-+]?(\d+([.,]\d+)?|\.\d+)([eE][-+]?\d+)?\s*%?\s*$/;

// model: { columns: string[], rowCount, cell(r, c) -> string, rowLabel?(r) -> string }
export function createGrid(host, model, opts = {}) {
  const root = document.createElement('div');
  root.className = 'zg';
  root.tabIndex = 0;
  root.setAttribute('role', 'grid');
  root.setAttribute('aria-label', opts.label || 'Table');
  root.setAttribute('aria-rowcount', String(model.rowCount + 1));
  root.setAttribute('aria-colcount', String(model.columns.length));
  const head = document.createElement('div');
  head.className = 'zg-head';
  head.setAttribute('role', 'row');
  const body = document.createElement('div');
  body.className = 'zg-body';
  body.setAttribute('role', 'rowgroup');
  root.append(head, body);
  host.replaceChildren(root);

  let z = 1;
  let rh = 24;
  const ncol = model.columns.length;
  const baseW = new Float64Array(ncol);
  let order = null;            // Int32Array of row indexes when sorted
  let sortCol = -1, sortDir = 0;
  let matches = [];            // [{ r (view row), c }]
  let cur = -1;
  let query = '';
  let sel = null;              // { r (view row), c }

  // Column widths from the header and the first 200 rows.
  const sample = Math.min(model.rowCount, 200);
  for (let c = 0; c < ncol; c++) {
    let w = String(model.columns[c] ?? '').length + 2;
    for (let r = 0; r < sample; r++) {
      const v = model.cell(r, c);
      if (v && v.length > w) w = v.length;
    }
    baseW[c] = Math.max(52, Math.min(380, w * 8.2 + 22));
  }
  const labelW = Math.max(40, String(model.rowCount).length * 8 + 16);
  let colX = new Float64Array(ncol + 1);
  let numW = labelW;

  function layout() {
    rh = Math.round(24 * z);
    numW = Math.round(labelW * z);
    colX = new Float64Array(ncol + 1);
    colX[0] = numW;
    for (let c = 0; c < ncol; c++) colX[c + 1] = colX[c] + Math.round(baseW[c] * z);
    root.style.setProperty('--rh', rh + 'px');
    root.style.fontSize = Math.round(13 * z) + 'px';
    const totalW = colX[ncol];
    head.style.width = totalW + 'px';
    body.style.width = totalW + 'px';
    body.style.height = model.rowCount * rh + 'px';
    drawHead();
    draw();
  }

  const rowOf = (v) => (order ? order[v] : v);

  function drawHead() {
    let h = `<div class="zg-c zg-h zg-n zg-corner" style="left:0;width:${numW}px" role="columnheader">#</div>`;
    for (let c = 0; c < ncol; c++) {
      const sort = c === sortCol ? (sortDir > 0 ? 'ascending' : 'descending') : 'none';
      h += `<div class="zg-c zg-h" role="columnheader" aria-sort="${sort}" data-c="${c}" title="Sort by this column" style="left:${colX[c]}px;width:${colX[c + 1] - colX[c]}px">${esc(model.columns[c] ?? '')}</div>`;
    }
    head.innerHTML = h;
  }

  function firstCol(x) {
    let lo = 0, hi = ncol - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (colX[m] <= x) lo = m; else hi = m - 1; }
    return lo;
  }

  let pending = false;
  function draw() {
    pending = false;
    const top = root.scrollTop, height = root.clientHeight || 600;
    const left = root.scrollLeft, width = root.clientWidth || 800;
    const r0 = Math.max(0, Math.floor(top / rh) - 4);
    const r1 = Math.min(model.rowCount, Math.ceil((top + height) / rh) + 4);
    const c0 = ncol ? firstCol(left + numW) : 0;
    let c1 = c0;
    while (c1 < ncol && colX[c1] < left + width) c1++;
    const hit = new Set();
    let curKey = '';
    if (matches.length) {
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        if (m.r >= r0 && m.r < r1) hit.add(m.r * ncol + m.c);
      }
      if (cur >= 0) curKey = matches[cur].r * ncol + matches[cur].c;
    }
    let h = '';
    for (let v = r0; v < r1; v++) {
      const r = rowOf(v);
      h += `<div class="zg-row" role="row" aria-rowindex="${v + 2}" style="top:${v * rh}px">`;
      h += `<div class="zg-c zg-n" role="rowheader" style="left:${left}px;width:${numW}px">${esc(model.rowLabel ? model.rowLabel(r) : r + 1)}</div>`;
      for (let c = c0; c < c1; c++) {
        const val = model.cell(r, c) ?? '';
        const k = v * ncol + c;
        let cls = 'zg-c';
        if (NUM.test(val)) cls += ' zg-num';
        if (k === curKey) cls += ' zg-cur';
        else if (hit.has(k)) cls += ' zg-hit';
        if (sel && sel.r === v && sel.c === c) cls += ' zg-sel';
        h += `<div class="${cls}" role="gridcell" aria-colindex="${c + 1}" data-r="${v}" data-c="${c}" style="left:${colX[c]}px;width:${colX[c + 1] - colX[c]}px" title="${val.length > 40 ? esc(val.slice(0, 2000)) : ''}">${esc(val.length > 500 ? val.slice(0, 500) + '…' : val)}</div>`;
      }
      h += '</div>';
    }
    body.innerHTML = h;
    const corner = head.firstElementChild;
    if (corner) corner.style.left = left + 'px';
  }
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(draw); } };
  root.addEventListener('scroll', schedule, { passive: true });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
  if (ro) ro.observe(root);

  function sortBy(c) {
    if (sortCol !== c) { sortCol = c; sortDir = 1; } else if (sortDir === 1) sortDir = -1; else { sortCol = -1; sortDir = 0; }
    if (sortCol < 0) order = null;
    else {
      const n = model.rowCount;
      const keys = new Array(n);
      let numeric = true;
      for (let r = 0; r < n; r++) {
        const s = model.cell(r, c) ?? '';
        keys[r] = s;
        if (numeric && s !== '' && !NUM.test(s)) numeric = false;
      }
      const idx = new Int32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      const dir = sortDir;
      if (numeric) {
        const num = keys.map((s) => (s === '' ? NaN : parseFloat(s.replace(',', '.'))));
        idx.sort((a, b) => { const x = num[a], y = num[b]; if (Number.isNaN(x)) return 1; if (Number.isNaN(y)) return -1; return (x - y) * dir || a - b; });
      } else {
        const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
        idx.sort((a, b) => { const x = keys[a], y = keys[b]; if (x === '' && y !== '') return 1; if (y === '' && x !== '') return -1; return coll.compare(x, y) * dir || a - b; });
      }
      order = idx;
    }
    if (query) find(query);
    drawHead();
    draw();
    if (opts.onStatus) opts.onStatus(sortCol < 0 ? 'Original order' : `Sorted by ${model.columns[sortCol] || 'column ' + (sortCol + 1)}, ${sortDir > 0 ? 'ascending' : 'descending'}`);
  }

  head.addEventListener('click', (e) => {
    const t = e.target.closest('[data-c]');
    if (t) sortBy(Number(t.dataset.c));
  });
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-r]');
    if (!t) return;
    sel = { r: Number(t.dataset.r), c: Number(t.dataset.c) };
    draw();
  });
  root.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && sel) {
      const v = model.cell(rowOf(sel.r), sel.c) ?? '';
      if (navigator.clipboard) navigator.clipboard.writeText(v).catch(() => {});
      if (opts.onStatus) opts.onStatus('Cell copied');
      e.preventDefault();
    }
  });

  function scrollTo(v, c) {
    const y = v * rh;
    if (y < root.scrollTop + rh || y > root.scrollTop + root.clientHeight - 2 * rh) root.scrollTop = Math.max(0, y - root.clientHeight / 3);
    if (c >= 0) {
      const x0 = colX[c], x1 = colX[c + 1];
      if (x0 < root.scrollLeft + numW || x1 > root.scrollLeft + root.clientWidth) root.scrollLeft = Math.max(0, x0 - numW - 20);
    }
  }

  const MAX_MATCHES = 100000;
  function find(q) {
    query = String(q || '');
    matches = [];
    cur = -1;
    if (query) {
      const needle = query.toLowerCase();
      outer: for (let v = 0; v < model.rowCount; v++) {
        const r = rowOf(v);
        for (let c = 0; c < ncol; c++) {
          const s = model.cell(r, c);
          if (s && s.toLowerCase().includes(needle)) {
            matches.push({ r: v, c });
            if (matches.length >= MAX_MATCHES) break outer;
          }
        }
      }
      if (matches.length) { cur = 0; scrollTo(matches[0].r, matches[0].c); }
    }
    draw();
    return { count: matches.length, index: cur, capped: matches.length >= MAX_MATCHES };
  }
  function findStep(dir) {
    if (!matches.length) return { count: 0, index: -1 };
    cur = (cur + dir + matches.length) % matches.length;
    scrollTo(matches[cur].r, matches[cur].c);
    draw();
    return { count: matches.length, index: cur };
  }

  layout();
  return {
    el: root,
    zoom(nz) { const fx = root.scrollLeft / (colX[ncol] || 1), fy = root.scrollTop / (model.rowCount * rh || 1); z = nz; layout(); root.scrollLeft = fx * colX[ncol]; root.scrollTop = fy * model.rowCount * rh; },
    find, findStep,
    sortBy,
    printHTML() {
      const n = Math.min(model.rowCount, LIMITS.printMaxRows);
      let h = '<table class="zdv-print-grid"><thead><tr><th>#</th>' + model.columns.map((c) => `<th>${esc(c ?? '')}</th>`).join('') + '</tr></thead><tbody>';
      for (let v = 0; v < n; v++) {
        const r = rowOf(v);
        h += `<tr><th>${esc(model.rowLabel ? model.rowLabel(r) : r + 1)}</th>`;
        for (let c = 0; c < ncol; c++) h += `<td>${esc(model.cell(r, c) ?? '')}</td>`;
        h += '</tr>';
      }
      h += '</tbody></table>';
      if (model.rowCount > n) h += `<p>Printed the first ${n.toLocaleString()} of ${model.rowCount.toLocaleString()} rows.</p>`;
      return h;
    },
    destroy() { if (ro) ro.disconnect(); root.remove(); },
  };
}

export function colName(c) {
  let s = '';
  c += 1;
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
