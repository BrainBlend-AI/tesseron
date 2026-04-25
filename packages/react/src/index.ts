import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
  type ActionAnnotations,
  type ActionContext,
  type ResumeCredentials,
  TesseronError,
  TesseronErrorCode,
  type WebTesseronClient,
  type WelcomeResult,
  tesseron,
} from '@tesseron/web';
import { useEffect, useRef, useState } from 'react';

export * from '@tesseron/web';

/** Options for {@link useTesseronAction}; mirrors the chained {@link ActionBuilder} methods as a single object. */
export interface UseTesseronActionOptions<I, O> {
  description?: string;
  input?: StandardSchemaV1<I>;
  inputJsonSchema?: unknown;
  output?: StandardSchemaV1<O>;
  outputJsonSchema?: unknown;
  annotations?: ActionAnnotations;
  timeoutMs?: number;
  strictOutput?: boolean;
  handler: (input: I, ctx: ActionContext) => Promise<O> | O;
}

/**
 * Registers a Tesseron action for the lifetime of the calling component. The
 * action is removed on unmount. `options.handler` is held in a ref so the
 * registration does not re-run when you close over new state — just pass the
 * latest handler each render.
 *
 * @example
 * ```tsx
 * useTesseronAction('addTodo', {
 *   input: z.object({ text: z.string() }),
 *   handler: ({ text }) => setTodos((t) => [...t, text]),
 * });
 * ```
 */
export function useTesseronAction<I = unknown, O = unknown>(
  name: string,
  options: UseTesseronActionOptions<I, O>,
  client: WebTesseronClient = tesseron,
): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let builder = client.action<I, O>(name);
    const o = optionsRef.current;
    if (o.description) builder = builder.describe(o.description);
    if (o.input) builder = builder.input(o.input, o.inputJsonSchema);
    if (o.output) builder = builder.output(o.output, o.outputJsonSchema);
    if (o.annotations) builder = builder.annotate(o.annotations);
    if (o.timeoutMs) builder = builder.timeout({ ms: o.timeoutMs });
    if (o.strictOutput) builder = builder.strictOutput();
    builder.handler((input, ctx) => optionsRef.current.handler(input, ctx));
    return () => {
      client.removeAction(name);
    };
  }, [name, client]);
}

/** Options for {@link useTesseronResource}. Pass either `read`, `subscribe`, or both. */
export interface UseTesseronResourceOptions<T> {
  description?: string;
  output?: StandardSchemaV1<T>;
  outputJsonSchema?: unknown;
  read?: () => T | Promise<T>;
  subscribe?: (emit: (value: T) => void) => () => void;
}

/**
 * Registers a Tesseron resource for the lifetime of the calling component.
 * The shorthand form (passing a reader function) is equivalent to `{ read }`.
 * Current-value closures are held in a ref so stale reads are avoided without
 * re-registering the resource each render.
 *
 * @example
 * ```tsx
 * useTesseronResource('todoCount', () => todos.length);
 * ```
 */
export function useTesseronResource<T = unknown>(
  name: string,
  optionsOrReader: UseTesseronResourceOptions<T> | (() => T | Promise<T>),
  client: WebTesseronClient = tesseron,
): void {
  const options: UseTesseronResourceOptions<T> =
    typeof optionsOrReader === 'function' ? { read: optionsOrReader } : optionsOrReader;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let builder = client.resource<T>(name);
    const o = optionsRef.current;
    if (o.description) builder = builder.describe(o.description);
    if (o.output) builder = builder.output(o.output, o.outputJsonSchema);
    if (o.read) {
      const read = o.read;
      builder = builder.read(() => (optionsRef.current.read ?? read)());
    }
    if (o.subscribe) {
      const subscribe = o.subscribe;
      builder = builder.subscribe((emit) => (optionsRef.current.subscribe ?? subscribe)(emit));
    }
    return () => {
      client.removeResource(name);
    };
  }, [name, client]);
}

/**
 * Persistence backend for resume credentials. Implementations may be sync or
 * async; the hook awaits each call. Returning `null` from `load` means "no
 * stored session, do a fresh hello."
 */
export interface ResumeStorage {
  load: () => ResumeCredentials | null | Promise<ResumeCredentials | null>;
  save: (credentials: ResumeCredentials) => void | Promise<void>;
  clear: () => void | Promise<void>;
}

/** Options for {@link useTesseronConnection}. */
export interface UseTesseronConnectionOptions {
  /** Gateway URL; defaults to `DEFAULT_GATEWAY_URL` (the local bridge). */
  url?: string;
  /** Set to `false` to skip connecting (useful for gating behind auth). Defaults to `true`. */
  enabled?: boolean;
  /**
   * Persist `{ sessionId, resumeToken }` so the hook can rejoin an existing
   * claimed session via `tesseron/resume` after the transport drops (page
   * refresh, HMR reload, brief network blip) instead of issuing a new claim
   * code. See [protocol/resume](https://tesseron.dev/protocol/resume/).
   *
   * - `false` / omitted (default): no persistence. Every connect is a fresh hello.
   * - `true`: persist in `localStorage` under `'tesseron:resume'`.
   * - `string`: persist in `localStorage` under that exact key. Use a per-app
   *   value when you have multiple `WebTesseronClient` instances per page.
   * - `ResumeStorage`: custom `{ load, save, clear }` callbacks. Useful when
   *   `localStorage` is not available (Electron renderer with strict CSP, an
   *   iframe partition, custom storage).
   *
   * On a `TesseronError(ResumeFailed)` (TTL expired, token rotated by another
   * tab, gateway restarted), the hook clears the stored credentials and falls
   * back to a fresh `tesseron/hello`. Resume tokens are one-shot - the hook
   * always overwrites the stored value with the freshest token from each
   * successful handshake.
   */
  resume?: boolean | string | ResumeStorage;
}

/** Reactive connection state returned from {@link useTesseronConnection}. */
export interface TesseronConnectionState {
  status: 'idle' | 'connecting' | 'open' | 'error' | 'closed';
  welcome?: WelcomeResult;
  /**
   * Claim code to display in the UI. Present only on a fresh `tesseron/hello`;
   * absent after a successful resume because the session was already claimed.
   */
  claimCode?: string;
  error?: Error;
}

const DEFAULT_RESUME_STORAGE_KEY = 'tesseron:resume';

function localStorageResumeBackend(key: string): ResumeStorage {
  return {
    load: () => {
      // SSR: no window, nothing to load.
      if (typeof window === 'undefined') return null;
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>;
          if (typeof obj['sessionId'] === 'string' && typeof obj['resumeToken'] === 'string') {
            return { sessionId: obj['sessionId'], resumeToken: obj['resumeToken'] };
          }
        }
        return null;
      } catch {
        // Corrupted entry or localStorage access denied (private mode, etc.)
        // - treat as no saved session and let the hook do a fresh hello.
        return null;
      }
    },
    save: (creds) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(key, JSON.stringify(creds));
      } catch {
        // Quota exceeded or storage disabled - non-fatal; the session still
        // works for this page load, it just won't survive the next refresh.
      }
    },
    clear: () => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Same as save: best-effort cleanup.
      }
    },
  };
}

function resolveResumeStorage(
  option: UseTesseronConnectionOptions['resume'],
): ResumeStorage | null {
  if (!option) return null;
  if (option === true) return localStorageResumeBackend(DEFAULT_RESUME_STORAGE_KEY);
  if (typeof option === 'string') return localStorageResumeBackend(option);
  return option;
}

/**
 * Connects the shared {@link WebTesseronClient} singleton on mount and exposes
 * the connection status (and claim code) for rendering. Register your actions
 * and resources with {@link useTesseronAction} / {@link useTesseronResource}
 * before this hook runs so they appear in the initial `tesseron/hello` manifest.
 *
 * Pass `options.resume` to survive page refresh / HMR reloads without losing
 * the claimed session - see {@link UseTesseronConnectionOptions.resume}.
 */
export function useTesseronConnection(
  options: UseTesseronConnectionOptions = {},
  client: WebTesseronClient = tesseron,
): TesseronConnectionState {
  const [state, setState] = useState<TesseronConnectionState>({ status: 'idle' });
  const enabled = options.enabled ?? true;
  const url = options.url;
  const resumeRef = useRef(options.resume);
  resumeRef.current = options.resume;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ status: 'connecting' });

    const storage = resolveResumeStorage(resumeRef.current);

    void (async () => {
      try {
        let saved: ResumeCredentials | null = null;
        if (storage) {
          try {
            saved = await storage.load();
          } catch {
            // A throwing custom backend shouldn't break the connection; fall
            // through to a fresh hello.
            saved = null;
          }
        }

        let welcome: WelcomeResult;
        try {
          welcome = await client.connect(url, saved ? { resume: saved } : undefined);
        } catch (err) {
          if (
            saved &&
            err instanceof TesseronError &&
            err.code === TesseronErrorCode.ResumeFailed
          ) {
            // Stored creds are stale (TTL elapsed, gateway restarted, token
            // already rotated by another tab). Clear and start fresh.
            await storage?.clear();
            if (cancelled) return;
            welcome = await client.connect(url);
          } else {
            throw err;
          }
        }

        if (cancelled) return;
        if (storage && welcome.resumeToken) {
          await storage.save({
            sessionId: welcome.sessionId,
            resumeToken: welcome.resumeToken,
          });
        }
        if (cancelled) return;
        setState({ status: 'open', welcome, claimCode: welcome.claimCode });
      } catch (error) {
        if (cancelled) return;
        setState({ status: 'error', error: error as Error });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, url, client]);

  return state;
}
