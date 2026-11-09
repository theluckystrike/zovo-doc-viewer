// Find in rendered HTML (DOCX, ODT, PPTX): wraps matches in <mark>, steps through them.
import { scrollWithin } from './scroll.js';
export const DOMFIND_CSS = `mark.zdv-hit{background:var(--zdv-hit);color:inherit;padding:0}mark.zdv-hit.zdv-cur{background:var(--zdv-hit-cur);outline:2px solid var(--zdv-accent)}`;

export function createDomFind(root, scroller) {
  let marks = [];
  let cur = -1;
  function clear() {
    for (const m of marks) {
      const p = m.parentNode;
      if (!p) continue;
      p.replaceChild(document.createTextNode(m.textContent), m);
      p.normalize();
    }
    marks = [];
    cur = -1;
  }
  function find(q) {
    clear();
    const needle = String(q || '').toLowerCase();
    if (!needle) return { count: 0, index: -1 };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentNode && /^(STYLE|SCRIPT)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.toLowerCase().includes(needle)) nodes.push(n);
    for (const node of nodes) {
      let text = node.nodeValue;
      let lower = text.toLowerCase();
      let at = lower.indexOf(needle);
      let cur0 = node;
      while (at >= 0 && marks.length < 20000) {
        const hit = cur0.splitText(at);
        const rest = hit.splitText(needle.length);
        const m = document.createElement('mark');
        m.className = 'zdv-hit';
        hit.parentNode.replaceChild(m, hit);
        m.appendChild(hit);
        marks.push(m);
        cur0 = rest;
        text = rest.nodeValue;
        lower = text.toLowerCase();
        at = lower.indexOf(needle);
      }
    }
    if (marks.length) step(0, true);
    return { count: marks.length, index: cur };
  }
  function step(dir, absolute) {
    if (!marks.length) return { count: 0, index: -1 };
    if (cur >= 0) marks[cur].classList.remove('zdv-cur');
    cur = absolute ? dir : (cur + dir + marks.length) % marks.length;
    const m = marks[cur];
    m.classList.add('zdv-cur');
    scrollWithin(scroller, m, 'center');
    return { count: marks.length, index: cur };
  }
  return { find, findStep: (d) => step(d, false), clear };
}

// Make links in rendered documents safe: only http, https, mailto and in-document anchors survive.
export function safeLinks(root) {
  for (const a of root.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href') || '';
    if (h.startsWith('#')) continue;
    if (/^(https?:|mailto:)/i.test(h.trim())) { a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; }
    else a.removeAttribute('href');
  }
}
