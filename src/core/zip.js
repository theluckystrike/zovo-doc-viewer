// ZIP central directory reader and zip-bomb guard. Pure functions on a Uint8Array. No inflate here.
import { LIMITS } from './limits.js';

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 4294967296;

export function isZip(b) {
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6);
}

function findEocd(b) {
  const stop = Math.max(0, b.length - 65557);
  for (let i = b.length - 22; i >= stop; i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6) return i;
  }
  return -1;
}

// Returns { entries: [{ name, method, csize, usize, offset }], count, zip64 } or throws Error with .code.
// opts.maxEntries stops reading early, so a directory that claims a million entries costs nothing.
export function listZip(b, opts = {}) {
  const maxEntries = opts.maxEntries ?? LIMITS.zipMaxEntries;
  const fail = (code, msg) => { const e = new Error(msg); e.code = code; throw e; };
  const eocd = findEocd(b);
  if (eocd < 0) fail('zip-corrupt', 'This file is not a complete ZIP archive.');
  let count = u16(b, eocd + 10);
  let cdSize = u32(b, eocd + 12);
  let cdOff = u32(b, eocd + 16);
  let zip64 = false;
  const loc = eocd - 20;
  if (loc >= 0 && u32(b, loc) === 0x07064b50) {
    const z = u64(b, loc + 8);
    if (z + 56 <= b.length && u32(b, z) === 0x06064b50) {
      zip64 = true;
      count = u64(b, z + 32);
      cdSize = u64(b, z + 40);
      cdOff = u64(b, z + 48);
    }
  }
  if (count > maxEntries) fail('zip-entries', `This archive has ${count} entries. The limit is ${maxEntries}.`);
  if (cdOff + cdSize > b.length) fail('zip-corrupt', 'The ZIP directory points past the end of the file.');
  const entries = [];
  let p = cdOff;
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) fail('zip-corrupt', 'The ZIP directory is damaged.');
    const method = u16(b, p + 10);
    let csize = u32(b, p + 20);
    let usize = u32(b, p + 24);
    const nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32);
    let offset = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    if (usize === 0xffffffff || csize === 0xffffffff || offset === 0xffffffff) {
      let x = p + 46 + nlen;
      const xend = x + xlen;
      while (x + 4 <= xend) {
        const id = u16(b, x), sz = u16(b, x + 2);
        if (id === 1) {
          let q = x + 4;
          if (usize === 0xffffffff) { usize = u64(b, q); q += 8; }
          if (csize === 0xffffffff) { csize = u64(b, q); q += 8; }
          if (offset === 0xffffffff) { offset = u64(b, q); q += 8; }
          break;
        }
        x += 4 + sz;
      }
    }
    entries.push({ name, method, csize, usize, offset });
    p += 46 + nlen + xlen + clen;
  }
  return { entries, count, zip64 };
}

// Zip-bomb guard on the declared sizes. Returns { ok, code?, message?, entries, total }.
export function checkZip(b, opts = {}) {
  const maxEntries = opts.maxEntries ?? LIMITS.zipMaxEntries;
  const maxBytes = opts.maxBytes ?? LIMITS.zipMaxBytes;
  let list;
  try {
    list = listZip(b, { maxEntries });
  } catch (e) {
    return { ok: false, code: e.code || 'zip-corrupt', message: e.message, entries: [], total: 0 };
  }
  let total = 0;
  for (const e of list.entries) {
    total += e.usize;
    if (total > maxBytes) {
      return { ok: false, code: 'zip-size', message: `This archive unpacks to more than ${Math.round(maxBytes / 1048576)} MB. It was not opened.`, entries: list.entries, total };
    }
  }
  return { ok: true, entries: list.entries, total };
}

export function zipNames(b) {
  try { return listZip(b, { maxEntries: LIMITS.zipMaxEntries }).entries.map((e) => e.name); } catch { return []; }
}

// Read one STORED entry (method 0) without inflating, e.g. the ODF "mimetype" file. Returns string or ''.
export function readStored(b, entry) {
  if (!entry || entry.method !== 0) return '';
  const o = entry.offset;
  if (o + 30 > b.length || u32(b, o) !== 0x04034b50) return '';
  const start = o + 30 + u16(b, o + 26) + u16(b, o + 28);
  return new TextDecoder().decode(b.subarray(start, Math.min(b.length, start + Math.min(entry.csize, 200))));
}
