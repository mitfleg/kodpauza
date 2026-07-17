import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { defaultKodpauzaHome } from './codexHookInstaller';
import {
  assertFilesUnchanged,
  assertJavaScriptParses,
  PatchCompatibilityMode
} from './patchSafety';
import { webviewVisibilityRuntime } from './uiVisibilityRuntime';

export const CODEX_UI_BRIDGE_PORT = 37_491;

const PATCH_STATE_FILE = 'codex-ui-patch.json';
const PATCH_REVISION = 5;
const UI_MARKER_PREFIX = '/*__KODPAUZA_UI_START__:';
const UI_MARKER_END = '/*__KODPAUZA_UI_END__*/';
const CSP_MARKER_START = '/*__KODPAUZA_CSP_START__*/';
const CSP_MARKER_END = '/*__KODPAUZA_CSP_END__*/';
const MAX_PATCH_FILE_BYTES = 4 * 1024 * 1024;

export type CodexSupportedBuild = {
  version: string;
  hostSha256: string;
  webviewSha256: string;
  patchProfile?: CodexPatchProfile;
  shimmerSha256?: string;
  shimmerPatchProfile?: CodexShimmerPatchProfile;
};

export type CodexPatchProfile = {
  reactAnchor: string;
  reactIdentifier: string;
  jsxIdentifier: string;
  intlIdentifier: string;
  thinkingCount: number;
  thinkingDescriptorIdentifier?: string;
  thinkingDescriptorCount?: number;
  exploringChildrenIdentifier: string;
  hostAnchor: string;
};

export type CodexShimmerPatchProfile = {
  reactAnchor: string;
  reactIdentifier: string;
  jsxIdentifier: string;
  intlIdentifier: string;
};

export const LEGACY_CODEX_PATCH_PROFILE: CodexPatchProfile = {
  reactAnchor: 'var X=e(r()),Po=',
  reactIdentifier: 'X',
  jsxIdentifier: 'Y',
  intlIdentifier: 'K',
  thinkingCount: 4,
  exploringChildrenIdentifier: 'Dd',
  hostAnchor: 'let n=[t,r,...b8e,...v8e];'
};

export const CODEX_26_707_PATCH_PROFILE: CodexPatchProfile = {
  reactAnchor: 'var $=e(t(),1),Ua=',
  reactIdentifier: '$',
  jsxIdentifier: 'Q',
  intlIdentifier: 'Y',
  thinkingCount: 5,
  thinkingDescriptorIdentifier: 'Gm',
  thinkingDescriptorCount: 3,
  exploringChildrenIdentifier: 'Of',
  hostAnchor: 'let n=[t,r,...jYe,...HYe];'
};

export const CODEX_26_707_91948_PATCH_PROFILE: CodexPatchProfile = {
  ...CODEX_26_707_PATCH_PROFILE,
  reactAnchor: 'var $=e(t(),1),Wa=',
  exploringChildrenIdentifier: 'kf'
};

export const CODEX_26_707_SHIMMER_PATCH_PROFILE: CodexShimmerPatchProfile = {
  reactAnchor: 'var c=e(t(),1),l=',
  reactIdentifier: 'c',
  jsxIdentifier: 'f',
  intlIdentifier: 'i'
};

const SUPPORTED_BUILDS: readonly CodexSupportedBuild[] = [
  {
    version: '26.623.141536',
    hostSha256: '50e1c9e90d8575515b0f169abddabd00bd5aae2989df38a3b4c6bc6e2e74d445',
    webviewSha256: '75fb9945bd4c268d5505cd35dea8e03eaf46c0f050cabec778afdcbe8257e05a',
    patchProfile: LEGACY_CODEX_PATCH_PROFILE
  },
  {
    version: '26.707.71524',
    hostSha256: 'bd000a4ac75e947bf81f10201b6d771f1255180f8f1efc4165b7f755ebdc420d',
    webviewSha256: '2942b7b29ab998b72680e499369bb6f17aaddd689ee29581d7261237bbb6876d',
    patchProfile: CODEX_26_707_PATCH_PROFILE,
    shimmerSha256: '4c91733cbf4948b50b02c6bc3a6590e7ed218e21e8dfbddc5cd1a3f3d955a140',
    shimmerPatchProfile: CODEX_26_707_SHIMMER_PATCH_PROFILE
  },
  {
    version: '26.707.91948',
    hostSha256: 'bd000a4ac75e947bf81f10201b6d771f1255180f8f1efc4165b7f755ebdc420d',
    webviewSha256: '6604a581f475f86e1cb65108e5accc38cd9694232f8297216e6ac631e16ee50f',
    patchProfile: CODEX_26_707_91948_PATCH_PROFILE,
    shimmerSha256: '4eebc888d5fed0f4ee4aeba142c6296d32dcb4bbbe136bbb710fdc03a0b00dca',
    shimmerPatchProfile: CODEX_26_707_SHIMMER_PATCH_PROFILE
  }
] as const;

type PatchFileRecord = {
  relativePath: string;
  backupPath: string;
  originalSha256: string;
};

type PatchManifest = {
  version: 1;
  patchRevision?: number;
  codexVersion: string;
  compatibilityMode?: Exclude<PatchCompatibilityMode, 'unsupported'>;
  extensionPath: string;
  token: string;
  port: number;
  createdAt: string;
  files: PatchFileRecord[];
};

export type CodexPatchStatus = {
  installed: boolean;
  compatible: boolean;
  compatibilityMode: PatchCompatibilityMode;
  codexVersion: string;
  token?: string;
  hostPath?: string;
  webviewPath?: string;
  shimmerPath?: string;
};

type PatchPaths = {
  hostPath: string;
  webviewPath: string;
  shimmerPath?: string;
};

type CodexSourceCandidates = {
  hostPath: string;
  webviewPath: string;
  shimmerPath?: string;
  hostSource: string;
  webviewSource: string;
  shimmerSource?: string;
};

export type CodexPatchMutationResult = CodexPatchStatus & {
  changed: boolean;
  backupDirectory?: string;
};

class PartialPatchError extends Error {
  constructor() {
    super('Патч Codex применен частично. Восстановите резервную копию Kodpauza.');
    this.name = 'PartialPatchError';
  }
}

class OutdatedPatchError extends Error {
  constructor() {
    super('UI-патч Codex требует безопасного обновления.');
    this.name = 'OutdatedPatchError';
  }
}

export class CodexPatchInstaller {
  private readonly statePath: string;
  private supportedBuild?: CodexSupportedBuild;
  private compatibilityMode: PatchCompatibilityMode;

  constructor(
    private readonly extensionPath: string,
    private readonly codexVersion: string,
    private readonly kodpauzaHome = defaultKodpauzaHome(),
    supportedBuild?: CodexSupportedBuild
  ) {
    this.statePath = path.join(kodpauzaHome, PATCH_STATE_FILE);
    this.supportedBuild = supportedBuild ?? SUPPORTED_BUILDS.find((build) => build.version === codexVersion);
    this.compatibilityMode = this.supportedBuild ? 'exact' : 'unsupported';
  }

  async inspect(): Promise<CodexPatchStatus> {
    const manifest = await readManifest(this.statePath);
    if (manifest && path.resolve(manifest.extensionPath) === path.resolve(this.extensionPath)) {
      const installed = await this.inspectManifestInstallation(manifest);
      if (installed) {
        return installed;
      }
    }

    const candidates = await this.readSourceCandidates(false);
    if (!candidates) {
      return {
        installed: false,
        compatible: false,
        compatibilityMode: 'unsupported',
        codexVersion: this.codexVersion
      };
    }

    const rawPatchStates = [
      candidates.hostSource.includes(CSP_MARKER_START),
      candidates.webviewSource.includes(UI_MARKER_PREFIX),
      ...(candidates.shimmerSource?.includes(UI_MARKER_PREFIX) ? [true] : [])
    ];
    if (rawPatchStates.some(Boolean)) {
      throw new PartialPatchError();
    }

    this.resolveCompatibleBuild(candidates);
    const paths: PatchPaths = {
      hostPath: candidates.hostPath,
      webviewPath: candidates.webviewPath,
      ...(this.supportedBuild?.shimmerPatchProfile && candidates.shimmerPath
        ? { shimmerPath: candidates.shimmerPath }
        : {})
    };

    return {
      installed: false,
      compatible: Boolean(this.supportedBuild),
      compatibilityMode: this.compatibilityMode,
      codexVersion: this.codexVersion,
      ...paths
    };
  }

  async install(): Promise<CodexPatchMutationResult> {
    const current = await this.inspect();
    if (current.installed) {
      return { ...current, changed: false };
    }
    if (!current.compatible) {
      throw new Error(`Версия Codex ${this.codexVersion} изменила структуру UI. Реклама безопасно отключена.`);
    }
    const supportedBuild = this.supportedBuild;
    if (!supportedBuild) {
      throw new Error(`Версия Codex ${this.codexVersion} пока не поддерживается патчем Kodpauza.`);
    }

    const paths = await this.resolvePatchPaths(true);
    const [hostSource, webviewSource, shimmerSource] = await Promise.all([
      readTextFile(paths.hostPath),
      readTextFile(paths.webviewPath),
      paths.shimmerPath ? readTextFile(paths.shimmerPath) : undefined
    ]);
    assertOriginalHash(paths.hostPath, hostSource, supportedBuild.hostSha256);
    assertOriginalHash(paths.webviewPath, webviewSource, supportedBuild.webviewSha256);
    if (supportedBuild.shimmerPatchProfile) {
      if (!paths.shimmerPath || !shimmerSource || !supportedBuild.shimmerSha256) {
        throw new Error('Профиль патча Codex не содержит проверенный модуль строки ожидания.');
      }
      assertOriginalHash(paths.shimmerPath, shimmerSource, supportedBuild.shimmerSha256);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const patchProfile = supportedBuild.patchProfile ?? LEGACY_CODEX_PATCH_PROFILE;
    const patchedHost = patchHostSource(hostSource, patchProfile);
    const patchedWebview = patchWebviewSource(webviewSource, token, patchProfile);
    const patchedShimmer = supportedBuild.shimmerPatchProfile && shimmerSource
      ? patchThinkingShimmerSource(shimmerSource, token, supportedBuild.shimmerPatchProfile)
      : undefined;
    assertJavaScriptParses(patchedHost, 'Codex out/extension.js');
    assertJavaScriptParses(patchedWebview, 'Codex local-conversation-turn.js');
    if (patchedShimmer) {
      assertJavaScriptParses(patchedShimmer, 'Codex thinking-shimmer.js');
    }
    const backupDirectory = await this.createBackup(paths);
    const files = [
      backupRecord(this.extensionPath, paths.hostPath, path.join(backupDirectory, 'extension.js'), hostSource),
      backupRecord(
        this.extensionPath,
        paths.webviewPath,
        path.join(backupDirectory, path.basename(paths.webviewPath)),
        webviewSource
      )
    ];
    if (paths.shimmerPath && shimmerSource) {
      files.push(backupRecord(
        this.extensionPath,
        paths.shimmerPath,
        path.join(backupDirectory, path.basename(paths.shimmerPath)),
        shimmerSource
      ));
    }
    const manifest: PatchManifest = {
      version: 1,
      patchRevision: PATCH_REVISION,
      codexVersion: this.codexVersion,
      compatibilityMode: this.compatibilityMode === 'structural' ? 'structural' : 'exact',
      extensionPath: this.extensionPath,
      token,
      port: CODEX_UI_BRIDGE_PORT,
      createdAt: new Date().toISOString(),
      files
    };

    await fs.mkdir(this.kodpauzaHome, { recursive: true, mode: 0o700 });
    await atomicWrite(this.statePath, `${JSON.stringify(manifest, null, 2)}\n`, 0o600);
    try {
      await assertFilesUnchanged([
        { filePath: paths.hostPath, expectedSource: hostSource, label: 'Codex out/extension.js' },
        { filePath: paths.webviewPath, expectedSource: webviewSource, label: 'Codex local-conversation-turn.js' },
        ...(paths.shimmerPath && shimmerSource
          ? [{ filePath: paths.shimmerPath, expectedSource: shimmerSource, label: 'Codex thinking-shimmer.js' }]
          : [])
      ]);
      if (paths.shimmerPath && patchedShimmer) {
        await atomicWritePreservingMode(paths.shimmerPath, patchedShimmer);
      }
      await atomicWritePreservingMode(paths.webviewPath, patchedWebview);
      await atomicWritePreservingMode(paths.hostPath, patchedHost);
      await assertPatchedFiles([
        { filePath: paths.hostPath, expectedSource: patchedHost, label: 'Codex out/extension.js' },
        { filePath: paths.webviewPath, expectedSource: patchedWebview, label: 'Codex local-conversation-turn.js' },
        ...(paths.shimmerPath && patchedShimmer
          ? [{ filePath: paths.shimmerPath, expectedSource: patchedShimmer, label: 'Codex thinking-shimmer.js' }]
          : [])
      ]);
    } catch (error) {
      await this.restoreFromManifest(manifest).catch(() => undefined);
      throw error;
    }

    return {
      installed: true,
      compatible: true,
      compatibilityMode: this.compatibilityMode,
      codexVersion: this.codexVersion,
      token,
      ...paths,
      changed: true,
      backupDirectory
    };
  }

  async ensureInstalled(): Promise<CodexPatchMutationResult> {
    await this.reconcilePreviousInstallation();
    try {
      const current = await this.inspect();
      if (current.installed || !current.compatible) {
        return { ...current, changed: false };
      }
      return await this.install();
    } catch (error) {
      if (!(error instanceof PartialPatchError) && !(error instanceof OutdatedPatchError)) {
        throw error;
      }

      const manifest = await readManifest(this.statePath);
      if (!manifest || path.resolve(manifest.extensionPath) !== path.resolve(this.extensionPath)) {
        throw error;
      }
      await this.assertManifestCanBeRestored(manifest);
      await this.restoreFromManifest(manifest);
      await fs.rm(this.statePath, { force: true });
      return this.install();
    }
  }

  async restore(): Promise<CodexPatchMutationResult> {
    const manifest = await readManifest(this.statePath);
    if (!manifest) {
      const current = await this.inspect();
      if (current.installed) {
        throw new Error('Не найдена резервная копия файлов Codex. Автоматический откат остановлен.');
      }
      return { ...current, changed: false };
    }

    if (path.resolve(manifest.extensionPath) !== path.resolve(this.extensionPath)) {
      throw new Error('Резервная копия относится к другой установке Codex.');
    }
    let current: CodexPatchStatus;
    try {
      current = await this.inspect();
    } catch {
      await this.restoreFromManifest(manifest);
      await fs.rm(this.statePath, { force: true });
      return {
        installed: false,
        compatible: Boolean(this.supportedBuild),
        compatibilityMode: this.compatibilityMode,
        codexVersion: this.codexVersion,
        changed: true
      };
    }
    if (!current.installed) {
      await fs.rm(this.statePath, { force: true });
      return { ...current, changed: false };
    }

    await this.restoreFromManifest(manifest);
    await fs.rm(this.statePath, { force: true });
    return {
      installed: false,
      compatible: Boolean(this.supportedBuild),
      compatibilityMode: this.compatibilityMode,
      codexVersion: this.codexVersion,
      changed: true
    };
  }

  private async inspectManifestInstallation(manifest: PatchManifest): Promise<CodexPatchStatus | undefined> {
    const extensionRoot = path.resolve(this.extensionPath);
    const sources = await Promise.all(manifest.files.map(async (file) => {
      const filePath = path.resolve(extensionRoot, file.relativePath);
      if (!isPathInside(extensionRoot, filePath)) {
        throw new Error('Манифест патча Codex указывает за пределы расширения.');
      }
      return { filePath, source: await readTextFile(filePath) };
    }));
    const states = sources.map(({ filePath, source }) => path.basename(filePath) === 'extension.js'
      ? source.includes(CSP_MARKER_START) && source.includes(CSP_MARKER_END)
      : Boolean(extractToken(source)) && source.includes(UI_MARKER_END));
    if (states.some(Boolean) && !states.every(Boolean)) {
      throw new PartialPatchError();
    }
    if (!states.every(Boolean)) {
      return undefined;
    }

    const uiTokens = sources
      .filter(({ filePath }) => path.basename(filePath) !== 'extension.js')
      .map(({ source }) => extractToken(source));
    if (uiTokens.length === 0 || uiTokens.some((token) => token !== manifest.token)) {
      throw new Error('UI-патч Codex не соответствует защищенному манифесту Kodpauza.');
    }
    if ((manifest.patchRevision ?? 1) !== PATCH_REVISION) {
      throw new OutdatedPatchError();
    }
    const hostPath = sources.find(({ filePath }) => path.basename(filePath) === 'extension.js')?.filePath;
    const webviewPath = sources.find(({ filePath }) => /^local-conversation-turn-/.test(path.basename(filePath)))?.filePath;
    const shimmerPath = sources.find(({ filePath }) => /^thinking-shimmer-/.test(path.basename(filePath)))?.filePath;
    if (!hostPath || !webviewPath) {
      throw new Error('Манифест патча Codex не содержит обязательные файлы.');
    }
    this.compatibilityMode = manifest.compatibilityMode ?? 'exact';
    return {
      installed: true,
      compatible: true,
      compatibilityMode: this.compatibilityMode,
      codexVersion: this.codexVersion,
      token: manifest.token,
      hostPath,
      webviewPath,
      shimmerPath
    };
  }

  private async readSourceCandidates(required: true): Promise<CodexSourceCandidates>;
  private async readSourceCandidates(required: false): Promise<CodexSourceCandidates | undefined>;
  private async readSourceCandidates(required: boolean): Promise<CodexSourceCandidates | undefined> {
    const hostPath = path.join(this.extensionPath, 'out', 'extension.js');
    const assetsDirectory = path.join(this.extensionPath, 'webview', 'assets');
    const entries = await fs.readdir(assetsDirectory, { withFileTypes: true }).catch(() => []);
    const webviewCandidates = entries
      .filter((entry) => entry.isFile() && /^local-conversation-turn-[A-Za-z0-9_-]+\.js$/.test(entry.name))
      .map((entry) => path.join(assetsDirectory, entry.name));
    const shimmerCandidates = entries
      .filter((entry) => entry.isFile() && /^thinking-shimmer-[A-Za-z0-9_-]+\.js$/.test(entry.name))
      .map((entry) => path.join(assetsDirectory, entry.name));
    if (
      webviewCandidates.length !== 1 ||
      shimmerCandidates.length > 1 ||
      !(await fileExists(hostPath))
    ) {
      if (required) {
        throw new Error('Структура установленного расширения Codex не распознана. Файлы не изменены.');
      }
      return undefined;
    }
    const webviewPath = webviewCandidates[0];
    const shimmerPath = shimmerCandidates[0];
    const [hostSource, webviewSource, shimmerSource] = await Promise.all([
      readTextFile(hostPath),
      readTextFile(webviewPath),
      shimmerPath ? readTextFile(shimmerPath) : undefined
    ]);
    return { hostPath, webviewPath, shimmerPath, hostSource, webviewSource, shimmerSource };
  }

  private resolveCompatibleBuild(candidates: CodexSourceCandidates): void {
    const currentBuild = this.supportedBuild;
    if (currentBuild && codexBuildHashesMatch(currentBuild, candidates)) {
      this.compatibilityMode = 'exact';
      return;
    }

    const profiles = uniqueCodexProfiles([
      ...(currentBuild ? [currentBuild] : []),
      ...SUPPORTED_BUILDS
    ]);
    const matches = profiles.filter((profile) => {
      try {
        const token = '0'.repeat(64);
        const patchedHost = patchHostSource(candidates.hostSource, profile.patchProfile);
        const patchedWebview = patchWebviewSource(candidates.webviewSource, token, profile.patchProfile);
        assertJavaScriptParses(patchedHost, 'Codex out/extension.js');
        assertJavaScriptParses(patchedWebview, 'Codex local-conversation-turn.js');
        if (profile.shimmerPatchProfile) {
          if (!candidates.shimmerSource) {
            return false;
          }
          const patchedShimmer = patchThinkingShimmerSource(
            candidates.shimmerSource,
            token,
            profile.shimmerPatchProfile
          );
          assertJavaScriptParses(patchedShimmer, 'Codex thinking-shimmer.js');
        } else if (candidates.shimmerSource?.includes('thinkingShimmer.default')) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    });

    if (matches.length !== 1) {
      this.supportedBuild = undefined;
      this.compatibilityMode = 'unsupported';
      return;
    }
    const match = matches[0];
    this.supportedBuild = {
      version: this.codexVersion,
      hostSha256: sha256(candidates.hostSource),
      webviewSha256: sha256(candidates.webviewSource),
      patchProfile: match.patchProfile,
      ...(match.shimmerPatchProfile && candidates.shimmerSource
        ? {
            shimmerSha256: sha256(candidates.shimmerSource),
            shimmerPatchProfile: match.shimmerPatchProfile
          }
        : {})
    };
    this.compatibilityMode = 'structural';
  }

  private async resolvePatchPaths(required: true): Promise<PatchPaths>;
  private async resolvePatchPaths(required: false): Promise<PatchPaths | undefined>;
  private async resolvePatchPaths(required: boolean): Promise<PatchPaths | undefined> {
    const hostPath = path.join(this.extensionPath, 'out', 'extension.js');
    const assetsDirectory = path.join(this.extensionPath, 'webview', 'assets');
    const entries = await fs.readdir(assetsDirectory, { withFileTypes: true }).catch(() => []);
    const webviewCandidates = entries
      .filter((entry) => entry.isFile() && /^local-conversation-turn-[A-Za-z0-9_-]+\.js$/.test(entry.name))
      .map((entry) => path.join(assetsDirectory, entry.name));
    const shimmerCandidates = entries
      .filter((entry) => entry.isFile() && /^thinking-shimmer-[A-Za-z0-9_-]+\.js$/.test(entry.name))
      .map((entry) => path.join(assetsDirectory, entry.name));
    const shimmerRequired = Boolean(this.supportedBuild?.shimmerPatchProfile);

    if (
      webviewCandidates.length !== 1 ||
      (shimmerRequired && shimmerCandidates.length !== 1) ||
      !(await fileExists(hostPath))
    ) {
      if (required) {
        throw new Error('Структура установленного расширения Codex не распознана. Файлы не изменены.');
      }
      return undefined;
    }
    return {
      hostPath,
      webviewPath: webviewCandidates[0],
      shimmerPath: shimmerRequired ? shimmerCandidates[0] : undefined
    };
  }

  private async createBackup(paths: PatchPaths): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDirectory = path.join(this.kodpauzaHome, 'backups', `codex-ui-${this.codexVersion}-${timestamp}`);
    await fs.mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    const backupOperations = [
      fs.copyFile(paths.hostPath, path.join(backupDirectory, 'extension.js')),
      fs.copyFile(paths.webviewPath, path.join(backupDirectory, path.basename(paths.webviewPath)))
    ];
    if (paths.shimmerPath) {
      backupOperations.push(
        fs.copyFile(paths.shimmerPath, path.join(backupDirectory, path.basename(paths.shimmerPath)))
      );
    }
    await Promise.all(backupOperations);
    return backupDirectory;
  }

  private async reconcilePreviousInstallation(): Promise<void> {
    const manifest = await readManifest(this.statePath);
    if (!manifest || path.resolve(manifest.extensionPath) === path.resolve(this.extensionPath)) {
      return;
    }

    const targetPaths = manifest.files.map((file) =>
      path.resolve(manifest.extensionPath, file.relativePath)
    );
    const targetExists = await Promise.all(targetPaths.map(fileExists));
    if (targetExists.every((exists) => !exists)) {
      await fs.rm(this.statePath, { force: true });
      return;
    }
    if (!targetExists.every(Boolean)) {
      throw new Error('Предыдущий патч Codex найден частично. Автоматическое обновление остановлено.');
    }

    await this.assertManifestCanBeRestored(manifest);
    await this.restoreFromManifest(manifest);
    await fs.rm(this.statePath, { force: true });
  }

  private async assertManifestCanBeRestored(manifest: PatchManifest): Promise<void> {
    const extensionRoot = path.resolve(manifest.extensionPath);
    for (const file of manifest.files) {
      const targetPath = path.resolve(extensionRoot, file.relativePath);
      if (!isPathInside(extensionRoot, targetPath)) {
        throw new Error('Файл предыдущего патча находится за пределами расширения Codex.');
      }
      const current = await fs.readFile(targetPath);
      const source = current.toString('utf8');
      const isOriginal = sha256(current) === file.originalSha256;
      const isKodpauzaPatch = path.basename(targetPath) === 'extension.js'
        ? source.includes(CSP_MARKER_START) && source.includes(CSP_MARKER_END)
        : source.includes(UI_MARKER_PREFIX) && source.includes(UI_MARKER_END);
      if (!isOriginal && !isKodpauzaPatch) {
        throw new Error(`Файл Codex ${path.basename(targetPath)} изменен после установки. Автоматическое восстановление остановлено.`);
      }
    }
  }

  private async restoreFromManifest(manifest: PatchManifest): Promise<void> {
    const extensionRoot = path.resolve(manifest.extensionPath);
    const backupRoot = path.resolve(this.kodpauzaHome, 'backups');
    for (const file of manifest.files) {
      const targetPath = path.resolve(extensionRoot, file.relativePath);
      if (!isPathInside(extensionRoot, targetPath)) {
        throw new Error('Файл резервной копии указывает за пределы установленного расширения Codex.');
      }
      const backupPath = path.resolve(file.backupPath);
      if (!isPathInside(backupRoot, backupPath)) {
        throw new Error('Резервная копия находится за пределами каталога Kodpauza.');
      }
      const backup = await fs.readFile(backupPath);
      if (sha256(backup) !== file.originalSha256) {
        throw new Error(`Резервная копия ${path.basename(file.backupPath)} повреждена.`);
      }
      await atomicWritePreservingMode(targetPath, backup);
    }
  }
}

export function patchWebviewSource(
  source: string,
  token: string,
  profile: CodexPatchProfile = LEGACY_CODEX_PATCH_PROFILE
): string {
  validateToken(token);
  if (source.includes(UI_MARKER_PREFIX)) {
    throw new Error('UI-патч Kodpauza уже присутствует в файле Codex.');
  }

  validatePatchProfile(profile);
  const anchor = profile.reactAnchor;
  const injected = `${uiRuntime(token, profile)}${anchor}`;
  let patched = replaceExact(source, anchor, injected, 1, 'точка подключения React');

  const jsx = profile.jsxIdentifier;
  const intl = profile.intlIdentifier;
  const thinkingFallback = `(0,${jsx}.jsx)(${intl},{id:\`thinkingShimmer.default\`,defaultMessage:\`Thinking\`,description:\`Default placeholder shown while the assistant is thinking\`})`;
  patched = replaceExact(
    patched,
    thinkingFallback,
    `(0,${jsx}.jsx)(__kpAdMessage,{fallback:${thinkingFallback}})`,
    profile.thinkingCount,
    'активные строки Thinking'
  );

  if (profile.thinkingDescriptorIdentifier) {
    const descriptorFallback = `(0,${jsx}.jsx)(${intl},{...${profile.thinkingDescriptorIdentifier}.thinking})`;
    patched = replaceExact(
      patched,
      descriptorFallback,
      `(0,${jsx}.jsx)(__kpAdMessage,{fallback:${descriptorFallback}})`,
      profile.thinkingDescriptorCount ?? 0,
      'видимый placeholder Thinking'
    );
  }

  const reasoningFallback = `(0,${jsx}.jsx)(${intl},{id:\`reasoningItem.thinking\`,defaultMessage:\`Thinking\`,description:\`Message shown when AI is currently thinking\`})`;
  patched = replaceExact(
    patched,
    reasoningFallback,
    `(0,${jsx}.jsx)(__kpAdMessage,{fallback:${reasoningFallback}})`,
    1,
    'строка Thinking в блоке рассуждения'
  );

  const exploringFallback = `(0,${jsx}.jsx)(${intl},{id:\`localConversationTurn.exploration.accordion.header.active\`,defaultMessage:\`Exploring\`,description:\`Header for the exploration accordion while Codex is listing or reading files\`,children:${profile.exploringChildrenIdentifier}})`;
  patched = replaceExact(
    patched,
    exploringFallback,
    `(0,${jsx}.jsx)(__kpAdMessage,{fallback:${exploringFallback}})`,
    1,
    'активная строка Exploring'
  );

  return patched;
}

export function patchThinkingShimmerSource(
  source: string,
  token: string,
  profile: CodexShimmerPatchProfile
): string {
  validateToken(token);
  if (source.includes(UI_MARKER_PREFIX)) {
    throw new Error('UI-патч Kodpauza уже присутствует в файле Codex.');
  }
  validateShimmerPatchProfile(profile);

  const injected = `${uiRuntime(token, profile)}${profile.reactAnchor}`;
  let patched = replaceExact(source, profile.reactAnchor, injected, 1, 'точка подключения React в строке ожидания');
  const thinkingFallback = `(0,${profile.jsxIdentifier}.jsx)(${profile.intlIdentifier},{id:\`thinkingShimmer.default\`,defaultMessage:\`Thinking\`,description:\`Default placeholder shown while the assistant is thinking\`})`;
  patched = replaceExact(
    patched,
    thinkingFallback,
    `(0,${profile.jsxIdentifier}.jsx)(__kpAdMessage,{fallback:${thinkingFallback}})`,
    1,
    'видимая строка Thinking'
  );
  return patched;
}

export function patchHostSource(
  source: string,
  profile: CodexPatchProfile = LEGACY_CODEX_PATCH_PROFILE
): string {
  if (source.includes(CSP_MARKER_START)) {
    throw new Error('CSP-патч Kodpauza уже присутствует в файле Codex.');
  }
  validatePatchProfile(profile);
  const anchor = profile.hostAnchor;
  const prefix = 'let n=[t,r,';
  if (!anchor.startsWith(prefix)) {
    throw new Error('Некорректный профиль CSP-патча Codex.');
  }
  const replacement = `${prefix}${CSP_MARKER_START}"http://127.0.0.1:${CODEX_UI_BRIDGE_PORT}"${CSP_MARKER_END},${anchor.slice(prefix.length)}`;
  return replaceExact(source, anchor, replacement, 1, 'политика подключения webview');
}

function uiRuntime(
  token: string,
  profile: Pick<CodexPatchProfile, 'reactIdentifier' | 'jsxIdentifier'>
): string {
  const endpoint = `http://127.0.0.1:${CODEX_UI_BRIDGE_PORT}/v1/codex/ad`;
  const react = profile.reactIdentifier;
  const jsx = profile.jsxIdentifier;
  const visibilityRuntime = webviewVisibilityRuntime('__kp', '__kpEndpoint', '__kpToken');
  return `${UI_MARKER_PREFIX}${token}__*/var __kpEndpoint=${JSON.stringify(endpoint)},__kpToken=${JSON.stringify(token)},__kpAdState=null,__kpSubscribers=new Set,__kpTimer,__kpActivityRefs=0,__kpActivityTimer,__kpActivityViewId="kp-"+Math.random().toString(36).slice(2)+Date.now().toString(36);function __kpSendActivity(e){fetch(__kpEndpoint+"/activity?token="+encodeURIComponent(__kpToken),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({viewId:__kpActivityViewId,active:e})}).catch(()=>{})}function __kpStartActivity(){__kpActivityRefs+=1,__kpActivityRefs===1&&(__kpSendActivity(!0),__kpActivityTimer=setInterval(()=>__kpSendActivity(!0),1e3))}function __kpStopActivity(){__kpActivityRefs=Math.max(0,__kpActivityRefs-1),__kpActivityRefs===0&&(__kpActivityTimer!=null&&clearInterval(__kpActivityTimer),__kpActivityTimer=void 0,__kpSendActivity(!1))}function __kpUseActivity(){(0,${react}.useEffect)(()=>{__kpStartActivity();return()=>__kpStopActivity()},[])}function __kpSnapshot(){return __kpAdState}function __kpNotify(){for(let e of __kpSubscribers)e()}function __kpSetAd(e){let t=e&&e.active===!0&&typeof e.adId=="string"&&typeof e.text=="string"&&(e.format==="standard"||e.format==="premium")?{active:!0,adId:e.adId,text:e.text,format:e.format}:null;if(__kpAdState?.adId===t?.adId&&__kpAdState?.text===t?.text&&__kpAdState?.format===t?.format)return;__kpAdState=t,__kpNotify()}function __kpPoll(){fetch(__kpEndpoint+"/current?token="+encodeURIComponent(__kpToken),{cache:"no-store"}).then(e=>e.ok?e.json():null).then(__kpSetAd).catch(()=>__kpSetAd(null)).finally(()=>{__kpSubscribers.size>0&&(__kpTimer=setTimeout(__kpPoll,750))})}function __kpSubscribe(e){return __kpSubscribers.add(e),__kpSubscribers.size===1&&__kpPoll(),()=>{__kpSubscribers.delete(e),__kpSubscribers.size===0&&(__kpTimer!=null&&clearTimeout(__kpTimer),__kpTimer=void 0)}}function __kpUseAd(){return(0,${react}.useSyncExternalStore)(__kpSubscribe,__kpSnapshot,__kpSnapshot)}${visibilityRuntime}function __kpOpenAd(e){fetch(__kpEndpoint+"/click?token="+encodeURIComponent(__kpToken),{method:"POST",headers:{"content-type":"text/plain"},body:e.adId}).catch(()=>{})}function __kpAdMessage(e){__kpUseActivity();let t=__kpUseAd(),n=(0,${react}.useRef)(null);(0,${react}.useEffect)(()=>t?__kpObserveVisibility(n.current,t):void 0,[t?.adId]);if(t==null)return e.fallback;let r=e=>{e.preventDefault(),e.stopPropagation(),__kpOpenAd(t)},i=e=>{(e.key==="Enter"||e.key===" ")&&r(e)},o=t.format==="premium";return(0,${jsx}.jsxs)("span",{"data-kodpauza-ad":"",ref:n,className:"inline-flex max-w-full min-w-0 items-center gap-1.5",role:"link",tabIndex:0,title:o?"Премиальная реклама Kodpauza. Нажмите, чтобы открыть предложение.":"Реклама Kodpauza. Нажмите, чтобы открыть предложение.",onClick:r,onKeyDown:i,style:o?{border:"1px solid rgba(245,158,11,.55)",borderRadius:"6px",padding:"2px 6px",background:"linear-gradient(90deg,rgba(245,158,11,.12),rgba(16,185,129,.08))",boxShadow:"0 0 0 1px rgba(245,158,11,.08)"}:void 0,children:[(0,${jsx}.jsx)("span",{className:"shrink-0 font-semibold",style:{color:o?"#f59e0b":"#10b981"},children:"Реклама"}),(0,${jsx}.jsx)("span",{className:"min-w-0 truncate",children:t.text})]})}${UI_MARKER_END}`;
}

function validatePatchProfile(profile: CodexPatchProfile): void {
  const identifiers = [
    profile.reactIdentifier,
    profile.jsxIdentifier,
    profile.intlIdentifier,
    profile.exploringChildrenIdentifier,
    ...(profile.thinkingDescriptorIdentifier ? [profile.thinkingDescriptorIdentifier] : [])
  ];
  if (
    !profile.reactAnchor ||
    !profile.hostAnchor ||
    !Number.isInteger(profile.thinkingCount) ||
    profile.thinkingCount < 1 ||
    Boolean(profile.thinkingDescriptorIdentifier) !== Boolean(profile.thinkingDescriptorCount) ||
    (profile.thinkingDescriptorCount !== undefined && (
      !Number.isInteger(profile.thinkingDescriptorCount) ||
      profile.thinkingDescriptorCount < 1
    )) ||
    !identifiers.every((identifier) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifier))
  ) {
    throw new Error('Некорректный профиль UI-патча Codex.');
  }
}

function validateShimmerPatchProfile(profile: CodexShimmerPatchProfile): void {
  if (
    !profile.reactAnchor ||
    ![profile.reactIdentifier, profile.jsxIdentifier, profile.intlIdentifier]
      .every((identifier) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifier))
  ) {
    throw new Error('Некорректный профиль патча строки ожидания Codex.');
  }
}

function validateToken(token: string): void {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    throw new Error('Некорректный токен UI-патча Codex.');
  }
}

function replaceExact(
  source: string,
  search: string,
  replacement: string,
  expectedCount: number,
  label: string
): string {
  const count = source.split(search).length - 1;
  if (count !== expectedCount) {
    throw new Error(`Codex несовместим с патчем: ${label} (${count} вместо ${expectedCount}).`);
  }
  return source.split(search).join(replacement);
}

function extractToken(source: string): string | undefined {
  return source.match(/\/\*__KODPAUZA_UI_START__:([a-f0-9]{64})__\*\//)?.[1];
}

function backupRecord(rootPath: string, targetPath: string, backupPath: string, source: string): PatchFileRecord {
  return {
    relativePath: path.relative(rootPath, targetPath),
    backupPath,
    originalSha256: sha256(source)
  };
}

function assertOriginalHash(filePath: string, source: string, expected: string): void {
  const actual = sha256(source);
  if (actual !== expected) {
    throw new Error(`Файл Codex ${path.basename(filePath)} отличается от проверенной сборки. Патч не применен.`);
  }
}

type CodexCompatibilityProfile = {
  patchProfile: CodexPatchProfile;
  shimmerPatchProfile?: CodexShimmerPatchProfile;
};

function uniqueCodexProfiles(builds: readonly CodexSupportedBuild[]): CodexCompatibilityProfile[] {
  const unique = new Map<string, CodexCompatibilityProfile>();
  for (const build of builds) {
    const profile: CodexCompatibilityProfile = {
      patchProfile: build.patchProfile ?? LEGACY_CODEX_PATCH_PROFILE,
      ...(build.shimmerPatchProfile ? { shimmerPatchProfile: build.shimmerPatchProfile } : {})
    };
    unique.set(JSON.stringify(profile), profile);
  }
  return [...unique.values()];
}

function codexBuildHashesMatch(build: CodexSupportedBuild, candidates: CodexSourceCandidates): boolean {
  if (
    sha256(candidates.hostSource) !== build.hostSha256 ||
    sha256(candidates.webviewSource) !== build.webviewSha256
  ) {
    return false;
  }
  if (build.shimmerPatchProfile) {
    return Boolean(
      candidates.shimmerSource &&
      build.shimmerSha256 &&
      sha256(candidates.shimmerSource) === build.shimmerSha256
    );
  }
  return !candidates.shimmerSource?.includes('thinkingShimmer.default');
}

async function assertPatchedFiles(
  files: readonly { filePath: string; expectedSource: string; label: string }[]
): Promise<void> {
  for (const file of files) {
    const current = await fs.readFile(file.filePath, 'utf8');
    if (current !== file.expectedSource) {
      throw new Error(`${file.label} не прошел проверку после атомарной записи.`);
    }
  }
}

async function readTextFile(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_PATCH_FILE_BYTES) {
    throw new Error(`Файл Codex ${path.basename(filePath)} имеет неожиданный размер.`);
  }
  return fs.readFile(filePath, 'utf8');
}

async function readManifest(filePath: string): Promise<PatchManifest | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isFileNotFound(error)) {
      return undefined;
    }
    throw error;
  }
  const value = JSON.parse(raw) as Partial<PatchManifest>;
  if (
    value.version !== 1 ||
    (value.patchRevision !== undefined &&
      (!Number.isInteger(value.patchRevision) || value.patchRevision < 1)) ||
    typeof value.codexVersion !== 'string' ||
    typeof value.extensionPath !== 'string' ||
    typeof value.token !== 'string' ||
    value.port !== CODEX_UI_BRIDGE_PORT ||
    (value.compatibilityMode !== undefined &&
      value.compatibilityMode !== 'exact' &&
      value.compatibilityMode !== 'structural') ||
    !Array.isArray(value.files) ||
    !value.files.every(isPatchFileRecord)
  ) {
    throw new Error('Файл состояния UI-патча Kodpauza поврежден.');
  }
  return value as PatchManifest;
}

async function atomicWritePreservingMode(filePath: string, data: string | Buffer): Promise<void> {
  const mode = (await fs.stat(filePath)).mode & 0o777;
  await atomicWrite(filePath, data, mode);
}

async function atomicWrite(filePath: string, data: string | Buffer, mode: number): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, data, { mode });
    await fs.rename(temporaryPath, filePath);
    await fs.chmod(filePath, mode).catch(() => undefined);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isFileNotFound(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function isPatchFileRecord(value: unknown): value is PatchFileRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<PatchFileRecord>;
  return (
    typeof record.relativePath === 'string' &&
    record.relativePath.length > 0 &&
    !path.isAbsolute(record.relativePath) &&
    !record.relativePath.split(path.sep).includes('..') &&
    typeof record.backupPath === 'string' &&
    path.isAbsolute(record.backupPath) &&
    typeof record.originalSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(record.originalSha256)
  );
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}
