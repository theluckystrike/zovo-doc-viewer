// Grid-based formats share this: one grid at a time, tabs for sheets.
import { createGrid, GRID_CSS } from '../ui/grid.js';

export function gridController(ctx, tabs, label) {
  let grid = null;
  let active = -1;
  let zoom = 1;
  let query = '';
  function show(i) {
    if (i === active) return;
    if (grid) grid.destroy();
    active = i;
    const t = tabs[i];
    grid = createGrid(ctx.body, t.model(), { label: t.name, onStatus: ctx.status });
    if (zoom !== 1) grid.zoom(zoom);
    if (t.note) ctx.status(t.note);
    ctx.setPage(i + 1);
    ctx.setTabs(tabs.map((x) => x.name), i);
    if (query) ctx.refind();
  }
  ctx.mode('grid');
  ctx.addStyle('grid', GRID_CSS);
  ctx.setPages(tabs.length, label);
  ctx.setTabs(tabs.map((x) => x.name), 0, (i) => show(i));
  show(0);
  return {
    goto(i) { if (i >= 1 && i <= tabs.length) show(i - 1); },
    zoom(z) { zoom = z; grid.zoom(z); },
    find(q) { query = q; return grid.find(q); },
    findStep: (d) => grid.findStep(d),
    printDoc() { return { html: `<h2>${tabs[active].name.replace(/[<&]/g, '')}</h2>` + grid.printHTML(), css: '' }; },
    focus() { grid.el.focus(); },
    destroy() { if (grid) grid.destroy(); },
  };
}
