export type IntegrationTool = 'codex' | 'claude';
export type UnsupportedVersionAttention = 'new_patch' | 'outdated_tool';

// Keep these values aligned with the newest exact patch profiles shipped by
// packages/vscode-extension. Structurally compatible versions are reported as
// supported by the extension and never reach this classifier.
export const latestExactIntegrationVersions: Record<IntegrationTool, string> = {
  codex: '26.721.41059',
  claude: '2.1.214',
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
