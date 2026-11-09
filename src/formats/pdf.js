// PDF through pdf.js (Apache-2.0): pages drawn when they scroll into view, a text layer for selection and find.
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist';
import { scrollWithin } from '../ui/scroll.js';

export const PDF_CSS = `.zdv-pdf{display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px;background:var(--zdv-desk)}
.zdv-pdf-page{position:relative;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);flex:none}
.zdv-pdf-page canvas{position:absolute;inset:0;width:100%;height:100%}
.textLayer{position:absolute;text-align:initial;inset:0;overflow:clip;opacity:1;line-height:1;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;caret-color:CanvasText;z-index:0;--min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor) * var(--min-font-size));--min-font-size-inv:calc(1 / var(--min-font-size))}
.textLayer :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}
.textLayer > :not(.markedContent),.textLayer .markedContent span:not(.markedContent){z-index:1;--font-height:0;font-size:calc(var(--text-scale-factor) * var(--font-height));--scale-x:1;--rotate:0deg;transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}
.textLayer .markedContent{display:contents}
.textLayer ::selection{background:rgba(0,100,255,.3)}
.textLayer span.zdv-hit{background:rgba(255,200,0,.45);border-radius:2px}
.textLayer span.zdv-cur{background:rgba(255,120,0,.6)}`;

let worker = null;
function setupWorker(base) {
  if (worker !== null) return;
  const url = base + 'pdf.worker.min.mjs';
  GlobalWorkerOptions.workerSrc = url;
  try {
    const same = new URL(url, location.href).origin === location.origin;
    if (same) worker = new Worker(url, { type: 'module' });
    else {
      // A page cannot start a worker from another origin (a CDN), but a same-origin blob worker can import it.
      const blob = new Blob([`import ${JSON.stringify(url)};`], { type: 'text/javascript' });
      worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    }
    GlobalWorkerOptions.workerPort = worker;
  } catch {
    worker = false; // pdf.js falls back to running in the page
  }
}

export async function render(ctx) {
  ctx.mode('doc');
  ctx.addStyle('pdf', PDF_CSS);
  setupWorker(ctx.base);
  const task = getDocument({
    data: ctx.bytes.slice(),
    isEvalSupported: false,
    enableXfa: false,
    cMapUrl: ctx.base + 'pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: ctx.base + 'pdfjs/standard_fonts/',
    wasmUrl: ctx.base + 'pdfjs/wasm/',
    useSystemFonts: true,
  });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (e) {
    const msg = e && e.name === 'PasswordException' ? 'This PDF is protected with a password.' : 'This PDF could not be opened: ' + ((e && e.message) || e);
    throw Object.assign(new Error(msg), { code: 'pdf' });
  }
  const n = pdf.numPages;
  const wrap = document.createElement('div');
  wrap.className = 'zdv-pdf';
  ctx.body.appendChild(wrap);
  const first = await pdf.getPage(1);
  const vp1 = first.getViewport({ scale: 1 });
  const fitScale = () => Math.max(0.25, Math.min(2, ((ctx.scroller.clientWidth || 900) - 40) / vp1.width));
  let base = fitScale();
  let zoom = 1;
  const scale = () => base * zoom;
  const pages = [];
  const sizes = new Array(n).fill(null);
  sizes[0] = { w: vp1.width, h: vp1.height };
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'zdv-pdf-page';
    d.dataset.page = String(i + 1);
    d.setAttribute('role', 'region');
    d.setAttribute('aria-label', `Page ${i + 1}`);
    wrap.appendChild(d);
    pages.push({ el: d, drawn: 0, task: null, text: null, textDiv: null });
  }
  function sizePage(i) {
    const s = sizes[i] || sizes[0];
    const el = pages[i].el;
    el.style.width = Math.floor(s.w * scale()) + 'px';
    el.style.height = Math.floor(s.h * scale()) + 'px';
  }
  pages.forEach((_, i) => sizePage(i));

  let query = '';
  let hits = []; // [{ page, n }] flattened match list
  let cur = -1;

  async function draw(i) {
    const p = pages[i];
    const sc = scale();
    if (p.drawn === sc) return;
    p.drawn = sc;
    if (p.task) { try { p.task.cancel(); } catch { /* ignore */ } }
    const page = i === 0 ? first : await pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: sc });
    if (!sizes[i]) { const v1 = page.getViewport({ scale: 1 }); sizes[i] = { w: v1.width, h: v1.height }; sizePage(i); }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    const textDiv = document.createElement('div');
    textDiv.className = 'textLayer';
    p.el.style.setProperty('--scale-factor', String(sc));
    p.el.style.setProperty('--total-scale-factor', String(sc));
    p.el.style.setProperty('--user-unit', '1');
    p.task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
    try { await p.task.promise; } catch (e) { if (e && e.name === 'RenderingCancelledException') return; throw e; }
    if (p.drawn !== sc) return;
    p.el.replaceChildren(canvas, textDiv);
    const tl = new TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport: vp });
    try { await tl.render(); } catch { /* text layer is optional */ }
    p.textDiv = textDiv;
    markHits(i);
  }

  const io = new IntersectionObserver((list) => {
    for (const e of list) if (e.isIntersecting) draw(Number(e.target.dataset.page) - 1).catch((err) => ctx.status('Page ' + e.target.dataset.page + ': ' + ((err && err.message) || err)));
  }, { root: ctx.scroller, rootMargin: '600px 0px' });
  pages.forEach((p) => io.observe(p.el));

  let page = 1;
  const onScroll = () => {
    const top = ctx.scroller.getBoundingClientRect().top + ctx.scroller.clientHeight / 3;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pages[m].el.getBoundingClientRect().top <= top) lo = m; else hi = m - 1; }
    if (lo + 1 !== page) { page = lo + 1; ctx.setPage(page); }
  };
  ctx.scroller.addEventListener('scroll', onScroll, { passive: true });
  ctx.setPages(n, 'Page');

  async function textOf(i) {
    if (pages[i].text != null) return pages[i].text;
    const pg = i === 0 ? first : await pdf.getPage(i + 1);
    const tc = await pg.getTextContent();
    pages[i].text = tc.items.map((it) => it.str || '').join('\n');
    return pages[i].text;
  }

  function markHits(i) {
    const td = pages[i].textDiv;
    if (!td) return;
    const needle = query.toLowerCase();
    const curHit = cur >= 0 ? hits[cur] : null;
    let k = 0;
    for (const s of td.querySelectorAll('span')) {
      s.classList.remove('zdv-hit', 'zdv-cur');
      if (!needle || s.childElementCount) continue;
      const t = (s.textContent || '').toLowerCase();
      if (t.includes(needle)) {
        s.classList.add('zdv-hit');
        if (curHit && curHit.page === i && curHit.n === k) s.classList.add('zdv-cur');
        k++;
      }
    }
  }

  function goto(i) {
    if (i < 1 || i > n) return;
    scrollWithin(ctx.scroller, pages[i - 1].el, 'start');
    page = i;
    ctx.setPage(i);
  }

  function rezoom() {
    const frac = ctx.scroller.scrollTop / (ctx.scroller.scrollHeight || 1);
    pages.forEach((p, i) => { sizePage(i); p.drawn = 0; });
    ctx.scroller.scrollTop = frac * ctx.scroller.scrollHeight;
    for (const p of pages) {
      const r = p.el.getBoundingClientRect(), v = ctx.scroller.getBoundingClientRect();
      if (r.bottom > v.top - 600 && r.top < v.bottom + 600) draw(Number(p.el.dataset.page) - 1).catch(() => {});
    }
  }

  return {
    goto,
    zoom(z) { zoom = z; rezoom(); },
    async find(q) {
      query = String(q || '');
      hits = [];
      cur = -1;
      if (query) {
        const needle = query.toLowerCase();
        for (let i = 0; i < n; i++) {
          const items = (await textOf(i)).toLowerCase().split('\n');
          let k = 0;
          for (const it of items) if (it.includes(needle)) hits.push({ page: i, n: k++ });
        }
        if (hits.length) cur = 0;
      }
      pages.forEach((_, i) => markHits(i));
      if (cur >= 0) goto(hits[0].page + 1);
      return { count: hits.length, index: cur };
    },
    findStep(d) {
      if (!hits.length) return { count: 0, index: -1 };
      const prev = hits[cur];
      cur = (cur + d + hits.length) % hits.length;
      markHits(prev.page);
      markHits(hits[cur].page);
      const el = pages[hits[cur].page].textDiv && pages[hits[cur].page].textDiv.querySelector('.zdv-cur');
      if (el) scrollWithin(ctx.scroller, el, 'center'); else goto(hits[cur].page + 1);
      return { count: hits.length, index: cur };
    },
    async printDoc() {
      let html = '';
      const max = Math.min(n, 300);
      for (let i = 0; i < max; i++) {
        const pg = i === 0 ? first : await pdf.getPage(i + 1);
        const vp = pg.getViewport({ scale: 1.5 });
        const c = document.createElement('canvas');
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        await pg.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp }).promise;
        html += `<img class="zdv-print-page" src="${c.toDataURL('image/jpeg', 0.92)}" alt="Page ${i + 1}">`;
      }
      return { html, css: '.zdv-print-page{width:100%;page-break-after:always;display:block}' };
    },
    destroy() {
      io.disconnect();
      ctx.scroller.removeEventListener('scroll', onScroll);
      try { pdf.destroy(); } catch { /* ignore */ }
    },
  };
}
