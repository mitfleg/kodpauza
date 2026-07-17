import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { CODEX_UI_BRIDGE_PORT } from './codexPatchInstaller';
import { defaultKodpauzaHome } from './codexHookInstaller';
import {
  assertFilesUnchanged,
  assertJavaScriptParses,
  PatchCompatibilityMode
} from './patchSafety';
import { webviewVisibilityRuntime } from './uiVisibilityRuntime';

const PATCH_STATE_FILE = 'claude-ui-patch.json';
const PATCH_REVISION = 5;
const UI_MARKER_PREFIX = '/*__KODPAUZA_CLAUDE_UI_START__:';
const UI_MARKER_END = '/*__KODPAUZA_CLAUDE_UI_END__*/';
const CSP_MARKER_START = '<!--__KODPAUZA_CLAUDE_CSP_START__-->';
const CSP_MARKER_END = '<!--__KODPAUZA_CLAUDE_CSP_END__-->';
const MAX_PATCH_FILE_BYTES = 8 * 1024 * 1024;

export type ClaudePatchProfile = {
  cspFinalIdentifier: string;
  componentIdentifier: string;
  verbsIdentifier: string;
  randomIdentifier: string;
  schedulerIdentifier: string;
  animateIdentifier: string;
  stylesIdentifier: string;
  spinnerFramesIdentifier: string;
};

export type ClaudeSupportedBuild = {
  version: string;
  hostSha256: string;
  webviewSha256: string;
  profile: ClaudePatchProfile;
};

export const CLAUDE_2_1_207_PROFILE: ClaudePatchProfile = {
  cspFinalIdentifier: 'v',
  componentIdentifier: 'aQe',
  verbsIdentifier: 'W8t',
  randomIdentifier: 'Wj',
  schedulerIdentifier: '$me',
  animateIdentifier: 'z8t',
  stylesIdentifier: 'Hj',
  spinnerFramesIdentifier: 'rQe'
};

export const CLAUDE_2_1_209_PROFILE: ClaudePatchProfile = {
  cspFinalIdentifier: 'v',
  componentIdentifier: 'oQe',
  verbsIdentifier: 'M8t',
  randomIdentifier: 'Bj',
  schedulerIdentifier: 'Vme',
  animateIdentifier: 'A8t',
  stylesIdentifier: 'Fj',
  spinnerFramesIdentifier: 'iQe'
};

export const CLAUDE_2_1_212_PROFILE: ClaudePatchProfile = {
  ...CLAUDE_2_1_209_PROFILE,
  cspFinalIdentifier: 'h'
};

const SUPPORTED_BUILDS: readonly ClaudeSupportedBuild[] = [
  {
    version: '2.1.207',
    hostSha256: 'c826e0fb877a54c595a27e2fe67da5bcf258cc08709783b7fda1b366f25b9980',
    webviewSha256: '67c105ac80d10834618c1d8fb8ed28c99df70167ffd38f52ac3420bdfc2aff67',
    profile: CLAUDE_2_1_207_PROFILE
  },
  {
    version: '2.1.209',
    hostSha256: '74fd568a28ccd54ec3902ed47ea8b33781325c4862c541613648684694ef072e',
    webviewSha256: '6cca18ca9b6952a0d737d7ab024fed1625dcdcd057a484fdc19e1fa019e62bc9',
    profile: CLAUDE_2_1_209_PROFILE
  },
  {
    version: '2.1.212',
    hostSha256: '4bf69e72516593859ceb3f520aa510918ea71bc63dec3a2f81816ccda28567d1',
    webviewSha256: 'd02e1ffdb066a69458759262433fc9c972b773e56f99f36c3bf2605749959a76',
    profile: CLAUDE_2_1_212_PROFILE
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
  claudeVersion: string;
  compatibilityMode?: Exclude<PatchCompatibilityMode, 'unsupported'>;
  extensionPath: string;
  token: string;
  port: number;
  createdAt: string;
  files: PatchFileRecord[];
};

export type ClaudePatchStatus = {
  installed: boolean;
  compatible: boolean;
  compatibilityMode: PatchCompatibilityMode;
  claudeVersion: string;
  token?: string;
  hostPath?: string;
  webviewPath?: string;
};

export type ClaudePatchMutationResult = ClaudePatchStatus & {
  changed: boolean;
  backupDirectory?: string;
};

class PartialPatchError extends Error {
  constructor() {
    super('Патч Claude Code применен частично. Требуется безопасное восстановление.');
    this.name = 'PartialPatchError';
  }
}

class OutdatedPatchError extends Error {
  constructor() {
    super('UI-патч Claude Code требует безопасного обновления.');
    this.name = 'OutdatedPatchError';
  }
}

export class ClaudePatchInstaller {
  private readonly statePath: string;
  private supportedBuild?: ClaudeSupportedBuild;
  private compatibilityMode: PatchCompatibilityMode;

  constructor(
    private readonly extensionPath: string,
    private readonly claudeVersion: string,
    private readonly kodpauzaHome = defaultKodpauzaHome(),
    supportedBuild?: ClaudeSupportedBuild
  ) {
    this.statePath = path.join(kodpauzaHome, PATCH_STATE_FILE);
    this.supportedBuild = supportedBuild
      ?? SUPPORTED_BUILDS.find((build) => build.version === claudeVersion);
    this.compatibilityMode = this.supportedBuild ? 'exact' : 'unsupported';
  }

  async inspect(): Promise<ClaudePatchStatus> {
    const paths = await this.resolvePatchPaths(false);
    if (!paths) {
      return {
        installed: false,
        compatible: false,
        compatibilityMode: 'unsupported',
        claudeVersion: this.claudeVersion
      };
    }
    const [hostSource, webviewSource] = await Promise.all([
      readTextFile(paths.hostPath),
      readTextFile(paths.webviewPath)
    ]);
    const token = extractToken(webviewSource);
    const hostPatched = hostSource.includes(CSP_MARKER_START) && hostSource.includes(CSP_MARKER_END);
    const webviewPatched = Boolean(token) && webviewSource.includes(UI_MARKER_END);
    if (hostPatched !== webviewPatched) {
      throw new PartialPatchError();
    }
    if (hostPatched && webviewPatched) {
      const manifest = await readManifest(this.statePath);
      if (
        !manifest ||
        path.resolve(manifest.extensionPath) !== path.resolve(this.extensionPath) ||
        manifest.token !== token
      ) {
        throw new Error('Установленный патч Claude Code не подтвержден манифестом Kodpauza.');
      }
      if ((manifest.patchRevision ?? 1) !== PATCH_REVISION) {
        throw new OutdatedPatchError();
      }
      this.compatibilityMode = manifest.compatibilityMode ?? 'exact';
      return {
        installed: true,
        compatible: true,
        compatibilityMode: this.compatibilityMode,
        claudeVersion: this.claudeVersion,
        token,
        ...paths
      };
    }

    this.resolveCompatibleBuild(hostSource, webviewSource);
    return {
      installed: false,
      compatible: Boolean(this.supportedBuild),
      compatibilityMode: this.compatibilityMode,
      claudeVersion: this.claudeVersion,
      ...paths
    };
  }

  async install(): Promise<ClaudePatchMutationResult> {
    const current = await this.inspect();
    if (current.installed) {
      return { ...current, changed: false };
    }
    const build = this.supportedBuild;
    if (!build) {
      throw new Error(`Версия Claude Code ${this.claudeVersion} пока не поддерживается патчем Kodpauza.`);
    }

    const paths = await this.resolvePatchPaths(true);
    const [hostSource, webviewSource] = await Promise.all([
      readTextFile(paths.hostPath),
      readTextFile(paths.webviewPath)
    ]);
    this.resolveCompatibleBuild(hostSource, webviewSource);
    const resolvedBuild = this.supportedBuild;
    if (!resolvedBuild) {
      throw new Error(`Версия Claude Code ${this.claudeVersion} изменила структуру UI. Реклама безопасно отключена.`);
    }
    assertOriginalHash(paths.hostPath, hostSource, resolvedBuild.hostSha256);
    assertOriginalHash(paths.webviewPath, webviewSource, resolvedBuild.webviewSha256);

    const token = crypto.randomBytes(32).toString('hex');
    const patchedHost = patchClaudeHostSource(hostSource, resolvedBuild.profile);
    const patchedWebview = patchClaudeWebviewSource(webviewSource, token, resolvedBuild.profile);
    assertJavaScriptParses(patchedHost, 'Claude Code extension.js');
    assertJavaScriptParses(patchedWebview, 'Claude Code webview/index.js');
    const backupDirectory = await this.createBackup(paths);
    const manifest: PatchManifest = {
      version: 1,
      patchRevision: PATCH_REVISION,
      claudeVersion: this.claudeVersion,
      compatibilityMode: this.compatibilityMode === 'structural' ? 'structural' : 'exact',
      extensionPath: this.extensionPath,
      token,
      port: CODEX_UI_BRIDGE_PORT,
      createdAt: new Date().toISOString(),
      files: [
        backupRecord(this.extensionPath, paths.hostPath, path.join(backupDirectory, 'extension.js'), hostSource),
        backupRecord(this.extensionPath, paths.webviewPath, path.join(backupDirectory, 'index.js'), webviewSource)
      ]
    };

    await fs.mkdir(this.kodpauzaHome, { recursive: true, mode: 0o700 });
    await atomicWrite(this.statePath, `${JSON.stringify(manifest, null, 2)}\n`, 0o600);
    try {
      await assertFilesUnchanged([
        { filePath: paths.hostPath, expectedSource: hostSource, label: 'Claude Code extension.js' },
        { filePath: paths.webviewPath, expectedSource: webviewSource, label: 'Claude Code webview/index.js' }
      ]);
      await atomicWritePreservingMode(paths.webviewPath, patchedWebview);
      await atomicWritePreservingMode(paths.hostPath, patchedHost);
      await assertPatchedFiles([
        { filePath: paths.hostPath, expectedSource: patchedHost, label: 'Claude Code extension.js' },
        { filePath: paths.webviewPath, expectedSource: patchedWebview, label: 'Claude Code webview/index.js' }
      ]);
    } catch (error) {
      await this.restoreFromManifest(manifest).catch(() => undefined);
      throw error;
    }
    return {
      installed: true,
      compatible: true,
      compatibilityMode: this.compatibilityMode,
      claudeVersion: this.claudeVersion,
      token,
      ...paths,
      changed: true,
      backupDirectory
    };
  }

  async ensureInstalled(): Promise<ClaudePatchMutationResult> {
    await this.reconcilePreviousInstallation();
    try {
      const current = await this.inspect();
      if (current.installed || !current.compatible) {
        return { ...current, changed: false };
      }
      return this.install();
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

  async restore(): Promise<ClaudePatchMutationResult> {
    const manifest = await readManifest(this.statePath);
    if (!manifest) {
      const current = await this.inspect();
      if (current.installed) {
        throw new Error('Не найдена резервная копия файлов Claude Code. Откат остановлен.');
      }
      return { ...current, changed: false };
    }
    if (path.resolve(manifest.extensionPath) !== path.resolve(this.extensionPath)) {
      throw new Error('Резервная копия относится к другой установке Claude Code.');
    }
    await this.assertManifestCanBeRestored(manifest);
    await this.restoreFromManifest(manifest);
    await fs.rm(this.statePath, { force: true });
      return {
        installed: false,
        compatible: Boolean(this.supportedBuild),
        compatibilityMode: this.compatibilityMode,
        claudeVersion: this.claudeVersion,
        changed: true
    };
  }

  private resolveCompatibleBuild(hostSource: string, webviewSource: string): void {
    const currentBuild = this.supportedBuild;
    if (
      currentBuild &&
      sha256(hostSource) === currentBuild.hostSha256 &&
      sha256(webviewSource) === currentBuild.webviewSha256
    ) {
      if (this.compatibilityMode !== 'structural') {
        this.compatibilityMode = 'exact';
      }
      return;
    }

    const profiles = uniqueClaudeProfiles([
      ...(currentBuild ? [currentBuild.profile] : []),
      ...SUPPORTED_BUILDS.map((build) => build.profile)
    ]);
    const matches = profiles.filter((profile) => {
      try {
        const token = '0'.repeat(64);
        const patchedHost = patchClaudeHostSource(hostSource, profile);
        const patchedWebview = patchClaudeWebviewSource(webviewSource, token, profile);
        assertJavaScriptParses(patchedHost, 'Claude Code extension.js');
        assertJavaScriptParses(patchedWebview, 'Claude Code webview/index.js');
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

    this.supportedBuild = {
      version: this.claudeVersion,
      hostSha256: sha256(hostSource),
      webviewSha256: sha256(webviewSource),
      profile: matches[0]
    };
    this.compatibilityMode = 'structural';
  }

  private async resolvePatchPaths(required: true): Promise<{ hostPath: string; webviewPath: string }>;
  private async resolvePatchPaths(required: false): Promise<{ hostPath: string; webviewPath: string } | undefined>;
  private async resolvePatchPaths(required: boolean): Promise<{ hostPath: string; webviewPath: string } | undefined> {
    const paths = {
      hostPath: path.join(this.extensionPath, 'extension.js'),
      webviewPath: path.join(this.extensionPath, 'webview', 'index.js')
    };
    if (!(await fileExists(paths.hostPath)) || !(await fileExists(paths.webviewPath))) {
      if (required) {
        throw new Error('Структура установленного Claude Code не распознана. Файлы не изменены.');
      }
      return undefined;
    }
    return paths;
  }

  private async createBackup(paths: { hostPath: string; webviewPath: string }): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const directory = path.join(
      this.kodpauzaHome,
      'backups',
      `claude-ui-${this.claudeVersion}-${timestamp}`
    );
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await Promise.all([
      fs.copyFile(paths.hostPath, path.join(directory, 'extension.js')),
      fs.copyFile(paths.webviewPath, path.join(directory, 'index.js'))
    ]);
    return directory;
  }

  private async reconcilePreviousInstallation(): Promise<void> {
    const manifest = await readManifest(this.statePath);
    if (!manifest || path.resolve(manifest.extensionPath) === path.resolve(this.extensionPath)) {
      return;
    }
    const targets = manifest.files.map((file) => path.resolve(manifest.extensionPath, file.relativePath));
    const exists = await Promise.all(targets.map(fileExists));
    if (exists.every((value) => !value)) {
      await fs.rm(this.statePath, { force: true });
      return;
    }
    if (!exists.every(Boolean)) {
      throw new Error('Предыдущий патч Claude Code найден частично. Автообновление остановлено.');
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
        throw new Error('Файл патча Claude Code находится за пределами расширения.');
      }
      const current = await fs.readFile(targetPath);
      const source = current.toString('utf8');
      const original = sha256(current) === file.originalSha256;
      const patched = path.basename(targetPath) === 'extension.js'
        ? source.includes(CSP_MARKER_START) && source.includes(CSP_MARKER_END)
        : source.includes(UI_MARKER_PREFIX) && source.includes(UI_MARKER_END);
      if (!original && !patched) {
        throw new Error(`Файл Claude Code ${path.basename(targetPath)} изменен после установки.`);
      }
    }
  }

  private async restoreFromManifest(manifest: PatchManifest): Promise<void> {
    const extensionRoot = path.resolve(manifest.extensionPath);
    const backupRoot = path.resolve(this.kodpauzaHome, 'backups');
    for (const file of manifest.files) {
      const targetPath = path.resolve(extensionRoot, file.relativePath);
      const backupPath = path.resolve(file.backupPath);
      if (!isPathInside(extensionRoot, targetPath) || !isPathInside(backupRoot, backupPath)) {
        throw new Error('Некорректный путь резервной копии Claude Code.');
      }
      const backup = await fs.readFile(backupPath);
      if (sha256(backup) !== file.originalSha256) {
        throw new Error(`Резервная копия ${path.basename(backupPath)} повреждена.`);
      }
      await atomicWritePreservingMode(targetPath, backup);
    }
  }
}

export function patchClaudeHostSource(
  source: string,
  profile: ClaudePatchProfile = CLAUDE_2_1_209_PROFILE
): string {
  validateProfile(profile);
  if (source.includes(CSP_MARKER_START)) {
    throw new Error('CSP-патч Kodpauza уже присутствует в Claude Code.');
  }
  const anchor = claudeCspAnchor(profile);
  const patchedAnchor = claudeCspAnchor(profile, true);
  return replaceExact(
    source,
    anchor,
    `${CSP_MARKER_START}${patchedAnchor}${CSP_MARKER_END}`,
    1,
    'Content Security Policy Claude Code'
  );
}

function claudeCspAnchor(profile: ClaudePatchProfile, patched = false): string {
  const connectSource = patched
    ? ` connect-src http://127.0.0.1:${CODEX_UI_BRIDGE_PORT};`
    : '';
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; \${p}; \${f}; \${m}; script-src 'nonce-\${u}'; \${${profile.cspFinalIdentifier}};${connectSource}">`;
}

export function patchClaudeWebviewSource(
  source: string,
  token: string,
  profile: ClaudePatchProfile
): string {
  validateToken(token);
  validateProfile(profile);
  if (source.includes(UI_MARKER_PREFIX)) {
    throw new Error('UI-патч Kodpauza уже присутствует в Claude Code.');
  }
  const original = spinnerComponentSource(profile, false);
  const patched = `${claudeUiRuntime(token)}${spinnerComponentSource(profile, true)}`;
  return replaceExact(source, original, patched, 1, 'активный spinner Claude Code');
}

function spinnerComponentSource(profile: ClaudePatchProfile, patched: boolean): string {
  const adState = patched ? 'k=__kpClaudeUseAd(),' : '';
  const content = patched ? 'k&&i!=="compacting"?b(__kpClaudeAdLink,{ad:k}):h' : 'h';
  return `function ${profile.componentIdentifier}({size:e=16,permissionMode:t,status:i,spinnerVerbsConfig:n}){let ${adState}o=co(()=>${profile.verbsIdentifier}(n),[n]),r=co(()=>Math.max(...o.map((p)=>p.length)),[o]),[s,a]=ne(0),[l,c]=ne(()=>${profile.randomIdentifier}(o));de(()=>{let p=setInterval(()=>{a((f)=>(f+1)%${profile.spinnerFramesIdentifier}.length)},120);return()=>clearInterval(p)},[]),${profile.schedulerIdentifier}(()=>{c(${profile.randomIdentifier}(o))},(p)=>{let f=[2000,3000,5000];return p<f.length?f[p]:5000});let u=l;if(i==="compacting")u="Compacting";let h=${profile.animateIdentifier}(u+"...",r+3);return E("div",{className:${profile.stylesIdentifier}.container,"data-permission-mode":t,children:[b("span",{className:${profile.stylesIdentifier}.icon,style:{fontSize:\`\${e}px\`},children:${profile.spinnerFramesIdentifier}[s]}),b("span",{className:${profile.stylesIdentifier}.text,children:${content}})]})}`;
}

function claudeUiRuntime(token: string): string {
  const endpoint = `http://127.0.0.1:${CODEX_UI_BRIDGE_PORT}/v1/claude/ad`;
  const activityRuntime = 'var __kpClaudeActivityRefs=0,__kpClaudeActivityTimer,__kpClaudeActivityViewId="kp-"+Math.random().toString(36).slice(2)+Date.now().toString(36);function __kpClaudeSendActivity(e){fetch(__kpClaudeEndpoint+"/activity?token="+encodeURIComponent(__kpClaudeToken),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({viewId:__kpClaudeActivityViewId,active:e})}).catch(()=>{})}function __kpClaudeStartActivity(){__kpClaudeActivityRefs+=1,__kpClaudeActivityRefs===1&&(__kpClaudeSendActivity(!0),__kpClaudeActivityTimer=setInterval(()=>__kpClaudeSendActivity(!0),1e3))}function __kpClaudeStopActivity(){__kpClaudeActivityRefs=Math.max(0,__kpClaudeActivityRefs-1),__kpClaudeActivityRefs===0&&(__kpClaudeActivityTimer!=null&&clearInterval(__kpClaudeActivityTimer),__kpClaudeActivityTimer=void 0,__kpClaudeSendActivity(!1))}function __kpClaudeUseActivity(){de(()=>{__kpClaudeStartActivity();return()=>__kpClaudeStopActivity()},[])}var __kpClaudeBaseUseAd=__kpClaudeUseAd;__kpClaudeUseAd=function(){__kpClaudeUseActivity();return __kpClaudeBaseUseAd()};';
  const visibilityRuntime = `${activityRuntime}${webviewVisibilityRuntime('__kpClaude', '__kpClaudeEndpoint', '__kpClaudeToken')}`;
  return `${UI_MARKER_PREFIX}${token}__*/var __kpClaudeEndpoint=${JSON.stringify(endpoint)},__kpClaudeToken=${JSON.stringify(token)};function __kpClaudeUseAd(){let[e,t]=ne(null);return de(()=>{let i=!0,n;function o(){fetch(__kpClaudeEndpoint+"/current?token="+encodeURIComponent(__kpClaudeToken),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(r=>{if(i)t(a=>a?.adId===r?.adId&&a?.text===r?.text&&a?.format===r?.format?a:r&&r.active===!0&&(r.format==="standard"||r.format==="premium")?r:null)}).catch(()=>{i&&t(null)}).finally(()=>{i&&(n=setTimeout(o,750))})}return o(),()=>{i=!1,n!=null&&clearTimeout(n)}},[]),e}${visibilityRuntime}function __kpClaudeOpenAd(e){fetch(__kpClaudeEndpoint+"/click?token="+encodeURIComponent(__kpClaudeToken),{method:"POST",headers:{"content-type":"text/plain"},body:e.adId}).catch(()=>{})}function __kpClaudeAdLink({ad:e}){let[t,i]=ne(null);de(()=>t?__kpClaudeObserveVisibility(t,e):void 0,[t,e.adId]);let n=t=>{t.preventDefault(),t.stopPropagation(),__kpClaudeOpenAd(e)},o=e=>{(e.key==="Enter"||e.key===" ")&&n(e)},a=e.format==="premium";return E("span",{ref:i,role:"link",tabIndex:0,title:a?"Премиальная реклама Kodpauza. Нажмите, чтобы открыть предложение.":"Реклама Kodpauza. Нажмите, чтобы открыть предложение.",onClick:n,onKeyDown:o,style:{cursor:"pointer",display:"inline-flex",alignItems:"center",gap:"6px",maxWidth:"100%",border:a?"1px solid rgba(245,158,11,.55)":void 0,borderRadius:a?"6px":void 0,padding:a?"2px 6px":void 0,background:a?"linear-gradient(90deg,rgba(245,158,11,.12),rgba(16,185,129,.08))":void 0,boxShadow:a?"0 0 0 1px rgba(245,158,11,.08)":void 0},children:[b("span",{style:{color:a?"#f59e0b":"#10b981",fontWeight:600},children:"Реклама"}),b("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:e.text})]})}${UI_MARKER_END}`;
}

function validateProfile(profile: ClaudePatchProfile): void {
  if (!Object.values(profile).every((identifier) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifier))) {
    throw new Error('Некорректный профиль UI-патча Claude Code.');
  }
}

function validateToken(token: string): void {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    throw new Error('Некорректный токен UI-патча Claude Code.');
  }
}

function replaceExact(source: string, search: string, replacement: string, count: number, label: string): string {
  const actual = source.split(search).length - 1;
  if (actual !== count) {
    throw new Error(`Claude Code несовместим с патчем: ${label} (${actual} вместо ${count}).`);
  }
  return source.split(search).join(replacement);
}

function extractToken(source: string): string | undefined {
  return source.match(/\/\*__KODPAUZA_CLAUDE_UI_START__:([a-f0-9]{64})__\*\//)?.[1];
}

function backupRecord(root: string, target: string, backup: string, source: string): PatchFileRecord {
  return { relativePath: path.relative(root, target), backupPath: backup, originalSha256: sha256(source) };
}

function assertOriginalHash(filePath: string, source: string, expected: string): void {
  if (sha256(source) !== expected) {
    throw new Error(`Файл Claude Code ${path.basename(filePath)} отличается от проверенной сборки.`);
  }
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

function uniqueClaudeProfiles(profiles: readonly ClaudePatchProfile[]): ClaudePatchProfile[] {
  const unique = new Map<string, ClaudePatchProfile>();
  for (const profile of profiles) {
    unique.set(JSON.stringify(profile), profile);
  }
  return [...unique.values()];
}

async function readTextFile(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_PATCH_FILE_BYTES) {
    throw new Error(`Файл Claude Code ${path.basename(filePath)} имеет неожиданный размер.`);
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
    typeof value.claudeVersion !== 'string' ||
    typeof value.extensionPath !== 'string' ||
    typeof value.token !== 'string' ||
    value.port !== CODEX_UI_BRIDGE_PORT ||
    (value.compatibilityMode !== undefined &&
      value.compatibilityMode !== 'exact' &&
      value.compatibilityMode !== 'structural') ||
    !Array.isArray(value.files) ||
    !value.files.every(isPatchFileRecord)
  ) {
    throw new Error('Файл состояния UI-патча Claude Code поврежден.');
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
  return fs.access(filePath).then(() => true, () => false);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isFileNotFound(error: unknown): boolean {
  if (error === null || typeof error !== 'object' || !('code' in error)) {
    return false;
  }
  return (error as { code?: unknown }).code === 'ENOENT';
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

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}
