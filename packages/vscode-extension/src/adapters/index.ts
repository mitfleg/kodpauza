import { SafeExtensionAdapter } from './safeExtensionAdapter';
import { ToolAdapter } from './types';

export function createToolAdapters(): ToolAdapter[] {
  return [
    new SafeExtensionAdapter({
      id: 'claude_code_vscode',
      name: 'Claude Code',
      extensionIdHints: ['claude'],
      knownVersions: [
        '2.1.207',
        '2.1.209',
        '2.1.212',
        '2.1.214',
        '2.1.238',
        '2.1.239',
        '2.1.241',
        '2.1.245',
        '2.1.246',
        '2.1.247',
        '2.1.250',
        '2.1.251',
        '2.1.258',
        '2.1.259',
      ],
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
