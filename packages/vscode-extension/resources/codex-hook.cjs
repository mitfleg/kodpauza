'use strict';

const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const requestedTool = process.argv[2] === 'claude' ? 'claude' : 'codex';
const event = requestedTool === 'claude' ? process.argv[3] : process.argv[2];
const isStop = event === 'stop';
const isSupported = event === 'start' || isStop;
const DESCRIPTOR_TTL_MS = 90_000;
const REQUEST_TIMEOUT_MS = 250;

let finished = false;
function debug(message) {
  if (process.env.KODPAUZA_HOOK_DEBUG === '1') process.stderr.write(`[kodpauza-hook] ${message}\n`);
}

function finish() {
  if (finished) return;
  finished = true;
  if (isStop) process.stdout.write('{}\n');
}

async function main() {
  if (!isSupported) return;
  const home = process.env.KODPAUZA_HOME || path.join(os.homedir(), '.kodpauza');
  const bridgesDirectory = path.join(home, 'bridges');
  const descriptors = await readDescriptors(bridgesDirectory);
  const cwd = await canonicalPath(process.cwd());
  debug(`descriptors=${descriptors.length} cwd=${cwd}`);
  const descriptor = selectDescriptor(descriptors, cwd);
  if (!descriptor) {
    debug('matching descriptor not found');
    return;
  }
  debug(`sending ${event} to port ${descriptor.port}`);
  await postLifecycle(descriptor, { version: 1, event, cwd });
}

async function readDescriptors(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const now = Date.now();
  const values = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map(async (entry) => {
      try {
        const raw = await fs.readFile(path.join(directory, entry.name), 'utf8');
        if (raw.length > 16_384) return null;
        const value = JSON.parse(raw);
        const updatedAt = Date.parse(value.updatedAt);
        if (
          value.version !== 1 ||
          typeof value.instanceId !== 'string' || value.instanceId.length === 0 ||
          !Number.isInteger(value.port) || value.port < 1 || value.port > 65_535 ||
          typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token) ||
          !Array.isArray(value.workspaceRoots) ||
          !Number.isFinite(updatedAt) || now - updatedAt > DESCRIPTOR_TTL_MS
        ) return null;
        const workspaceRoots = await Promise.all(value.workspaceRoots
          .filter((root) => typeof root === 'string')
          .map(canonicalPath));
        return { ...value, workspaceRoots, updatedAtMs: updatedAt };
      } catch {
        return null;
      }
    }));
  return values.filter(Boolean);
}

function selectDescriptor(descriptors, cwd) {
  const matches = descriptors
    .map((descriptor) => ({
      descriptor,
      matchLength: descriptor.workspaceRoots.reduce((longest, root) => {
        if (typeof root !== 'string' || !isWithin(cwd, root)) return longest;
        return Math.max(longest, path.resolve(root).length);
      }, -1)
    }))
    .filter((candidate) => candidate.matchLength >= 0)
    .sort((left, right) =>
      right.matchLength - left.matchLength || left.descriptor.instanceId.localeCompare(right.descriptor.instanceId));
  if (matches.length > 0) return matches[0].descriptor;

  return descriptors
    .filter((descriptor) => descriptor.workspaceRoots.length === 0)
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId))[0];
}

function isWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function canonicalPath(value) {
  try {
    return await fs.realpath(value);
  } catch {
    return path.resolve(value);
  }
}

function postLifecycle(descriptor, payload) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify(payload));
    const request = http.request({
      host: '127.0.0.1',
      port: descriptor.port,
      path: `/v1/${requestedTool}/lifecycle`,
      method: 'POST',
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        'content-type': 'application/json',
        'content-length': body.length
      },
      timeout: REQUEST_TIMEOUT_MS
    }, (response) => {
      response.resume();
      response.once('end', resolve);
    });
    request.once('timeout', () => {
      request.destroy();
      resolve();
    });
    request.once('error', resolve);
    request.end(body);
  });
}

const run = () => void main().catch((error) => debug(error instanceof Error ? error.message : String(error))).finally(finish);
if (process.stdin.isTTY) {
  run();
} else {
  process.stdin.on('data', () => {});
  process.stdin.once('error', finish);
  process.stdin.once('end', run);
  process.stdin.resume();
}
