/**
 * Filesystem hygiene helpers for `~/.tesseron/*` writes.
 *
 * Tesseron writes a handful of small files under `~/.tesseron/` (instance
 * manifests, claim breadcrumbs, future runtime state). Every one of those
 * files is locally sensitive: another process running as the same user can
 * read them, and a few of them carry tokens or about-to-be-tokens that the
 * threat model assumes only the owning gateway sees. The shipped writers
 * predate any explicit hardening, so they used the umask default (typically
 * world-readable 0o644 on Linux) and a non-atomic `writeFile`. This helper
 * standardises the contract:
 *
 *   - parent dir is forced to 0o700 (best-effort on filesystems that ignore
 *     POSIX modes);
 *   - file is created with mode 0o600 — owner-only read/write;
 *   - the write is atomic via a sibling temp file plus `rename`, so a reader
 *     never observes a partial write or an empty file mid-flight.
 *
 * Identical helpers live in `@tesseron/server/fs-hygiene` and
 * `@tesseron/mcp/fs-hygiene`. Three copies is cheaper than wiring a new
 * shared package or making `@tesseron/vite` depend on `@tesseron/server`
 * just for ~70 lines of disk plumbing.
 */

import { constants as fsConstants } from 'node:fs';
import { chmod, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

/**
 * Ensure `dir` exists with restrictive (0o700) permissions.
 *
 * On creation the mode flows through `mkdir({ mode })`. For a pre-existing
 * directory (e.g. a `~/.tesseron/` left behind by a pre-hardening release
 * with the umask-default 0o755), an explicit `chmod` tightens it down.
 * Failures of the secondary chmod are swallowed: on Windows POSIX modes
 * are advisory and on a handful of niche filesystems `chmod` is a no-op,
 * but the atomic-write semantics in {@link writePrivateFile} are the
 * primary integrity guarantee, so a best-effort tightening is sufficient.
 */
export async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  await chmod(dir, PRIVATE_DIR_MODE).catch(() => {});
}

/**
 * Atomically write `contents` to `targetPath` with mode 0o600.
 *
 * Atomicity: the write goes to `<targetPath>.tmp.<pid>.<random>`, then
 * `rename`s into place. Same-filesystem `rename` is atomic on POSIX and on
 * Windows ≥ 10 (the only platforms Node 20 supports), so a concurrent
 * reader sees either the previous file or the new one — never a half-
 * written one.
 *
 * Mode: the file is created with mode 0o600 (owner-only). The chmod after
 * write covers filesystems that ignored the open-time mode argument.
 *
 * Symlink safety is enforced upstream: the parent directory is set to
 * 0o700 by {@link ensurePrivateDir}, which means an attacker without write
 * access to the directory cannot pre-plant a symlink inside it, so a
 * regular `rename` into the dir is safe to trust without extra `O_NOFOLLOW`
 * acrobatics. (On Windows POSIX modes are advisory and the OS user model
 * is the gate — same caveat as the UDS transport, documented there.)
 */
export async function writePrivateFile(targetPath: string, contents: string): Promise<void> {
  const dir = dirname(targetPath);
  await ensurePrivateDir(dir);

  const tmp = `${targetPath}.tmp.${process.pid}.${randomSuffix()}`;
  // O_EXCL guarantees the open fails if the temp name somehow already
  // exists (concurrent write collision). Combined with the random suffix
  // this is collision-free in practice.
  const fh = await open(
    tmp,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
    PRIVATE_FILE_MODE,
  );
  try {
    await fh.writeFile(contents);
    await fh.chmod(PRIVATE_FILE_MODE).catch(() => {});
  } finally {
    await fh.close();
  }

  try {
    await rename(tmp, targetPath);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

function randomSuffix(): string {
  const buf = new Uint8Array(8);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
