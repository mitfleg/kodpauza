const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  editorInstallMarkerKey,
  isNewerExtensionVersion,
  verifyExtensionUpdateEnvelope,
} = require('../dist/extensionUpdate.js');

const NOW = Date.parse('2026-07-20T12:00:00.000Z');

function payload(overrides = {}) {
  return {
    schemaVersion: 1,
    extensionId: 'kodpauza.kodpauza-vscode',
    version: '0.7.19',
    downloadUrl: 'https://api.kodpauza.ru/v1/extension/download/0.7.19',
    sha256: 'a'.repeat(64),
    issuedAt: new Date(NOW - 1_000).toISOString(),
    expiresAt: new Date(NOW + 15 * 60_000).toISOString(),
    ...overrides,
  };
}

function signedEnvelope(value, privateKey) {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return {
    algorithm: 'Ed25519',
    keyId: 'test-extension-update',
    payload: encoded,
    signature: crypto.sign(null, Buffer.from(encoded, 'utf8'), privateKey).toString('base64url'),
  };
}

test('accepts only a current signed manifest for the trusted VSIX URL', () => {
  const pair = crypto.generateKeyPairSync('ed25519');
  const verified = verifyExtensionUpdateEnvelope(signedEnvelope(payload(), pair.privateKey), {
    trustedBaseUrl: 'https://api.kodpauza.ru',
    publicKeyDerBase64: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    now: () => NOW,
  });
  assert.equal(verified.version, '0.7.19');
  assert.equal(verified.sha256, 'a'.repeat(64));
});

test('rejects a modified signature, external download URL and expired manifest', () => {
  const pair = crypto.generateKeyPairSync('ed25519');
  const options = {
    trustedBaseUrl: 'https://api.kodpauza.ru',
    publicKeyDerBase64: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    now: () => NOW,
  };
  const modified = signedEnvelope(payload(), pair.privateKey);
  modified.signature = modified.signature.slice(0, -2) + 'xx';
  assert.throws(() => verifyExtensionUpdateEnvelope(modified, options), /signature/i);
  assert.throws(
    () =>
      verifyExtensionUpdateEnvelope(
        signedEnvelope(
          payload({ downloadUrl: 'https://evil.example/kodpauza.vsix' }),
          pair.privateKey,
        ),
        options,
      ),
    /trusted/i,
  );
  assert.throws(
    () =>
      verifyExtensionUpdateEnvelope(
        signedEnvelope(payload({ expiresAt: new Date(NOW - 1).toISOString() }), pair.privateKey),
        options,
      ),
    /expired/i,
  );
});

test('compares stable versions and maps supported editor names', () => {
  assert.equal(isNewerExtensionVersion('0.7.19', '0.7.18'), true);
  assert.equal(isNewerExtensionVersion('0.7.18', '0.7.18'), false);
  assert.equal(isNewerExtensionVersion('0.6.99', '0.7.18'), false);
  assert.equal(isNewerExtensionVersion('invalid', '0.7.18'), false);
  assert.equal(editorInstallMarkerKey('Visual Studio Code'), 'vscode');
  assert.equal(editorInstallMarkerKey('Cursor'), 'cursor');
  assert.equal(editorInstallMarkerKey('VSCodium'), 'vscodium');
});
