import { SafeExtensionAdapter } from './safeExtensionAdapter';
import { ToolAdapter } from './types';

export function createToolAdapters(): ToolAdapter[] {
  return [
    new SafeExtensionAdapter({
      id: 'claude_code_vscode',
      name: 'Claude Code',
      extensionIdHints: ['claude'],
      knownVersions: ['2.1.207', '2.1.209', '2.1.212', '2.1.214', '2.1.238'],
      versionedPatch: true,
    }),
    new SafeExtensionAdapter({
      id: 'codex_vscode',
      name: 'Codex',
      extensionIdHints: ['openai.chatgpt', 'codex'],
      knownVersions: [],
      versionedPatch: true,
    }),
  ];
}
