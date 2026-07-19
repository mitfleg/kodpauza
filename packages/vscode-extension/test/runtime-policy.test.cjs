const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  RuntimePolicyManager,
  isLocalRuntimePolicyUrl,
} = require('../dist/runtimePolicy.js');

function policy(overrides = {}) {
  const now = Date.parse('2026-07-19T12:00:00.000Z');
  return {
    schemaVersion: 1,
    policyVersion: 'test-1',
    environment: 'production',
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
    enabled: true,
    blocks: { tools: [], toolVersions: [], surfaces: [], campaigns: [] },
    ...overrides,
  };
}

function envelope(payload, privateKey, overrides = {}) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return {
    algorithm: 'Ed25519',
    keyId: 'test-key',
    payload: encoded,
    signature: crypto.sign(null, Buffer.from(encoded, 'utf8'), privateKey).toString('base64url'),
    ...overrides,
  };
}

function setup(fetchValue, options = {}) {
  const pair = crypto.generateKeyPairSync('ed25519');
  let stored = options.stored;
  const manager = new RuntimePolicyManager(
    async () => (typeof fetchValue === 'function' ? fetchValue(pair) : fetchValue),
    {
      get: () => stored,
      set: (value) => {
        stored = value;
      },
    },
    {
      publicKeyDerBase64: pair.publicKey
        .export({ format: 'der', type: 'spki' })
        .toString('base64'),
      now: () => Date.parse('2026-07-19T12:00:00.000Z'),
      allowUnsignedLocalDevelopment: options.allowUnsignedLocalDevelopment,
    },
  );
  return { manager, pair, stored: () => stored };
}

test('accepts a valid signed policy and evaluates every block dimension', async () => {
  const fixture = setup(({ privateKey }) =>
    envelope(
      policy({
        blocks: {
          tools: ['claude'],
          toolVersions: [{ tool: 'codex', version: '26.blocked' }],
          surfaces: ['codex_vscode'],
          campaigns: ['campaign-a'],
        },
      }),
      privateKey,
    ),
  );
  assert.equal(await fixture.manager.refresh(), true);
  assert.equal(fixture.manager.canPatch({ tool: 'claude' }), false);
  assert.equal(fixture.manager.canPatch({ tool: 'codex', version: '26.blocked' }), false);
  assert.equal(fixture.manager.canPatch({ tool: 'codex' }), false);
  assert.equal(
    fixture.manager.canServe({ tool: 'codex', surface: 'codex_vscode' }),
    false,
  );
  assert.equal(fixture.manager.canServe({ tool: 'codex', campaignId: 'campaign-a' }), false);
  assert.equal(fixture.manager.canServe({ tool: 'codex', version: '26.ok' }), true);
});

test('rejects a modified or incorrectly signed policy', async () => {
  const fixture = setup(({ privateKey }) => {
    const signed = envelope(policy(), privateKey);
    signed.payload = Buffer.from(JSON.stringify(policy({ enabled: false }))).toString('base64url');
    return signed;
  });
  assert.equal(await fixture.manager.refresh(), false);
  assert.equal(fixture.manager.canPatch({ tool: 'codex' }), false);
  assert.match(fixture.manager.lastError, /signature/i);
});

test('rejects expired policy and fails closed', async () => {
  const fixture = setup(({ privateKey }) =>
    envelope(
      policy({ expiresAt: '2026-07-19T11:59:59.000Z' }),
      privateKey,
    ),
  );
  assert.equal(await fixture.manager.refresh(), false);
  assert.equal(fixture.manager.canServe({ tool: 'codex' }), false);
});

test('uses an unexpired last-known-good policy when refresh fails', async () => {
  const initial = setup(({ privateKey }) => envelope(policy(), privateKey));
  assert.equal(await initial.manager.refresh(), true);
  const cached = initial.stored();
  const fallback = setup(async () => {
    throw new Error('offline');
  }, { stored: cached });
  // The cache was signed with a different key, so use the original public key via a direct manager.
  let stored = cached;
  const manager = new RuntimePolicyManager(
    async () => { throw new Error('offline'); },
    { get: () => stored, set: (value) => { stored = value; } },
    {
      publicKeyDerBase64: initial.pair.publicKey
        .export({ format: 'der', type: 'spki' })
        .toString('base64'),
      now: () => Date.parse('2026-07-19T12:00:00.000Z'),
    },
  );
  assert.equal(fallback.manager.canPatch({ tool: 'codex' }), false);
  assert.equal(await manager.refresh(), true);
  assert.equal(manager.canPatch({ tool: 'codex' }), true);
  assert.equal(manager.lastError, 'offline');
});

test('loads a verified cache without waiting for the network', async () => {
  const initial = setup(({ privateKey }) => envelope(policy(), privateKey));
  assert.equal(await initial.manager.refresh(), true);
  let fetchCalls = 0;
  const manager = new RuntimePolicyManager(
    async () => {
      fetchCalls += 1;
      throw new Error('network must not be used by loadCached');
    },
    { get: () => initial.stored(), set: () => undefined },
    {
      publicKeyDerBase64: initial.pair.publicKey
        .export({ format: 'der', type: 'spki' })
        .toString('base64'),
      now: () => Date.parse('2026-07-19T12:00:00.000Z'),
    },
  );
  assert.equal(await manager.loadCached(), true);
  assert.equal(fetchCalls, 0);
  assert.equal(manager.canPatch({ tool: 'codex' }), true);
});

test('unsigned development policy is accepted only with explicit localhost mode', async () => {
  const development = policy({ environment: 'development' });
  const unsigned = {
    algorithm: 'none',
    keyId: 'local-development',
    payload: Buffer.from(JSON.stringify(development)).toString('base64url'),
    signature: '',
  };
  const accepted = setup(unsigned, { allowUnsignedLocalDevelopment: true });
  const rejected = setup(unsigned, { allowUnsignedLocalDevelopment: false });
  assert.equal(await accepted.manager.refresh(), true);
  assert.equal(await rejected.manager.refresh(), false);
  assert.equal(isLocalRuntimePolicyUrl('http://localhost:4000'), true);
  assert.equal(isLocalRuntimePolicyUrl('https://api.kodpauza.ru'), false);
});
