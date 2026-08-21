---
'@tesseron/docs-mcp': patch
---

Refresh the docs snapshot with the corrected 1.2 protocol spec: the published
`protocolVersion` was `1.1.0` in eight places, `tesseron/bind` was undocumented,
and both transport-binding pages still described the 1.1 handshake (including
the `tesseron/hello` direction, which was backwards).

This is the first release where `@tesseron/docs-mcp` moves on its own. It has
left the changesets `fixed` group, so a prose correction no longer forces a
version bump across all eight SDK packages.
