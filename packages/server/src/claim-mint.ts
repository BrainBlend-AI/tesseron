/**
 * Host-side mint helpers for the tesseron#60 claim-mediated flow.
 *
 * Mirrors `@tesseron/mcp/src/session.ts` — same alphabets, same entropy
 * source (`crypto.getRandomValues` with rejection sampling), same wire
 * format. Duplicated rather than imported because `@tesseron/vite` doesn't
 * depend on `@tesseron/mcp` and shouldn't (mcp is the gateway runtime;
 * vite is a dev-server plugin). A drift-detection regression here would
 * land as either a session-ID collision or a claim-code that the gateway
 * refuses, both caught by the e2e test in `packages/mcp/test/`.
 */

import { Buffer } from 'node:buffer';

const CLAIM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const BASE36_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomFromAlphabet(alphabet: string, len: number): string {
  const aLen = alphabet.length;
  const maxAcceptable = Math.floor(256 / aLen) * aLen;
  let out = '';
  while (out.length < len) {
    const buf = new Uint8Array((len - out.length) * 2 + 4);
    globalThis.crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= maxAcceptable) continue;
      out += alphabet.charAt(b % aLen);
      if (out.length === len) break;
    }
  }
  return out;
}

/** Six-character pairing code in the existing `XXXX-XX` format. */
export function mintClaimCode(): string {
  const code = randomFromAlphabet(CLAIM_CHARS, 6);
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Opaque host-side session id. Same shape as `@tesseron/mcp`'s. */
export function mintSessionId(): string {
  return `s_${randomFromAlphabet(BASE36_CHARS, 8)}${Date.now().toString(36)}`;
}

/** 24-byte base64url resume token. Same shape as `@tesseron/mcp`'s. */
export function mintResumeToken(): string {
  const buf = new Uint8Array(24);
  globalThis.crypto.getRandomValues(buf);
  return Buffer.from(buf).toString('base64url');
}
