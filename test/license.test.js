import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { verifyAsync } from '../src/formats/ed25519.js';
import { verifyKey, setFallbackLoader, isLocalHost, showCornerLink, SKUS, LIVE_PUBLIC_KEY, TEST_PUBLIC_KEY, cleanKey } from '../src/core/license.js';

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function pair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { spki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), privateKey };
}
// Same layout as factory/sprint/pay/issue_key.mjs.
function makeKey(privateKey, payload) {
  const p = b64url(JSON.stringify({ v: 1, eh: '', sid: 'manual-test', iat: '2026-11-09', lm: true, ...payload }));
  return `ZOVO1.${p}.${b64url(sign(null, Buffer.from('ZOVO1.' + p), privateKey))}`;
}
const live = pair();
const testPair = pair();
const opts = { publicKey: live.spki, testPublicKey: testPair.spki };

test('only the two Doc Viewer skus are accepted', () => {
  assert.deepEqual([...SKUS], ['zovo-doc-viewer', 'zovo-doc-viewer-unlimited']);
});

test('valid keys for both skus', async () => {
  for (const sku of SKUS) {
    const r = await verifyKey(makeKey(live.privateKey, { sku }), opts);
    assert.equal(r.ok, true, sku);
    assert.equal(r.license.sku, sku);
    assert.equal(r.license.expires, null);
  }
});

test('a key pasted with spaces, quotes and line breaks still works', async () => {
  const k = makeKey(live.privateKey, { sku: 'zovo-doc-viewer' });
  const messy = ` "${k.slice(0, 40)}\n  ${k.slice(40)}" `;
  assert.equal(cleanKey(messy), k);
  assert.equal((await verifyKey(messy, opts)).ok, true);
});

test('tampered payload and tampered signature are refused', async () => {
  const k = makeKey(live.privateKey, { sku: 'zovo-doc-viewer' });
  const [, p, s] = k.split('.');
  const forged = b64url(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), sku: 'zovo-doc-viewer-unlimited' }));
  assert.equal((await verifyKey(`ZOVO1.${forged}.${s}`, opts)).reason, 'signature');
  const badSig = s.slice(0, 10) + (s[10] === 'A' ? 'B' : 'A') + s.slice(11);
  assert.equal((await verifyKey(`ZOVO1.${p}.${badSig}`, opts)).reason, 'signature');
  const other = pair();
  assert.equal((await verifyKey(makeKey(other.privateKey, { sku: 'zovo-doc-viewer' }), opts)).reason, 'signature');
});

test('wrong sku: bundle and other product keys do not unlock the viewer', async () => {
  for (const sku of ['zovo-pro', 'zovo-pro-team', 'hex-pro', 'docx-pro']) {
    const r = await verifyKey(makeKey(live.privateKey, { sku }), opts);
    assert.equal(r.ok, false, sku);
    assert.equal(r.reason, 'sku', sku);
  }
});

test('expired yearly key is refused, a current one is accepted', async () => {
  const k = makeKey(live.privateKey, { sku: 'zovo-doc-viewer', exp: '2026-01-31' });
  const before = await verifyKey(k, { ...opts, now: Date.parse('2026-01-31T23:00:00Z') });
  assert.equal(before.ok, true);
  assert.equal(before.license.expires, '2026-01-31');
  const after = await verifyKey(k, { ...opts, now: Date.parse('2026-02-01T00:00:01Z') });
  assert.equal(after.ok, false);
  assert.equal(after.reason, 'expired');
});

test('test-mode keys: refused by default, accepted with allowTest against the test public key only', async () => {
  const k = makeKey(testPair.privateKey, { sku: 'zovo-doc-viewer', lm: false });
  assert.equal((await verifyKey(k, opts)).reason, 'test');
  assert.equal((await verifyKey(k, { ...opts, allowTest: true })).ok, true);
  const liveSignedTest = makeKey(live.privateKey, { sku: 'zovo-doc-viewer', lm: false });
  assert.equal((await verifyKey(liveSignedTest, { ...opts, allowTest: true })).reason, 'signature');
});

test('format errors', async () => {
  assert.equal((await verifyKey('', opts)).reason, 'empty');
  assert.equal((await verifyKey('hello', opts)).reason, 'format');
  assert.equal((await verifyKey('ZOVO1.abc', opts)).reason, 'format');
  assert.equal((await verifyKey('ZOVO1.a$b.c', opts)).reason, 'format');
  assert.equal((await verifyKey('ZOVO1.' + b64url('{}') + '.' + b64url(Buffer.alloc(64)), opts)).reason, 'test');
});

test('noble fallback (pure JS SHA-512, for pages without crypto.subtle) gives the same answers as WebCrypto', async () => {
  const verify = (sig, msg, raw) => verifyAsync(sig, msg, raw);
  const good = makeKey(live.privateKey, { sku: 'zovo-doc-viewer' });
  assert.equal((await verifyKey(good, { ...opts, verify })).ok, true);
  const [, p, s] = good.split('.');
  assert.equal((await verifyKey(`ZOVO1.${p}.${s.slice(0, -2)}AA`, { ...opts, verify })).ok, false);
});

test('embedded public keys match factory/sprint/pay', () => {
  const dir = homedir() + '/plugin-market-intel-work/factory/sprint/pay/';
  if (!existsSync(dir + 'public-key.txt')) return;
  assert.equal(readFileSync(dir + 'public-key.txt', 'utf8').trim(), LIVE_PUBLIC_KEY);
  assert.equal(readFileSync(dir + 'public-key-test.txt', 'utf8').trim(), TEST_PUBLIC_KEY);
});

test('corner link: localhost and files are exempt, public hosts are not', () => {
  const at = (u) => new URL(u);
  for (const u of ['http://localhost:8080/x', 'http://127.0.0.1/', 'http://127.4.5.6:3000', 'http://[::1]:5173/', 'http://app.localhost/', 'file:///Users/a/index.html', 'http://0.0.0.0:8000']) {
    assert.equal(isLocalHost(at(u)), true, u);
    assert.equal(showCornerLink(at(u), false), false, u);
  }
  for (const u of ['https://example.com/', 'http://192.168.1.20/', 'https://localhost.example.com/', 'https://127.0.0.1.nip.io/', 'http://10.0.0.5:8080/']) {
    assert.equal(isLocalHost(at(u)), false, u);
    assert.equal(showCornerLink(at(u), false), true, u);
    assert.equal(showCornerLink(at(u), true), false, u + ' licensed');
  }
});

test('no crypto.subtle (plain-HTTP page): the default check loads the pure JS fallback', async () => {
  const good = makeKey(live.privateKey, { sku: 'zovo-doc-viewer' });
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true, writable: true });
  let loaded = 0;
  try {
    setFallbackLoader(() => { loaded++; return import('../src/formats/ed25519.js'); });
    assert.equal((await verifyKey(good, opts)).ok, true);
    const [, p, s] = good.split('.');
    assert.equal((await verifyKey(`ZOVO1.${p}.${s.slice(0, -2)}AA`, opts)).ok, false);
    assert.equal(loaded, 2);
  } finally {
    Object.defineProperty(globalThis, 'crypto', desc);
    setFallbackLoader(null);
  }
});
