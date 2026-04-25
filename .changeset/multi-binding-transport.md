---
'@tesseron/core': minor
'@tesseron/mcp': minor
'@tesseron/server': minor
'@tesseron/vite': minor
'@tesseron/web': minor
'@tesseron/react': minor
'@tesseron/svelte': minor
'@tesseron/vue': minor
---

Multi-binding transport layer (PROTOCOL_VERSION → 1.1.0). Decouples the
protocol from WebSocket so apps that can host other duplex channels — Unix
domain sockets, future named pipes / stdio — speak Tesseron without bridging
through a WS server.

Closes #28, #29, #30, #31, #32, #33, #34.

### Protocol

- New on-disk discovery format: `~/.tesseron/instances/<instanceId>.json`,
  v2 manifest with a discriminated `transport: { kind, ... }` field.
- New types in `@tesseron/core`: `TransportSpec`, `InstanceManifest`.
- `PROTOCOL_VERSION` bumped 1.0.0 → 1.1.0. Hard reject on major mismatch,
  warn on minor (covered by `protocol-version.test.ts`).
- Compat: gateway reads both `instances/` (v2) and `tabs/` (v1) for one
  minor version. v1 manifests are coerced to `{ kind: 'ws', url }`. The
  legacy directory drops in 2.0.

### Bindings

- **WebSocket** (default, unchanged on the wire) — formal binding spec at
  `/protocol/transport-bindings/ws/`.
- **Unix domain socket** (new) — NDJSON framing on AF_UNIX sockets; SDK-side
  `UnixSocketServerTransport` in `@tesseron/server` (Linux + macOS).
  Same-UID enforcement via 0700 parent dir + 0600 socket file. Select with
  `tesseron.connect({ transport: 'uds' })`. Windows tracked separately —
  Node's `net.listen({ path })` binds named pipes there, which need a
  different binding.

### Gateway

- `TesseronGateway.connectToApp(instanceId, spec: TransportSpec)` —
  signature change from `(tabId, wsUrl)`. Picks a dialer (`WsDialer`,
  `UdsDialer`) by `spec.kind`. Custom dialers can be registered via
  `new TesseronGateway({ dialers: [...] })`.
- `TesseronGateway.watchInstances()` — replaces `watchAppsJson()`, which
  stays as a deprecated alias for one minor.
- Internal `Session.ws: WebSocket` → `Session.transport: Transport`. Session
  shutdown now goes through the binding-neutral `transport.close(reason)`
  instead of a raw `ws.close(1001)` — UDS sessions don't have close codes.

### Vite plugin

- `@tesseron/vite` writes v2 instance manifests (`{ kind: 'ws', url }`)
  instead of v1 tab files.
- Internal `tabId` → `instanceId` (manifests are still per-tab; the rename
  drops the WS-only bias).

### Docs

- `protocol/transport.md` rewritten as a binding-neutral overview.
- New per-binding pages: `protocol/transport-bindings/ws.md`,
  `protocol/transport-bindings/uds.md`.
- `sdk/porting.md` updated to describe how to write a new binding.
- Cross-references in `handshake.mdx`, `wire-format.mdx`, `security.mdx`,
  `mcp.md`, `server.md`, `vite.md`, `quickstart.mdx`, `architecture.mdx`,
  `core.md`, `index.mdx` synced.
