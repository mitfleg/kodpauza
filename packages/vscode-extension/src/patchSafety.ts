import * as fs from 'node:fs/promises';
import * as acorn from './vendor/acorn';

// Vendored during build so syntax validation also works in offline extension hosts.

export type PatchCompatibilityMode = 'exact' | 'structural' | 'unsupported';

export function assertJavaScriptParses(source: string, label: string): void {
  try {
    acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    return;
  } catch (scriptError) {
    try {
      acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
      return;
    } catch (moduleError) {
      throw new Error(
        `Сгенерированный патч ${label} не прошел синтаксическую проверку: ${errorMessage(moduleError ?? scriptError)}`
      );
    }
  }
}

export async function assertFilesUnchanged(
  files: readonly { filePath: string; expectedSource: string; label: string }[]
): Promise<void> {
  for (const file of files) {
    const current = await fs.readFile(file.filePath, 'utf8');
    if (current !== file.expectedSource) {
      throw new Error(`${file.label} изменился во время проверки. Патч не применен.`);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
