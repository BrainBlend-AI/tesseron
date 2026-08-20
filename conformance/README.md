# Tesseron conformance fixtures

Executable version of the [porting checklist](../docs/src/content/docs/sdk/porting.md).
Every fixture is a scripted exchange in plain JSON. No TypeScript, no test framework,
no dependency on this repo. If your runtime can parse JSON and open a socket, it can
run these.

The point: "is this implementation correct" should be a command you run, not an
argument you have. Five implementations of a protocol without a shared suite means
five subtly incompatible implementations, discovered through bug reports.

Licensed CC BY 4.0, same as the spec. See [`LICENSE`](../docs/src/content/docs/protocol/LICENSE).

## What is under test

Fixtures test a **host**: the thing a port actually writes. The runner plays the
gateway, so you never need a real `@tesseron/mcp` process to get a signal.

```
  your host implementation  <--- fixture steps --->  the runner (plays gateway)
```

The gateway itself is not portable work. It is one binary that dials out to your app
and speaks the same wire protocol regardless of what language wrote the manifest, so
a port needs the host side only.

## Fixture format

```jsonc
{
  "id": "actions/invoke-success",
  "title": "A well-formed invoke returns the handler output verbatim",
  "spec": "/protocol/actions/",
  "requires": ["actions"],
  "fixture": {
    "actions": [
      { "name": "add", "returns": { "sum": 3 } }
    ]
  },
  "steps": [
    { "recv": { "method": "tesseron/hello" } },
    { "send": { "result": { "sessionId": "s_test", "claimCode": "AB3X-7K" } } }
  ]
}
```

- `id` — path-shaped, matches the file path under `fixtures/`.
- `spec` — the docs page this pins down. A fixture with no spec anchor is a bug in
  the fixture, not a feature.
- `requires` — capability tags. A host that does not implement `uds` or `resume`
  skips those fixtures and reports them as skipped, never as passed.
- `fixture` — the app the host must stand up before the exchange: actions with
  canned return values, resources with canned reads. Keeps handler logic out of the
  wire assertions.
- `steps` — ordered. `recv` is a frame the runner expects **from** the host; `send`
  is a frame the runner writes **to** it.

### Matchers

Session ids, invocation ids, claim codes, and timestamps are volatile, so `recv`
frames match structurally rather than by equality. A `recv` object asserts only the
keys it names; extra keys on the actual frame are allowed (a host may carry fields
from a later minor). String values starting with `~` are matchers:

| Matcher | Matches |
|---|---|
| `~any` | any value, including `null` |
| `~string`, `~number`, `~boolean`, `~object`, `~array` | that JSON type |
| `~regex:<pattern>` | a string matching the pattern |
| `~capture:<name>` | any value, bound to `<name>` for later steps |
| `~ref:<name>` | equal to whatever `<name>` captured earlier |
| `~absent` | the key must not be present |

`~capture` / `~ref` is what pins id correlation: capture the `id` on a `recv`, echo
it with `~ref` on the `send`, and a host that mismatches request ids fails loudly.

### Timing

`recv` waits up to 2000 ms by default; override per step with `"timeoutMs"`. A step
carrying `"notBefore"` asserts ordering: the frame must not arrive before the named
step completed. Nothing else about timing is asserted, because wall-clock assertions
are how a suite becomes flaky.

## Runner contract

A runner is ~200 lines in any language. It must:

1. Read every `.json` under `fixtures/`, recursively.
2. Skip fixtures whose `requires` names a capability the implementation declares it
   lacks. **Report skips separately from passes.** A suite that reports 40/40 while
   silently skipping 12 is worse than no suite.
3. Stand up the host with the `fixture` app, connect, and walk `steps` in order.
4. On `recv`, read the next frame and match it. On `send`, resolve matchers against
   captures and write it.
5. Fail with the fixture `id`, the step index, the expected shape, and the actual
   frame. All three, or debugging the failure means adding print statements.

Exit non-zero if any fixture fails. Print the skip list.

## Adding a fixture

A fixture earns its place by pinning behaviour that a reasonable implementer would
get wrong. The traps already covered:

- `ctx.confirm` collapses decline, cancel, and missing-capability all to `false`,
  while `ctx.elicit` returns `null` on decline but *throws* when unsupported.
- `resources/subscribe` and `read` each commit separately; chaining both registers
  the resource twice.
- Resume rotates the token every time. A host that keeps presenting the original
  fails the second reconnect.
- `actions/progress` percent must increase monotonically.
- The `log` notification method is bare `log`, not `tesseron/log`.

Fixtures must not encode reference-implementation *choices* — code alphabet, id
format, timeout defaults beyond the documented 60 000 ms. If the spec permits it,
the fixture must permit it.

## Status

Starter set. It covers the handshake, the action lifecycle, resources, and the error
model. Not yet covered: sampling depth capping, the full elicit schema-rejection
matrix, UDS file-mode enforcement, and the host-minted bind flow on both bindings.
Those are the next ones to write.

No runner ships yet. The format is stable enough to write against; the reference
runner lands with the first non-TypeScript SDK.
