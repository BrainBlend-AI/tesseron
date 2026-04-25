---
'@tesseron/react': minor
---

`useTesseronConnection` now accepts a `resume` option that persists `sessionId` / `resumeToken` so the hook reattaches to the existing claimed session via `tesseron/resume` after a page refresh, HMR reload, or brief network drop instead of issuing a new claim code on every reconnect. Pass `resume: true` for the default `localStorage` backend, a `string` to override the storage key, or a `{ load, save, clear }` object for custom backends (Electron, OS keychain, iframe partition). Falls back to a fresh `tesseron/hello` automatically when the gateway rejects the resume with `ResumeFailed`.
