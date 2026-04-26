/**
 * Constant-time equality helpers.
 *
 * These are split into their own module rather than co-existing with the
 * dispatcher / builder code so the surface is obvious to security reviewers:
 * "every equality check on a user-presented token MUST go through this file."
 * Plain `a === b` on a short-circuiting comparison leaks a prefix-match
 * length to anyone measuring response latency, which is the textbook
 * timing-side-channel against bearer credentials (claim codes, resume
 * tokens, future host-minted bind tokens).
 *
 * Implementation is pure JavaScript so the helper works in browser bundles
 * too — `@tesseron/core` is the platform-neutral package and we don't want
 * to pull in `node:crypto` here. The XOR-and-OR loop runs in time
 * proportional to the input length regardless of where the strings differ;
 * V8/JSC don't optimise the OR-of-XORs into anything timing-variable.
 */

/**
 * Constant-time string equality. Returns false if either argument is not a
 * string, or if lengths differ; otherwise XORs character codes and returns
 * true iff every comparison was zero.
 *
 * **Length is a permitted side channel.** Lengths are returned eagerly. The
 * caller is expected to ensure same-length inputs by the format contract
 * (claim codes are fixed-length, resume tokens are fixed-length); a length
 * mismatch in practice means "definitely not this token" and doesn't leak
 * anything an attacker couldn't deduce from the protocol shape.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
