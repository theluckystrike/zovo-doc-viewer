import { readFileSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const fixture = (n) => new Uint8Array(readFileSync(join(FIX, n)));

// Minimal ZIP writer for tests. entries: [{ name, data (Buffer), method: 0|8, declaredSize? }]
export function makeZip(entries, { zip64Count } = {}) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const raw = e.data || Buffer.alloc(0);
    const method = e.method ?? 8;
    const comp = method === 8 ? deflateRawSync(raw) : raw;
    const usize = e.declaredSize ?? raw.length;
    const crc = crc32 ? crc32(raw) : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(usize >>> 0, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc >>> 0, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(Math.min(usize, 0xffffffff) >>> 0, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  const count = zip64Count ?? entries.length;
  eocd.writeUInt16LE(Math.min(count, 0xffff), 8); eocd.writeUInt16LE(Math.min(count, 0xffff), 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
}
