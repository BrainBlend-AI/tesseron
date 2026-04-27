/**
 * End-to-end coverage for the tesseron#60 host-minted-claim flow.
 *
 * Exercises the gateway-side path independently of the Vite plugin's
 * intricate hello-interception state machine: we stand up a minimal fake
 * host that writes a `helloHandledByHost: true` manifest, accepts the
 * gateway's bind-subprotocol upgrade, and pumps a synthesized
 * `tesseron/hello` over the bound channel. The gateway-side assertions
 * lock the contract that the rewritten claim flow needs to honour: no
 * auto-dial of host-mint manifests, scan-on-claim, dial-with-bind, and a
 * pre-claimed session in `gateway.sessions`.
 *
 * The Vite plugin's own state machine is exercised by its package-level
 * tests; here we focus on the wire interaction with the gateway.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type WebSocket, WebSocketServer } from 'ws';
import { TesseronGateway } from '../src/index.js';
import { type Sandbox, prepareSandbox } from './setup.js';

let sandbox: Sandbox;
let gateway: TesseronGateway;
let activeHosts: FakeHost[] = [];

beforeAll(() => {
  sandbox = prepareSandbox();
  gateway = new TesseronGateway();
  gateway.watchInstances();
});

afterAll(async () => {
  await gateway.stop().catch(() => {});
  sandbox.cleanup();
});

afterEach(async () => {
  await Promise.all(activeHosts.map((h) => h.close()));
  activeHosts = [];
  // Let the gateway's discovery loop register / unregister manifests.
  await new Promise((r) => setTimeout(r, 60));
});

interface FakeHostOptions {
  appId: string;
  appName: string;
  hostMintedCode: string;
  hostMintedSessionId: string;
  hostMintedResumeToken: string;
}

/**
 * Minimal stand-in for the production Vite plugin / `@tesseron/server`
 * host. Hosts a one-shot WebSocket server, writes a v2-with-host-mint
 * manifest the gateway's discovery loop will read, validates the bind
 * subprotocol on upgrade, and pumps a single `tesseron/hello` over the
 * bound channel — enough to drive the gateway's v3 hello handler all the
 * way to a claimed session.
 */
class FakeHost {
  private server!: Server;
  private wss!: WebSocketServer;
  private boundWs?: WebSocket;
  readonly instanceId: string;
  private manifestPath?: string;
  private welcomeReceived?: { resolve: (msg: unknown) => void; promise: Promise<unknown> };

  constructor(private readonly opts: FakeHostOptions) {
    this.instanceId = `inst-fake-${Math.random().toString(36).slice(2, 10)}`;
  }

  async start(): Promise<void> {
    this.server = createServer();
    this.wss = new WebSocketServer({ noServer: true });

    this.server.on('upgrade', (req, socket, head) => {
      const proto = req.headers['sec-websocket-protocol'];
      const protoStr = Array.isArray(proto) ? proto.join(', ') : (proto ?? '');
      // Only accept bind-subprotocol upgrades (the gateway dialing in v3
      // mode). A legacy auto-dial would land here too in production but
      // for this test we exercise the v3 path exclusively.
      if (!protoStr.includes(`tesseron-bind.${this.opts.hostMintedCode}`)) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.boundWs = ws;
        ws.on('message', (data) => this.onGatewayMessage(data.toString()));
        // Pump the cached hello — the plugin in production replays the
        // SDK's hello here. We use a fixed id so we can assert the
        // gateway's reply to it.
        const hello = {
          jsonrpc: '2.0',
          id: '__test-hello',
          method: 'tesseron/hello',
          params: {
            protocolVersion: '1.1.0',
            app: {
              id: this.opts.appId,
              name: this.opts.appName,
              origin: 'http://localhost',
            },
            actions: [],
            resources: [],
            capabilities: {
              streaming: true,
              subscriptions: true,
              sampling: false,
              elicitation: false,
            },
          },
        };
        ws.send(JSON.stringify(hello));
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    const url = `ws://127.0.0.1:${addr.port}/`;

    // Write the v2-with-host-mint manifest the gateway watches for.
    const instancesDir = join(sandbox.dir, '.tesseron', 'instances');
    await mkdir(instancesDir, { recursive: true });
    this.manifestPath = join(instancesDir, `${this.instanceId}.json`);
    await writeFile(
      this.manifestPath,
      JSON.stringify({
        version: 2,
        instanceId: this.instanceId,
        appName: this.opts.appName,
        addedAt: Date.now(),
        pid: process.pid,
        transport: { kind: 'ws', url },
        helloHandledByHost: true,
        hostMintedClaim: {
          code: this.opts.hostMintedCode,
          sessionId: this.opts.hostMintedSessionId,
          resumeToken: this.opts.hostMintedResumeToken,
          mintedAt: Date.now(),
          boundAgent: null,
        },
      }),
    );
  }

  /**
   * Resolves with the welcome the gateway returns to the replayed hello.
   */
  awaitWelcome(): Promise<unknown> {
    if (this.welcomeReceived !== undefined) return this.welcomeReceived.promise;
    let resolve!: (msg: unknown) => void;
    const promise = new Promise<unknown>((res) => {
      resolve = res;
    });
    this.welcomeReceived = { resolve, promise };
    return promise;
  }

  private onGatewayMessage(text: string): void {
    let parsed: { id?: unknown; result?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (parsed.id === '__test-hello' && parsed.result !== undefined) {
      this.welcomeReceived?.resolve(parsed.result);
    }
  }

  async close(): Promise<void> {
    this.boundWs?.close();
    this.wss?.close();
    this.server?.close();
    if (this.manifestPath !== undefined && existsSync(this.manifestPath)) {
      try {
        const { unlink } = await import('node:fs/promises');
        await unlink(this.manifestPath);
      } catch {
        // best effort
      }
    }
  }
}

function newHost(opts: FakeHostOptions): FakeHost {
  const host = new FakeHost(opts);
  activeHosts.push(host);
  return host;
}

describe('host-minted claim flow (tesseron#60)', () => {
  it('does not auto-dial a manifest with helloHandledByHost: true', async () => {
    const host = newHost({
      appId: 'noautoapp',
      appName: 'no-auto-dial',
      hostMintedCode: 'TEST-A1',
      hostMintedSessionId: 's_test_noauto',
      hostMintedResumeToken: 'r_test_noauto'.padEnd(32, 'x'),
    });
    await host.start();
    // Wait for the discovery poll to read the manifest. The gateway's
    // poll interval is ~2 s; give it time plus margin.
    await new Promise((r) => setTimeout(r, 2500));
    // No upgrade should have hit the host because no claim has been made.
    // Assert by checking that `awaitWelcome` is unresolved.
    let welcomeArrived = false;
    void host.awaitWelcome().then(() => {
      welcomeArrived = true;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(welcomeArrived).toBe(false);
  });

  it('dials a host-minted manifest with bind subprotocol on claimSession and registers a claimed session', async () => {
    const host = newHost({
      appId: 'claimapp',
      appName: 'claim-flow',
      hostMintedCode: 'CLAM-99',
      hostMintedSessionId: 's_test_claim',
      hostMintedResumeToken: 'r_test_claim'.padEnd(32, 'x'),
    });
    await host.start();
    // Wait for discovery to register the manifest.
    await new Promise((r) => setTimeout(r, 2500));

    // The bridge calls this from `tesseron__claim_session`; here we
    // exercise the gateway directly so the test stays focused on the
    // claim-mediated dial path.
    const claimPromise = gateway.claimSession('CLAM-99');
    const welcome = (await host.awaitWelcome()) as {
      sessionId: string;
      claimCode?: string;
      agent: { id: string };
      resumeToken: string;
    };
    const session = await claimPromise;

    expect(session, 'claimSession returns the registered session').not.toBeNull();
    expect(session?.claimed).toBe(true);
    expect(session?.claimCode).toBe('CLAM-99');
    // The gateway's v3 welcome must NOT echo a claim code — that would
    // race the host's synthesized welcome and confuse the SDK.
    expect(welcome.claimCode).toBeUndefined();
    // The gateway's resumeToken in the v3 welcome is its own; the host's
    // resume token is what the SDK saw earlier from the synthesized
    // welcome. They're independent — the resume flow re-issues on every
    // handshake.
    expect(typeof welcome.resumeToken).toBe('string');
  });

  it('returns null for a code that does not match any host-minted manifest', async () => {
    const result = await gateway.claimSession('NOMATCH-XX');
    expect(result).toBeNull();
  });
});
