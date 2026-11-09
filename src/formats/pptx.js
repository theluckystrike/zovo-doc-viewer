// PPTX (beta): slides drawn by pptx-preview (ISC, published build; see PPTX.md).
import JSZip from 'jszip';
import { init } from 'pptx-preview';
import { guardZip, pagedController } from './common.js';
import { safeLinks } from '../ui/domfind.js';

const EMU_PX = 9525;

async function slideSize(bytes) {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const f = zip.file('ppt/presentation.xml');
    if (!f) return null;
    const xml = await f.async('string');
    const m = /<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(xml);
    return m ? { w: Number(m[1]) / EMU_PX, h: Number(m[2]) / EMU_PX } : null;
  } catch { return null; }
}

export async function render(ctx) {
  await guardZip(ctx);
  ctx.mode('doc');
  ctx.beta('PPTX support is in beta.');
  const size = (await slideSize(ctx.bytes)) || { w: 960, h: 540 };
  const width = 960;
  const height = Math.round((width * size.h) / size.w) || 540;
  const wrap = document.createElement('div');
  wrap.className = 'zdv-pptx';
  const box = document.createElement('div');
  wrap.appendChild(box);
  ctx.body.appendChild(wrap);
  const buf = ctx.bytes.buffer.slice(ctx.bytes.byteOffset, ctx.bytes.byteOffset + ctx.bytes.byteLength);
  let previewer;
  try {
    previewer = init(box, { width, height, mode: 'list' });
    await previewer.preview(buf);
  } catch (e) {
    throw Object.assign(new Error('PPTX support is in beta and could not draw this deck (' + ((e && e.message) || e) + ').'), { code: 'pptx-beta' });
  }
  safeLinks(wrap);
  let slides = [...box.querySelectorAll('[class*="pptx-preview-slide-wrapper-"]')];
  if (!slides.length) slides = [...box.querySelectorAll('.pptx-preview-slide-wrapper')];
  if (!slides.length) throw Object.assign(new Error('PPTX support is in beta and found no slides it can draw in this deck.'), { code: 'pptx-beta' });
  const ctl = pagedController(ctx, wrap, slides, 'Slide');
  ctl.destroy = ((d) => () => { d(); try { previewer.destroy(); } catch { /* already gone */ } })(ctl.destroy);
  return ctl;
}
