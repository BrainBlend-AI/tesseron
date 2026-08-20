#!/usr/bin/env node
/**
 * Validates the fixture corpus against the format documented in README.md.
 *
 * Not a conformance runner: it never opens a socket. It checks that the
 * fixtures themselves are well-formed, so a broken fixture fails here rather
 * than looking like a failing implementation in someone else's repo.
 *
 * Zero dependencies, so a port can run it without installing this workspace.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');

const MATCHER_TYPES = new Set(['any', 'string', 'number', 'boolean', 'object', 'array', 'absent']);
const STEP_KINDS = ['recv', 'send', 'expectClosed', 'expectSilence', 'dropTransport', 'reconnect'];

const problems = [];

function report(fixtureId, message) {
  problems.push(`${fixtureId}: ${message}`);
}

function collectFixtureFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...collectFixtureFiles(path));
    else if (entry.endsWith('.json')) found.push(path);
  }
  return found;
}

/** Walks every string in a frame, yielding `~`-prefixed matcher tokens. */
function* matcherTokens(node) {
  if (typeof node === 'string') {
    if (node.startsWith('~')) yield node.slice(1);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) yield* matcherTokens(item);
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const value of Object.values(node)) yield* matcherTokens(value);
  }
}

function checkMatcher(fixtureId, token, captured, isRecvStep) {
  if (MATCHER_TYPES.has(token)) return;

  if (token.startsWith('regex:')) {
    const pattern = token.slice('regex:'.length);
    try {
      new RegExp(pattern);
    } catch (error) {
      report(fixtureId, `~regex is not a valid pattern (${pattern}): ${error.message}`);
    }
    return;
  }

  if (token.startsWith('capture:')) {
    const name = token.slice('capture:'.length);
    if (!name) report(fixtureId, '~capture needs a name');
    else if (!isRecvStep)
      report(fixtureId, `~capture:${name} used in a send step; captures only bind on recv`);
    else if (captured.has(name)) report(fixtureId, `~capture:${name} declared twice`);
    else captured.add(name);
    return;
  }

  if (token.startsWith('ref:')) {
    const name = token.slice('ref:'.length);
    if (!captured.has(name)) {
      report(fixtureId, `~ref:${name} is used before anything captures it`);
    }
    return;
  }

  report(fixtureId, `unknown matcher ~${token}`);
}

function validateFixture(path) {
  const relativePath = relative(FIXTURES_ROOT, path);
  const expectedId = relativePath
    .split(sep)
    .join('/')
    .replace(/\.json$/, '');

  let fixture;
  try {
    fixture = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    report(expectedId, `is not valid JSON: ${error.message}`);
    return;
  }

  if (fixture.id !== expectedId) {
    report(expectedId, `id is "${fixture.id}" but the file path says "${expectedId}"`);
  }
  if (typeof fixture.title !== 'string' || fixture.title.length === 0) {
    report(expectedId, 'needs a title');
  }
  if (typeof fixture.spec !== 'string' || !fixture.spec.startsWith('/')) {
    report(expectedId, 'needs a spec anchor pointing at the docs page it pins down');
  }
  if (!Array.isArray(fixture.requires)) {
    report(expectedId, 'needs a requires array (use [] when it applies to every host)');
  }
  if (!Array.isArray(fixture.steps) || fixture.steps.length === 0) {
    report(expectedId, 'needs at least one step');
    return;
  }

  const captured = new Set();
  const labels = new Set();

  fixture.steps.forEach((step, index) => {
    const kinds = STEP_KINDS.filter((kind) => kind in step);
    if (kinds.length === 0) {
      report(expectedId, `step ${index} has no recognised kind (one of ${STEP_KINDS.join(', ')})`);
      return;
    }
    if (kinds.length > 1) {
      report(expectedId, `step ${index} mixes ${kinds.join(' and ')}; one kind per step`);
    }
    if (typeof step.label === 'string') labels.add(step.label);
    if (typeof step.notBefore === 'string' && !labels.has(step.notBefore)) {
      report(expectedId, `step ${index} references label "${step.notBefore}" before it is defined`);
    }

    const kind = kinds[0];
    if (kind !== 'recv' && kind !== 'send') return;

    const frame = step[kind];
    if (frame === null || typeof frame !== 'object') {
      report(expectedId, `step ${index} ${kind} must be a JSON-RPC frame object`);
      return;
    }
    if (kind === 'send' && frame.jsonrpc !== '2.0') {
      report(expectedId, `step ${index} send frame must carry "jsonrpc": "2.0"`);
    }
    for (const token of matcherTokens(frame)) {
      checkMatcher(expectedId, token, captured, kind === 'recv');
    }
  });
}

const files = collectFixtureFiles(FIXTURES_ROOT);
for (const file of files) validateFixture(file);

if (problems.length > 0) {
  console.error(`${problems.length} problem(s) in ${files.length} fixture(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`${files.length} fixtures valid.`);
