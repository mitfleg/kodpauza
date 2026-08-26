import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { defaultKodpauzaHome } from './codexHookInstaller';
import {
  assertFilesUnchanged,
  assertJavaScriptParses,
  PatchCompatibilityMode,
} from './patchSafety';
import { webviewVisibilityRuntime } from './uiVisibilityRuntime';

export const CODEX_UI_BRIDGE_PORT = 37_491;

const PATCH_STATE_FILE = 'codex-ui-patch.json';
const PATCH_REVISION = 9;
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
  reasoningCount?: number;
  thinkingDescriptorIdentifier?: string;
  thinkingDescriptorCount?: number;
  exploringChildrenIdentifier?: string;
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
  hostAnchor: 'let n=[t,r,...b8e,...v8e];',
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
  hostAnchor: 'let n=[t,r,...jYe,...HYe];',
};

export const CODEX_26_707_91948_PATCH_PROFILE: CodexPatchProfile = {
  ...CODEX_26_707_PATCH_PROFILE,
  reactAnchor: 'var $=e(t(),1),Wa=',
  exploringChildrenIdentifier: 'kf',
};

export const CODEX_26_707_SHIMMER_PATCH_PROFILE: CodexShimmerPatchProfile = {
  reactAnchor: 'var c=e(t(),1),l=',
  reactIdentifier: 'c',
  jsxIdentifier: 'f',
  intlIdentifier: 'i',
};

export const CODEX_26_715_31925_PATCH_PROFILE: CodexPatchProfile = {
  reactAnchor: 'var X=i(),Z=e(t(),1),Q=',
  reactIdentifier: 'Z',
  jsxIdentifier: 'Q',
  intlIdentifier: 'U',
  thinkingCount: 3,
  reasoningCount: 0,
  thinkingDescriptorIdentifier: '_a',
  thinkingDescriptorCount: 3,
  exploringChildrenIdentifier: 'Nr',
  hostAnchor: 'let n=[t,r,...wtt,...Stt];',
};

export const CODEX_26_715_31925_SHIMMER_PATCH_PROFILE: CodexShimmerPatchProfile = {
  reactAnchor: 'var c=r(),l=e(t(),1),u=',
  reactIdentifier: 'l',
  jsxIdentifier: 'f',
  intlIdentifier: 'i',
};

export const CODEX_26_721_30844_PATCH_PROFILE: CodexPatchProfile = {
  reactAnchor: 'var Ba,Q,$,Va,Ha,Ua,Wa,Ga,Ka,qa,Ja=',
  reactIdentifier: 'Q',
  jsxIdentifier: '$',
  intlIdentifier: 'U',
  thinkingCount: 0,
  reasoningCount: 0,
  thinkingDescriptorIdentifier: 'Ka',
  thinkingDescriptorCount: 1,
  hostAnchor: 'let n=[t,r,...Zst,...Kst];',
};

export const CODEX_26_721_41059_PATCH_PROFILE: CodexPatchProfile = {
  ...CODEX_26_721_30844_PATCH_PROFILE,
  hostAnchor: 'let n=[t,r,...zst,...jst];',
};

export const CODEX_26_727_40816_PATCH_PROFILE: CodexPatchProfile = {
  reactAnchor: 'var Oo,Q,$,ko,Ao,jo,Mo,No,Po,Fo,Io=e((()=>{',
  reactIdentifier: 'Q',
  jsxIdentifier: '$',
  intlIdentifier: 'B',
  thinkingCount: 0,
  reasoningCount: 0,
  thinkingDescriptorIdentifier: 'Po',
  thinkingDescriptorCount: 1,
  hostAnchor: 'let n=[t,r,...lut,...cut];',
};

export const CODEX_26_727_40816_SHIMMER_PATCH_PROFILE: CodexShimmerPatchProfile = {
  reactAnchor: 'var E,D,O,k,A,j,M,N=e((()=>{',
  reactIdentifier: 'D',
  jsxIdentifier: 'O',
  intlIdentifier: 'i',
};

export const CODEX_26_5727_51351_PATCH_PROFILE: CodexPatchProfile = {
  ...CODEX_26_727_40816_PATCH_PROFILE,
  hostAnchor: 'let n=[t,r,...uut,...lut];',
};

export const CODEX_26_5727_51351_SHIMMER_PATCH_PROFILE: CodexShimmerPatchProfile = {
  ...CODEX_26_727_40816_SHIMMER_PATCH_PROFILE,
};

export const CODEX_26_803_41515_PATCH_PROFILE: CodexPatchProfile = {
  reactAnchor: 'var Za,Q,$,Qa,$a,eo,to,no,ro,io=e((()=>{',
  reactIdentifier: 'Q',
  jsxIdentifier: '$',
  intlIdentifier: 'R',
  thinkingCount: 0,
  reasoningCount: 0,
  thinkingDescriptorIdentifier: 'no',
  thinkingDescriptorCount: 2,
  hostAnchor: 'let n=[t,r,...eut,...Qlt];',
};

export const CODEX_26_803_41515_SHIMMER_PATCH_PROFILE: CodexShimmerPatchProfile = {
  reactAnchor: 'var E,D,O,k,A,j,M,N=e((()=>{',
  reactIdentifier: 'D',
  jsxIdentifier: 'O',
  intlIdentifier: 'a',
};

export const CODEX_26_810_41047_PATCH_PROFILE: CodexPatchProfile = {
  reactAnchor: 'var Ka,qa,Ja,$,Ya,Xa,Za,Qa,$a,eo=e((()=>{',
  reactIdentifier: 'Ja',
  jsxIdentifier: '$',
  intlIdentifier: 'O',
  thinkingCount: 0,
  reasoningCount: 0,
  thinkingDescriptorIdentifier: 'Qa',
  thinkingDescriptorCount: 2,
  hostAnchor: 'let n=[t,r,...nut,...rut];',
};

export const CODEX_26_810_41047_SHIMMER_PATCH_PROFILE: CodexShimmerPatchProfile = {
  reactAnchor: 'var C,w,T,E,D,O,k=e((()=>{',
  reactIdentifier: 'w',
  jsxIdentifier: 'T',
  intlIdentifier: 'c',
};

export const CODEX_26_810_52044_PATCH_PROFILE: CodexPatchProfile = {
  ...CODEX_26_810_41047_PATCH_PROFILE,
  intlIdentifier: 'j',
};

export const CODEX_26_810_52044_SHIMMER_PATCH_PROFILE: CodexShimmerPatchProfile = {
  ...CODEX_26_810_41047_SHIMMER_PATCH_PROFILE,
  intlIdentifier: 's',
};

export const CODEX_26_814_41407_PATCH_PROFILE: CodexPatchProfile = {
  reactAnchor: 'var $a,eo,to,$,no,ro,io,ao,oo,so=e((()=>{',
  reactIdentifier: 'to',
  jsxIdentifier: '$',
  intlIdentifier: 'k',
  thinkingCount: 0,
  reasoningCount: 0,
  thinkingDescriptorIdentifier: 'ao',
  thinkingDescriptorCount: 2,
  hostAnchor: 'let n=[t,r,...Out,...Mut];',
};

export const CODEX_26_814_41407_SHIMMER_PATCH_PROFILE: CodexShimmerPatchProfile = {
  ...CODEX_26_810_52044_SHIMMER_PATCH_PROFILE,
};

export const CODEX_26_818_31338_PATCH_PROFILE: CodexPatchProfile = {
  reactAnchor: 'var to,no,ro,$,io,ao,oo,so,co,lo=e((()=>{',
  reactIdentifier: 'ro',
  jsxIdentifier: '$',
  intlIdentifier: 's',
  thinkingCount: 0,
  reasoningCount: 0,
  thinkingDescriptorIdentifier: 'so',
  thinkingDescriptorCount: 2,
  hostAnchor: 'let n=[t,r,...$ut,...Lut];',
};

export const CODEX_26_818_41705_PATCH_PROFILE: CodexPatchProfile = {
  ...CODEX_26_818_31338_PATCH_PROFILE,
  intlIdentifier: 'M',
  hostAnchor: 'let n=[t,r,...Fut,...$ut];',
};

export const CODEX_26_818_61809_PATCH_PROFILE: CodexPatchProfile = {
  ...CODEX_26_818_41705_PATCH_PROFILE,
  hostAnchor: 'let n=[t,r,...But,...$ut];',
};

export const CODEX_26_820_60940_PATCH_PROFILE: CodexPatchProfile = {
  reactAnchor: 'var ea,ta,na,Z,ra,ia,aa,oa,sa,Q=e((()=>{',
  reactIdentifier: 'na',
  jsxIdentifier: 'Z',
  intlIdentifier: 'E',
  thinkingCount: 0,
  reasoningCount: 0,
  thinkingDescriptorIdentifier: 'oa',
  thinkingDescriptorCount: 2,
  hostAnchor: 'let n=[t,r,...bdt,...vdt];',
};

const SUPPORTED_BUILDS: readonly CodexSupportedBuild[] = [
  {
    version: '26.623.141536',
    hostSha256: '50e1c9e90d8575515b0f169abddabd00bd5aae2989df38a3b4c6bc6e2e74d445',
    webviewSha256: '75fb9945bd4c268d5505cd35dea8e03eaf46c0f050cabec778afdcbe8257e05a',
    patchProfile: LEGACY_CODEX_PATCH_PROFILE,
  },
  {
    version: '26.707.71524',
    hostSha256: 'bd000a4ac75e947bf81f10201b6d771f1255180f8f1efc4165b7f755ebdc420d',
    webviewSha256: '2942b7b29ab998b72680e499369bb6f17aaddd689ee29581d7261237bbb6876d',
    patchProfile: CODEX_26_707_PATCH_PROFILE,
    shimmerSha256: '4c91733cbf4948b50b02c6bc3a6590e7ed218e21e8dfbddc5cd1a3f3d955a140',
    shimmerPatchProfile: CODEX_26_707_SHIMMER_PATCH_PROFILE,
  },
  {
    version: '26.707.91948',
    hostSha256: 'bd000a4ac75e947bf81f10201b6d771f1255180f8f1efc4165b7f755ebdc420d',
    webviewSha256: '6604a581f475f86e1cb65108e5accc38cd9694232f8297216e6ac631e16ee50f',
    patchProfile: CODEX_26_707_91948_PATCH_PROFILE,
    shimmerSha256: '4eebc888d5fed0f4ee4aeba142c6296d32dcb4bbbe136bbb710fdc03a0b00dca',
    shimmerPatchProfile: CODEX_26_707_SHIMMER_PATCH_PROFILE,
  },
  {
    version: '26.715.31925',
    hostSha256: '82c37c10459460bd84f68bc47b77d58dad5a9dda09061e31fc8ecee9d378a827',
    webviewSha256: 'f63a12ba815cd82719d90eb6a8f570f3598b87bcb3158522187c7a082ba3a465',
    patchProfile: CODEX_26_715_31925_PATCH_PROFILE,
    shimmerSha256: 'bc928b184ba150446923e759defc6d04dcb67ca5c2842bad5750224f0e086e4d',
    shimmerPatchProfile: CODEX_26_715_31925_SHIMMER_PATCH_PROFILE,
  },
  {
    version: '26.721.30844',
    hostSha256: '5a27120dbeba4b9b3a7101a061d8e76de138e57d3688e4f0ac8ec8c1b448cebe',
    webviewSha256: 'bfc3600bbe3e1d83404e683ff0e04b6d3ff09948376d271b4c491a20e690dea3',
    patchProfile: CODEX_26_721_30844_PATCH_PROFILE,
  },
  {
    version: '26.721.41059',
    hostSha256: '7408425e3fe73d0443ea1cba3a0ffb6de2ed7426ecec8372b8746cf440227ddd',
    webviewSha256: 'b30c8571171acd122bcad8304fa98215fa23e7a852bc051ac61bfc3e275d219b',
    patchProfile: CODEX_26_721_41059_PATCH_PROFILE,
  },
  {
    version: '26.727.40816',
    hostSha256: 'b0b1f3bbd6266e63c40b32cdb31a8fd9cca37cfb157bbf72653fc3964747e354',
    webviewSha256: 'f79167332a57da597a16874102a4f38ecd45c4e52a3352e340cb4cec3a9c66b3',
    patchProfile: CODEX_26_727_40816_PATCH_PROFILE,
    shimmerSha256: 'a0fd63304966f1ce597859df4419c13bd4225ffb0c34093e2b6b13d3f4ddcc25',
    shimmerPatchProfile: CODEX_26_727_40816_SHIMMER_PATCH_PROFILE,
  },
  {
    version: '26.5727.51351',
    hostSha256: '50d179dd12551a078f99dd6c7b887b25c34d10c48080c7c693af6f5969d025c4',
    webviewSha256: 'bd2ca30ef35807658aff1487d50de0e2861e5303aeb8b71fb41568b7301bfc42',
    patchProfile: CODEX_26_5727_51351_PATCH_PROFILE,
    shimmerSha256: 'c3e82c27eacbe8293e19148c9e811ad153ea7fa3bcd432997af778352d51f601',
    shimmerPatchProfile: CODEX_26_5727_51351_SHIMMER_PATCH_PROFILE,
  },
  {
    version: '26.803.41515',
    hostSha256: '15870d0e9b3d7b67d5a6600e34399b883bd860daae899912361a764df6ae73bb',
    webviewSha256: '017ea30658504b9fd60c91889db8a9d9e0d9c854d9ad7ddce26793eeffb7c561',
    patchProfile: CODEX_26_803_41515_PATCH_PROFILE,
    shimmerSha256: '0e2fc93be1046c281e7d5660cd77383a05fdafb9fc99a5163c70116cc471c8ff',
    shimmerPatchProfile: CODEX_26_803_41515_SHIMMER_PATCH_PROFILE,
  },
  {
    version: '26.810.41047',
    hostSha256: '5669921cf77b0de7e49c8e6c6ac6283baa593ccf131bef7b2eac3e1b8eeaf859',
    webviewSha256: 'ed8ff53c926e2e5364209032d5b4e7330e1d4c3c3f73c95d73fd9506ed1bb19b',
    patchProfile: CODEX_26_810_41047_PATCH_PROFILE,
    shimmerSha256: '33d7edb055047aa6699cf2e1b140982fc83efbb01ddc2f3089784214a0e0c0ea',
    shimmerPatchProfile: CODEX_26_810_41047_SHIMMER_PATCH_PROFILE,
  },
  {
    version: '26.810.52044',
    hostSha256: '5669921cf77b0de7e49c8e6c6ac6283baa593ccf131bef7b2eac3e1b8eeaf859',
    webviewSha256: '59be5c326b276163aafaff9d724729da5361526f0eb23380ab46d2507a790e8a',
    patchProfile: CODEX_26_810_52044_PATCH_PROFILE,
    shimmerSha256: '76988e6021721320f6cdc3afeec7f655f13f6c55a87f6661cd5004eefc954451',
    shimmerPatchProfile: CODEX_26_810_52044_SHIMMER_PATCH_PROFILE,
  },
  {
    version: '26.814.41407',
    hostSha256: 'bfbe07b5fcd521b743b6e548b04781ff9ed92f34da24b180c85180a92b8db8b7',
    webviewSha256: 'ba383878e0facc09f5d4b378fb79d67f6d8e733ca1ab15a834fa8f603e4a4389',
    patchProfile: CODEX_26_814_41407_PATCH_PROFILE,
    shimmerSha256: '748ad150adab6cae28aa6e9c9d882f3cc341e822069f9b5b7640f6460c3eb224',
    shimmerPatchProfile: CODEX_26_814_41407_SHIMMER_PATCH_PROFILE,
  },
  {
    version: '26.818.31338',
    hostSha256: '8fb401d3e2fdc02a4892cc896c4b2c459030e1ccbe58a2e8e82249016621b690',
    webviewSha256: 'a27ad88a356f1edf14ec817da7a9454e5c37dd5fbd67aef8e47ea69c4f0a152b',
    patchProfile: CODEX_26_818_31338_PATCH_PROFILE,
  },
  {
    version: '26.818.41705',
    hostSha256: 'ecbc2fc452dde64f9be4bcd93928a18bd091f2d7f23dcb6ef756b4c239c2747d',
    webviewSha256: 'd57e55eea16a349dae367f26512b1199397f984840275e7e12ced882b40d89fd',
    patchProfile: CODEX_26_818_41705_PATCH_PROFILE,
  },
  {
    version: '26.818.61809',
    hostSha256: 'ef5fe33f04826846875c95a3da12c2c2ab7dfc7a34472c0cee5783cb101544e7',
    webviewSha256: '79d16f04d2e99adeda0045af2aea38ac0de9f83e2cb230e4f3cb18ff27e5c276',
    patchProfile: CODEX_26_818_61809_PATCH_PROFILE,
  },
  {
    version: '26.820.60940',
    hostSha256: '8cf883c518aa255f064ff6809cca9f3c476d165a288932be89cfc7bbcce4b7be',
    webviewSha256: '2a8fe764d9e99efdf8858da4640dac29e7c293922aa1f6393c599728e4002fad',
    patchProfile: CODEX_26_820_60940_PATCH_PROFILE,
  },
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
    supportedBuild?: CodexSupportedBuild,
  ) {
    this.statePath = path.join(kodpauzaHome, PATCH_STATE_FILE);
    this.supportedBuild =
      supportedBuild ?? SUPPORTED_BUILDS.find((build) => build.version === codexVersion);
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
        codexVersion: this.codexVersion,
      };
    }

    const rawPatchStates = [
      candidates.hostSource.includes(CSP_MARKER_START),
      candidates.webviewSource.includes(UI_MARKER_PREFIX),
      ...(candidates.shimmerSource?.includes(UI_MARKER_PREFIX) ? [true] : []),
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
        : {}),
    };

    return {
      installed: false,
      compatible: Boolean(this.supportedBuild),
      compatibilityMode: this.compatibilityMode,
      codexVersion: this.codexVersion,
      ...paths,
    };
  }

  async install(): Promise<CodexPatchMutationResult> {
    const current = await this.inspect();
    if (current.installed) {
      return { ...current, changed: false };
    }
    if (!current.compatible) {
      throw new Error(
        `Версия Codex ${this.codexVersion} изменила структуру UI. Реклама безопасно отключена.`,
      );
    }
    const supportedBuild = this.supportedBuild;
    if (!supportedBuild) {
      throw new Error(`Версия Codex ${this.codexVersion} пока не поддерживается патчем Kodpauza.`);
    }

    const paths = await this.resolvePatchPaths(true);
    const [hostSource, webviewSource, shimmerSource] = await Promise.all([
      readTextFile(paths.hostPath),
      readTextFile(paths.webviewPath),
      paths.shimmerPath ? readTextFile(paths.shimmerPath) : undefined,
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
    const patchedShimmer =
      supportedBuild.shimmerPatchProfile && shimmerSource
        ? patchThinkingShimmerSource(shimmerSource, token, supportedBuild.shimmerPatchProfile)
        : undefined;
    assertJavaScriptParses(patchedHost, 'Codex out/extension.js');
    assertJavaScriptParses(patchedWebview, 'Codex local-conversation-turn.js');
    if (patchedShimmer) {
      assertJavaScriptParses(patchedShimmer, 'Codex thinking-shimmer.js');
    }
    const backupDirectory = await this.createBackup(paths);
    const files = [
      backupRecord(
        this.extensionPath,
        paths.hostPath,
        path.join(backupDirectory, 'extension.js'),
        hostSource,
      ),
      backupRecord(
        this.extensionPath,
        paths.webviewPath,
        path.join(backupDirectory, path.basename(paths.webviewPath)),
        webviewSource,
      ),
    ];
    if (paths.shimmerPath && shimmerSource) {
      files.push(
        backupRecord(
          this.extensionPath,
          paths.shimmerPath,
          path.join(backupDirectory, path.basename(paths.shimmerPath)),
          shimmerSource,
        ),
      );
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
      files,
    };

    await fs.mkdir(this.kodpauzaHome, { recursive: true, mode: 0o700 });
    await atomicWrite(this.statePath, `${JSON.stringify(manifest, null, 2)}\n`, 0o600);
    try {
      await assertFilesUnchanged([
        { filePath: paths.hostPath, expectedSource: hostSource, label: 'Codex out/extension.js' },
        {
          filePath: paths.webviewPath,
          expectedSource: webviewSource,
          label: 'Codex local-conversation-turn.js',
        },
        ...(paths.shimmerPath && shimmerSource
          ? [
              {
                filePath: paths.shimmerPath,
                expectedSource: shimmerSource,
                label: 'Codex thinking-shimmer.js',
              },
            ]
          : []),
      ]);
      if (paths.shimmerPath && patchedShimmer) {
        await atomicWritePreservingMode(paths.shimmerPath, patchedShimmer);
      }
      await atomicWritePreservingMode(paths.webviewPath, patchedWebview);
      await atomicWritePreservingMode(paths.hostPath, patchedHost);
      await assertPatchedFiles([
        { filePath: paths.hostPath, expectedSource: patchedHost, label: 'Codex out/extension.js' },
        {
          filePath: paths.webviewPath,
          expectedSource: patchedWebview,
          label: 'Codex local-conversation-turn.js',
        },
        ...(paths.shimmerPath && patchedShimmer
          ? [
              {
                filePath: paths.shimmerPath,
                expectedSource: patchedShimmer,
                label: 'Codex thinking-shimmer.js',
              },
            ]
          : []),
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
      backupDirectory,
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
        throw new Error(
          'Не найдена резервная копия файлов Codex. Автоматический откат остановлен.',
        );
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
        changed: true,
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
      changed: true,
    };
  }

  private async inspectManifestInstallation(
    manifest: PatchManifest,
  ): Promise<CodexPatchStatus | undefined> {
    const extensionRoot = path.resolve(this.extensionPath);
    const sources = await Promise.all(
      manifest.files.map(async (file) => {
        const filePath = path.resolve(extensionRoot, file.relativePath);
        if (!isPathInside(extensionRoot, filePath)) {
          throw new Error('Манифест патча Codex указывает за пределы расширения.');
        }
        return { filePath, source: await readTextFile(filePath) };
      }),
    );
    const states = sources.map(({ filePath, source }) =>
      path.basename(filePath) === 'extension.js'
        ? source.includes(CSP_MARKER_START) && source.includes(CSP_MARKER_END)
        : Boolean(extractToken(source)) && source.includes(UI_MARKER_END),
    );
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
    const hostPath = sources.find(
      ({ filePath }) => path.basename(filePath) === 'extension.js',
    )?.filePath;
    const webviewPath = sources.find(({ filePath }) =>
      /^local-conversation-turn-/.test(path.basename(filePath)),
    )?.filePath;
    const shimmerPath = sources.find(({ filePath }) =>
      /^thinking-shimmer-/.test(path.basename(filePath)),
    )?.filePath;
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
      shimmerPath,
    };
  }

  private async readSourceCandidates(required: true): Promise<CodexSourceCandidates>;
  private async readSourceCandidates(required: false): Promise<CodexSourceCandidates | undefined>;
  private async readSourceCandidates(
    required: boolean,
  ): Promise<CodexSourceCandidates | undefined> {
    const hostPath = path.join(this.extensionPath, 'out', 'extension.js');
    const assetsDirectory = path.join(this.extensionPath, 'webview', 'assets');
    const entries = await fs.readdir(assetsDirectory, { withFileTypes: true }).catch(() => []);
    const webviewCandidates = entries
      .filter(
        (entry) =>
          entry.isFile() && /^local-conversation-turn-[A-Za-z0-9_-]+\.js$/.test(entry.name),
      )
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
        throw new Error(
          'Структура установленного расширения Codex не распознана. Файлы не изменены.',
        );
      }
      return undefined;
    }
    const webviewPath = webviewCandidates[0];
    const shimmerPath = shimmerCandidates[0];
    const [hostSource, webviewSource, shimmerSource] = await Promise.all([
      readTextFile(hostPath),
      readTextFile(webviewPath),
      shimmerPath ? readTextFile(shimmerPath) : undefined,
    ]);
    return { hostPath, webviewPath, shimmerPath, hostSource, webviewSource, shimmerSource };
  }

  private resolveCompatibleBuild(candidates: CodexSourceCandidates): void {
    const currentBuild = this.supportedBuild;
    if (currentBuild && codexBuildHashesMatch(currentBuild, candidates)) {
      if (this.compatibilityMode !== 'structural') {
        this.compatibilityMode = 'exact';
      }
      return;
    }

    const inferredProfile = inferCodexCompatibilityProfile(candidates);
    const profiles = uniqueCompatibilityProfiles([
      ...uniqueCodexProfiles([...(currentBuild ? [currentBuild] : []), ...SUPPORTED_BUILDS]),
      ...(inferredProfile ? [inferredProfile] : []),
    ]);
    const matches = profiles.filter((profile) => {
      try {
        const token = '0'.repeat(64);
        const patchedHost = patchHostSource(candidates.hostSource, profile.patchProfile);
        const patchedWebview = patchWebviewSource(
          candidates.webviewSource,
          token,
          profile.patchProfile,
        );
        assertJavaScriptParses(patchedHost, 'Codex out/extension.js');
        assertJavaScriptParses(patchedWebview, 'Codex local-conversation-turn.js');
        if (profile.shimmerPatchProfile) {
          if (!candidates.shimmerSource) {
            return false;
          }
          const patchedShimmer = patchThinkingShimmerSource(
            candidates.shimmerSource,
            token,
            profile.shimmerPatchProfile,
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
            shimmerPatchProfile: match.shimmerPatchProfile,
          }
        : {}),
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
      .filter(
        (entry) =>
          entry.isFile() && /^local-conversation-turn-[A-Za-z0-9_-]+\.js$/.test(entry.name),
      )
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
        throw new Error(
          'Структура установленного расширения Codex не распознана. Файлы не изменены.',
        );
      }
      return undefined;
    }
    return {
      hostPath,
      webviewPath: webviewCandidates[0],
      shimmerPath: shimmerRequired ? shimmerCandidates[0] : undefined,
    };
  }

  private async createBackup(paths: PatchPaths): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDirectory = path.join(
      this.kodpauzaHome,
      'backups',
      `codex-ui-${this.codexVersion}-${timestamp}`,
    );
    await fs.mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    const backupOperations = [
      fs.copyFile(paths.hostPath, path.join(backupDirectory, 'extension.js')),
      fs.copyFile(paths.webviewPath, path.join(backupDirectory, path.basename(paths.webviewPath))),
    ];
    if (paths.shimmerPath) {
      backupOperations.push(
        fs.copyFile(
          paths.shimmerPath,
          path.join(backupDirectory, path.basename(paths.shimmerPath)),
        ),
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
      path.resolve(manifest.extensionPath, file.relativePath),
    );
    const targetExists = await Promise.all(targetPaths.map(fileExists));
    if (targetExists.every((exists) => !exists)) {
      await fs.rm(this.statePath, { force: true });
      return;
    }
    if (!targetExists.every(Boolean)) {
      throw new Error(
        'Предыдущий патч Codex найден частично. Автоматическое обновление остановлено.',
      );
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
      const isKodpauzaPatch =
        path.basename(targetPath) === 'extension.js'
          ? source.includes(CSP_MARKER_START) && source.includes(CSP_MARKER_END)
          : source.includes(UI_MARKER_PREFIX) && source.includes(UI_MARKER_END);
      if (!isOriginal && !isKodpauzaPatch) {
        throw new Error(
          `Файл Codex ${path.basename(targetPath)} изменен после установки. Автоматическое восстановление остановлено.`,
        );
      }
    }
  }

  private async restoreFromManifest(manifest: PatchManifest): Promise<void> {
    const extensionRoot = path.resolve(manifest.extensionPath);
    const backupRoot = path.resolve(this.kodpauzaHome, 'backups');
    for (const file of manifest.files) {
      const targetPath = path.resolve(extensionRoot, file.relativePath);
      if (!isPathInside(extensionRoot, targetPath)) {
        throw new Error(
          'Файл резервной копии указывает за пределы установленного расширения Codex.',
        );
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
  profile: CodexPatchProfile = LEGACY_CODEX_PATCH_PROFILE,
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
  if (profile.thinkingCount > 0) {
    patched = replaceExact(
      patched,
      thinkingFallback,
      `(0,${jsx}.jsx)(__kpAdMessage,{fallback:${thinkingFallback}})`,
      profile.thinkingCount,
      'активные строки Thinking',
    );
  }

  if (profile.thinkingDescriptorIdentifier) {
    const descriptorFallback = `(0,${jsx}.jsx)(${intl},{...${profile.thinkingDescriptorIdentifier}.thinking})`;
    patched = replaceExact(
      patched,
      descriptorFallback,
      `(0,${jsx}.jsx)(__kpAdMessage,{fallback:${descriptorFallback}})`,
      profile.thinkingDescriptorCount ?? 0,
      'видимый placeholder Thinking',
    );
  }

  const reasoningFallback = `(0,${jsx}.jsx)(${intl},{id:\`reasoningItem.thinking\`,defaultMessage:\`Thinking\`,description:\`Message shown when AI is currently thinking\`})`;
  const reasoningCount = profile.reasoningCount ?? 1;
  if (reasoningCount > 0) {
    patched = replaceExact(
      patched,
      reasoningFallback,
      `(0,${jsx}.jsx)(__kpAdMessage,{fallback:${reasoningFallback}})`,
      reasoningCount,
      'строка Thinking в блоке рассуждения',
    );
  }

  if (profile.exploringChildrenIdentifier) {
    const exploringFallback = `(0,${jsx}.jsx)(${intl},{id:\`localConversationTurn.exploration.accordion.header.active\`,defaultMessage:\`Exploring\`,description:\`Header for the exploration accordion while Codex is listing or reading files\`,children:${profile.exploringChildrenIdentifier}})`;
    patched = replaceExact(
      patched,
      exploringFallback,
      `(0,${jsx}.jsx)(__kpAdMessage,{fallback:${exploringFallback}})`,
      1,
      'активная строка Exploring',
    );
  }

  return patched;
}

export function patchThinkingShimmerSource(
  source: string,
  token: string,
  profile: CodexShimmerPatchProfile,
): string {
  validateToken(token);
  if (source.includes(UI_MARKER_PREFIX)) {
    throw new Error('UI-патч Kodpauza уже присутствует в файле Codex.');
  }
  validateShimmerPatchProfile(profile);

  const injected = `${uiRuntime(token, profile)}${profile.reactAnchor}`;
  let patched = replaceExact(
    source,
    profile.reactAnchor,
    injected,
    1,
    'точка подключения React в строке ожидания',
  );
  const thinkingFallback = `(0,${profile.jsxIdentifier}.jsx)(${profile.intlIdentifier},{id:\`thinkingShimmer.default\`,defaultMessage:\`Thinking\`,description:\`Default placeholder shown while the assistant is thinking\`})`;
  patched = replaceExact(
    patched,
    thinkingFallback,
    `(0,${profile.jsxIdentifier}.jsx)(__kpAdMessage,{fallback:${thinkingFallback}})`,
    1,
    'видимая строка Thinking',
  );
  return patched;
}

export function patchHostSource(
  source: string,
  profile: CodexPatchProfile = LEGACY_CODEX_PATCH_PROFILE,
): string {
  if (source.includes(CSP_MARKER_START)) {
    throw new Error('CSP-патч Kodpauza уже присутствует в файле Codex.');
  }
  validatePatchProfile(profile);
  const anchor = profile.hostAnchor;
  const prefix = anchor.match(
    /^let [A-Za-z_$][A-Za-z0-9_$]*=\[[A-Za-z_$][A-Za-z0-9_$]*,[A-Za-z_$][A-Za-z0-9_$]*,/,
  )?.[0];
  if (!prefix) {
    throw new Error('Некорректный профиль CSP-патча Codex.');
  }
  const replacement = `${prefix}${CSP_MARKER_START}"http://127.0.0.1:${CODEX_UI_BRIDGE_PORT}"${CSP_MARKER_END},${anchor.slice(prefix.length)}`;
  return replaceExact(source, anchor, replacement, 1, 'политика подключения webview');
}

function uiRuntime(
  token: string,
  profile: Pick<CodexPatchProfile, 'reactIdentifier' | 'jsxIdentifier'>,
): string {
  const endpoint = `http://127.0.0.1:${CODEX_UI_BRIDGE_PORT}/v1/codex/ad`;
  const react = profile.reactIdentifier;
  const jsx = profile.jsxIdentifier;
  const visibilityRuntime = webviewVisibilityRuntime('__kp', '__kpEndpoint', '__kpToken');
  const baseRuntime = `${UI_MARKER_PREFIX}${token}__*/var __kpEndpoint=${JSON.stringify(endpoint)},__kpToken=${JSON.stringify(token)},__kpAdState=null,__kpSubscribers=new Set,__kpTimer,__kpActivityRefs=0,__kpActivityTimer,__kpActivityViewId="kp-"+Math.random().toString(36).slice(2)+Date.now().toString(36),__kpCanaryViewId="kp-canary-"+Math.random().toString(36).slice(2)+Date.now().toString(36);function __kpSendActivity(e){fetch(__kpEndpoint+"/activity?token="+encodeURIComponent(__kpToken),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({viewId:__kpActivityViewId,active:e})}).catch(()=>{})}function __kpStartActivity(){__kpActivityRefs+=1,__kpActivityRefs===1&&(__kpSendActivity(!0),__kpActivityTimer=setInterval(()=>__kpSendActivity(!0),1e3))}function __kpStopActivity(){__kpActivityRefs=Math.max(0,__kpActivityRefs-1),__kpActivityRefs===0&&(__kpActivityTimer!=null&&clearInterval(__kpActivityTimer),__kpActivityTimer=void 0,__kpSendActivity(!1))}function __kpUseActivity(){(0,${react}.useEffect)(()=>{__kpStartActivity();return()=>__kpStopActivity()},[])}function __kpSnapshot(){return __kpAdState}function __kpNotify(){for(let e of __kpSubscribers)e()}function __kpSafeIcon(e){if(typeof e!="string")return null;if(e.length<=9e4&&/^data:image\\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(e))return e;if(e.length>8e3||!e.startsWith("data:image/svg+xml,"))return null;try{let t=decodeURIComponent(e.slice(19));return/^<svg[\\s>]/i.test(t)&&/<\\/svg>$/i.test(t)&&!/(?:<script|<foreignObject|<image|\\bhref\\s*=|\\burl\\s*\\(|@import|\\bon[a-z]+\\s*=)/i.test(t)?e:null}catch{return null}}function __kpSafeDomain(e){return typeof e=="string"&&e.length<=253&&/^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(e)?e:null}function __kpSetAd(e){e?.canary===!0&&typeof e.adId=="string"&&(__kpVisibilityHeartbeat(e,__kpCanaryViewId,!0),e=null);let t=e&&e.active===!0&&typeof e.adId=="string"&&typeof e.text=="string"&&(e.format==="standard"||e.format==="premium")?{active:!0,adId:e.adId,text:e.text,format:e.format,advertiserName:typeof e.advertiserName=="string"&&e.advertiserName.trim().length>0&&e.advertiserName.length<=160?e.advertiserName.trim():"Kodpauza",iconUrl:__kpSafeIcon(e.iconUrl),domain:__kpSafeDomain(e.domain)}:null;if(__kpAdState?.adId===t?.adId&&__kpAdState?.text===t?.text&&__kpAdState?.format===t?.format&&__kpAdState?.iconUrl===t?.iconUrl&&__kpAdState?.domain===t?.domain&&__kpAdState?.advertiserName===t?.advertiserName)return;__kpAdState=t,__kpNotify()}function __kpPoll(){fetch(__kpEndpoint+"/current?token="+encodeURIComponent(__kpToken),{cache:"no-store"}).then(e=>e.ok?e.json():null).then(__kpSetAd).catch(()=>__kpSetAd(null)).finally(()=>{__kpSubscribers.size>0&&(__kpTimer=setTimeout(__kpPoll,750))})}function __kpSubscribe(e){return __kpSubscribers.add(e),__kpSubscribers.size===1&&__kpPoll(),()=>{__kpSubscribers.delete(e),__kpSubscribers.size===0&&(__kpTimer!=null&&clearTimeout(__kpTimer),__kpTimer=void 0)}}function __kpUseAd(){return(0,${react}.useSyncExternalStore)(__kpSubscribe,__kpSnapshot,__kpSnapshot)}${visibilityRuntime}function __kpOpenAd(e){fetch(__kpEndpoint+"/click?token="+encodeURIComponent(__kpToken),{method:"POST",headers:{"content-type":"text/plain"},body:e.adId}).catch(()=>{})}`;
  const adMessageRuntime = `function __kpAdMessage(e){__kpUseActivity();let t=__kpUseAd(),n=(0,${react}.useRef)(null);(0,${react}.useEffect)(()=>t?__kpObserveVisibility(n.current,t):void 0,[t?.adId]);if(t==null)return e.fallback;let r=e=>{e.preventDefault(),e.stopPropagation(),__kpOpenAd(t)},i=e=>{(e.key==="Enter"||e.key===" ")&&r(e)},o=t.format==="premium",a=t.advertiserName.slice(0,1).toUpperCase()||"K",c=t.domain,h=t.advertiserName+" · ",u=t.text.toLowerCase().startsWith(h.toLowerCase())?t.text.slice(h.length).trim()||t.text:t.text,s=t.advertiserName+": "+u+(c?" · "+c:"")+". Нажмите, чтобы открыть.";if(o)return(0,${jsx}.jsxs)("span",{"data-kodpauza-ad":"",ref:n,className:"inline-flex max-w-full min-w-0 items-center",role:"link",tabIndex:0,title:s,"aria-label":s,onClick:r,onKeyDown:i,style:{cursor:"pointer",display:"inline-flex",alignItems:"center",gap:"7px",background:"rgba(245,158,11,.10)",border:"1px solid rgba(245,158,11,.32)",borderLeft:"3px solid rgba(245,158,11,.78)",borderRadius:"7px",padding:"4px 7px 4px 6px",maxWidth:"100%",minWidth:0,boxSizing:"border-box",overflow:"hidden"},children:[t.iconUrl?(0,${jsx}.jsx)("img",{src:t.iconUrl,alt:"",width:21,height:21,className:"shrink-0",style:{width:"21px",height:"21px",objectFit:"contain",borderRadius:"5px"}}):(0,${jsx}.jsx)("span",{"aria-hidden":"true",className:"shrink-0 inline-flex items-center justify-center",style:{width:"21px",height:"21px",borderRadius:"5px",fontSize:"10px",lineHeight:"21px",fontWeight:700,color:"#fbbf24",background:"rgba(245,158,11,.16)"},children:a}),(0,${jsx}.jsxs)("span",{className:"min-w-0",style:{display:"flex",flexDirection:"column",flex:"1 1 auto",minWidth:0,lineHeight:1.2},children:[(0,${jsx}.jsxs)("span",{className:"min-w-0",style:{display:"flex",alignItems:"baseline",gap:"4px",minWidth:0,fontSize:"10px",opacity:.82},children:[(0,${jsx}.jsx)("span",{className:"truncate",style:{fontWeight:700,minWidth:0},children:t.advertiserName}),c?(0,${jsx}.jsx)("span",{className:"truncate",style:{minWidth:0,opacity:.78},children:c}):null]}),(0,${jsx}.jsx)("span",{className:"truncate",style:{minWidth:0,fontSize:"12px",marginTop:"1px"},children:u})]}),(0,${jsx}.jsx)("span",{"aria-hidden":"true",className:"shrink-0",style:{fontSize:"12px",lineHeight:1,opacity:.72},children:"↗"})]});return(0,${jsx}.jsxs)("span",{"data-kodpauza-ad":"",ref:n,className:"inline-flex max-w-full min-w-0 items-center gap-1.5",role:"link",tabIndex:0,title:s,"aria-label":s,onClick:r,onKeyDown:i,style:{cursor:"pointer",borderBottom:"1px solid rgba(148,163,184,.34)",paddingBottom:"1px",maxWidth:"100%"},children:[t.iconUrl?(0,${jsx}.jsx)("img",{src:t.iconUrl,alt:"",width:14,height:14,className:"shrink-0",style:{width:"14px",height:"14px",objectFit:"contain",borderRadius:"3px"}}):(0,${jsx}.jsx)("span",{"aria-hidden":"true",className:"shrink-0 inline-flex items-center justify-center",style:{width:"14px",height:"14px",borderRadius:"3px",fontSize:"9px",lineHeight:"14px",fontWeight:700,color:"#34d399",background:"rgba(16,185,129,.12)"},children:a}),(0,${jsx}.jsx)("span",{className:"min-w-0 truncate",children:t.text})]})}`;
  const compliantBaseRuntime = replaceExact(
    baseRuntime,
    'domain:__kpSafeDomain(e.domain)}:null;',
    'domain:__kpSafeDomain(e.domain),erid:typeof e.erid=="string"&&e.erid.length<=80?e.erid:""}:null;',
    1,
    'ERID объявления в UI Codex',
  );
  let compliantAdMessageRuntime = replaceExact(
    adMessageRuntime,
    'h=t.advertiserName+" · "',
    'h="Реклама · "+t.advertiserName+" · "',
    1,
    'маркированный префикс Codex',
  );
  compliantAdMessageRuntime = replaceExact(
    compliantAdMessageRuntime,
    's=t.advertiserName+": "+u+(c?" · "+c:"")+". Нажмите, чтобы открыть."',
    's="Реклама. Рекламодатель: "+t.advertiserName+(c?". Сайт: "+c:"")+(t.erid?". erid: "+t.erid:"")+". Нажмите, чтобы открыть."',
    1,
    'подсказка объявления Codex',
  );
  compliantAdMessageRuntime = replaceExact(
    compliantAdMessageRuntime,
    'children:t.advertiserName',
    'children:"Реклама · "+t.advertiserName',
    1,
    'видимая маркировка premium Codex',
  );
  return `${compliantBaseRuntime}${compliantAdMessageRuntime}${UI_MARKER_END}`;
}

function validatePatchProfile(profile: CodexPatchProfile): void {
  const identifiers = [
    profile.reactIdentifier,
    profile.jsxIdentifier,
    profile.intlIdentifier,
    ...(profile.exploringChildrenIdentifier ? [profile.exploringChildrenIdentifier] : []),
    ...(profile.thinkingDescriptorIdentifier ? [profile.thinkingDescriptorIdentifier] : []),
  ];
  const reasoningCount = profile.reasoningCount ?? 1;
  const hasReplacementTarget =
    profile.thinkingCount > 0 ||
    reasoningCount > 0 ||
    Boolean(profile.thinkingDescriptorIdentifier) ||
    Boolean(profile.exploringChildrenIdentifier);
  if (
    !profile.reactAnchor ||
    !profile.hostAnchor ||
    !Number.isInteger(profile.thinkingCount) ||
    profile.thinkingCount < 0 ||
    profile.thinkingCount > 32 ||
    !Number.isInteger(reasoningCount) ||
    reasoningCount < 0 ||
    reasoningCount > 1 ||
    Boolean(profile.thinkingDescriptorIdentifier) !== Boolean(profile.thinkingDescriptorCount) ||
    (profile.thinkingDescriptorCount !== undefined &&
      (!Number.isInteger(profile.thinkingDescriptorCount) ||
        profile.thinkingDescriptorCount < 1 ||
        profile.thinkingDescriptorCount > 32)) ||
    !hasReplacementTarget ||
    !identifiers.every((identifier) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifier))
  ) {
    throw new Error('Некорректный профиль UI-патча Codex.');
  }
}

function validateShimmerPatchProfile(profile: CodexShimmerPatchProfile): void {
  if (
    !profile.reactAnchor ||
    ![profile.reactIdentifier, profile.jsxIdentifier, profile.intlIdentifier].every((identifier) =>
      /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifier),
    )
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
  label: string,
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

function backupRecord(
  rootPath: string,
  targetPath: string,
  backupPath: string,
  source: string,
): PatchFileRecord {
  return {
    relativePath: path.relative(rootPath, targetPath),
    backupPath,
    originalSha256: sha256(source),
  };
}

function assertOriginalHash(filePath: string, source: string, expected: string): void {
  const actual = sha256(source);
  if (actual !== expected) {
    throw new Error(
      `Файл Codex ${path.basename(filePath)} отличается от проверенной сборки. Патч не применен.`,
    );
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
      ...(build.shimmerPatchProfile ? { shimmerPatchProfile: build.shimmerPatchProfile } : {}),
    };
    unique.set(JSON.stringify(profile), profile);
  }
  return [...unique.values()];
}

function uniqueCompatibilityProfiles(
  profiles: readonly CodexCompatibilityProfile[],
): CodexCompatibilityProfile[] {
  const unique = new Map<string, CodexCompatibilityProfile>();
  for (const profile of profiles) {
    unique.set(JSON.stringify(profile), profile);
  }
  return [...unique.values()];
}

function inferCodexCompatibilityProfile(
  candidates: CodexSourceCandidates,
): CodexCompatibilityProfile | undefined {
  try {
    const patchProfile = inferCodexPatchProfile(candidates.webviewSource, candidates.hostSource);
    if (!candidates.shimmerSource) {
      return { patchProfile };
    }
    if (!candidates.shimmerSource.includes('thinkingShimmer.default')) {
      return undefined;
    }
    return {
      patchProfile,
      shimmerPatchProfile: inferCodexShimmerPatchProfile(candidates.shimmerSource),
    };
  } catch {
    return undefined;
  }
}

function inferCodexPatchProfile(webviewSource: string, hostSource: string): CodexPatchProfile {
  const identifier = '[A-Za-z_$][A-Za-z0-9_$]*';
  const thinkingPattern = new RegExp(
    `\\(0,(${identifier})\\.jsx\\)\\((${identifier}),\\{id:\\x60thinkingShimmer\\.default\\x60,defaultMessage:\\x60Thinking\\x60,description:\\x60Default placeholder shown while the assistant is thinking\\x60\\}\\)`,
    'g',
  );
  const thinkingMatches = [...webviewSource.matchAll(thinkingPattern)];
  const thinkingPairs = new Set(thinkingMatches.map((match) => `${match[1]}:${match[2]}`));
  if (thinkingMatches.length < 1 || thinkingMatches.length > 32 || thinkingPairs.size !== 1) {
    throw new Error('Неоднозначная строка Thinking Codex.');
  }
  const jsxIdentifier = requiredCapture(thinkingMatches[0], 1);
  const intlIdentifier = requiredCapture(thinkingMatches[0], 2);
  const reasoningPattern = new RegExp(
    `\\(0,${escapeRegExp(jsxIdentifier)}\\.jsx\\)\\(${escapeRegExp(intlIdentifier)},\\{id:\\x60reasoningItem\\.thinking\\x60,defaultMessage:\\x60Thinking\\x60,description:\\x60Message shown when AI is currently thinking\\x60\\}\\)`,
    'g',
  );
  if ([...webviewSource.matchAll(reasoningPattern)].length !== 1) {
    throw new Error('Неоднозначная строка reasoning Codex.');
  }

  const exploringPattern = new RegExp(
    `\\(0,${escapeRegExp(jsxIdentifier)}\\.jsx\\)\\(${escapeRegExp(intlIdentifier)},\\{id:\\x60localConversationTurn\\.exploration\\.accordion\\.header\\.active\\x60,defaultMessage:\\x60Exploring\\x60,description:\\x60Header for the exploration accordion while Codex is listing or reading files\\x60,children:(${identifier})\\}\\)`,
    'g',
  );
  const exploringMatches = [...webviewSource.matchAll(exploringPattern)];
  if (exploringMatches.length !== 1) {
    throw new Error('Неоднозначная строка Exploring Codex.');
  }

  const reactMatches = [
    ...webviewSource.matchAll(new RegExp(`\\(0,(${identifier})\\.useSyncExternalStore\\)`, 'g')),
  ];
  if (reactMatches.length !== 1) {
    throw new Error('Неоднозначный React runtime Codex.');
  }
  const reactIdentifier = requiredCapture(reactMatches[0], 1);
  for (const hook of ['useEffect', 'useRef']) {
    const hookPattern = new RegExp(`\\(0,${escapeRegExp(reactIdentifier)}\\.${hook}\\)`, 'g');
    if ([...webviewSource.matchAll(hookPattern)].length < 1) {
      throw new Error(`React runtime Codex не содержит ${hook}.`);
    }
  }
  const reactAnchor = inferReactAnchor(webviewSource, reactIdentifier);
  const hostAnchor = inferHostAnchor(hostSource);

  const descriptorPattern = new RegExp(
    `\\(0,${escapeRegExp(jsxIdentifier)}\\.jsx\\)\\(${escapeRegExp(intlIdentifier)},\\{\\.\\.\\.(${identifier})\\.thinking\\}\\)`,
    'g',
  );
  const descriptorMatches = [...webviewSource.matchAll(descriptorPattern)];
  const descriptorIdentifiers = new Set(descriptorMatches.map((match) => match[1]));
  if (descriptorIdentifiers.size > 1) {
    throw new Error('Неоднозначный descriptor Thinking Codex.');
  }

  return {
    reactAnchor,
    reactIdentifier,
    jsxIdentifier,
    intlIdentifier,
    thinkingCount: thinkingMatches.length,
    ...(descriptorMatches.length > 0
      ? {
          thinkingDescriptorIdentifier: requiredCapture(descriptorMatches[0], 1),
          thinkingDescriptorCount: descriptorMatches.length,
        }
      : {}),
    exploringChildrenIdentifier: requiredCapture(exploringMatches[0], 1),
    hostAnchor,
  };
}

function inferCodexShimmerPatchProfile(source: string): CodexShimmerPatchProfile {
  const identifier = '[A-Za-z_$][A-Za-z0-9_$]*';
  const thinkingPattern = new RegExp(
    `\\(0,(${identifier})\\.jsx\\)\\((${identifier}),\\{id:\\x60thinkingShimmer\\.default\\x60,defaultMessage:\\x60Thinking\\x60,description:\\x60Default placeholder shown while the assistant is thinking\\x60\\}\\)`,
    'g',
  );
  const thinkingMatches = [...source.matchAll(thinkingPattern)];
  if (thinkingMatches.length !== 1) {
    throw new Error('Неоднозначная строка Thinking в shimmer Codex.');
  }
  const refIdentifiers = new Set(
    [...source.matchAll(new RegExp(`\\(0,(${identifier})\\.useRef\\)`, 'g'))].map(
      (match) => match[1],
    ),
  );
  const effectIdentifiers = new Set(
    [...source.matchAll(new RegExp(`\\(0,(${identifier})\\.useEffect\\)`, 'g'))].map(
      (match) => match[1],
    ),
  );
  const reactIdentifiers = [...refIdentifiers].filter((value) => effectIdentifiers.has(value));
  if (reactIdentifiers.length !== 1) {
    throw new Error('Неоднозначный React runtime shimmer Codex.');
  }
  const reactIdentifier = reactIdentifiers[0];
  return {
    reactAnchor: inferReactAnchor(source, reactIdentifier),
    reactIdentifier,
    jsxIdentifier: requiredCapture(thinkingMatches[0], 1),
    intlIdentifier: requiredCapture(thinkingMatches[0], 2),
  };
}

function inferReactAnchor(source: string, reactIdentifier: string): string {
  const identifier = '[A-Za-z_$][A-Za-z0-9_$]*';
  const pattern = new RegExp(
    `var ${escapeRegExp(reactIdentifier)}=${identifier}\\(${identifier}\\(\\)(?:,1)?\\),${identifier}=`,
    'g',
  );
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error('Неоднозначная точка подключения React Codex.');
  }
  return matches[0][0];
}

function inferHostAnchor(source: string): string {
  const identifier = '[A-Za-z_$][A-Za-z0-9_$]*';
  const pattern = new RegExp(
    `function ${identifier}\\(\\{cspSource:(${identifier}),devOrigin:(${identifier}),extensionSentryOrigin:(${identifier})\\}\\)\\{(let (${identifier})=\\[\\1,\\3,\\.\\.\\.${identifier},\\.\\.\\.${identifier}\\];)`,
    'g',
  );
  const matches = [...source.matchAll(pattern)].filter((match) => {
    const index = match.index ?? -1;
    if (index < 0) {
      return false;
    }
    const listIdentifier = requiredCapture(match, 5);
    const contract = source.slice(index, index + 4_000);
    return [
      `"default-src 'none'"`,
      '`img-src ',
      '`script-src ',
      '`connect-src ',
      `${listIdentifier}.join(" ")`,
    ].every((anchor) => contract.includes(anchor));
  });
  if (matches.length !== 1) {
    throw new Error('Неоднозначная CSP-политика Codex.');
  }
  return requiredCapture(matches[0], 4);
}

function requiredCapture(match: RegExpMatchArray, index: number): string {
  const value = match[index];
  if (!value) {
    throw new Error('Структурный якорь Codex не содержит ожидаемое значение.');
  }
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function codexBuildHashesMatch(
  build: CodexSupportedBuild,
  candidates: CodexSourceCandidates,
): boolean {
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
      sha256(candidates.shimmerSource) === build.shimmerSha256,
    );
  }
  return !candidates.shimmerSource?.includes('thinkingShimmer.default');
}

async function assertPatchedFiles(
  files: readonly { filePath: string; expectedSource: string; label: string }[],
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
  return (
    relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  );
}
