import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const MAX_BIN_DEPTH = 3;

export async function findBundledCodexCli(
  extensionPath: string,
  platform = process.platform,
): Promise<string | undefined> {
  const binRoot = path.resolve(extensionPath, 'bin');
  const executableName = platform === 'win32' ? 'codex.exe' : 'codex';
  const candidates = await collectCandidates(binRoot, executableName, MAX_BIN_DEPTH);
  const preferredPlatform = platformPrefix(platform);
  return candidates
    .sort((left, right) => {
      const leftPreferred = path.basename(path.dirname(left)).startsWith(preferredPlatform) ? 0 : 1;
      const rightPreferred = path.basename(path.dirname(right)).startsWith(preferredPlatform) ? 0 : 1;
      return leftPreferred - rightPreferred || left.localeCompare(right);
    })[0];
}

async function collectCandidates(
  directory: string,
  executableName: string,
  depth: number,
): Promise<string[]> {
  if (depth < 0) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const candidates: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === executableName) {
      candidates.push(candidate);
      continue;
    }
    if (entry.isDirectory()) {
      candidates.push(...(await collectCandidates(candidate, executableName, depth - 1)));
    }
  }
  return candidates;
}

function platformPrefix(platform: NodeJS.Platform): string {
  if (platform === 'win32') return 'windows-';
  if (platform === 'darwin') return 'macos-';
  return `${platform}-`;
}
