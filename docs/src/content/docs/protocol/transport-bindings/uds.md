---
title: Unix domain socket binding
description: NDJSON framing, file-mode-based UID enforcement, and lifecycle for the UDS transport binding.
related:
  - protocol/transport
  - protocol/transport-bindings/ws
  - protocol/handshake
  - sdk/typescript/server
---

The UDS binding speaks Tesseron over a Unix domain socket on the local filesystem. Lower per-message overhead than WebSocket and avoids the loopback TCP stack entirely. Available on Linux and macOS in 1.1; Windows tracks separately (see [Windows](#windows-known-limitations) below).

This page is the wire spec for that binding. The [transport overview](/protocol/transport/) covers the binding-neutral contract this binding satisfies.

## Manifest discriminant

```jsonc
{
  "version": 2,
  "instanceId": "inst-...",
  "appName": "...",
  "addedAt": 1777038462692,
  "transport": { "kind": "uds", "path": "/tmp/tesseron-Xy7/sock" }
}
```

The `path` is the absolute filesystem path the gateway connects to. Apps SHOULD put the socket inside a per-process directory under `os.tmpdir()` (the reference SDK creates a `mkdtemp`-style 0700 dir, then binds `<dir>/sock` inside it). The directory mode is what gates same-UID access.

## Framing

NDJSON: one JSON-RPC envelope per **`\n`-terminated line**.

- Compact `JSON.stringify` never emits a raw `\n` (newlines inside strings are escaped as `\\n`), so a line splitter recovers messages losslessly.
- `JSON.stringify(msg) + '\n'` on send.
- Buffer inbound bytes and split on `\n` on receive. Empty lines are ignored.
- No batching, no fragmentation, no compression.

There is **no** subprotocol negotiation - bytes start flowing the moment `connect()` succeeds. The gateway sends `tesseron/hello` (or `tesseron/resume`) as its first message and the app responds.

## Origin / access control

Apps **MUST** restrict the socket file so only the same UID can `connect()`. Two complementary mechanisms, both supported on Linux and macOS:

1. **Parent directory mode `0700`.** Put the socket inside a private dir; the kernel's directory permission check rejects `connect()` from any other UID before it ever reaches the socket inode. The reference SDK does this via `mkdtemp` + `chmod 0700`.
2. **Socket file mode `0600`.** Apply `chmod 0600` to the socket file itself after `bind()`. Belt-and-suspenders against directory misconfiguration; some kernels (macOS pre-10.10, Linux pre-3.9) ignore the socket-file mode and rely solely on the parent dir.

The threat model is identical to loopback WS plus the [claim code](/protocol/handshake/): any process running as the same OS user can connect; the [claim code](/protocol/handshake/) is what gates the privilege escalation from "can talk to the socket" to "is bound to a session". Cross-UID isolation is the OS's job.

## Lifecycle

- App creates a 0700 temp dir under `os.tmpdir()` (or wherever the OS lets the user write privately), `bind()`s a socket inside, optionally `chmod 0600`s the socket file.
- App writes `~/.tesseron/instances/<instanceId>.json` with the path.
- Gateway watches `~/.tesseron/instances/`, picks the manifest up, dials.
- App accepts exactly one connection - the first peer wins; subsequent connect attempts are closed immediately.
- On session close, the app deletes its manifest and the socket file, and removes the temp dir.

## Failure matrix (UDS-specific)

| Event | What you see | Notes |
|---|---|---|
| Same-host other-UID connect attempt | `EACCES` from `connect()` | The kernel rejects before any byte is exchanged. |
| Stale socket file from prior run | `EADDRINUSE` on bind | Apps SHOULD `unlink` before `bind` if they pin a path. |
| App crashes without cleanup | Stale manifest + stale socket file | Gateway dial hits `ECONNREFUSED`; manifest is harmless until manually swept. |
| Gateway disconnects | `'close'` on the app side, no code | Treat as session end; rebind + re-announce to recover. |

## Windows: known limitations

Windows ≥ 1803 has an AF_UNIX implementation, but Node's `net.listen({ path })` on Windows actually creates a **named pipe** under the hood, not a filesystem socket. The path semantics differ (`\\.\pipe\<name>` instead of arbitrary filesystem paths) and the file-mode-based UID enforcement does not apply - Windows uses ACLs.

The 1.1 reference SDK skips the UDS binding on Windows. A separate `pipe` binding is tracked as follow-up work; until then, Windows apps should use the [WebSocket binding](./ws/).

## SDK-side reference implementation

- [`@tesseron/server` `UnixSocketServerTransport`](/sdk/typescript/server/) - select with `tesseron.connect({ transport: 'uds' })`.

## Porting another language?

Implement a UDS server that:

1. Creates a private (mode `0700`) directory under `os.tmpdir()` (or equivalent), binds a socket inside.
2. `chmod 0600`s the socket file after bind.
3. Writes `~/.tesseron/instances/<instanceId>.json` with `{ kind: 'uds', path }`.
4. Accepts exactly one connection; rejects subsequent connect attempts.
5. Serialises outgoing JSON-RPC envelopes with `\n` terminator; splits incoming bytes on `\n`.
6. Deletes its manifest, the socket file, and the temp dir on close.

The full conformance checklist lives in [Port Tesseron to your language](/sdk/porting/).
