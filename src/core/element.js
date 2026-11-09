// <zovo-doc-viewer>: the custom element. Small on purpose: every format is a separate file loaded on demand.
import { detect, FORMATS, MODULE, formatFromName } from './detect.js';
import { LIMITS } from './limits.js';
import { verifyKey, showCornerLink, setFallbackLoader } from './license.js';
import { CORE_CSS, PRINT_CSS } from './styles.js';

export const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev';
const HOME = 'https://theluckystrike.github.io/zovo-doc-viewer/';
const CDN_BASE = `https://cdn.jsdelivr.net/gh/theluckystrike/zovo-doc-viewer@v${VERSION}/dist/`;

// Where the format files live: next to this script, unless setBaseUrl() or the base-url attribute says otherwise.
const SCRIPT_BASE = (() => {
  try { const s = document.currentScript && document.currentScript.src; if (s) return new URL('./', s).href; } catch { /* not a classic script */ }
  try { return new URL('./', import.meta.url).href; } catch { /* bundled */ }
  return CDN_BASE;
})();
let globalBase = null;
export function setBaseUrl(url) { globalBase = url ? new URL(url.endsWith('/') ? url : url + '/', document.baseURI).href : null; }

const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const I = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const ICON = {
  prev: I('M15 6l-6 6 6 6'), next: I('M9 6l6 6-6 6'),
  out: I('M5 12h14'), in: I('M12 5v14M5 12h14'),
  up: I('M6 15l6-6 6 6'), down: I('M6 9l6 6 6-6'),
  print: I('M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z'),
  dl: I('M12 4v11M7 10l5 5 5-5M5 20h14'),
  full: I('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'),
};

const TEMPLATE = `<div class="zdv" part="viewer">
<div class="zdv-bar" role="toolbar" aria-label="Document tools" part="toolbar">
 <span class="zdv-name" part="name"></span><span class="zdv-beta" hidden>beta</span>
 <span class="zdv-grp zdv-nav" hidden><button data-a="prev" aria-label="Previous page" title="Previous">${ICON.prev}</button><input class="zdv-page" type="number" min="1" aria-label="Page number"><span class="zdv-of"></span><button data-a="next" aria-label="Next page" title="Next">${ICON.next}</button></span>
 <span class="zdv-grp"><button data-a="zout" aria-label="Zoom out" title="Zoom out">${ICON.out}</button><button data-a="zreset" class="zdv-zoom" aria-label="Reset zoom" title="Reset zoom">100%</button><button data-a="zin" aria-label="Zoom in" title="Zoom in">${ICON.in}</button></span>
 <span class="zdv-grp"><input class="zdv-find" type="search" placeholder="Find" aria-label="Find in document"><button data-a="fprev" aria-label="Previous match" title="Previous match (Shift+Enter)">${ICON.up}</button><button data-a="fnext" aria-label="Next match" title="Next match (Enter)">${ICON.down}</button><span class="zdv-count" aria-live="polite"></span></span>
 <span class="zdv-spacer"></span>
 <span class="zdv-grp"><button data-a="print" aria-label="Print" title="Print">${ICON.print}</button><button data-a="download" aria-label="Download" title="Download">${ICON.dl}</button><button data-a="full" aria-label="Full screen" title="Full screen">${ICON.full}</button></span>
</div>
<div class="zdv-view" tabindex="0" role="document" aria-label="Document" part="view"><div class="zdv-body"></div><div class="zdv-msg" role="alert"></div></div>
<div class="zdv-tabs" role="tablist" aria-label="Sheets" hidden></div>
<div class="zdv-status" role="status" aria-live="polite" part="status"></div>
<a class="zdv-corner" hidden target="_blank" rel="noopener" href="${HOME}">Zovo Doc Viewer</a>
</div>`;

function fail(message, code) { return Object.assign(new Error(message), { code }); }

export class ZovoDocViewer extends HTMLElement {
  static get observedAttributes() { return ['src', 'theme', 'download', 'print', 'license-key', 'license-test', 'filename', 'format']; }

  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });
    this._root.innerHTML = `<style>${CORE_CSS}</style>${TEMPLATE}`;
    const $ = (s) => this._root.querySelector(s);
    this._el = {
      name: $('.zdv-name'), beta: $('.zdv-beta'), nav: $('.zdv-nav'), page: $('.zdv-page'), of: $('.zdv-of'),
      zoom: $('.zdv-zoom'), find: $('.zdv-find'), count: $('.zdv-count'), view: $('.zdv-view'), body: $('.zdv-body'),
      msg: $('.zdv-msg'), tabs: $('.zdv-tabs'), status: $('.zdv-status'), corner: $('.zdv-corner'),
      print: $('[data-a=print]'), download: $('[data-a=download]'),
    };
    this._styles = new Set();
    this._gen = 0;
    this._ctl = null;
    this._bytes = null;
    this._name = '';
    this._format = null;
    this._zoom = 1;
    this._pages = 0;
    this._pageNo = 1;
    this._licensed = false;
    this._findTimer = 0;
    this._wire();
    this._msg('No document loaded.');
  }

  connectedCallback() {
    this._applyToggles();
    this._checkLicense();
    if (this.getAttribute('src') && !this._bytes && !this._loading) this.load(this.getAttribute('src'));
  }

  disconnectedCallback() {
    if (this._ctl && this._ctl.destroy) { try { this._ctl.destroy(); } catch { /* ignore */ } }
    this._ctl = null;
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV) return;
    if (name === 'src' && this.isConnected && newV) this.load(newV);
    else if (name === 'license-key' || name === 'license-test') this._checkLicense();
    else if (name === 'download' || name === 'print') this._applyToggles();
  }

  // ---------- public API ----------
  get format() { return this._format; }
  get pageCount() { return this._pages; }
  get page() { return this._pageNo; }
  set page(i) { this.goToPage(i); }
  get zoom() { return this._zoom; }
  set zoom(z) { this._setZoom(z); }
  get licensed() { return this._licensed; }
  static get version() { return VERSION; }

  goToPage(i) { if (this._ctl && this._ctl.goto) this._ctl.goto(Math.max(1, Math.min(this._pages, Number(i) || 1))); }
  async find(q) { this._el.find.value = q || ''; return this._doFind(); }
  findNext() { return this._findStep(1); }
  findPrevious() { return this._findStep(-1); }
  print() { return this._print(); }
  download() { return this._download(); }

  // load(source, { name, format }) where source is a URL string, File, Blob, ArrayBuffer or typed array.
  async load(source, opts = {}) {
    const gen = ++this._gen;
    this._loading = true;
    this._reset();
    this._msg('Loading…');
    try {
      const max = this._maxBytes();
      let bytes, name = opts.name || this.getAttribute('filename') || '', mime = '';
      if (typeof source === 'string') {
        const url = new URL(source, document.baseURI);
        if (!name) name = decodeURIComponent(url.pathname.split('/').pop() || '');
        bytes = await this._fetch(url.href, max, gen);
      } else if (typeof Blob !== 'undefined' && source instanceof Blob) {
        if (source.size > max) throw fail(this._tooLarge(max), 'too-large');
        if (!name && source.name) name = source.name;
        mime = source.type || '';
        bytes = new Uint8Array(await source.arrayBuffer());
      } else if (source instanceof ArrayBuffer) bytes = new Uint8Array(source);
      else if (ArrayBuffer.isView(source)) bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
      else throw fail('load() needs a URL, File, Blob or ArrayBuffer.', 'input');
      if (gen !== this._gen) return null;
      if (bytes.length > max) throw fail(this._tooLarge(max), 'too-large');
      if (!bytes.length) throw fail('This file is empty.', 'empty');
      this._bytes = bytes;
      this._name = name;
      this._el.name.textContent = name;
      this._el.name.title = name;
      let format = opts.format || this.getAttribute('format') || '';
      if (format && !FORMATS.includes(format)) format = formatFromName('x.' + format) || '';
      if (!format) {
        const d = detect(bytes, name, mime);
        if (!d.format) throw fail(d.reason || 'This file type is not supported.', 'unsupported');
        format = d.format;
      }
      this._format = format;
      let mod;
      try { mod = await this._module(MODULE[format]); } catch { throw fail('The viewer code for this format could not be loaded.', 'module'); }
      if (gen !== this._gen) return null;
      this._el.msg.hidden = true;
      const ctl = await mod.render(this._ctx(format, gen));
      if (gen !== this._gen) { if (ctl && ctl.destroy) ctl.destroy(); return null; }
      this._ctl = ctl;
      if (this._zoom !== 1) this._applyZoom();
      const detail = { format, name, size: bytes.length, pages: this._pages };
      this._loading = false;
      this.dispatchEvent(new CustomEvent('load', { detail }));
      if (this._el.find.value) this._doFind();
      return detail;
    } catch (e) {
      if (gen !== this._gen) return null;
      this._loading = false;
      const message = (e && e.message) || String(e);
      const code = (e && e.code) || 'error';
      this._el.body.replaceChildren();
      this._msg(message, true);
      this._status('');
      this.dispatchEvent(new CustomEvent('error', { detail: { message, code } }));
      return null;
    }
  }

  // ---------- internals ----------
  _base() {
    const attr = this.getAttribute('base-url');
    if (attr) return new URL(attr.endsWith('/') ? attr : attr + '/', document.baseURI).href;
    return globalBase || SCRIPT_BASE;
  }
  _module(name) { return import(/* @vite-ignore */ /* webpackIgnore: true */ this._base() + 'formats/' + name + '.js'); }
  _maxBytes() {
    const mb = Number(this.getAttribute('max-size'));
    return mb > 0 ? mb * 1048576 : LIMITS.maxFileBytes;
  }
  _tooLarge(max) { return `This file is larger than ${Math.round(max / 1048576)} MB, the limit for this viewer.`; }

  async _fetch(url, max, gen) {
    const cred = this.getAttribute('crossorigin') === 'use-credentials' ? 'include' : 'same-origin';
    let res;
    try { res = await fetch(url, { credentials: cred }); } catch (e) { throw fail('The file could not be loaded. Check the address and the server CORS settings.', 'network'); }
    if (!res.ok) throw fail(`The file could not be loaded (HTTP ${res.status}).`, 'http');
    const len = Number(res.headers.get('content-length') || 0);
    if (len > max) throw fail(this._tooLarge(max), 'too-large');
    if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader();
    const parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (gen !== this._gen) { reader.cancel().catch(() => {}); return new Uint8Array(0); }
      n += value.byteLength;
      if (n > max) { reader.cancel().catch(() => {}); throw fail(this._tooLarge(max), 'too-large'); }
      parts.push(value);
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.byteLength; }
    return out;
  }

  _ctx(format, gen) {
    const live = () => gen === this._gen;
    return {
      bytes: this._bytes, name: this._name, format,
      body: this._el.body, scroller: this._el.view, base: this._base() + 'formats/',
      limits: LIMITS,
      mode: (m) => { this._el.view.classList.toggle('grid', m === 'grid'); },
      addStyle: (id, css) => {
        if (this._styles.has(id)) return;
        this._styles.add(id);
        const s = document.createElement('style');
        s.textContent = css;
        this._root.insertBefore(s, this._root.querySelector('.zdv'));
      },
      setPages: (n, label) => { if (!live()) return; this._pages = n; this._label = label || 'Page'; this._el.nav.hidden = !(n > 1) || label === 'Sheet' || label === 'View'; this._el.of.textContent = `/ ${n}`; this._el.page.max = String(n); this._showPage(1); },
      setPage: (i) => { if (live()) this._showPage(i, true); },
      setTabs: (names, active, onSelect) => { if (live()) this._tabs(names, active, onSelect); },
      status: (t) => { if (live()) this._status(t); },
      beta: (t) => { if (!live()) return; this._el.beta.hidden = false; this._el.beta.title = t; },
      refind: () => { if (live() && this._el.find.value) this._doFind(); },
    };
  }

  _reset() {
    if (this._ctl && this._ctl.destroy) { try { this._ctl.destroy(); } catch { /* ignore */ } }
    this._ctl = null;
    this._bytes = null;
    this._format = null;
    this._pages = 0;
    this._pageNo = 1;
    this._el.body.replaceChildren();
    this._el.body.style.zoom = '';
    this._el.view.classList.remove('grid');
    this._el.view.scrollTop = 0;
    this._el.nav.hidden = true;
    this._el.beta.hidden = true;
    this._el.tabs.hidden = true;
    this._el.tabs.replaceChildren();
    this._el.count.textContent = '';
    this._status('');
  }

  _msg(text, isError) {
    this._el.msg.textContent = text;
    this._el.msg.classList.toggle('err', !!isError);
    this._el.msg.hidden = !text;
  }
  _status(t) { this._el.status.textContent = t || ''; }

  _showPage(i, fire) {
    this._pageNo = i;
    if (this._root.activeElement !== this._el.page) this._el.page.value = String(i);
    if (fire) this.dispatchEvent(new CustomEvent('page', { detail: { page: i, pages: this._pages } }));
  }

  _tabs(names, active, onSelect) {
    if (onSelect) this._onTab = onSelect;
    const t = this._el.tabs;
    t.hidden = names.length < 2;
    t.replaceChildren(...names.map((n, i) => {
      const b = document.createElement('button');
      b.className = 'zdv-tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === active));
      b.tabIndex = i === active ? 0 : -1;
      b.textContent = n;
      b.addEventListener('click', () => this._onTab && this._onTab(i));
      return b;
    }));
  }

  _applyToggles() {
    this._el.download.hidden = this.getAttribute('download') === 'false';
    this._el.print.hidden = this.getAttribute('print') === 'false';
  }

  async _checkLicense() {
    const key = this.getAttribute('license-key');
    let ok = false;
    if (key) {
      setFallbackLoader(() => import(/* @vite-ignore */ /* webpackIgnore: true */ this._base() + 'formats/ed25519.js'));
      const r = await verifyKey(key, { allowTest: this.hasAttribute('license-test') });
      ok = r.ok;
      if (key !== this.getAttribute('license-key')) return;
    }
    this._licensed = ok;
    this._el.corner.hidden = !showCornerLink(location, ok);
  }

  _setZoom(z) {
    const v = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], Number(z) || 1));
    this._zoom = v;
    this._applyZoom();
  }
  _applyZoom() {
    this._el.zoom.textContent = Math.round(this._zoom * 100) + '%';
    if (!this._ctl) return;
    if (this._ctl.zoom) this._ctl.zoom(this._zoom);
    else this._el.body.style.zoom = String(this._zoom);
  }
  _zoomStep(d) {
    const i = ZOOMS.findIndex((z) => z >= this._zoom - 1e-6);
    const at = i < 0 ? ZOOMS.length - 1 : i;
    const next = d > 0 ? ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS[at] > this._zoom + 1e-6 ? at : at + 1)] : ZOOMS[Math.max(0, at - 1)];
    this._setZoom(next);
  }

  async _doFind() {
    const q = this._el.find.value;
    if (!this._ctl || !this._ctl.find) return { count: 0, index: -1 };
    const r = await this._ctl.find(q);
    this._showCount(q, r);
    return r;
  }
  async _findStep(d) {
    if (!this._ctl || !this._ctl.findStep) return { count: 0, index: -1 };
    const r = await this._ctl.findStep(d);
    this._showCount(this._el.find.value, r);
    return r;
  }
  _showCount(q, r) {
    this._el.count.textContent = !q ? '' : r.count ? `${r.index + 1} of ${r.count.toLocaleString()}${r.capped ? '+' : ''}` : 'No matches';
  }

  async _print() {
    if (!this._ctl || !this._ctl.printDoc || this.getAttribute('print') === 'false') return;
    this._status('Preparing to print…');
    const { html, css } = await this._ctl.printDoc();
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-same-origin allow-modals');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden';
    const title = this._name.replace(/[<&>]/g, '');
    f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_CSS}\n${css || ''}</style></head><body>${html}</body></html>`;
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; setTimeout(res, 3000); });
    await Promise.all([...f.contentDocument.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
    this._status('');
    try { f.contentWindow.focus(); f.contentWindow.print(); } finally { setTimeout(() => f.remove(), 1000); }
  }

  _download() {
    if (!this._bytes || this.getAttribute('download') === 'false') return;
    const url = URL.createObjectURL(new Blob([this._bytes]));
    const a = document.createElement('a');
    a.href = url;
    a.download = this._name || 'document';
    a.rel = 'noopener';
    this._root.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  _wire() {
    const e = this._el;
    this._root.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'prev') this.goToPage(this._pageNo - 1);
      else if (a === 'next') this.goToPage(this._pageNo + 1);
      else if (a === 'zin') this._zoomStep(1);
      else if (a === 'zout') this._zoomStep(-1);
      else if (a === 'zreset') this._setZoom(1);
      else if (a === 'fnext') this._findStep(1);
      else if (a === 'fprev') this._findStep(-1);
      else if (a === 'print') this._print();
      else if (a === 'download') this._download();
      else if (a === 'full') {
        if (document.fullscreenElement === this) document.exitFullscreen();
        else if (this.requestFullscreen) this.requestFullscreen().catch(() => {});
      }
    });
    e.page.addEventListener('change', () => this.goToPage(e.page.value));
    e.find.addEventListener('input', () => { clearTimeout(this._findTimer); this._findTimer = setTimeout(() => this._doFind(), 250); });
    e.find.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(this._findTimer); this._findStep(ev.shiftKey ? -1 : 1); }
      else if (ev.key === 'Escape') { e.find.value = ''; this._doFind(); e.view.focus(); }
    });
    e.tabs.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const tabs = [...e.tabs.children];
      const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      const j = (i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      if (this._onTab) { this._onTab(j); const t = e.tabs.children[j]; if (t) t.focus(); }
    });
    this.addEventListener('keydown', (ev) => {
      const mod = ev.ctrlKey || ev.metaKey;
      const inInput = ev.composedPath()[0] instanceof HTMLInputElement;
      if (mod && ev.key.toLowerCase() === 'f') { ev.preventDefault(); e.find.focus(); e.find.select(); return; }
      if (mod && ev.key.toLowerCase() === 'p' && this.getAttribute('print') !== 'false') { ev.preventDefault(); this._print(); return; }
      if (inInput || mod || ev.altKey) return;
      if (ev.key === '+' || ev.key === '=') { this._zoomStep(1); ev.preventDefault(); }
      else if (ev.key === '-') { this._zoomStep(-1); ev.preventDefault(); }
      else if (ev.key === '0') { this._setZoom(1); ev.preventDefault(); }
      else if (ev.key === 'n' || ev.key === 'j') this.goToPage(this._pageNo + 1);
      else if (ev.key === 'p' || ev.key === 'k') this.goToPage(this._pageNo - 1);
    });
  }
}

export function define(tag = 'zovo-doc-viewer') {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) customElements.define(tag, tag === 'zovo-doc-viewer' ? ZovoDocViewer : class extends ZovoDocViewer {});
}
