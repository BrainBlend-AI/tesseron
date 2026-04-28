---
'@tesseron/mcp': minor
---

Improve agent recovery when a claimed session is invalidated mid-conversation (closes #69).

When a browser session is replaced by a fresh-hello (after an `@tesseron/react` resume race per #68, a manual reload, or any other condition that invalidates the prior session), agent-side MCP tools that hold a cached claim previously got a flat `No claimed session found for app "<id>".` error with no actionable recovery path. The agent's reflex of retrying `tesseron__claim_session` with the previously-known code also failed, leaving the user to read the new claim code from the app UI and paste it back manually.

**`tesseron__list_pending_claims` (new meta tool).** Lists every claim code the gateway can currently redeem — gateway-minted sessions waiting in `pendingClaims`, plus host-minted manifests under `~/.tesseron/instances/` whose `boundAgent` is `null` and whose `expiresAt` (when present) hasn't elapsed. Each entry carries the code, app id, app name, source mint flow, and unix timestamps. The agent calls this on the failure path, picks the entry whose `app_id` matches its cached app, and re-pairs without a user round-trip. Surfaced in the default `both` and `meta` tool surfaces; suppressed in `dynamic`.

**Improved error messages.** `tesseron__invoke_action` and `tesseron__read_resource` now name the recovery tool by name in the "No claimed session found" body, and inline the matching pending claim code(s) when one exists for the same app id. `tesseron__claim_session` similarly mentions other pending codes when the user typed a code the gateway doesn't have, so a typo doesn't dead-end.

**Internal.** `Session` and `ZombieSession` carry a new `mintedAt: number` field set at session creation and preserved across resume so `getPendingClaims()` reports a stable timestamp for sorting. `TesseronGateway.getPendingClaims()` is the new public method the bridge consumes; it returns `PendingClaim[]` (also exported for embedders).

Tests cover the new meta tool's empty + populated states, expired host-minted entry filtering, and the wrong-code claim path with a pending manifest discovered via `watchInstances`.
