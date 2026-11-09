// Commercial licence key check. Offline: no request is ever made to check a key.
// Key format (same as every Zovo product): ZOVO1.<base64url(JSON payload)>.<base64url(Ed25519 signature)>
// The signature covers the ASCII bytes "ZOVO1." + <base64url payload>.
// Payload: { v: 1, sku, eh, sid, iat: "YYYY-MM-DD", exp?: "YYYY-MM-DD", lm: true|false, q? }
// Only the two Doc Viewer skus are accepted. Bundle skus (zovo-pro, zovo-pro-team) are refused on purpose:
// they cost less than this licence.

export const LIVE_PUBLIC_KEY = 'MCowBQYDK2VwAyEAtXEc+9zkJ34oa1Id1oSrAifTSxqhvKtMKZOo5ieX90k=';
export const TEST_PUBLIC_KEY = 'MCowBQYDK2VwAyEAJQgWdto978RwNQLZDFpjEJVajkFN5v0ZxrYNPgnMtzw=';
export const SKUS = Object.freeze(['zovo-doc-viewer', 'zovo-doc-viewer-unlimited']);
const PREFIX = 'ZOVO1.';
const DAY_MS = 86400000;

function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlToBytes(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  try { return b64ToBytes(t); } catch { return null; }
}

// The raw 32-byte key is the tail of the 44-byte SPKI DER.
export function rawFromSpki(spkiB64) {
  const der = b64ToBytes(spkiB64);
  return der.subarray(der.length - 32);
}

export function cleanKey(text) {
  return String(text == null ? '' : text).replace(/[\s"'`<>]/g, '');
}

const dateOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

// Default verifier: WebCrypto Ed25519 where the browser has it, else @noble/ed25519 loaded on demand.
let fallbackLoader = null;
export function setFallbackLoader(fn) { fallbackLoader = fn; }

export async function ed25519Verify(sig, msg, raw) {
  // crypto.subtle is undefined on plain-HTTP pages (not a secure context); the fallback covers those.
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (subtle) {
    try {
      const key = await subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
      return await subtle.verify({ name: 'Ed25519' }, key, sig, msg);
    } catch (e) {
      // NotSupportedError on older browsers: use the fallback below.
    }
  }
  if (!fallbackLoader) return false;
  const mod = await fallbackLoader();
  try { return await mod.verifyAsync(sig, msg, raw); } catch { return false; }
}

// verifyKey(text, opts) -> { ok, reason?, license? }
// reason: empty | format | signature | version | test | expired | sku
// opts: now (ms), allowTest (accept keys signed by the test pair with lm:false), verify (sig, msg, raw) => Promise<bool>,
//       publicKey / testPublicKey (SPKI base64) for tests.
export async function verifyKey(text, opts = {}) {
  const key = cleanKey(text);
  if (!key) return { ok: false, reason: 'empty' };
  if (!key.startsWith(PREFIX)) return { ok: false, reason: 'format' };
  const parts = key.slice(PREFIX.length).split('.');
  if (parts.length !== 2) return { ok: false, reason: 'format' };
  const [payloadB64, sigB64] = parts;
  const sig = b64urlToBytes(sigB64);
  const payloadBytes = b64urlToBytes(payloadB64);
  if (!sig || sig.length !== 64 || !payloadBytes) return { ok: false, reason: 'format' };
  let p;
  try { p = JSON.parse(new TextDecoder().decode(payloadBytes)); } catch { return { ok: false, reason: 'format' }; }
  const live = !!(p && p.lm === true);
  if (!live && !opts.allowTest) return { ok: false, reason: 'test' };
  const spki = live ? (opts.publicKey || LIVE_PUBLIC_KEY) : (opts.testPublicKey || TEST_PUBLIC_KEY);
  const msg = new TextEncoder().encode(PREFIX + payloadB64);
  const verify = opts.verify || ed25519Verify;
  let good = false;
  try { good = await verify(sig, msg, rawFromSpki(spki)); } catch { good = false; }
  if (!good) return { ok: false, reason: 'signature' };
  if (!p || p.v !== 1 || typeof p.sku !== 'string' || !p.sku || !dateOk(p.iat) || (p.exp !== undefined && !dateOk(p.exp))) {
    return { ok: false, reason: 'version' };
  }
  const license = { sku: p.sku, issued: p.iat, expires: p.exp || null, live, seats: Number.isInteger(p.q) && p.q > 1 ? p.q : 1 };
  const now = opts.now !== undefined ? opts.now : Date.now();
  if (license.expires && now >= Date.parse(license.expires + 'T00:00:00Z') + DAY_MS) return { ok: false, reason: 'expired', license };
  if (!SKUS.includes(license.sku)) return { ok: false, reason: 'sku', license };
  return { ok: true, license };
}

// Pages that never show the corner link: local development and files opened from disk.
export function isLocalHost(loc) {
  if (!loc) return true;
  const protocol = String(loc.protocol || '');
  if (protocol === 'file:' || protocol === 'about:' || protocol === 'blob:' || protocol === 'data:') return true;
  const h = String(loc.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

// The whole free/paid difference: a small text link in the corner on public pages without a valid key.
export function showCornerLink(loc, licensed) {
  return !licensed && !isLocalHost(loc);
}
