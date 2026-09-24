export type IntegrationTool = 'codex' | 'claude';
export type UnsupportedVersionAttention = 'new_patch' | 'outdated_tool';

export type ClassifiedIntegrationVersionReport = {
  id: string;
  tool: string;
  version: string;
  supported: boolean;
  compatibilityMode: string;
  attention: UnsupportedVersionAttention;
  acknowledgedAt: Date | null;
  lastSeenAt: Date;
};

// Keep these values aligned with the newest exact patch profiles shipped by
// packages/vscode-extension. Structurally compatible versions are reported as
// supported by the extension and never reach this classifier.
export const latestExactIntegrationVersions: Record<IntegrationTool, string> = {
  codex: '26.917.62051',
  claude: '2.1.281',
};

export function classifyUnsupportedIntegrationVersion(
  tool: IntegrationTool,
  version: string,
): {
  attention: UnsupportedVersionAttention;
  latestExactVersion: string;
} {
  const latestExactVersion = latestExactIntegrationVersions[tool];
  return {
    attention:
      compareNumericVersions(version, latestExactVersion) > 0 ? 'new_patch' : 'outdated_tool',
    latestExactVersion,
  };
}

export function compareIntegrationVersionReports(
  left: ClassifiedIntegrationVersionReport,
  right: ClassifiedIntegrationVersionReport,
): number {
  const priorityDifference = integrationVersionPriority(left) - integrationVersionPriority(right);
  if (priorityDifference !== 0) return priorityDifference;

  const lastSeenDifference = right.lastSeenAt.getTime() - left.lastSeenAt.getTime();
  if (lastSeenDifference !== 0) return lastSeenDifference;

  const toolDifference = left.tool.localeCompare(right.tool);
  if (toolDifference !== 0) return toolDifference;

  const versionDifference = compareNumericVersions(right.version, left.version);
  if (versionDifference !== 0) return versionDifference;
  return left.id.localeCompare(right.id);
}

function integrationVersionPriority(report: ClassifiedIntegrationVersionReport): number {
  if (!report.supported && !report.acknowledgedAt) {
    return report.attention === 'new_patch' ? 0 : 1;
  }
  if (report.supported) return 2;
  return 3;
}

function compareNumericVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}
