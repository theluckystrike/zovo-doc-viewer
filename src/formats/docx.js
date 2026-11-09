// DOCX: drawn as pages with docx-preview (Apache-2.0).
import { renderAsync } from 'docx-preview';
import { guardZip, pagedController } from './common.js';
import { safeLinks } from '../ui/domfind.js';

export async function render(ctx) {
  await guardZip(ctx);
  ctx.mode('doc');
  const style = document.createElement('div');
  style.className = 'zdv-docx-style';
  const wrap = document.createElement('div');
  wrap.className = 'zdv-docx';
  ctx.body.append(style, wrap);
  await renderAsync(new Blob([ctx.bytes]), wrap, style, {
    className: 'docx',
    inWrapper: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: true,
    useBase64URL: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    renderComments: false,
    experimental: false,
  });
  safeLinks(wrap);
  for (const s of wrap.querySelectorAll('script,iframe,object,embed')) s.remove();
  const pages = [...wrap.querySelectorAll('section.docx')];
  const css = [...style.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  return pagedController(ctx, wrap, pages.length ? pages : [wrap], 'Page', css);
}
