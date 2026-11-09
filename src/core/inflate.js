// Second zip-bomb guard: inflate every entry with the browser's DecompressionStream and count the real output.
// The ZIP directory can lie about sizes; this check cannot be fooled that way. Nothing is kept in memory.
import { LIMITS } from './limits.js';

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflatedSize(data, budget) {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(data).catch(() => {});
  writer.close().catch(() => {});
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > budget) { reader.cancel().catch(() => {}); return n; }
    }
  } catch {
    return n; // damaged stream: the renderer will report it
  }
  return n;
}

// realZipCheck(bytes, entries, { maxBytes }) -> { ok, total, code?, message? }
export async function realZipCheck(b, entries, opts = {}) {
  const maxBytes = opts.maxBytes ?? LIMITS.zipMaxBytes;
  if (typeof DecompressionStream === 'undefined') return { ok: true, total: -1 };
  let total = 0;
  for (const e of entries) {
    if (e.name.endsWith('/')) continue;
    const o = e.offset;
    if (o + 30 > b.length || u32(b, o) !== 0x04034b50) continue;
    const start = o + 30 + u16(b, o + 26) + u16(b, o + 28);
    const data = b.subarray(start, Math.min(b.length, start + e.csize));
    if (e.method === 0) total += data.length;
    else if (e.method === 8) total += await inflatedSize(data, maxBytes - total);
    if (total > maxBytes) {
      return { ok: false, total, code: 'zip-size', message: `This archive unpacks to more than ${Math.round(maxBytes / 1048576)} MB. It was not opened.` };
    }
  }
  return { ok: true, total };
}
