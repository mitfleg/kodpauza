export type FleetInstallSnapshot = {
  extensionVersion: string | null;
  vscodeVersion: string | null;
  editorName?: string | null;
  os: string | null;
  integrationsEnabled: boolean;
  codexDetected: boolean;
  claudeDetected: boolean;
  codexPatchStatus?: string | null;
  claudePatchStatus?: string | null;
  lastSeenAt: Date;
};

export type FleetHealth = 'active' | 'degraded' | 'stale';

const staleAfterMs = 24 * 60 * 60 * 1_000;

export function classifyFleetInstall(
  install: FleetInstallSnapshot,
  now = new Date(),
): FleetHealth {
  if (now.getTime() - install.lastSeenAt.getTime() > staleAfterMs) return 'stale';
  if (
    (install.codexDetected && isDegradedPatch(install.codexPatchStatus)) ||
    (install.claudeDetected && isDegradedPatch(install.claudePatchStatus))
  ) {
    return 'degraded';
  }
  if (
    !install.extensionVersion ||
    !install.integrationsEnabled ||
    (!install.codexDetected && !install.claudeDetected)
  ) {
    return 'degraded';
  }
  return 'active';
}

function isDegradedPatch(status: string | null | undefined) {
  return status === 'not_installed' || status === 'unsupported' || status === 'error';
}

export function aggregateFleet(installs: FleetInstallSnapshot[], now = new Date()) {
  const counts = { total: installs.length, active: 0, degraded: 0, stale: 0 };
  const versions = new Map<string, number>();
  const editors = new Map<string, number>();
  const tools = { codex: 0, claude: 0 };

  for (const install of installs) {
    counts[classifyFleetInstall(install, now)] += 1;
    const version = install.extensionVersion?.trim() || 'unknown';
    versions.set(version, (versions.get(version) ?? 0) + 1);
    const editor = editorFamily(install.editorName, install.vscodeVersion);
    editors.set(editor, (editors.get(editor) ?? 0) + 1);
    if (install.codexDetected) tools.codex += 1;
    if (install.claudeDetected) tools.claude += 1;
  }

  const ranked = (values: Map<string, number>) =>
    Array.from(values, ([name, count]) => ({ name, count })).sort(
      (left, right) => right.count - left.count || left.name.localeCompare(right.name),
    );

  return { counts, versions: ranked(versions), editors: ranked(editors), tools };
}

function editorFamily(editorName: string | null | undefined, vscodeVersion: string | null) {
  const value = `${editorName?.trim() ?? ''} ${vscodeVersion?.trim() ?? ''}`.trim();
  if (/cursor/i.test(value)) return 'Cursor';
  if (/windsurf/i.test(value)) return 'Windsurf';
  return value ? 'VS Code compatible' : 'unknown';
}
