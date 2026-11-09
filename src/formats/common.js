// Shared by the format modules (bundled into a shared chunk, never into the core).
import { checkZip } from '../core/zip.js';
import { realZipCheck } from '../core/inflate.js';
import { createDomFind, DOMFIND_CSS } from '../ui/domfind.js';
import { scrollWithin } from '../ui/scroll.js';

export async function guardZip(ctx) {
  const declared = checkZip(ctx.bytes, ctx.limits);
  if (!declared.ok) throw Object.assign(new Error(declared.message), { code: declared.code });
  const real = await realZipCheck(ctx.bytes, declared.entries, ctx.limits);
  if (!real.ok) throw Object.assign(new Error(real.message), { code: real.code });
  return declared.entries;
}

// Controller for formats drawn as HTML pages (DOCX, ODT, PPTX): page tracking, find, CSS zoom, print.
export function pagedController(ctx, content, pages, label, cssText = '') {
  ctx.addStyle('find', DOMFIND_CSS);
  const df = createDomFind(content, ctx.scroller);
  let page = 1;
  ctx.setPages(pages.length, label);
  let io = null;
  if (pages.length > 1 && typeof IntersectionObserver !== 'undefined') {
    const ratios = new Map();
    io = new IntersectionObserver((list) => {
      for (const e of list) ratios.set(e.target, e.intersectionRatio);
      let best = page, bestR = 0;
      pages.forEach((p, i) => { const r = ratios.get(p) || 0; if (r > bestR) { bestR = r; best = i + 1; } });
      if (bestR > 0 && best !== page) { page = best; ctx.setPage(page); }
    }, { root: ctx.scroller, threshold: [0, 0.25, 0.5, 0.75, 1] });
    pages.forEach((p) => io.observe(p));
  }
  return {
    goto(i) {
      const p = pages[i - 1];
      if (!p) return;
      page = i;
      scrollWithin(ctx.scroller, p, 'start');
      ctx.setPage(i);
    },
    zoom(z) { content.style.zoom = String(z); },
    find: (q) => df.find(q),
    findStep: (d) => df.findStep(d),
    printDoc() {
      df.clear();
      return { html: content.outerHTML, css: cssText };
    },
    destroy() { if (io) io.disconnect(); df.clear(); },
  };
}
