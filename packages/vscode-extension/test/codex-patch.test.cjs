const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {
  CODEX_26_707_PATCH_PROFILE,
  CODEX_26_707_91948_PATCH_PROFILE,
  CODEX_26_707_SHIMMER_PATCH_PROFILE,
  CODEX_26_715_31925_PATCH_PROFILE,
  CODEX_26_715_31925_SHIMMER_PATCH_PROFILE,
  CODEX_26_721_30844_PATCH_PROFILE,
  CODEX_26_721_41059_PATCH_PROFILE,
  CODEX_26_727_40816_PATCH_PROFILE,
  CODEX_26_727_40816_SHIMMER_PATCH_PROFILE,
  CODEX_26_5727_51351_PATCH_PROFILE,
  CODEX_26_5727_51351_SHIMMER_PATCH_PROFILE,
  CODEX_26_803_41515_PATCH_PROFILE,
  CODEX_26_803_41515_SHIMMER_PATCH_PROFILE,
  CODEX_26_810_41047_PATCH_PROFILE,
  CODEX_26_810_41047_SHIMMER_PATCH_PROFILE,
  CODEX_26_810_52044_PATCH_PROFILE,
  CODEX_26_810_52044_SHIMMER_PATCH_PROFILE,
  CODEX_26_814_41407_PATCH_PROFILE,
  CODEX_26_814_41407_SHIMMER_PATCH_PROFILE,
  CODEX_26_818_31338_PATCH_PROFILE,
  CODEX_26_818_41705_PATCH_PROFILE,
  CODEX_26_818_61809_PATCH_PROFILE,
  CODEX_26_820_60940_PATCH_PROFILE,
  CODEX_26_820_71523_PATCH_PROFILE,
  CODEX_26_825_32147_PATCH_PROFILE,
  CODEX_26_825_51511_PATCH_PROFILE,
  CODEX_26_901_22334_PATCH_PROFILE,
  CodexPatchInstaller,
  patchHostSource,
  patchThinkingShimmerSource,
  patchWebviewSource,
} = require('../dist/codexPatchInstaller.js');

const thinking =
  '(0,Y.jsx)(K,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
const reasoning =
  '(0,Y.jsx)(K,{id:`reasoningItem.thinking`,defaultMessage:`Thinking`,description:`Message shown when AI is currently thinking`})';
const exploring =
  '(0,Y.jsx)(K,{id:`localConversationTurn.exploration.accordion.header.active`,defaultMessage:`Exploring`,description:`Header for the exploration accordion while Codex is listing or reading files`,children:Dd})';

function fixtureWebview() {
  return `var X=e(r()),Po=${[thinking, thinking, thinking, thinking, reasoning, exploring].join(';')}`;
}

function fixtureHost() {
  return 'prefix;let n=[t,r,...b8e,...v8e];suffix';
}

function renderInjectedAd(ad) {
  const patched = patchWebviewSource(fixtureWebview(), 'e'.repeat(64));
  const start = patched.indexOf('function __kpAdMessage');
  const end = patched.indexOf('/*__KODPAUZA_UI_END__*/', start);
  const clicks = [];
  const element = (type, props) => ({ type, props });
  const context = {
    X: {
      useRef: () => ({ current: null }),
      useEffect: () => undefined,
    },
    Y: { jsx: element, jsxs: element },
    __kpUseActivity: () => undefined,
    __kpUseAd: () => ad,
    __kpObserveVisibility: () => undefined,
    __kpOpenAd: (value) => clicks.push(value),
  };
  const node = vm.runInNewContext(
    `${patched.slice(start, end)};__kpAdMessage({fallback:null})`,
    context,
  );
  return { node, clicks };
}

function modernFixtureWebview() {
  const thinkingModern =
    '(0,Q.jsx)(Y,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  const reasoningModern =
    '(0,Q.jsx)(Y,{id:`reasoningItem.thinking`,defaultMessage:`Thinking`,description:`Message shown when AI is currently thinking`})';
  const exploringModern =
    '(0,Q.jsx)(Y,{id:`localConversationTurn.exploration.accordion.header.active`,defaultMessage:`Exploring`,description:`Header for the exploration accordion while Codex is listing or reading files`,children:Of})';
  const placeholderModern = '(0,Q.jsx)(Y,{...Gm.thinking})';
  return `var Z=i(),Q=n();var $=e(t(),1),Ua=${[
    thinkingModern,
    thinkingModern,
    thinkingModern,
    thinkingModern,
    thinkingModern,
    reasoningModern,
    exploringModern,
    placeholderModern,
    placeholderModern,
    placeholderModern,
  ].join(';')}`;
}

function modernFixtureHost() {
  return 'prefix;let n=[t,r,...jYe,...HYe];suffix';
}

function modernFixtureShimmer() {
  const fallback =
    '(0,f.jsx)(i,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  return `var c=e(t(),1),l={};function y(r){return r??${fallback}}`;
}

function latestModernFixtureWebview() {
  return modernFixtureWebview()
    .replace('var $=e(t(),1),Ua=', 'var $=e(t(),1),Wa=')
    .replace('children:Of', 'children:kf');
}

function codex2715FixtureWebview() {
  const thinkingLatest =
    '(0,Q.jsx)(U,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  const exploringLatest =
    '(0,Q.jsx)(U,{id:`localConversationTurn.exploration.accordion.header.active`,defaultMessage:`Exploring`,description:`Header for the exploration accordion while Codex is listing or reading files`,children:Nr})';
  const placeholderLatest = '(0,Q.jsx)(U,{..._a.thinking})';
  return `var X=i(),Z=e(t(),1),Q=n();${[
    thinkingLatest,
    thinkingLatest,
    thinkingLatest,
    exploringLatest,
    placeholderLatest,
    placeholderLatest,
    placeholderLatest,
  ].join(';')}`;
}

function codex2715FixtureHost() {
  return 'prefix;let n=[t,r,...wtt,...Stt];suffix';
}

function codex2715FixtureShimmer() {
  const fallback =
    '(0,f.jsx)(i,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  return `var c=r(),l=e(t(),1),u={};function y(r){return r??${fallback}}`;
}

function codex2721FixtureWebview() {
  return [
    'var Ba,Q,$,Va,Ha,Ua,Wa,Ga,Ka,qa,Ja=e((()=>{',
    'Q=t(A(),1),$=V(),Ka=ge({thinking:{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`}});',
    'function Fa(e){let r=e.message,d;r==null?d=(0,$.jsx)(U,{...Ka.thinking}):d=r;return d}',
    '(0,Q.useEffect)(()=>{},[])}));',
  ].join('');
}

function codex2721FixtureHost() {
  return 'prefix;let n=[t,r,...Zst,...Kst];suffix';
}

function codex2721UpdatedFixtureHost() {
  return 'prefix;let n=[t,r,...zst,...jst];suffix';
}

function codex2727FixtureWebview() {
  return [
    'var Oo,Q,$,ko,Ao,jo,Mo,No,Po,Fo,Io=e((()=>{',
    'Q=t(K(),1),$=G(),Po=be({thinking:{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`}});',
    'function x(e){let r=e.message,d;r==null?d=(0,$.jsx)(B,{...Po.thinking}):d=r;return d}',
    '(0,Q.useEffect)(()=>{},[])}));',
  ].join('');
}

function codex2727FixtureHost() {
  return 'prefix;let n=[t,r,...lut,...cut];suffix';
}

function codex265727FixtureHost() {
  return 'prefix;let n=[t,r,...uut,...lut];suffix';
}

function codex2727FixtureShimmer() {
  const fallback =
    '(0,O.jsx)(i,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  return [
    'var E,D,O,k,A,j,M,N=e((()=>{',
    'D=t(c(),1),O=s();',
    'function x(){let r=(0,D.useRef)(null);(0,D.useEffect)(()=>{},[]);return ',
    fallback,
    '}}));',
  ].join('');
}

function codex26803FixtureWebview() {
  return [
    'var Za,Q,$,Qa,$a,eo,to,no,ro,io=e((()=>{',
    'Q=t(xe(),1),$=B(),no=me({thinking:{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`}});',
    'function x(e){let r=e.message,d;r==null?d=(0,$.jsx)(R,{...no.thinking}):d=r;return d}',
    'function y(e){return e??(0,$.jsx)(R,{...no.thinking})}',
    '(0,Q.useEffect)(()=>{},[])}));',
  ].join('');
}

function codex26803FixtureHost() {
  return 'prefix;let n=[t,r,...eut,...Qlt];suffix';
}

function codex26803FixtureShimmer() {
  const fallback =
    '(0,O.jsx)(a,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  return [
    'var E,D,O,k,A,j,M,N=e((()=>{',
    'D=t(s(),1),O=o();',
    'function x(){let r=(0,D.useRef)(null);(0,D.useEffect)(()=>{},[]);return ',
    fallback,
    '}}));',
  ].join('');
}

function codex26810FixtureWebview() {
  return [
    'var Ka,qa,Ja,$,Ya,Xa,Za,Qa,$a,eo=e((()=>{',
    'Ja=t(S(),1),$=u(),Qa=re({thinking:{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`}});',
    'function x(e){let t=e.label;return t??(0,$.jsx)(O,{...Qa.thinking})}',
    'function y(e){return e??(0,$.jsx)(O,{...Qa.thinking})}',
    '(0,Ja.useEffect)(()=>{},[])}));',
  ].join('');
}

function codex26810FixtureHost() {
  return 'prefix;let n=[t,r,...nut,...rut];suffix';
}

function codex26810FixtureShimmer() {
  const fallback =
    '(0,T.jsx)(c,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  return [
    'var C,w,T,E,D,O,k=e((()=>{',
    'w=t(o(),1),T=n();',
    'function x(){let r=(0,w.useRef)(null);(0,w.useEffect)(()=>{},[]);return ',
    fallback,
    '}}));',
  ].join('');
}

function codex2681052044FixtureWebview() {
  return [
    'var Ka,qa,Ja,$,Ya,Xa,Za,Qa,$a,eo=e((()=>{',
    'Ja=t(S(),1),$=u(),Qa=re({thinking:{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`}});',
    'function x(e){let t=e.label;return t??(0,$.jsx)(j,{...Qa.thinking})}',
    'function y(e){return e??(0,$.jsx)(j,{...Qa.thinking})}',
    '(0,Ja.useEffect)(()=>{},[])}));',
  ].join('');
}

function codex2681052044FixtureShimmer() {
  const fallback =
    '(0,T.jsx)(s,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  return [
    'var C,w,T,E,D,O,k=e((()=>{',
    'w=t(o(),1),T=n();',
    'function x(){let r=(0,w.useRef)(null);(0,w.useEffect)(()=>{},[]);return ',
    fallback,
    '}}));',
  ].join('');
}

function codex2681441407FixtureWebview() {
  return [
    'function x(e){let t=e.label;return t??(0,$.jsx)(k,{...ao.thinking})}',
    'function y(e){return e??(0,$.jsx)(k,{...ao.thinking})}',
    'var $a,eo,to,$,no,ro,io,ao,oo,so=e((()=>{',
    'to=t(S(),1),$=l(),ao=T({thinking:{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`}});',
    '(0,to.useEffect)(()=>{},[])}));',
  ].join('');
}

function codex2681441407FixtureHost() {
  return 'prefix;let n=[t,r,...Out,...Mut];suffix';
}

function codex2681831338FixtureWebview() {
  return [
    'function x(e){let i=e.message;return i??(0,$.jsx)(s,{...so.thinking})}',
    'function y(e){let i=e.heading;return i??(0,$.jsx)(s,{...so.thinking})}',
    'var to,no,ro,$,io,ao,oo,so,co,lo=e((()=>{',
    'ro=t(T(),1),$=A(),so=u({thinking:{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`}});',
    '(0,ro.useEffect)(()=>{},[])}));',
  ].join('');
}

function codex2681831338FixtureHost() {
  return 'prefix;let n=[t,r,...$ut,...Lut];suffix';
}

function codex2681841705FixtureWebview() {
  return codex2681831338FixtureWebview().replaceAll(
    '(0,$.jsx)(s,{...so.thinking})',
    '(0,$.jsx)(M,{...so.thinking})',
  );
}

function codex2681841705FixtureHost() {
  return 'prefix;let n=[t,r,...Fut,...$ut];suffix';
}

function codex2681861809FixtureWebview() {
  return codex2681841705FixtureWebview();
}

function codex2681861809FixtureHost() {
  return 'prefix;let n=[t,r,...But,...$ut];suffix';
}

function codex2682060940FixtureWebview() {
  return [
    'function x(e){let i=e.message;return i??(0,Z.jsx)(E,{...oa.thinking})}',
    'function y(e){let i=e.heading;return i??(0,Z.jsx)(E,{...oa.thinking})}',
    'var ea,ta,na,Z,ra,ia,aa,oa,sa,Q=e((()=>{',
    'na=t(a(),1),Z=b(),oa=re({thinking:{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`}});',
    '(0,na.useEffect)(()=>{},[])}));',
  ].join('');
}

function codex2682060940FixtureHost() {
  return 'prefix;let n=[t,r,...bdt,...vdt];suffix';
}

function codex2682532147FixtureWebview() {
  return [
    'function x(e){let i=e.message;return i??(0,Z.jsx)(a,{...qi.thinking})}',
    'function y(e){let i=e.heading;return i??(0,Z.jsx)(a,{...qi.thinking})}',
    'var Vi,Hi,Ui,Z,Wi,Gi,Ki,qi,Ji,Yi=e((()=>{',
    'Ui=t(v(),1),Z=b(),qi=i({thinking:{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`}});',
    '(0,Ui.useEffect)(()=>{},[])}));',
  ].join('');
}

function codex2682532147FixtureHost() {
  return 'prefix;let n=[t,r,...vpt,...ypt];suffix';
}

function codex2682551511FixtureWebview() {
  return codex2682532147FixtureWebview().replaceAll(
    '(0,Z.jsx)(a,{...qi.thinking})',
    '(0,Z.jsx)(d,{...qi.thinking})',
  );
}

function codex2682551511FixtureHost() {
  return 'prefix;let n=[t,r,...Spt,...bpt];suffix';
}

function codex2690122334FixtureWebview() {
  return [
    'function x(e){let i=e.message;return i??(0,X.jsx)(c,{...Qr.thinking})}',
    'function y(e){let i=e.heading;return i??(0,X.jsx)(c,{...Qr.thinking})}',
    'var qr,Jr,Yr,X,Z,Xr,Zr,Qr,$r,ei=e((()=>{',
    'Yr=t(f(),1),X=a(),Qr=s({thinking:{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`}});',
    '(0,Yr.useEffect)(()=>{},[])}));',
  ].join('');
}

function codex2690122334FixtureHost() {
  return 'prefix;let n=[t,r,...Iht,...Pht];suffix';
}

function inferredFixtureWebview() {
  const thinkingInferred =
    '(0,J.jsx)(I,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  const reasoningInferred =
    '(0,J.jsx)(I,{id:`reasoningItem.thinking`,defaultMessage:`Thinking`,description:`Message shown when AI is currently thinking`})';
  const exploringInferred =
    '(0,J.jsx)(I,{id:`localConversationTurn.exploration.accordion.header.active`,defaultMessage:`Exploring`,description:`Header for the exploration accordion while Codex is listing or reading files`,children:Child})';
  const descriptorInferred = '(0,J.jsx)(I,{...Messages.thinking})';
  return `var J=n();var R=q(u(),1),Next=(0,R.useSyncExternalStore)(subscribe,snapshot,snapshot);(0,R.useEffect)(()=>{},[]);let ref=(0,R.useRef)(null);${[
    thinkingInferred,
    thinkingInferred,
    reasoningInferred,
    exploringInferred,
    descriptorInferred,
  ].join(';')}`;
}

function inferredFixtureHost(suffix = '') {
  return `function buildPolicy({cspSource:a,devOrigin:b,extensionSentryOrigin:c}){let destinations=[a,c,...maps,...sockets];return ["default-src 'none'",\`img-src ${'${a}'} https: data:\`,\`script-src ${'${a}'}\`,\`connect-src ${'${destinations.join(" ")}'}\`].join("; ")+";"}${suffix}`;
}

function inferredFixtureShimmer() {
  const fallback =
    '(0,J.jsx)(I,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  return `var R=q(u(),1),Next={};function shimmer(){let ref=(0,R.useRef)(null);(0,R.useEffect)(()=>{},[]);return ${fallback}}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('патч заменяет активные ожидания, сохраняет резервную копию и откатывается', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(
    extensionPath,
    'webview',
    'assets',
    'local-conversation-turn-test.js',
  );
  const hostSource = fixtureHost();
  const webviewSource = fixtureWebview();
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, webviewSource);

  const installer = new CodexPatchInstaller(extensionPath, 'test-version', home, {
    version: 'test-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource),
  });

  const installed = await installer.install();
  assert.equal(installed.installed, true);
  assert.equal(installed.changed, true);
  assert.equal(installed.compatibilityMode, 'exact');
  assert.match(installed.token, /^[a-f0-9]{64}$/);
  assert.match(await fs.readFile(hostPath, 'utf8'), /__KODPAUZA_CSP_START__/);
  const patchedWebview = await fs.readFile(webviewPath, 'utf8');
  assert.match(patchedWebview, /__KODPAUZA_UI_START__/);
  assert.match(patchedWebview, /__kpObserveVisibility/);
  assert.match(patchedWebview, /document\.visibilityState!=="visible"/);
  assert.match(patchedWebview, /elementFromPoint/);
  assert.match(patchedWebview, /\/visibility\?token=/);
  assert.match(patchedWebview, /\/activity\?token=/);
  assert.match(patchedWebview, /__kpUseActivity/);
  assert.match(patchedWebview, /e\.format==="premium"/);
  assert.match(patchedWebview, /children:"Реклама · "\+t\.advertiserName/);
  assert.doesNotMatch(patchedWebview, /linear-gradient/);
  assert.doesNotMatch(patchedWebview, /Спонсорское предложение/);
  assert.doesNotMatch(patchedWebview, /Премиум/);
  assert.match(patchedWebview, /background:"rgba\(245,158,11,\.10\)"/);
  assert.match(patchedWebview, /borderLeft:"3px solid rgba\(245,158,11,\.78\)"/);
  assert.match(patchedWebview, /borderRadius:"7px"/);
  assert.match(patchedWebview, /width:"21px",height:"21px"/);
  assert.match(patchedWebview, /Рекламодатель:/);
  assert.match(patchedWebview, /erid:/);
  assert.match(patchedWebview, /children:"↗"/);
  assert.match(patchedWebview, /width:"14px",height:"14px"/);
  assert.match(patchedWebview, /data:image\\\/\(\?:png\|jpeg\|webp\)/);
  assert.match(patchedWebview, /data:image\/svg\+xml,/);
  assert.match(patchedWebview, /<foreignObject/);
  assert.match(patchedWebview, /borderBottom:"1px solid rgba\(148,163,184,\.34\)"/);
  assert.equal((patchedWebview.match(/__kpAdMessage/g) ?? []).length, 7);
  assert.doesNotThrow(() => new vm.Script(patchedWebview));

  const repeated = await installer.install();
  assert.equal(repeated.changed, false);
  assert.equal(repeated.token, installed.token);

  const restored = await installer.restore();
  assert.equal(restored.changed, true);
  assert.equal(await fs.readFile(hostPath, 'utf8'), hostSource);
  assert.equal(await fs.readFile(webviewPath, 'utf8'), webviewSource);
});

test('premium Codex рендерится отдельной компактной бренд-карточкой', () => {
  const ad = {
    adId: 'premium-1',
    format: 'premium',
    advertiserName: 'Acme',
    text: 'Реклама · Acme · Быстрые серверы для разработки',
    domain: 'acme.dev',
    iconUrl: null,
  };
  const { node, clicks } = renderInjectedAd(ad);

  assert.equal(node.props.role, 'link');
  assert.equal(node.props.tabIndex, 0);
  assert.equal(node.props.style.background, 'rgba(245,158,11,.10)');
  assert.equal(node.props.style.borderLeft, '3px solid rgba(245,158,11,.78)');
  assert.equal(node.props.style.maxWidth, '100%');
  assert.equal(node.props.style.minWidth, 0);
  assert.equal(node.props.style.overflow, 'hidden');
  assert.equal(node.props.children[0].props.style.width, '21px');

  const content = node.props.children[1];
  const header = content.props.children[0];
  assert.equal(header.props.children[0].props.children, 'Реклама · Acme');
  assert.equal(header.props.children[1].props.children, 'acme.dev');
  assert.equal(content.props.children[1].props.children, 'Быстрые серверы для разработки');
  assert.equal(node.props.children[2].props.children, '↗');
  assert.match(node.props.title, /Реклама\. Рекламодатель: Acme/);

  let prevented = false;
  let stopped = false;
  node.props.onKeyDown({
    key: 'Enter',
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.deepEqual(clicks, [ad]);
});

test('standard Codex сохраняет прежний однострочный формат', () => {
  const { node } = renderInjectedAd({
    adId: 'standard-1',
    format: 'standard',
    advertiserName: 'Acme',
    text: 'Реклама · Acme · Быстрые серверы для разработки',
    domain: 'acme.dev',
    iconUrl: null,
  });

  assert.equal(node.props.className, 'inline-flex max-w-full min-w-0 items-center gap-1.5');
  assert.equal(node.props.style.borderBottom, '1px solid rgba(148,163,184,.34)');
  assert.equal(node.props.style.background, undefined);
  assert.equal(node.props.children[0].props.style.width, '14px');
  assert.equal(
    node.props.children[1].props.children,
    'Реклама · Acme · Быстрые серверы для разработки',
  );
});

test('патч принимает новую версию Codex при неизменной структуре цели', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(
    extensionPath,
    'webview',
    'assets',
    'local-conversation-turn-test.js',
  );
  const hostSource = fixtureHost();
  const webviewSource = `${fixtureWebview()};var unrelated=1`;
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, webviewSource);

  const installer = new CodexPatchInstaller(extensionPath, 'future-version', home);

  const preflight = await installer.inspect();
  assert.equal(preflight.compatibilityMode, 'structural');
  const installed = await installer.install();
  assert.equal(installed.installed, true);
  assert.equal(installed.compatibilityMode, 'structural');
  assert.match(await fs.readFile(webviewPath, 'utf8'), /__KODPAUZA_UI_START__/);
});

test('патч Codex fail-closed отклоняет измененную цель', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(
    extensionPath,
    'webview',
    'assets',
    'local-conversation-turn-test.js',
  );
  const hostSource = fixtureHost();
  const changed = fixtureWebview().replace('reasoningItem.thinking', 'reasoningItem.changed');
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, changed);

  const installer = new CodexPatchInstaller(extensionPath, 'future-version', home);
  const status = await installer.inspect();
  assert.equal(status.compatible, false);
  assert.equal(status.compatibilityMode, 'unsupported');
  await assert.rejects(() => installer.install(), /безопасно отключена/);
  assert.equal(await fs.readFile(hostPath, 'utf8'), hostSource);
  assert.equal(await fs.readFile(webviewPath, 'utf8'), changed);
});

test('UI-патч Codex принимает только безопасные inline-иконки и домены', () => {
  const token = 'e'.repeat(64);
  const patched = patchWebviewSource(fixtureWebview(), token);
  const originalAnchor = 'var X=e(r()),Po=';
  const runtime = patched.slice(0, patched.indexOf(originalAnchor));
  const safeSvg = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16"/></svg>',
  )}`;
  const remoteIcon = 'https://tracker.example/icon.png';
  const unsafeSvg = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://tracker.example/pixel"/></svg>',
  )}`;
  const result = vm.runInNewContext(
    `${runtime};[__kpSafeIcon(${JSON.stringify(safeSvg)}),__kpSafeIcon(${JSON.stringify(remoteIcon)}),__kpSafeIcon(${JSON.stringify(unsafeSvg)}),__kpSafeDomain("acme.dev"),__kpSafeDomain("acme.dev/path")]`,
  );
  assert.equal(result[0], safeSvg);
  assert.equal(result[1], null);
  assert.equal(result[2], null);
  assert.equal(result[3], 'acme.dev');
  assert.equal(result[4], null);
});

test('служебный canary Codex подтверждает UI без отображения объявления', () => {
  const token = 'e'.repeat(64);
  const patched = patchWebviewSource(fixtureWebview(), token);
  const runtime = patched.slice(0, patched.indexOf('var X=e(r()),Po='));
  const requests = [];
  const canary = {
    active: true,
    adId: 'house-canary-12345678',
    campaignId: 'house',
    text: 'Kodpauza · Зарабатывайте, пока AI работает',
    advertiserName: 'Kodpauza',
    format: 'standard',
    canary: true,
  };
  const state = vm.runInNewContext(
    `${runtime};__kpSetAd(${JSON.stringify(canary)});__kpSnapshot()`,
    {
      fetch: (...args) => {
        requests.push(args);
        return Promise.resolve({ ok: true });
      },
    },
  );

  assert.equal(state, null);
  assert.equal(requests.length, 1);
  assert.match(requests[0][0], /\/visibility\?token=/);
  assert.deepEqual(JSON.parse(requests[0][1].body), {
    adId: canary.adId,
    viewId: requests[0][1].body.match(/"viewId":"([^"]+)"/)[1],
    visible: true,
  });
  assert.match(JSON.parse(requests[0][1].body).viewId, /^kp-canary-/);
});

test('структурный fallback Codex выводит профиль из переименованных якорей', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const assetsPath = path.join(extensionPath, 'webview', 'assets');
  const webviewPath = path.join(assetsPath, 'local-conversation-turn-future.js');
  const shimmerPath = path.join(assetsPath, 'thinking-shimmer-future.js');
  const hostSource = inferredFixtureHost();
  const webviewSource = inferredFixtureWebview();
  const shimmerSource = inferredFixtureShimmer();
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(assetsPath, { recursive: true });
  await Promise.all([
    fs.writeFile(hostPath, hostSource),
    fs.writeFile(webviewPath, webviewSource),
    fs.writeFile(shimmerPath, shimmerSource),
  ]);

  const installer = new CodexPatchInstaller(extensionPath, 'future-renamed-version', home);
  const installed = await installer.install();
  assert.equal(installed.compatibilityMode, 'structural');
  assert.equal(installed.installed, true);
  assert.match(
    await fs.readFile(hostPath, 'utf8'),
    /let destinations=\[a,c,\/\*__KODPAUZA_CSP_START__/,
  );
  assert.match(await fs.readFile(webviewPath, 'utf8'), /__KODPAUZA_UI_START__/);
  assert.match(await fs.readFile(shimmerPath, 'utf8'), /__KODPAUZA_UI_START__/);

  const restored = await installer.restore();
  assert.equal(restored.changed, true);
  assert.equal(await fs.readFile(hostPath, 'utf8'), hostSource);
  assert.equal(await fs.readFile(webviewPath, 'utf8'), webviewSource);
  assert.equal(await fs.readFile(shimmerPath, 'utf8'), shimmerSource);
});

test('структурный fallback Codex fail-closed при двух React-якорях', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(
    extensionPath,
    'webview',
    'assets',
    'local-conversation-turn-future.js',
  );
  const hostSource = inferredFixtureHost();
  const ambiguousWebview = `${inferredFixtureWebview()};let duplicate=(0,R.useSyncExternalStore)(a,b,b)`;
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, ambiguousWebview);

  const installer = new CodexPatchInstaller(extensionPath, 'future-ambiguous-version', home);
  const status = await installer.inspect();
  assert.equal(status.compatible, false);
  assert.equal(status.compatibilityMode, 'unsupported');
  await assert.rejects(() => installer.install(), /безопасно отключена/);
  assert.equal(await fs.readFile(hostPath, 'utf8'), hostSource);
  assert.equal(await fs.readFile(webviewPath, 'utf8'), ambiguousWebview);
});

test('структурный fallback Codex требует независимые React hooks', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(
    extensionPath,
    'webview',
    'assets',
    'local-conversation-turn-future.js',
  );
  const incompleteWebview = inferredFixtureWebview().replace('(0,R.useRef)', '(0,Other.useRef)');
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, inferredFixtureHost());
  await fs.writeFile(webviewPath, incompleteWebview);

  const status = await new CodexPatchInstaller(
    extensionPath,
    'future-incomplete-version',
    path.join(root, 'home'),
  ).inspect();
  assert.equal(status.compatible, false);
  assert.equal(status.compatibilityMode, 'unsupported');
});

test('чистые функции патча отклоняют повторное применение', () => {
  const token = 'b'.repeat(64);
  const webview = patchWebviewSource(fixtureWebview(), token);
  const host = patchHostSource(fixtureHost());
  const shimmer = patchThinkingShimmerSource(
    modernFixtureShimmer(),
    token,
    CODEX_26_707_SHIMMER_PATCH_PROFILE,
  );
  assert.throws(() => patchWebviewSource(webview, token), /уже присутствует/);
  assert.throws(() => patchHostSource(host), /уже присутствует/);
  assert.throws(
    () => patchThinkingShimmerSource(shimmer, token, CODEX_26_707_SHIMMER_PATCH_PROFILE),
    /уже присутствует/,
  );
});

test('профиль Codex 26.707 патчит новую структуру без затрагивания других строк', () => {
  const token = 'c'.repeat(64);
  const source = modernFixtureWebview();
  const webview = patchWebviewSource(source, token, CODEX_26_707_PATCH_PROFILE);
  const host = patchHostSource(modernFixtureHost(), CODEX_26_707_PATCH_PROFILE);

  assert.match(webview, /__KODPAUZA_UI_START__/);
  assert.match(webview, /\$\.useSyncExternalStore/);
  assert.match(webview, /Q\.jsxs/);
  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 11);
  assert.match(webview, /__kpAdMessage,\{fallback:\(0,Q\.jsx\)\(Y,\{\.\.\.Gm\.thinking\}\)\}/);
  assert.match(host, /__KODPAUZA_CSP_START__/);
  assert.doesNotThrow(() => new vm.Script(webview));
});

test('профиль Codex 26.707.91948 патчит обновленные идентификаторы UI', () => {
  const token = 'd'.repeat(64);
  const source = latestModernFixtureWebview();
  const webview = patchWebviewSource(source, token, CODEX_26_707_91948_PATCH_PROFILE);
  const host = patchHostSource(modernFixtureHost(), CODEX_26_707_91948_PATCH_PROFILE);

  assert.match(webview, /__KODPAUZA_UI_START__/);
  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 11);
  assert.match(
    webview,
    /localConversationTurn\.exploration\.accordion\.header\.active[^;]+children:kf/,
  );
  assert.match(host, /__KODPAUZA_CSP_START__/);
  assert.doesNotThrow(() => new vm.Script(webview));
});

test('профиль Codex 26.715.31925 патчит UI без удаленной строки reasoning', () => {
  const token = 'f'.repeat(64);
  const webview = patchWebviewSource(
    codex2715FixtureWebview(),
    token,
    CODEX_26_715_31925_PATCH_PROFILE,
  );
  const host = patchHostSource(codex2715FixtureHost(), CODEX_26_715_31925_PATCH_PROFILE);
  const shimmer = patchThinkingShimmerSource(
    codex2715FixtureShimmer(),
    token,
    CODEX_26_715_31925_SHIMMER_PATCH_PROFILE,
  );

  assert.match(webview, /__KODPAUZA_UI_START__/);
  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 8);
  assert.doesNotMatch(webview, /reasoningItem\.thinking/);
  assert.match(
    webview,
    /localConversationTurn\.exploration\.accordion\.header\.active[^;]+children:Nr/,
  );
  assert.match(host, /__KODPAUZA_CSP_START__/);
  assert.match(shimmer, /__KODPAUZA_UI_START__/);
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(shimmer));
});

test('профиль Codex 26.721.30844 патчит descriptor-only placeholder', () => {
  const token = '7'.repeat(64);
  const webview = patchWebviewSource(
    codex2721FixtureWebview(),
    token,
    CODEX_26_721_30844_PATCH_PROFILE,
  );
  const host = patchHostSource(codex2721FixtureHost(), CODEX_26_721_30844_PATCH_PROFILE);

  assert.match(webview, /__KODPAUZA_UI_START__/);
  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 2);
  assert.match(
    webview,
    /\$\.jsx\)\(__kpAdMessage,\{fallback:\(0,\$\.jsx\)\(U,\{\.\.\.Ka\.thinking\}\)\}/,
  );
  assert.doesNotMatch(webview, /reasoningItem\.thinking/);
  assert.doesNotMatch(webview, /localConversationTurn\.exploration\.accordion\.header\.active/);
  assert.match(host, /__KODPAUZA_CSP_START__/);
  assert.doesNotThrow(() => new vm.Script(webview));
});

test('профиль Codex 26.721.30844 fail-closed при измененном descriptor', () => {
  const token = '8'.repeat(64);
  const changed = codex2721FixtureWebview().replace('Ka.thinking', 'Ka.changed');

  assert.throws(
    () => patchWebviewSource(changed, token, CODEX_26_721_30844_PATCH_PROFILE),
    /видимый placeholder Thinking/,
  );
});

test('профиль Codex 26.721.41059 патчит обновленный CSP-якорь', () => {
  const token = '9'.repeat(64);
  const webview = patchWebviewSource(
    codex2721FixtureWebview(),
    token,
    CODEX_26_721_41059_PATCH_PROFILE,
  );
  const host = patchHostSource(codex2721UpdatedFixtureHost(), CODEX_26_721_41059_PATCH_PROFILE);

  assert.match(webview, /__KODPAUZA_UI_START__/);
  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 2);
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.doesNotThrow(() => new vm.Script(webview));
});

test('профиль Codex 26.727.40816 патчит descriptor и отдельный shimmer', () => {
  const token = 'a'.repeat(64);
  const webview = patchWebviewSource(
    codex2727FixtureWebview(),
    token,
    CODEX_26_727_40816_PATCH_PROFILE,
  );
  const host = patchHostSource(codex2727FixtureHost(), CODEX_26_727_40816_PATCH_PROFILE);
  const shimmer = patchThinkingShimmerSource(
    codex2727FixtureShimmer(),
    token,
    CODEX_26_727_40816_SHIMMER_PATCH_PROFILE,
  );

  assert.match(webview, /__KODPAUZA_UI_START__/);
  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 2);
  assert.match(
    webview,
    /\$\.jsx\)\(__kpAdMessage,\{fallback:\(0,\$\.jsx\)\(B,\{\.\.\.Po\.thinking\}\)\}/,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.match(shimmer, /__KODPAUZA_UI_START__/);
  assert.match(
    shimmer,
    /O\.jsx\)\(__kpAdMessage,\{fallback:\(0,O\.jsx\)\(i,\{id:`thinkingShimmer\.default`/,
  );
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
  assert.doesNotThrow(() => new vm.Script(shimmer));
});

test('профиль Codex 26.727.40816 fail-closed при измененном descriptor', () => {
  const token = 'b'.repeat(64);
  const changed = codex2727FixtureWebview().replace('Po.thinking', 'Po.changed');

  assert.throws(
    () => patchWebviewSource(changed, token, CODEX_26_727_40816_PATCH_PROFILE),
    /видимый placeholder Thinking/,
  );
});

test('профиль Codex 26.5727.51351 патчит exact CSP, descriptor и shimmer', () => {
  const token = 'c'.repeat(64);
  const webview = patchWebviewSource(
    codex2727FixtureWebview(),
    token,
    CODEX_26_5727_51351_PATCH_PROFILE,
  );
  const host = patchHostSource(codex265727FixtureHost(), CODEX_26_5727_51351_PATCH_PROFILE);
  const shimmer = patchThinkingShimmerSource(
    codex2727FixtureShimmer(),
    token,
    CODEX_26_5727_51351_SHIMMER_PATCH_PROFILE,
  );

  assert.match(webview, /__KODPAUZA_UI_START__/);
  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 2);
  assert.match(
    webview,
    /\$\.jsx\)\(__kpAdMessage,\{fallback:\(0,\$\.jsx\)\(B,\{\.\.\.Po\.thinking\}\)\}/,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.match(shimmer, /__KODPAUZA_UI_START__/);
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
  assert.doesNotThrow(() => new vm.Script(shimmer));
});

test('профиль Codex 26.5727.51351 fail-closed при старом CSP-якоре', () => {
  assert.throws(
    () => patchHostSource(codex2727FixtureHost(), CODEX_26_5727_51351_PATCH_PROFILE),
    /политика подключения webview/,
  );
});

test('профиль Codex 26.803.41515 патчит два descriptor placeholder, CSP и shimmer', () => {
  const token = 'd'.repeat(64);
  const webview = patchWebviewSource(
    codex26803FixtureWebview(),
    token,
    CODEX_26_803_41515_PATCH_PROFILE,
  );
  const host = patchHostSource(codex26803FixtureHost(), CODEX_26_803_41515_PATCH_PROFILE);
  const shimmer = patchThinkingShimmerSource(
    codex26803FixtureShimmer(),
    token,
    CODEX_26_803_41515_SHIMMER_PATCH_PROFILE,
  );

  assert.match(webview, /__KODPAUZA_UI_START__/);
  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,\$\.jsx\)\(R,\{\.\.\.no\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.match(shimmer, /__KODPAUZA_UI_START__/);
  assert.match(
    shimmer,
    /O\.jsx\)\(__kpAdMessage,\{fallback:\(0,O\.jsx\)\(a,\{id:`thinkingShimmer\.default`/,
  );
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
  assert.doesNotThrow(() => new vm.Script(shimmer));
});

test('профиль Codex 26.803.41515 fail-closed при пропавшем descriptor', () => {
  const changed = codex26803FixtureWebview().replace(
    '(0,$.jsx)(R,{...no.thinking})',
    '(0,$.jsx)(R,{...no.changed})',
  );

  assert.throws(
    () => patchWebviewSource(changed, 'e'.repeat(64), CODEX_26_803_41515_PATCH_PROFILE),
    /видимый placeholder Thinking/,
  );
});

test('профиль Codex 26.810.41047 патчит React Compiler UI, CSP и shimmer', () => {
  const token = 'f'.repeat(64);
  const webview = patchWebviewSource(
    codex26810FixtureWebview(),
    token,
    CODEX_26_810_41047_PATCH_PROFILE,
  );
  const host = patchHostSource(codex26810FixtureHost(), CODEX_26_810_41047_PATCH_PROFILE);
  const shimmer = patchThinkingShimmerSource(
    codex26810FixtureShimmer(),
    token,
    CODEX_26_810_41047_SHIMMER_PATCH_PROFILE,
  );

  assert.match(webview, /__KODPAUZA_UI_START__/);
  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,\$\.jsx\)\(O,\{\.\.\.Qa\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.match(shimmer, /__KODPAUZA_UI_START__/);
  assert.match(
    shimmer,
    /T\.jsx\)\(__kpAdMessage,\{fallback:\(0,T\.jsx\)\(c,\{id:`thinkingShimmer\.default`/,
  );
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
  assert.doesNotThrow(() => new vm.Script(shimmer));
});

test('профиль Codex 26.810.41047 fail-closed при изменённом descriptor', () => {
  const changed = codex26810FixtureWebview().replace(
    '(0,$.jsx)(O,{...Qa.thinking})',
    '(0,$.jsx)(O,{...Qa.changed})',
  );

  assert.throws(
    () => patchWebviewSource(changed, 'a'.repeat(64), CODEX_26_810_41047_PATCH_PROFILE),
    /видимый placeholder Thinking/,
  );
});

test('профиль Codex 26.810.52044 патчит новые intl-идентификаторы UI и shimmer', () => {
  const token = 'b'.repeat(64);
  const webview = patchWebviewSource(
    codex2681052044FixtureWebview(),
    token,
    CODEX_26_810_52044_PATCH_PROFILE,
  );
  const host = patchHostSource(codex26810FixtureHost(), CODEX_26_810_52044_PATCH_PROFILE);
  const shimmer = patchThinkingShimmerSource(
    codex2681052044FixtureShimmer(),
    token,
    CODEX_26_810_52044_SHIMMER_PATCH_PROFILE,
  );

  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,\$\.jsx\)\(j,\{\.\.\.Qa\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.match(
    shimmer,
    /T\.jsx\)\(__kpAdMessage,\{fallback:\(0,T\.jsx\)\(s,\{id:`thinkingShimmer\.default`/,
  );
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
  assert.doesNotThrow(() => new vm.Script(shimmer));
});

test('профиль Codex 26.810.52044 fail-closed при старом intl-идентификаторе', () => {
  const changed = codex2681052044FixtureWebview().replace(
    '(0,$.jsx)(j,{...Qa.thinking})',
    '(0,$.jsx)(O,{...Qa.thinking})',
  );

  assert.throws(
    () => patchWebviewSource(changed, 'c'.repeat(64), CODEX_26_810_52044_PATCH_PROFILE),
    /видимый placeholder Thinking/,
  );
});

test('профиль Codex 26.814.41407 патчит новую структуру UI, CSP и shimmer', () => {
  const token = 'd'.repeat(64);
  const webview = patchWebviewSource(
    codex2681441407FixtureWebview(),
    token,
    CODEX_26_814_41407_PATCH_PROFILE,
  );
  const host = patchHostSource(
    codex2681441407FixtureHost(),
    CODEX_26_814_41407_PATCH_PROFILE,
  );
  const shimmer = patchThinkingShimmerSource(
    codex2681052044FixtureShimmer(),
    token,
    CODEX_26_814_41407_SHIMMER_PATCH_PROFILE,
  );

  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,\$\.jsx\)\(k,\{\.\.\.ao\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.match(
    shimmer,
    /T\.jsx\)\(__kpAdMessage,\{fallback:\(0,T\.jsx\)\(s,\{id:`thinkingShimmer\.default`/,
  );
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
  assert.doesNotThrow(() => new vm.Script(shimmer));
});

test('профиль Codex 26.814.41407 fail-closed при старом descriptor', () => {
  const changed = codex2681441407FixtureWebview().replace(
    '(0,$.jsx)(k,{...ao.thinking})',
    '(0,$.jsx)(k,{...Qa.thinking})',
  );

  assert.throws(
    () => patchWebviewSource(changed, 'e'.repeat(64), CODEX_26_814_41407_PATCH_PROFILE),
    /видимый placeholder Thinking/,
  );
});

test('профиль Codex 26.818.31338 патчит descriptor-only UI без shimmer и новый CSP', () => {
  const token = 'f'.repeat(64);
  const webview = patchWebviewSource(
    codex2681831338FixtureWebview(),
    token,
    CODEX_26_818_31338_PATCH_PROFILE,
  );
  const host = patchHostSource(
    codex2681831338FixtureHost(),
    CODEX_26_818_31338_PATCH_PROFILE,
  );

  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,\$\.jsx\)\(s,\{\.\.\.so\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
});

test('профиль Codex 26.818.31338 fail-closed при изменении descriptor', () => {
  const changed = codex2681831338FixtureWebview().replace(
    '(0,$.jsx)(s,{...so.thinking})',
    '(0,$.jsx)(s,{...ao.thinking})',
  );

  assert.throws(
    () => patchWebviewSource(changed, '0'.repeat(64), CODEX_26_818_31338_PATCH_PROFILE),
    /видимый placeholder Thinking/,
  );
});

test('профиль Codex 26.818.41705 патчит новые intl и CSP-якорь без shimmer', () => {
  const token = '1'.repeat(64);
  const webview = patchWebviewSource(
    codex2681841705FixtureWebview(),
    token,
    CODEX_26_818_41705_PATCH_PROFILE,
  );
  const host = patchHostSource(
    codex2681841705FixtureHost(),
    CODEX_26_818_41705_PATCH_PROFILE,
  );

  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,\$\.jsx\)\(M,\{\.\.\.so\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
});

test('профиль Codex 26.818.41705 fail-closed при старом intl-компоненте', () => {
  const changed = codex2681841705FixtureWebview().replace(
    '(0,$.jsx)(M,{...so.thinking})',
    '(0,$.jsx)(s,{...so.thinking})',
  );

  assert.throws(
    () => patchWebviewSource(changed, '2'.repeat(64), CODEX_26_818_41705_PATCH_PROFILE),
    /видимый placeholder Thinking/,
  );
});

test('профиль Codex 26.818.61809 патчит новый CSP-якорь без shimmer', () => {
  const token = '3'.repeat(64);
  const webview = patchWebviewSource(
    codex2681861809FixtureWebview(),
    token,
    CODEX_26_818_61809_PATCH_PROFILE,
  );
  const host = patchHostSource(
    codex2681861809FixtureHost(),
    CODEX_26_818_61809_PATCH_PROFILE,
  );

  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,\$\.jsx\)\(M,\{\.\.\.so\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
});

test('профиль Codex 26.818.61809 fail-closed при старом CSP-якоре', () => {
  assert.throws(
    () => patchHostSource(codex2681841705FixtureHost(), CODEX_26_818_61809_PATCH_PROFILE),
    /политика подключения webview/,
  );
});

test('профиль Codex 26.820.60940 патчит новые React, intl и CSP-якоря без shimmer', () => {
  const token = '4'.repeat(64);
  const webview = patchWebviewSource(
    codex2682060940FixtureWebview(),
    token,
    CODEX_26_820_60940_PATCH_PROFILE,
  );
  const host = patchHostSource(
    codex2682060940FixtureHost(),
    CODEX_26_820_60940_PATCH_PROFILE,
  );

  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,Z\.jsx\)\(E,\{\.\.\.oa\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
});

test('профиль Codex 26.820.60940 fail-closed при старом React-якоре', () => {
  assert.throws(
    () =>
      patchWebviewSource(
        codex2681861809FixtureWebview(),
        '5'.repeat(64),
        CODEX_26_820_60940_PATCH_PROFILE,
      ),
    /точка подключения React/,
  );
});

test('профиль Codex 26.820.71523 патчит проверенную descriptor-only структуру', () => {
  const token = '6'.repeat(64);
  const webview = patchWebviewSource(
    codex2682060940FixtureWebview(),
    token,
    CODEX_26_820_71523_PATCH_PROFILE,
  );
  const host = patchHostSource(
    codex2682060940FixtureHost(),
    CODEX_26_820_71523_PATCH_PROFILE,
  );

  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,Z\.jsx\)\(E,\{\.\.\.oa\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
});

test('профиль Codex 26.820.71523 fail-closed при старом React-якоре', () => {
  assert.throws(
    () =>
      patchWebviewSource(
        codex2681861809FixtureWebview(),
        '7'.repeat(64),
        CODEX_26_820_71523_PATCH_PROFILE,
      ),
    /точка подключения React/,
  );
});

test('профиль Codex 26.825.32147 патчит новые descriptor-only и CSP-якоря', () => {
  const token = '8'.repeat(64);
  const webview = patchWebviewSource(
    codex2682532147FixtureWebview(),
    token,
    CODEX_26_825_32147_PATCH_PROFILE,
  );
  const host = patchHostSource(
    codex2682532147FixtureHost(),
    CODEX_26_825_32147_PATCH_PROFILE,
  );

  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,Z\.jsx\)\(a,\{\.\.\.qi\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
});

test('профиль Codex 26.825.32147 fail-closed при старом React-якоре', () => {
  assert.throws(
    () =>
      patchWebviewSource(
        codex2682060940FixtureWebview(),
        '9'.repeat(64),
        CODEX_26_825_32147_PATCH_PROFILE,
      ),
    /точка подключения React/,
  );
});

test('профиль Codex 26.825.51511 патчит новые intl и CSP-якоря', () => {
  const token = 'a'.repeat(64);
  const webview = patchWebviewSource(
    codex2682551511FixtureWebview(),
    token,
    CODEX_26_825_51511_PATCH_PROFILE,
  );
  const host = patchHostSource(
    codex2682551511FixtureHost(),
    CODEX_26_825_51511_PATCH_PROFILE,
  );

  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,Z\.jsx\)\(d,\{\.\.\.qi\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
});

test('профиль Codex 26.825.51511 fail-closed при старом intl-якоре', () => {
  assert.throws(
    () =>
      patchWebviewSource(
        codex2682532147FixtureWebview(),
        'b'.repeat(64),
        CODEX_26_825_51511_PATCH_PROFILE,
      ),
    /видимый placeholder Thinking/,
  );
});

test('профиль Codex 26.901.22334 патчит новые ESM и CSP-якоря', () => {
  const token = 'c'.repeat(64);
  const webview = patchWebviewSource(
    codex2690122334FixtureWebview(),
    token,
    CODEX_26_901_22334_PATCH_PROFILE,
  );
  const host = patchHostSource(
    codex2690122334FixtureHost(),
    CODEX_26_901_22334_PATCH_PROFILE,
  );

  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 3);
  assert.equal(
    (webview.match(/__kpAdMessage,\{fallback:\(0,X\.jsx\)\(c,\{\.\.\.Qr\.thinking\}\)\}/g) ?? [])
      .length,
    2,
  );
  assert.match(host, /let n=\[t,r,\/\*__KODPAUZA_CSP_START__\*\/"http:\/\/127\.0\.0\.1:37491"/);
  assert.doesNotThrow(() => new vm.Script(webview));
  assert.doesNotThrow(() => new vm.Script(host));
});

test('профиль Codex 26.901.22334 fail-closed при старой ESM-структуре', () => {
  assert.throws(
    () =>
      patchWebviewSource(
        codex2682551511FixtureWebview(),
        'd'.repeat(64),
        CODEX_26_901_22334_PATCH_PROFILE,
      ),
    /точка подключения React/,
  );
});

test('профиль Codex 26.707 патчит и восстанавливает отдельный модуль видимого Thinking', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const assetsPath = path.join(extensionPath, 'webview', 'assets');
  const webviewPath = path.join(assetsPath, 'local-conversation-turn-modern.js');
  const shimmerPath = path.join(assetsPath, 'thinking-shimmer-modern.js');
  const hostSource = modernFixtureHost();
  const webviewSource = modernFixtureWebview();
  const shimmerSource = modernFixtureShimmer();
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(assetsPath, { recursive: true });
  await Promise.all([
    fs.writeFile(hostPath, hostSource),
    fs.writeFile(webviewPath, webviewSource),
    fs.writeFile(shimmerPath, shimmerSource),
  ]);

  const installer = new CodexPatchInstaller(extensionPath, 'modern-version', home, {
    version: 'modern-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource),
    patchProfile: CODEX_26_707_PATCH_PROFILE,
    shimmerSha256: sha256(shimmerSource),
    shimmerPatchProfile: CODEX_26_707_SHIMMER_PATCH_PROFILE,
  });

  const installed = await installer.install();
  const [patchedWebview, patchedShimmer, manifest] = await Promise.all([
    fs.readFile(webviewPath, 'utf8'),
    fs.readFile(shimmerPath, 'utf8'),
    fs.readFile(path.join(home, 'codex-ui-patch.json'), 'utf8').then(JSON.parse),
  ]);
  assert.equal(installed.installed, true);
  assert.equal(installed.shimmerPath, shimmerPath);
  assert.equal(manifest.files.length, 3);
  assert.equal(patchedWebview.includes(installed.token), true);
  assert.equal(patchedShimmer.includes(installed.token), true);
  assert.match(patchedShimmer, /__kpAdMessage/);
  assert.doesNotThrow(() => new vm.Script(patchedShimmer));
  assert.equal((await installer.inspect()).installed, true);

  const restored = await installer.restore();
  assert.equal(restored.changed, true);
  assert.equal(await fs.readFile(hostPath, 'utf8'), hostSource);
  assert.equal(await fs.readFile(webviewPath, 'utf8'), webviewSource);
  assert.equal(await fs.readFile(shimmerPath, 'utf8'), shimmerSource);
});

test('восстановление исправляет частично примененный патч', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(
    extensionPath,
    'webview',
    'assets',
    'local-conversation-turn-test.js',
  );
  const hostSource = fixtureHost();
  const webviewSource = fixtureWebview();
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, webviewSource);

  const installer = new CodexPatchInstaller(extensionPath, 'test-version', home, {
    version: 'test-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource),
  });
  await installer.install();
  await fs.writeFile(hostPath, hostSource);

  await assert.rejects(() => installer.inspect(), /применен частично/);
  const restored = await installer.restore();
  assert.equal(restored.changed, true);
  assert.equal(await fs.readFile(hostPath, 'utf8'), hostSource);
  assert.equal(await fs.readFile(webviewPath, 'utf8'), webviewSource);
});

test('автоматическая проверка переустанавливает частично примененный патч', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(
    extensionPath,
    'webview',
    'assets',
    'local-conversation-turn-test.js',
  );
  const hostSource = fixtureHost();
  const webviewSource = fixtureWebview();
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, webviewSource);

  const installer = new CodexPatchInstaller(extensionPath, 'test-version', home, {
    version: 'test-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource),
  });
  const first = await installer.install();
  await fs.writeFile(hostPath, hostSource);

  const repaired = await installer.ensureInstalled();
  assert.equal(repaired.installed, true);
  assert.equal(repaired.changed, true);
  assert.notEqual(repaired.token, first.token);
  assert.match(await fs.readFile(hostPath, 'utf8'), /__KODPAUZA_CSP_START__/);
  assert.match(await fs.readFile(webviewPath, 'utf8'), /__KODPAUZA_UI_START__/);
});

test('автоматическая проверка обновляет старую ревизию патча Codex', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(
    extensionPath,
    'webview',
    'assets',
    'local-conversation-turn-test.js',
  );
  const hostSource = fixtureHost();
  const webviewSource = fixtureWebview();
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, webviewSource);
  const build = {
    version: 'test-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource),
  };
  const installer = new CodexPatchInstaller(extensionPath, 'test-version', home, build);
  const first = await installer.install();
  const manifestPath = path.join(home, 'codex-ui-patch.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.patchRevision = 8;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

  const updated = await installer.ensureInstalled();
  assert.equal(updated.installed, true);
  assert.equal(updated.changed, true);
  assert.notEqual(updated.token, first.token);
  assert.equal(JSON.parse(await fs.readFile(manifestPath, 'utf8')).patchRevision, 9);
});

test('автоматическая проверка переносит патч на новый каталог Codex', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'kodpauza');
  const oldExtensionPath = path.join(root, 'codex-old');
  const newExtensionPath = path.join(root, 'codex-new');
  const hostSource = fixtureHost();
  const webviewSource = fixtureWebview();

  for (const extensionPath of [oldExtensionPath, newExtensionPath]) {
    const hostPath = path.join(extensionPath, 'out', 'extension.js');
    const webviewPath = path.join(
      extensionPath,
      'webview',
      'assets',
      'local-conversation-turn-test.js',
    );
    await fs.mkdir(path.dirname(hostPath), { recursive: true });
    await fs.mkdir(path.dirname(webviewPath), { recursive: true });
    await fs.writeFile(hostPath, hostSource);
    await fs.writeFile(webviewPath, webviewSource);
  }

  const build = {
    version: 'test-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource),
  };
  await new CodexPatchInstaller(oldExtensionPath, 'test-version', home, build).install();

  const migrated = await new CodexPatchInstaller(
    newExtensionPath,
    'test-version',
    home,
    build,
  ).ensureInstalled();
  assert.equal(migrated.installed, true);
  assert.equal(migrated.changed, true);
  assert.equal(
    await fs.readFile(path.join(oldExtensionPath, 'out', 'extension.js'), 'utf8'),
    hostSource,
  );
  assert.equal(
    await fs.readFile(
      path.join(oldExtensionPath, 'webview', 'assets', 'local-conversation-turn-test.js'),
      'utf8',
    ),
    webviewSource,
  );
  assert.match(
    await fs.readFile(path.join(newExtensionPath, 'out', 'extension.js'), 'utf8'),
    /__KODPAUZA_CSP_START__/,
  );
  const manifest = JSON.parse(await fs.readFile(path.join(home, 'codex-ui-patch.json'), 'utf8'));
  assert.equal(manifest.extensionPath, newExtensionPath);
});
