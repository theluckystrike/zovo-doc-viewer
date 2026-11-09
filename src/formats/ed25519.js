// Fallback signature check, loaded only when WebCrypto Ed25519 is missing. That includes every plain-HTTP page
// (an intranet server, for example): browsers hide crypto.subtle outside secure contexts, so SHA-512 is pure JS here.
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = (m) => Promise.resolve(sha512(m));

export async function verifyAsync(sig, msg, pub) {
  return ed.verify(sig, msg, pub);
}
