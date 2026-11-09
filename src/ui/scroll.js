// Scroll an element into view inside the viewer only. Element.scrollIntoView() would also scroll the host page.
export function scrollWithin(scroller, el, block = 'start') {
  if (!scroller || !el) return;
  const r = el.getBoundingClientRect();
  const s = scroller.getBoundingClientRect();
  if (block === 'center') scroller.scrollTop += r.top - s.top - (s.height - r.height) / 2;
  else if (block === 'nearest') {
    if (r.top < s.top) scroller.scrollTop += r.top - s.top - 8;
    else if (r.bottom > s.bottom) scroller.scrollTop += r.bottom - s.bottom + 8;
  } else scroller.scrollTop += r.top - s.top - 8;
  if (r.left < s.left || r.right > s.right) scroller.scrollLeft += r.left - s.left - Math.max(8, (s.width - r.width) / 2);
}
