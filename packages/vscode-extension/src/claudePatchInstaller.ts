import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as acorn from './vendor/acorn';
import { CODEX_UI_BRIDGE_PORT } from './codexPatchInstaller';
import { defaultKodpauzaHome } from './codexHookInstaller';
import {
  assertFilesUnchanged,
  assertJavaScriptParses,
  PatchCompatibilityMode,
} from './patchSafety';
import { webviewVisibilityRuntime } from './uiVisibilityRuntime';

const PATCH_STATE_FILE = 'claude-ui-patch.json';
const PATCH_REVISION = 9;
const UI_MARKER_PREFIX = '/*__KODPAUZA_CLAUDE_UI_START__:';
const UI_MARKER_END = '/*__KODPAUZA_CLAUDE_UI_END__*/';
const CSP_MARKER_START = '<!--__KODPAUZA_CLAUDE_CSP_START__-->';
const CSP_MARKER_END = '<!--__KODPAUZA_CLAUDE_CSP_END__-->';
const MAX_PATCH_FILE_BYTES = 8 * 1024 * 1024;

export type ClaudePatchProfile = {
  cspFinalIdentifier: string;
  cspFirstIdentifier?: string;
  cspSecondIdentifier?: string;
  cspThirdIdentifier?: string;
  cspNonceIdentifier?: string;
  componentIdentifier: string;
  verbsIdentifier: string;
  randomIdentifier: string;
  schedulerIdentifier: string;
  animateIdentifier: string;
  stylesIdentifier: string;
  spinnerFramesIdentifier: string;
  structuralSpinnerAnchor?: string;
  structuralTextAnchor?: string;
  stateHookIdentifier?: string;
  effectHookIdentifier?: string;
  containerElementIdentifier?: string;
  childElementIdentifier?: string;
  statusLocalIdentifier?: string;
  animatedLocalIdentifier?: string;
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
  spinnerFramesIdentifier: 'rQe',
};

export const CLAUDE_2_1_209_PROFILE: ClaudePatchProfile = {
  cspFinalIdentifier: 'v',
  componentIdentifier: 'oQe',
  verbsIdentifier: 'M8t',
  randomIdentifier: 'Bj',
  schedulerIdentifier: 'Vme',
  animateIdentifier: 'A8t',
  stylesIdentifier: 'Fj',
  spinnerFramesIdentifier: 'iQe',
};

export const CLAUDE_2_1_212_PROFILE: ClaudePatchProfile = {
  ...CLAUDE_2_1_209_PROFILE,
  cspFinalIdentifier: 'h',
};

export const CLAUDE_2_1_214_PROFILE: ClaudePatchProfile = {
  ...CLAUDE_2_1_212_PROFILE,
};

const CLAUDE_2_1_238_SPINNER_ANCHOR =
  'function urt({size:e=16,permissionMode:t,status:i,spinnerVerbsConfig:n}){let o=to(()=>sHt(n),[n]),r=to(()=>Math.max(...o.map((p)=>p.length)),[o]),[s,a]=ie(0),[l,c]=ie(()=>FG(o));re(()=>{let p=setInterval(()=>{a((f)=>(f+1)%crt.length)},120);return()=>clearInterval(p)},[]),_G(()=>{c(FG(o))},(p)=>{let f=[2000,3000,5000];return p<f.length?f[p]:5000});let u=l;if(i==="compacting")u="Compacting";let h=aHt(u+"...",r+3);return I("div",{className:OG.container,"data-permission-mode":t,children:[b("span",{"aria-hidden":"true",className:OG.icon,style:{fontSize:`${e}px`},children:crt[s]}),b("span",{"aria-hidden":"true",className:OG.text,children:h}),b("span",{className:H6.visuallyHidden,children:i==="compacting"?"Compacting conversation":"Claude is working"})]})}';

export const CLAUDE_2_1_238_PROFILE: ClaudePatchProfile = {
  cspFirstIdentifier: 'p',
  cspSecondIdentifier: 'f',
  cspThirdIdentifier: 'h',
  cspNonceIdentifier: 'u',
  cspFinalIdentifier: 'g',
  componentIdentifier: 'urt',
  verbsIdentifier: 'sHt',
  randomIdentifier: 'FG',
  schedulerIdentifier: '_G',
  animateIdentifier: 'aHt',
  stylesIdentifier: 'OG',
  spinnerFramesIdentifier: 'crt',
  structuralSpinnerAnchor: CLAUDE_2_1_238_SPINNER_ANCHOR,
  structuralTextAnchor: 'b("span",{"aria-hidden":"true",className:OG.text,children:h})',
  stateHookIdentifier: 'ie',
  effectHookIdentifier: 're',
  containerElementIdentifier: 'I',
  childElementIdentifier: 'b',
  statusLocalIdentifier: 'i',
  animatedLocalIdentifier: 'h',
};

const CLAUDE_2_1_239_SPINNER_ANCHOR =
  'function _rt({size:e=16,permissionMode:t,status:i,spinnerVerbsConfig:n}){let o=Xn(()=>gHt(n),[n]),r=Xn(()=>Math.max(...o.map((p)=>p.length)),[o]),[s,a]=te(0),[l,c]=te(()=>HG(o));re(()=>{let p=setInterval(()=>{a((f)=>(f+1)%mrt.length)},120);return()=>clearInterval(p)},[]),vG(()=>{c(HG(o))},(p)=>{let f=[2000,3000,5000];return p<f.length?f[p]:5000});let u=l;if(i==="compacting")u="Compacting";let h=_Ht(u+"...",r+3);return I("div",{className:BG.container,"data-permission-mode":t,children:[b("span",{"aria-hidden":"true",className:BG.icon,style:{fontSize:`${e}px`},children:mrt[s]}),b("span",{"aria-hidden":"true",className:BG.text,children:h}),b("span",{className:H6.visuallyHidden,children:i==="compacting"?"Compacting conversation":"Claude is working"})]})}';

export const CLAUDE_2_1_239_PROFILE: ClaudePatchProfile = {
  cspFirstIdentifier: 'p',
  cspSecondIdentifier: 'f',
  cspThirdIdentifier: 'h',
  cspNonceIdentifier: 'u',
  cspFinalIdentifier: 'g',
  componentIdentifier: '_rt',
  verbsIdentifier: 'gHt',
  randomIdentifier: 'HG',
  schedulerIdentifier: 'vG',
  animateIdentifier: '_Ht',
  stylesIdentifier: 'BG',
  spinnerFramesIdentifier: 'mrt',
  structuralSpinnerAnchor: CLAUDE_2_1_239_SPINNER_ANCHOR,
  structuralTextAnchor: 'b("span",{"aria-hidden":"true",className:BG.text,children:h})',
  stateHookIdentifier: 'te',
  effectHookIdentifier: 're',
  containerElementIdentifier: 'I',
  childElementIdentifier: 'b',
  statusLocalIdentifier: 'i',
  animatedLocalIdentifier: 'h',
};

const CLAUDE_2_1_241_SPINNER_ANCHOR =
  'function act({size:e=16,permissionMode:t,status:i,spinnerVerbsConfig:n}){let o=Xn(()=>mUt(n),[n]),r=Xn(()=>Math.max(...o.map((p)=>p.length)),[o]),[s,a]=ie(0),[l,c]=ie(()=>cZ(o));se(()=>{let p=setInterval(()=>{a((f)=>(f+1)%rct.length)},120);return()=>clearInterval(p)},[]),UG(()=>{c(cZ(o))},(p)=>{let f=[2000,3000,5000];return p<f.length?f[p]:5000});let u=l;if(i==="compacting")u="Compacting";let h=gUt(u+"...",r+3);return E("div",{className:lZ.container,"data-permission-mode":t,children:[b("span",{"aria-hidden":"true",className:lZ.icon,style:{fontSize:`${e}px`},children:rct[s]}),b("span",{"aria-hidden":"true",className:lZ.text,children:h}),b("span",{className:q6.visuallyHidden,children:i==="compacting"?"Compacting conversation":"Claude is working"})]})}';

export const CLAUDE_2_1_241_PROFILE: ClaudePatchProfile = {
  cspFirstIdentifier: 'p',
  cspSecondIdentifier: 'f',
  cspThirdIdentifier: 'h',
  cspNonceIdentifier: 'u',
  cspFinalIdentifier: 'g',
  componentIdentifier: 'act',
  verbsIdentifier: 'mUt',
  randomIdentifier: 'cZ',
  schedulerIdentifier: 'UG',
  animateIdentifier: 'gUt',
  stylesIdentifier: 'lZ',
  spinnerFramesIdentifier: 'rct',
  structuralSpinnerAnchor: CLAUDE_2_1_241_SPINNER_ANCHOR,
  structuralTextAnchor: 'b("span",{"aria-hidden":"true",className:lZ.text,children:h})',
  stateHookIdentifier: 'ie',
  effectHookIdentifier: 'se',
  containerElementIdentifier: 'E',
  childElementIdentifier: 'b',
  statusLocalIdentifier: 'i',
  animatedLocalIdentifier: 'h',
};

const CLAUDE_2_1_245_SPINNER_ANCHOR =
  'function M30({size:$=16,permissionMode:J,status:Y,spinnerVerbsConfig:X}){let Q=i2(()=>Lc0(X),[X]),Z=i2(()=>Math.max(...Q.map((W)=>W.length)),[Q]),[G,q]=Y1(0),[z,U]=Y1(()=>Bi(Q));Z1(()=>{let W=setInterval(()=>{q((F)=>(F+1)%j30.length)},120);return()=>clearInterval(W)},[]),dk(()=>{U(Bi(Q))},(W)=>{let F=[2000,3000,5000];return W<F.length?F[W]:5000});let H=z;if(Y==="compacting")H="Compacting";let B=Tc0(H+"...",Z+3);return E("div",{className:Hi.container,"data-permission-mode":J,children:[j("span",{"aria-hidden":"true",className:Hi.icon,style:{fontSize:`${$}px`},children:j30[G]}),j("span",{"aria-hidden":"true",className:Hi.text,children:B}),j("span",{className:lO.visuallyHidden,children:Y==="compacting"?"Compacting conversation":"Claude is working"})]})}';

export const CLAUDE_2_1_245_PROFILE: ClaudePatchProfile = {
  cspFirstIdentifier: 'B',
  cspSecondIdentifier: 'N',
  cspThirdIdentifier: 'q',
  cspNonceIdentifier: 'U',
  cspFinalIdentifier: 'D',
  componentIdentifier: 'M30',
  verbsIdentifier: 'Lc0',
  randomIdentifier: 'Bi',
  schedulerIdentifier: 'dk',
  animateIdentifier: 'Tc0',
  stylesIdentifier: 'Hi',
  spinnerFramesIdentifier: 'j30',
  structuralSpinnerAnchor: CLAUDE_2_1_245_SPINNER_ANCHOR,
  structuralTextAnchor: 'j("span",{"aria-hidden":"true",className:Hi.text,children:B})',
  stateHookIdentifier: 'Y1',
  effectHookIdentifier: 'Z1',
  containerElementIdentifier: 'E',
  childElementIdentifier: 'j',
  statusLocalIdentifier: 'Y',
  animatedLocalIdentifier: 'B',
};

const CLAUDE_2_1_246_SPINNER_ANCHOR =
  'function _30({size:$=16,permissionMode:J,status:Y,spinnerVerbsConfig:X}){let Q=i2(()=>Tc0(X),[X]),Z=i2(()=>Math.max(...Q.map((W)=>W.length)),[Q]),[G,q]=Y1(0),[z,U]=Y1(()=>Fi(Q));Z1(()=>{let W=setInterval(()=>{q((F)=>(F+1)%P30.length)},120);return()=>clearInterval(W)},[]),rk(()=>{U(Fi(Q))},(W)=>{let F=[2000,3000,5000];return W<F.length?F[W]:5000});let H=z;if(Y==="compacting")H="Compacting";let B=Ec0(H+"...",Z+3);return E("div",{className:Wi.container,"data-permission-mode":J,children:[j("span",{"aria-hidden":"true",className:Wi.icon,style:{fontSize:`${$}px`},children:P30[G]}),j("span",{"aria-hidden":"true",className:Wi.text,children:B}),j("span",{className:dO.visuallyHidden,children:Y==="compacting"?"Compacting conversation":"Claude is working"})]})}';

export const CLAUDE_2_1_246_PROFILE: ClaudePatchProfile = {
  cspFirstIdentifier: 'B',
  cspSecondIdentifier: 'q',
  cspThirdIdentifier: 'N',
  cspNonceIdentifier: 'U',
  cspFinalIdentifier: 'O',
  componentIdentifier: '_30',
  verbsIdentifier: 'Tc0',
  randomIdentifier: 'Fi',
  schedulerIdentifier: 'rk',
  animateIdentifier: 'Ec0',
  stylesIdentifier: 'Wi',
  spinnerFramesIdentifier: 'P30',
  structuralSpinnerAnchor: CLAUDE_2_1_246_SPINNER_ANCHOR,
  structuralTextAnchor: 'j("span",{"aria-hidden":"true",className:Wi.text,children:B})',
  stateHookIdentifier: 'Y1',
  effectHookIdentifier: 'Z1',
  containerElementIdentifier: 'E',
  childElementIdentifier: 'j',
  statusLocalIdentifier: 'Y',
  animatedLocalIdentifier: 'B',
};

const CLAUDE_2_1_247_SPINNER_ANCHOR =
  'function w30({size:$=16,permissionMode:J,status:Y,spinnerVerbsConfig:X}){let Q=o2(()=>Ec0(X),[X]),Z=o2(()=>Math.max(...Q.map((W)=>W.length)),[Q]),[G,q]=Y1(0),[z,U]=Y1(()=>Fi(Q));Z1(()=>{let W=setInterval(()=>{q((F)=>(F+1)%M30.length)},120);return()=>clearInterval(W)},[]),rk(()=>{U(Fi(Q))},(W)=>{let F=[2000,3000,5000];return W<F.length?F[W]:5000});let H=z;if(Y==="compacting")H="Compacting";let B=Ic0(H+"...",Z+3);return E("div",{className:Wi.container,"data-permission-mode":J,children:[j("span",{"aria-hidden":"true",className:Wi.icon,style:{fontSize:`${$}px`},children:M30[G]}),j("span",{"aria-hidden":"true",className:Wi.text,children:B}),j("span",{className:dO.visuallyHidden,children:Y==="compacting"?"Compacting conversation":"Claude is working"})]})}';

export const CLAUDE_2_1_247_PROFILE: ClaudePatchProfile = {
  cspFirstIdentifier: 'H',
  cspSecondIdentifier: 'q',
  cspThirdIdentifier: 'N',
  cspNonceIdentifier: 'U',
  cspFinalIdentifier: 'O',
  componentIdentifier: 'w30',
  verbsIdentifier: 'Ec0',
  randomIdentifier: 'Fi',
  schedulerIdentifier: 'rk',
  animateIdentifier: 'Ic0',
  stylesIdentifier: 'Wi',
  spinnerFramesIdentifier: 'M30',
  structuralSpinnerAnchor: CLAUDE_2_1_247_SPINNER_ANCHOR,
  structuralTextAnchor: 'j("span",{"aria-hidden":"true",className:Wi.text,children:B})',
  stateHookIdentifier: 'Y1',
  effectHookIdentifier: 'Z1',
  containerElementIdentifier: 'E',
  childElementIdentifier: 'j',
  statusLocalIdentifier: 'Y',
  animatedLocalIdentifier: 'B',
};

const CLAUDE_2_1_250_SPINNER_ANCHOR =
  'function R30({size:$=16,permissionMode:J,status:Y,spinnerVerbsConfig:X}){let Q=o2(()=>cc0(X),[X]),Z=o2(()=>Math.max(...Q.map((W)=>W.length)),[Q]),[G,q]=Y1(0),[z,U]=Y1(()=>Ki(Q));Z1(()=>{let W=setInterval(()=>{q((F)=>(F+1)%w30.length)},120);return()=>clearInterval(W)},[]),rk(()=>{U(Ki(Q))},(W)=>{let F=[2000,3000,5000];return W<F.length?F[W]:5000});let H=z;if(Y==="compacting")H="Compacting";let B=lc0(H+"...",Z+3);return E("div",{className:Fi.container,"data-permission-mode":J,children:[j("span",{"aria-hidden":"true",className:Fi.icon,style:{fontSize:`${$}px`},children:w30[G]}),j("span",{"aria-hidden":"true",className:Fi.text,children:B}),j("span",{className:dO.visuallyHidden,children:Y==="compacting"?"Compacting conversation":"Claude is working"})]})}';

export const CLAUDE_2_1_250_PROFILE: ClaudePatchProfile = {
  cspFirstIdentifier: 'H',
  cspSecondIdentifier: 'q',
  cspThirdIdentifier: 'N',
  cspNonceIdentifier: 'U',
  cspFinalIdentifier: 'O',
  componentIdentifier: 'R30',
  verbsIdentifier: 'cc0',
  randomIdentifier: 'Ki',
  schedulerIdentifier: 'rk',
  animateIdentifier: 'lc0',
  stylesIdentifier: 'Fi',
  spinnerFramesIdentifier: 'w30',
  structuralSpinnerAnchor: CLAUDE_2_1_250_SPINNER_ANCHOR,
  structuralTextAnchor: 'j("span",{"aria-hidden":"true",className:Fi.text,children:B})',
  stateHookIdentifier: 'Y1',
  effectHookIdentifier: 'Z1',
  containerElementIdentifier: 'E',
  childElementIdentifier: 'j',
  statusLocalIdentifier: 'Y',
  animatedLocalIdentifier: 'B',
};

const SUPPORTED_BUILDS: readonly ClaudeSupportedBuild[] = [
  {
    version: '2.1.207',
    hostSha256: 'c826e0fb877a54c595a27e2fe67da5bcf258cc08709783b7fda1b366f25b9980',
    webviewSha256: '67c105ac80d10834618c1d8fb8ed28c99df70167ffd38f52ac3420bdfc2aff67',
    profile: CLAUDE_2_1_207_PROFILE,
  },
  {
    version: '2.1.209',
    hostSha256: '74fd568a28ccd54ec3902ed47ea8b33781325c4862c541613648684694ef072e',
    webviewSha256: '6cca18ca9b6952a0d737d7ab024fed1625dcdcd057a484fdc19e1fa019e62bc9',
    profile: CLAUDE_2_1_209_PROFILE,
  },
  {
    version: '2.1.212',
    hostSha256: '4bf69e72516593859ceb3f520aa510918ea71bc63dec3a2f81816ccda28567d1',
    webviewSha256: 'd02e1ffdb066a69458759262433fc9c972b773e56f99f36c3bf2605749959a76',
    profile: CLAUDE_2_1_212_PROFILE,
  },
  {
    version: '2.1.214',
    hostSha256: '267cbd2f3cea2b5d13a36a70f34c1e0def2c6638e3960c1bdd29e6ec9ce118b3',
    webviewSha256: '83579b34af4114e1a124cf72c5845205ff49fc52862aec767f1e4bdf920b371e',
    profile: CLAUDE_2_1_214_PROFILE,
  },
  {
    version: '2.1.238',
    hostSha256: '70799d3bf0d558d19b102d4869ca53463f724c5f431d0d9df940bf6fbfd26a94',
    webviewSha256: '6ba7df68ca165a0d694df51871c33869447cedce0157eb70d3f569d7b271bc0e',
    profile: CLAUDE_2_1_238_PROFILE,
  },
  {
    version: '2.1.239',
    hostSha256: '685839cb5e5c5583f4d25bd9d577dc8122efd22005e6c8cbebd1ee7d8366086a',
    webviewSha256: '81f9172c72a16ee64ea1e47af55c770200dbbba26d726edf6d9657f74fcabbdc',
    profile: CLAUDE_2_1_239_PROFILE,
  },
  {
    version: '2.1.241',
    hostSha256: 'dfad55e168977ad34d83183bab0bf73b799e18752e935df9c39608b5243b22b2',
    webviewSha256: '282b68c13d0caec6426798214dc7b1182b3d141b76de0b3a2042420d338d625e',
    profile: CLAUDE_2_1_241_PROFILE,
  },
  {
    version: '2.1.245',
    hostSha256: 'c153b4e7ba7fe32ce6661a1f353072a0bee8bbc9ee7c28fc9fa69dbd3174093a',
    webviewSha256: '7c45c12094fefec2e6fd8299d26bb105a02dcc122e96ab9b537d6e8fbf20a71e',
    profile: CLAUDE_2_1_245_PROFILE,
  },
  {
    version: '2.1.246',
    hostSha256: '624eba9eacd3a44d40e4d7f9b061573a9e12e6ac5e479d55782e2c36e105d11a',
    webviewSha256: 'b4d80db0926cde6e11b17d744d954782c54ece6c658f59de19ce7070f9dc54da',
    profile: CLAUDE_2_1_246_PROFILE,
  },
  {
    version: '2.1.247',
    hostSha256: '2874f2dddc0e43a0812aa8d30d299f598b727b28c15400adf88cd32fd4d3c35d',
    webviewSha256: '31b4fa25b8e799a0e6bc31d6544513152a8b960f69a843c3c7df91a399630559',
    profile: CLAUDE_2_1_247_PROFILE,
  },
  {
    version: '2.1.250',
    hostSha256: '8dc9e924e755afd3f65fff266d50aef21afe5bf8ae25ead1c67d2fa6dc90db0d',
    webviewSha256: 'd00e7db099e2ba4f11cd4dae4dec6e433c5a3a632e9b8fb23c4b748957799c72',
    profile: CLAUDE_2_1_250_PROFILE,
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
    supportedBuild?: ClaudeSupportedBuild,
  ) {
    this.statePath = path.join(kodpauzaHome, PATCH_STATE_FILE);
    this.supportedBuild =
      supportedBuild ?? SUPPORTED_BUILDS.find((build) => build.version === claudeVersion);
    this.compatibilityMode = this.supportedBuild ? 'exact' : 'unsupported';
  }

  async inspect(): Promise<ClaudePatchStatus> {
    const paths = await this.resolvePatchPaths(false);
    if (!paths) {
      return {
        installed: false,
        compatible: false,
        compatibilityMode: 'unsupported',
        claudeVersion: this.claudeVersion,
      };
    }
    const [hostSource, webviewSource] = await Promise.all([
      readTextFile(paths.hostPath),
      readTextFile(paths.webviewPath),
    ]);
    const token = extractToken(webviewSource);
    const hostPatched =
      hostSource.includes(CSP_MARKER_START) && hostSource.includes(CSP_MARKER_END);
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
        ...paths,
      };
    }

    this.resolveCompatibleBuild(hostSource, webviewSource);
    return {
      installed: false,
      compatible: Boolean(this.supportedBuild),
      compatibilityMode: this.compatibilityMode,
      claudeVersion: this.claudeVersion,
      ...paths,
    };
  }

  async install(): Promise<ClaudePatchMutationResult> {
    const current = await this.inspect();
    if (current.installed) {
      return { ...current, changed: false };
    }
    const build = this.supportedBuild;
    if (!build) {
      throw new Error(
        `Версия Claude Code ${this.claudeVersion} пока не поддерживается патчем Kodpauza.`,
      );
    }

    const paths = await this.resolvePatchPaths(true);
    const [hostSource, webviewSource] = await Promise.all([
      readTextFile(paths.hostPath),
      readTextFile(paths.webviewPath),
    ]);
    this.resolveCompatibleBuild(hostSource, webviewSource);
    const resolvedBuild = this.supportedBuild;
    if (!resolvedBuild) {
      throw new Error(
        `Версия Claude Code ${this.claudeVersion} изменила структуру UI. Реклама безопасно отключена.`,
      );
    }
    assertOriginalHash(paths.hostPath, hostSource, resolvedBuild.hostSha256);
    assertOriginalHash(paths.webviewPath, webviewSource, resolvedBuild.webviewSha256);

    const token = crypto.randomBytes(32).toString('hex');
    const patchedHost = patchClaudeHostSource(hostSource, resolvedBuild.profile);
    const patchedWebview = patchClaudeWebviewSource(webviewSource, token, resolvedBuild.profile);
    assertJavaScriptParses(patchedHost, 'Claude Code extension.js');
    assertJavaScriptParses(patchedWebview, 'Claude Code webview/index.js');
    assertClaudePatchedContract(patchedHost, patchedWebview, token);
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
        backupRecord(
          this.extensionPath,
          paths.hostPath,
          path.join(backupDirectory, 'extension.js'),
          hostSource,
        ),
        backupRecord(
          this.extensionPath,
          paths.webviewPath,
          path.join(backupDirectory, 'index.js'),
          webviewSource,
        ),
      ],
    };

    await fs.mkdir(this.kodpauzaHome, { recursive: true, mode: 0o700 });
    await atomicWrite(this.statePath, `${JSON.stringify(manifest, null, 2)}\n`, 0o600);
    try {
      await assertFilesUnchanged([
        { filePath: paths.hostPath, expectedSource: hostSource, label: 'Claude Code extension.js' },
        {
          filePath: paths.webviewPath,
          expectedSource: webviewSource,
          label: 'Claude Code webview/index.js',
        },
      ]);
      await atomicWritePreservingMode(paths.webviewPath, patchedWebview);
      await atomicWritePreservingMode(paths.hostPath, patchedHost);
      await assertPatchedFiles([
        {
          filePath: paths.hostPath,
          expectedSource: patchedHost,
          label: 'Claude Code extension.js',
        },
        {
          filePath: paths.webviewPath,
          expectedSource: patchedWebview,
          label: 'Claude Code webview/index.js',
        },
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
      backupDirectory,
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
      changed: true,
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

    const knownProfiles = uniqueClaudeProfiles([
      ...(currentBuild ? [currentBuild.profile] : []),
      ...SUPPORTED_BUILDS.map((build) => build.profile),
    ]);
    let matches = compatibleClaudeProfiles(hostSource, webviewSource, knownProfiles);
    if (matches.length === 0) {
      const derivedProfiles = deriveClaudePatchProfiles(hostSource, webviewSource);
      matches = compatibleClaudeProfiles(hostSource, webviewSource, derivedProfiles);
    }

    if (matches.length !== 1) {
      this.supportedBuild = undefined;
      this.compatibilityMode = 'unsupported';
      return;
    }

    this.supportedBuild = {
      version: this.claudeVersion,
      hostSha256: sha256(hostSource),
      webviewSha256: sha256(webviewSource),
      profile: matches[0],
    };
    this.compatibilityMode = 'structural';
  }

  private async resolvePatchPaths(
    required: true,
  ): Promise<{ hostPath: string; webviewPath: string }>;
  private async resolvePatchPaths(
    required: false,
  ): Promise<{ hostPath: string; webviewPath: string } | undefined>;
  private async resolvePatchPaths(
    required: boolean,
  ): Promise<{ hostPath: string; webviewPath: string } | undefined> {
    const paths = {
      hostPath: path.join(this.extensionPath, 'extension.js'),
      webviewPath: path.join(this.extensionPath, 'webview', 'index.js'),
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
      `claude-ui-${this.claudeVersion}-${timestamp}`,
    );
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await Promise.all([
      fs.copyFile(paths.hostPath, path.join(directory, 'extension.js')),
      fs.copyFile(paths.webviewPath, path.join(directory, 'index.js')),
    ]);
    return directory;
  }

  private async reconcilePreviousInstallation(): Promise<void> {
    const manifest = await readManifest(this.statePath);
    if (!manifest || path.resolve(manifest.extensionPath) === path.resolve(this.extensionPath)) {
      return;
    }
    const targets = manifest.files.map((file) =>
      path.resolve(manifest.extensionPath, file.relativePath),
    );
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
      const patched =
        path.basename(targetPath) === 'extension.js'
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

function compatibleClaudeProfiles(
  hostSource: string,
  webviewSource: string,
  profiles: readonly ClaudePatchProfile[],
): ClaudePatchProfile[] {
  return profiles.filter((profile) => {
    try {
      const token = '0'.repeat(64);
      const patchedHost = patchClaudeHostSource(hostSource, profile);
      const patchedWebview = patchClaudeWebviewSource(webviewSource, token, profile);
      assertJavaScriptParses(patchedHost, 'Claude Code extension.js');
      assertJavaScriptParses(patchedWebview, 'Claude Code webview/index.js');
      assertClaudePatchedContract(patchedHost, patchedWebview, token);
      return true;
    } catch {
      return false;
    }
  });
}

type AstNode = {
  type?: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
};

function deriveClaudePatchProfiles(
  hostSource: string,
  webviewSource: string,
): ClaudePatchProfile[] {
  const csp = deriveClaudeCspIdentifiers(hostSource);
  if (!csp) {
    return [];
  }
  const spinnerProfiles = deriveClaudeSpinnerProfiles(webviewSource);
  if (spinnerProfiles.length !== 1) {
    return [];
  }
  return [{ ...spinnerProfiles[0], ...csp }];
}

function deriveClaudeCspIdentifiers(
  source: string,
):
  | Pick<
      ClaudePatchProfile,
      | 'cspFirstIdentifier'
      | 'cspSecondIdentifier'
      | 'cspThirdIdentifier'
      | 'cspNonceIdentifier'
      | 'cspFinalIdentifier'
    >
  | undefined {
  const identifier = '[A-Za-z_$][A-Za-z0-9_$]*';
  const pattern = new RegExp(
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
      '\\$\\{(?<first>' +
      identifier +
      ')\\}; ' +
      '\\$\\{(?<second>' +
      identifier +
      ')\\}; ' +
      '\\$\\{(?<third>' +
      identifier +
      ')\\}; ' +
      "script-src 'nonce-\\$\\{(?<nonce>" +
      identifier +
      ")\\}'; " +
      '\\$\\{(?<final>' +
      identifier +
      ')\\};">',
    'g',
  );
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1 || !matches[0].groups) {
    return undefined;
  }
  return {
    cspFirstIdentifier: matches[0].groups.first,
    cspSecondIdentifier: matches[0].groups.second,
    cspThirdIdentifier: matches[0].groups.third,
    cspNonceIdentifier: matches[0].groups.nonce,
    cspFinalIdentifier: matches[0].groups.final,
  };
}

function deriveClaudeSpinnerProfiles(source: string): ClaudePatchProfile[] {
  const ast = parseJavaScriptAst(source);
  const functions: AstNode[] = [];
  walkAst(ast, (node) => {
    if (
      node.type === 'FunctionDeclaration' &&
      typeof node.start === 'number' &&
      Number.isInteger(node.start) &&
      typeof node.end === 'number' &&
      Number.isInteger(node.end)
    ) {
      functions.push(node);
    }
  });
  const profiles: ClaudePatchProfile[] = [];
  for (const node of functions) {
    const candidate = source.slice(node.start as number, node.end as number);
    const profile = deriveClaudeSpinnerProfile(candidate);
    if (profile) {
      profiles.push(profile);
    }
  }
  return uniqueClaudeProfiles(profiles);
}

function deriveClaudeSpinnerProfile(source: string): ClaudePatchProfile | undefined {
  const identifier = '[A-Za-z_$][A-Za-z0-9_$]*';
  const signature = source.match(
    new RegExp(
      '^function (?<component>' +
        identifier +
        ')\\(\\{size:(?<size>' +
        identifier +
        ')=16,permissionMode:(?<permission>' +
        identifier +
        '),status:(?<status>' +
        identifier +
        '),spinnerVerbsConfig:(?<config>' +
        identifier +
        ')\\}\\)\\{',
    ),
  );
  const setup = source.match(
    new RegExp(
      '\\{let (?<verbsList>' +
        identifier +
        ')=(?<memo>' +
        identifier +
        ')\\(\\(\\)=>(?<verbs>' +
        identifier +
        ')\\((?<config>' +
        identifier +
        ')\\),\\[\\k<config>\\]\\),(?<width>' +
        identifier +
        ')=\\k<memo>\\(\\(\\)=>Math\\.max\\(\\.\\.\\.\\k<verbsList>\\.map\\(\\((?<mapValue>' +
        identifier +
        ')\\)=>\\k<mapValue>\\.length\\)\\),\\[\\k<verbsList>\\]\\),\\[(?<frameIndex>' +
        identifier +
        '),(?<setFrame>' +
        identifier +
        ')\\]=(?<state>' +
        identifier +
        ')\\(0\\),\\[(?<phrase>' +
        identifier +
        '),(?<setPhrase>' +
        identifier +
        ')\\]=\\k<state>\\(\\(\\)=>(?<random>' +
        identifier +
        ')\\(\\k<verbsList>\\)\\);',
    ),
  );
  const animation = source.match(
    new RegExp(
      '(?<effect>' +
        identifier +
        ')\\(\\(\\)=>\\{let (?<timer>' +
        identifier +
        ')=setInterval\\(\\(\\)=>\\{(?<setFrame>' +
        identifier +
        ')\\(\\((?<frame>' +
        identifier +
        ')\\)=>\\(\\k<frame>\\+1\\)%(?<frames>' +
        identifier +
        ')\\.length\\)\\},120\\);return\\(\\)=>clearInterval\\(\\k<timer>\\)\\},\\[\\]\\)',
    ),
  );
  const schedulerPattern = new RegExp(
    '(?<scheduler>' +
      identifier +
      ')\\(\\(\\)=>\\{(?<setPhrase>' +
      identifier +
      ')\\((?<random>' +
      identifier +
      ')\\((?<verbsList>' +
      identifier +
      ')\\)\\)\\},\\((?<attempt>' +
      identifier +
      ')\\)=>\\{let (?<delays>' +
      identifier +
      ')=\\[2000,3000,5000\\];return (?<returnAttempt>' +
      identifier +
      ')<(?<returnDelays>' +
      identifier +
      ')\\.length\\?(?<indexDelays>' +
      identifier +
      ')\\[(?<indexAttempt>' +
      identifier +
      ')\\]:5000\\}\\)',
  );
  const scheduler = source.match(schedulerPattern);
  const status = source.match(
    new RegExp(
      'let (?<current>' +
        identifier +
        ')=(?<phrase>' +
        identifier +
        ');if\\((?<status>' +
        identifier +
        ')==="compacting"\\)\\k<current>="Compacting";let (?<animated>' +
        identifier +
        ')=(?<animate>' +
        identifier +
        ')\\(\\k<current>\\+"\\.\\.\\.",(?<width>' +
        identifier +
        ')\\+3\\);',
    ),
  );
  const output = source.match(
    new RegExp(
      'return (?<container>' +
        identifier +
        ')\\("div",\\{className:(?<styles>' +
        identifier +
        ')\\.container,"data-permission-mode":(?<permission>' +
        identifier +
        '),children:\\[(?<child>' +
        identifier +
        ')\\("span",\\{className:\\k<styles>\\.icon,style:\\{fontSize:`\\$\\{(?<size>' +
        identifier +
        ')\\}px`\\},children:(?<frames>' +
        identifier +
        ')\\[(?<frameIndex>' +
        identifier +
        ')\\]\\}\\),\\k<child>\\("span",\\{className:\\k<styles>\\.text,children:(?<animated>' +
        identifier +
        ')\\}\\)\\]\\}\\)\\}$',
    ),
  );
  const groups = [signature, setup, animation, scheduler, status, output].map(
    (match) => match?.groups,
  );
  if (groups.some((value) => !value)) {
    return undefined;
  }
  const [
    signatureGroups,
    setupGroups,
    animationGroups,
    schedulerGroups,
    statusGroups,
    outputGroups,
  ] = groups as RegExpGroups[];
  if (
    setupGroups.config !== signatureGroups.config ||
    animationGroups.setFrame !== setupGroups.setFrame ||
    animationGroups.frames !== outputGroups.frames ||
    schedulerGroups.setPhrase !== setupGroups.setPhrase ||
    schedulerGroups.random !== setupGroups.random ||
    schedulerGroups.verbsList !== setupGroups.verbsList ||
    schedulerGroups.returnAttempt !== schedulerGroups.attempt ||
    schedulerGroups.returnDelays !== schedulerGroups.delays ||
    schedulerGroups.indexDelays !== schedulerGroups.delays ||
    schedulerGroups.indexAttempt !== schedulerGroups.attempt ||
    statusGroups.phrase !== setupGroups.phrase ||
    statusGroups.status !== signatureGroups.status ||
    statusGroups.width !== setupGroups.width ||
    outputGroups.permission !== signatureGroups.permission ||
    outputGroups.size !== signatureGroups.size ||
    outputGroups.frames !== animationGroups.frames ||
    outputGroups.frameIndex !== setupGroups.frameIndex ||
    outputGroups.animated !== statusGroups.animated
  ) {
    return undefined;
  }
  return {
    cspFinalIdentifier: 'v',
    componentIdentifier: signatureGroups.component,
    verbsIdentifier: setupGroups.verbs,
    randomIdentifier: setupGroups.random,
    schedulerIdentifier: schedulerGroups.scheduler,
    animateIdentifier: statusGroups.animate,
    stylesIdentifier: outputGroups.styles,
    spinnerFramesIdentifier: outputGroups.frames,
    structuralSpinnerAnchor: source,
    stateHookIdentifier: setupGroups.state,
    effectHookIdentifier: animationGroups.effect,
    containerElementIdentifier: outputGroups.container,
    childElementIdentifier: outputGroups.child,
    statusLocalIdentifier: signatureGroups.status,
    animatedLocalIdentifier: statusGroups.animated,
  };
}

type RegExpGroups = Record<string, string>;

function parseJavaScriptAst(source: string): AstNode {
  try {
    return acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' }) as AstNode;
  } catch {
    return acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' }) as AstNode;
  }
}

function walkAst(value: unknown, visitor: (node: AstNode) => void): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      walkAst(item, visitor);
    }
    return;
  }
  const node = value as AstNode;
  if (typeof node.type === 'string') {
    visitor(node);
  }
  for (const [key, child] of Object.entries(node)) {
    if (key !== 'start' && key !== 'end') {
      walkAst(child, visitor);
    }
  }
}

function assertClaudePatchedContract(
  hostSource: string,
  webviewSource: string,
  token: string,
): void {
  assertOccurrenceCount(hostSource, CSP_MARKER_START, 1, 'начало CSP-маркера Claude Code');
  assertOccurrenceCount(hostSource, CSP_MARKER_END, 1, 'конец CSP-маркера Claude Code');
  assertOccurrenceCount(
    hostSource,
    `connect-src http://127.0.0.1:${CODEX_UI_BRIDGE_PORT};`,
    1,
    'локальный bridge в CSP Claude Code',
  );
  assertOccurrenceCount(
    webviewSource,
    `${UI_MARKER_PREFIX}${token}__*/`,
    1,
    'начало UI-маркера Claude Code',
  );
  assertOccurrenceCount(webviewSource, UI_MARKER_END, 1, 'конец UI-маркера Claude Code');
  assertOccurrenceCount(
    webviewSource,
    '"data-kodpauza-ad":""',
    2,
    'варианты рекламного элемента Claude Code',
  );
  if (webviewSource.includes('Спонсорское предложение')) {
    throw new Error('UI-патч Claude Code содержит лишнюю видимую подпись.');
  }
  if (
    webviewSource.includes('children:"Реклама"') ||
    webviewSource.includes('Премиальная реклама Kodpauza')
  ) {
    throw new Error('UI-патч Claude Code содержит устаревшую видимую маркировку.');
  }
}

function assertOccurrenceCount(
  source: string,
  search: string,
  expected: number,
  label: string,
): void {
  const actual = source.split(search).length - 1;
  if (actual !== expected) {
    throw new Error(`Claude Code несовместим с патчем: ${label} (${actual} вместо ${expected}).`);
  }
}

export function patchClaudeHostSource(
  source: string,
  profile: ClaudePatchProfile = CLAUDE_2_1_209_PROFILE,
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
    'Content Security Policy Claude Code',
  );
}

function claudeCspAnchor(profile: ClaudePatchProfile, patched = false): string {
  const connectSource = patched ? ` connect-src http://127.0.0.1:${CODEX_UI_BRIDGE_PORT};` : '';
  const first = profile.cspFirstIdentifier ?? 'p';
  const second = profile.cspSecondIdentifier ?? 'f';
  const third = profile.cspThirdIdentifier ?? 'm';
  const nonce = profile.cspNonceIdentifier ?? 'u';
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; \${${first}}; \${${second}}; \${${third}}; script-src 'nonce-\${${nonce}}'; \${${profile.cspFinalIdentifier}};${connectSource}">`;
}

export function patchClaudeWebviewSource(
  source: string,
  token: string,
  profile: ClaudePatchProfile,
): string {
  validateToken(token);
  validateProfile(profile);
  if (source.includes(UI_MARKER_PREFIX)) {
    throw new Error('UI-патч Kodpauza уже присутствует в Claude Code.');
  }
  const original = spinnerComponentSource(profile, false);
  const patched = `${compliantClaudeUiRuntime(claudeUiRuntime(token, profile))}${spinnerComponentSource(profile, true)}`;
  return replaceExact(source, original, patched, 1, 'активный spinner Claude Code');
}

function compliantClaudeUiRuntime(runtime: string): string {
  let result = replaceExact(
    runtime,
    'f=l+" · "',
    'f="Реклама · "+l+" · "',
    1,
    'маркированный префикс Claude Code',
  );
  result = replaceExact(
    result,
    'p=e.text+(d?" · "+d:"")+". Нажмите, чтобы открыть."',
    'p="Реклама. Рекламодатель: "+l+(d?". Сайт: "+d:"")+(e.erid?". erid: "+e.erid:"")+". Нажмите, чтобы открыть."',
    1,
    'подсказка объявления Claude Code',
  );
  result = replaceExact(
    result,
    'children:l}),d?',
    'children:"Реклама · "+l}),d?',
    1,
    'видимая маркировка premium Claude Code',
  );
  return result;
}

function spinnerComponentSource(profile: ClaudePatchProfile, patched: boolean): string {
  if (profile.structuralSpinnerAnchor) {
    if (!patched) {
      return profile.structuralSpinnerAnchor;
    }
    return patchStructuralSpinnerComponent(profile.structuralSpinnerAnchor, profile);
  }
  const adState = patched ? 'k=__kpClaudeUseAd(),' : '';
  const content = patched ? 'k&&i!=="compacting"?b(__kpClaudeAdLink,{ad:k}):h' : 'h';
  return `function ${profile.componentIdentifier}({size:e=16,permissionMode:t,status:i,spinnerVerbsConfig:n}){let ${adState}o=co(()=>${profile.verbsIdentifier}(n),[n]),r=co(()=>Math.max(...o.map((p)=>p.length)),[o]),[s,a]=ne(0),[l,c]=ne(()=>${profile.randomIdentifier}(o));de(()=>{let p=setInterval(()=>{a((f)=>(f+1)%${profile.spinnerFramesIdentifier}.length)},120);return()=>clearInterval(p)},[]),${profile.schedulerIdentifier}(()=>{c(${profile.randomIdentifier}(o))},(p)=>{let f=[2000,3000,5000];return p<f.length?f[p]:5000});let u=l;if(i==="compacting")u="Compacting";let h=${profile.animateIdentifier}(u+"...",r+3);return E("div",{className:${profile.stylesIdentifier}.container,"data-permission-mode":t,children:[b("span",{className:${profile.stylesIdentifier}.icon,style:{fontSize:\`\${e}px\`},children:${profile.spinnerFramesIdentifier}[s]}),b("span",{className:${profile.stylesIdentifier}.text,children:${content}})]})}`;
}

function patchStructuralSpinnerComponent(source: string, profile: ClaudePatchProfile): string {
  const childElement = requiredStructuralIdentifier(
    profile.childElementIdentifier,
    'дочерний JSX-элемент',
  );
  const status = requiredStructuralIdentifier(profile.statusLocalIdentifier, 'статус spinner');
  const animated = requiredStructuralIdentifier(
    profile.animatedLocalIdentifier,
    'анимированный текст spinner',
  );
  if (source.includes('__kpClaudeAd')) {
    throw new Error('Структурная цель Claude Code уже содержит идентификатор Kodpauza.');
  }
  let patched = replaceExact(
    source,
    '){let ',
    '){let __kpClaudeAd=__kpClaudeUseAd(),',
    1,
    'начало spinner-компонента Claude Code',
  );
  const textAnchor =
    profile.structuralTextAnchor ??
    `${childElement}("span",{className:${profile.stylesIdentifier}.text,children:${animated}})`;
  const patchedTextAnchor = replaceExact(
    textAnchor,
    `children:${animated}`,
    `children:__kpClaudeAd&&${status}!=="compacting"?${childElement}(__kpClaudeAdLink,{ad:__kpClaudeAd}):${animated}`,
    1,
    'содержимое текста spinner-компонента Claude Code',
  );
  patched = replaceExact(
    patched,
    textAnchor,
    patchedTextAnchor,
    1,
    'текст spinner-компонента Claude Code',
  );
  return patched;
}

function claudeUiRuntime(token: string, profile: ClaudePatchProfile): string {
  const endpoint = `http://127.0.0.1:${CODEX_UI_BRIDGE_PORT}/v1/claude/ad`;
  const stateHook = profile.stateHookIdentifier ?? 'ne';
  const effectHook = profile.effectHookIdentifier ?? 'de';
  const containerElement = profile.containerElementIdentifier ?? 'E';
  const childElement = profile.childElementIdentifier ?? 'b';
  const activityRuntime = `var __kpClaudeActivityRefs=0,__kpClaudeActivityTimer,__kpClaudeActivityViewId="kp-"+Math.random().toString(36).slice(2)+Date.now().toString(36);function __kpClaudeSendActivity(e){fetch(__kpClaudeEndpoint+"/activity?token="+encodeURIComponent(__kpClaudeToken),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({viewId:__kpClaudeActivityViewId,active:e})}).catch(()=>{})}function __kpClaudeStartActivity(){__kpClaudeActivityRefs+=1,__kpClaudeActivityRefs===1&&(__kpClaudeSendActivity(!0),__kpClaudeActivityTimer=setInterval(()=>__kpClaudeSendActivity(!0),1e3))}function __kpClaudeStopActivity(){__kpClaudeActivityRefs=Math.max(0,__kpClaudeActivityRefs-1),__kpClaudeActivityRefs===0&&(__kpClaudeActivityTimer!=null&&clearInterval(__kpClaudeActivityTimer),__kpClaudeActivityTimer=void 0,__kpClaudeSendActivity(!1))}function __kpClaudeUseActivity(){${effectHook}(()=>{__kpClaudeStartActivity();return()=>__kpClaudeStopActivity()},[])}function __kpClaudeUseCanary(e){${effectHook}(()=>{e?.canary===!0&&typeof e.adId==="string"&&__kpClaudeVisibilityHeartbeat(e,"kp-canary-"+e.adId.slice(-64),!0)},[e?.adId])}var __kpClaudeBaseUseAd=__kpClaudeUseAd;__kpClaudeUseAd=function(){__kpClaudeUseActivity();let e=__kpClaudeBaseUseAd();return __kpClaudeUseCanary(e),e?.canary===!0?null:e};`;
  const visibilityRuntime = `${activityRuntime}${webviewVisibilityRuntime('__kpClaude', '__kpClaudeEndpoint', '__kpClaudeToken')}`;
  return `${UI_MARKER_PREFIX}${token}__*/var __kpClaudeEndpoint=${JSON.stringify(endpoint)},__kpClaudeToken=${JSON.stringify(token)};function __kpClaudeSafeIcon(e){if(typeof e!="string")return null;if(e.length<=9e4&&/^data:image\\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(e))return e;if(e.length>8e3||!e.startsWith("data:image/svg+xml,"))return null;try{let t=decodeURIComponent(e.slice(19));return /^<svg[\\s>]/i.test(t)&&/<\\/svg>$/i.test(t)&&!/(?:<script|<foreignObject|<image|\\bhref\\s*=|\\burl\\s*\\(|@import|\\bon[a-z]+\\s*=)/i.test(t)?e:null}catch{return null}}function __kpClaudeSafeDomain(e){return typeof e==="string"&&e.length<=253&&/^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(e)?e:null}function __kpClaudeUseAd(){let[e,t]=${stateHook}(null);return ${effectHook}(()=>{let i=!0,n;function o(){fetch(__kpClaudeEndpoint+"/current?token="+encodeURIComponent(__kpClaudeToken),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(r=>{if(i)t(a=>a?.adId===r?.adId&&a?.text===r?.text&&a?.format===r?.format&&a?.iconUrl===r?.iconUrl&&a?.domain===r?.domain&&a?.advertiserName===r?.advertiserName?a:r&&r.active===!0&&(r.format==="standard"||r.format==="premium")?r:null)}).catch(()=>{i&&t(null)}).finally(()=>{i&&(n=setTimeout(o,750))})}return o(),()=>{i=!1,n!=null&&clearTimeout(n)}},[]),e}${visibilityRuntime}function __kpClaudeOpenAd(e){fetch(__kpClaudeEndpoint+"/click?token="+encodeURIComponent(__kpClaudeToken),{method:"POST",headers:{"content-type":"text/plain"},body:e.adId}).catch(()=>{})}function __kpClaudeAdLink({ad:e}){let[t,i]=${stateHook}(null);${effectHook}(()=>t?__kpClaudeObserveVisibility(t,e):void 0,[t,e.adId]);let n=t=>{t.preventDefault(),t.stopPropagation(),__kpClaudeOpenAd(e)},o=e=>{(e.key==="Enter"||e.key===" ")&&n(e)},a=e.format==="premium",s=__kpClaudeSafeIcon(e.iconUrl),l=typeof e.advertiserName==="string"&&e.advertiserName.trim()?e.advertiserName.trim().slice(0,160):"Kodpauza",c=l.slice(0,1).toUpperCase()||"K",d=__kpClaudeSafeDomain(e.domain)||"",f=l+" · ",u=a&&e.text.toLowerCase().startsWith(f.toLowerCase())?e.text.slice(f.length).trim()||e.text:e.text,p=e.text+(d?" · "+d:"")+". Нажмите, чтобы открыть.";if(!a)return ${containerElement}("span",{"data-kodpauza-ad":"",ref:i,role:"link",tabIndex:0,title:p,onClick:n,onKeyDown:o,style:{cursor:"pointer",display:"inline-flex",alignItems:"center",gap:"6px",width:"100%",maxWidth:"100%",minWidth:0},children:[${containerElement}("span",{style:{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",width:"14px",height:"14px",minWidth:"14px",borderRadius:"3px",overflow:"hidden",fontSize:"9px",fontWeight:700,lineHeight:"14px",color:"#10b981",background:"rgba(16,185,129,.12)"},children:[s?${childElement}("img",{src:s,alt:"",width:14,height:14,style:{display:"block",width:"14px",height:"14px",objectFit:"contain"},onError:e=>{e.currentTarget.style.display="none";let t=e.currentTarget.nextElementSibling;t&&(t.style.display="inline-flex")}}):null,${childElement}("span",{style:{display:s?"none":"inline-flex",alignItems:"center",justifyContent:"center",width:"14px",height:"14px"},children:c})]}),${childElement}("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"rgba(16,185,129,.45)",textUnderlineOffset:"2px"},children:e.text})]});return ${containerElement}("span",{"data-kodpauza-ad":"","data-kodpauza-format":"premium",ref:i,role:"link",tabIndex:0,title:p,"aria-label":p,onClick:n,onKeyDown:o,style:{cursor:"pointer",display:"grid",gridTemplateColumns:"22px minmax(0,1fr) auto",alignItems:"center",columnGap:"7px",width:"100%",maxWidth:"100%",minWidth:0,boxSizing:"border-box",padding:"5px 7px 5px 6px",border:"1px solid rgba(245,158,11,.28)",borderLeft:"3px solid rgba(245,158,11,.78)",borderRadius:"7px",background:"rgba(245,158,11,.09)",overflow:"hidden"},children:[${containerElement}("span",{style:{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",width:"22px",height:"22px",minWidth:"22px",borderRadius:"5px",overflow:"hidden",fontSize:"11px",fontWeight:700,lineHeight:"22px",color:"#fbbf24",background:"rgba(245,158,11,.16)"},children:[s?${childElement}("img",{src:s,alt:"",width:22,height:22,style:{display:"block",width:"22px",height:"22px",objectFit:"contain"},onError:e=>{e.currentTarget.style.display="none";let t=e.currentTarget.nextElementSibling;t&&(t.style.display="inline-flex")}}):null,${childElement}("span",{"aria-hidden":"true",style:{display:s?"none":"inline-flex",alignItems:"center",justifyContent:"center",width:"22px",height:"22px"},children:c})]}),${containerElement}("span",{style:{display:"flex",flexDirection:"column",minWidth:0,lineHeight:1.15},children:[${containerElement}("span",{style:{display:"flex",alignItems:"baseline",gap:"5px",minWidth:0},children:[${childElement}("span",{style:{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:"10px",fontWeight:700,color:"rgba(251,191,36,.96)"},children:l}),d?${childElement}("span",{style:{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:"9px",color:"rgba(148,163,184,.9)"},children:d}):null]}),${childElement}("span",{style:{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:"12px",color:"inherit",marginTop:"2px"},children:u})]}),${childElement}("span",{"aria-hidden":"true",style:{fontSize:"11px",lineHeight:1,color:"rgba(245,158,11,.78)",paddingLeft:"1px"},children:"↗"})]})}${UI_MARKER_END}`;
}

function validateProfile(profile: ClaudePatchProfile): void {
  const identifiers = [
    profile.cspFinalIdentifier,
    profile.cspFirstIdentifier ?? 'p',
    profile.cspSecondIdentifier ?? 'f',
    profile.cspThirdIdentifier ?? 'm',
    profile.cspNonceIdentifier ?? 'u',
    profile.componentIdentifier,
    profile.verbsIdentifier,
    profile.randomIdentifier,
    profile.schedulerIdentifier,
    profile.animateIdentifier,
    profile.stylesIdentifier,
    profile.spinnerFramesIdentifier,
    ...(profile.structuralSpinnerAnchor
      ? [
          profile.stateHookIdentifier,
          profile.effectHookIdentifier,
          profile.containerElementIdentifier,
          profile.childElementIdentifier,
          profile.statusLocalIdentifier,
          profile.animatedLocalIdentifier,
        ]
      : []),
  ];
  if (
    !identifiers.every(
      (identifier) =>
        typeof identifier === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifier),
    ) ||
    (profile.structuralSpinnerAnchor !== undefined &&
      (profile.structuralSpinnerAnchor.length === 0 ||
        profile.structuralSpinnerAnchor.length > 100_000 ||
        !profile.structuralSpinnerAnchor.startsWith(`function ${profile.componentIdentifier}(`))) ||
    (profile.structuralTextAnchor !== undefined &&
      (profile.structuralSpinnerAnchor === undefined ||
        profile.structuralTextAnchor.length === 0 ||
        profile.structuralTextAnchor.length > 10_000 ||
        !profile.structuralSpinnerAnchor.includes(profile.structuralTextAnchor)))
  ) {
    throw new Error('Некорректный профиль UI-патча Claude Code.');
  }
}

function requiredStructuralIdentifier(value: string | undefined, label: string): string {
  if (!value || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error(`Структурный профиль Claude Code не содержит ${label}.`);
  }
  return value;
}

function validateToken(token: string): void {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    throw new Error('Некорректный токен UI-патча Claude Code.');
  }
}

function replaceExact(
  source: string,
  search: string,
  replacement: string,
  count: number,
  label: string,
): string {
  const actual = source.split(search).length - 1;
  if (actual !== count) {
    throw new Error(`Claude Code несовместим с патчем: ${label} (${actual} вместо ${count}).`);
  }
  return source.split(search).join(replacement);
}

function extractToken(source: string): string | undefined {
  return source.match(/\/\*__KODPAUZA_CLAUDE_UI_START__:([a-f0-9]{64})__\*\//)?.[1];
}

function backupRecord(
  root: string,
  target: string,
  backup: string,
  source: string,
): PatchFileRecord {
  return {
    relativePath: path.relative(root, target),
    backupPath: backup,
    originalSha256: sha256(source),
  };
}

function assertOriginalHash(filePath: string, source: string, expected: string): void {
  if (sha256(source) !== expected) {
    throw new Error(
      `Файл Claude Code ${path.basename(filePath)} отличается от проверенной сборки.`,
    );
  }
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
  return fs.access(filePath).then(
    () => true,
    () => false,
  );
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
