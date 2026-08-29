const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {
  CLAUDE_2_1_209_PROFILE,
  CLAUDE_2_1_212_PROFILE,
  CLAUDE_2_1_214_PROFILE,
  CLAUDE_2_1_238_PROFILE,
  CLAUDE_2_1_239_PROFILE,
  CLAUDE_2_1_241_PROFILE,
  CLAUDE_2_1_245_PROFILE,
  CLAUDE_2_1_246_PROFILE,
  CLAUDE_2_1_247_PROFILE,
  CLAUDE_2_1_250_PROFILE,
  CLAUDE_2_1_251_PROFILE,
  ClaudePatchInstaller,
  patchClaudeHostSource,
  patchClaudeWebviewSource,
} = require('../dist/claudePatchInstaller.js');

const profile = CLAUDE_2_1_209_PROFILE;
const hostSource =
  'prefix;<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ${p}; ${f}; ${m}; script-src \'nonce-${u}\'; ${v};">;suffix';
const hostSource212 = hostSource.replace('${v}', '${h}');

function fixtureWebview() {
  return `var pre=1;function oQe({size:e=16,permissionMode:t,status:i,spinnerVerbsConfig:n}){let o=co(()=>M8t(n),[n]),r=co(()=>Math.max(...o.map((p)=>p.length)),[o]),[s,a]=ne(0),[l,c]=ne(()=>Bj(o));de(()=>{let p=setInterval(()=>{a((f)=>(f+1)%iQe.length)},120);return()=>clearInterval(p)},[]),Vme(()=>{c(Bj(o))},(p)=>{let f=[2000,3000,5000];return p<f.length?f[p]:5000});let u=l;if(i==="compacting")u="Compacting";let h=A8t(u+"...",r+3);return E("div",{className:Fj.container,"data-permission-mode":t,children:[b("span",{className:Fj.icon,style:{fontSize:\`\${e}px\`},children:iQe[s]}),b("span",{className:Fj.text,children:h})]})}var post=1;`;
}

function renamedFixtureWebview() {
  return `var pre=1;function Zz({size:q=16,permissionMode:w,status:x,spinnerVerbsConfig:y}){let A=mx(()=>vr(y),[y]),B=mx(()=>Math.max(...A.map((z)=>z.length)),[A]),[C,D]=st(0),[F,G]=st(()=>rr(A));ef(()=>{let tm=setInterval(()=>{D((p)=>(p+1)%FR.length)},120);return()=>clearInterval(tm)},[]),sch(()=>{G(rr(A))},(at)=>{let ds=[2000,3000,5000];return at<ds.length?ds[at]:5000});let cur=F;if(x==="compacting")cur="Compacting";let anim=ani(cur+"...",B+3);return CE("div",{className:ST.container,"data-permission-mode":w,children:[CH("span",{className:ST.icon,style:{fontSize:\`\${q}px\`},children:FR[C]}),CH("span",{className:ST.text,children:anim})]})}var post=1;`;
}

const renamedHostSource = hostSource
  .replace('${p}', '${aa}')
  .replace('${f}', '${bb}')
  .replace('${m}', '${cc}')
  .replace('${u}', '${dd}')
  .replace('${v}', '${ee}');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function renderPatchedAd(ad) {
  const token = 'd'.repeat(64);
  const patched = patchClaudeWebviewSource(fixtureWebview(), token, profile);
  const runtime = patched.slice(
    patched.indexOf('/*__KODPAUZA_CLAUDE_UI_START__'),
    patched.indexOf('function oQe'),
  );
  const requests = [];
  const context = {
    fetch: (...args) => {
      requests.push(args);
      return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
    },
    ne: (initial) => [initial, () => {}],
    de: () => {},
    E: (type, properties) => ({ type, ...properties }),
    b: (type, properties) => ({ type, ...properties }),
  };
  vm.runInNewContext(
    `${runtime};globalThis.__rendered=__kpClaudeAdLink({ad:${JSON.stringify(ad)}})`,
    context,
  );
  return { rendered: context.__rendered, requests };
}

async function fixture(context, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-claude-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'claude');
  const home = path.join(root, 'kodpauza');
  const fixtureHostSource = options.hostSource ?? hostSource;
  const fixtureProfile = options.profile ?? profile;
  const webviewSource = options.webviewSource ?? fixtureWebview();
  await fs.mkdir(path.join(extensionPath, 'webview'), { recursive: true });
  await fs.writeFile(path.join(extensionPath, 'extension.js'), fixtureHostSource);
  await fs.writeFile(path.join(extensionPath, 'webview', 'index.js'), webviewSource);
  const build = {
    version: 'test-version',
    hostSha256: sha256(fixtureHostSource),
    webviewSha256: sha256(webviewSource),
    profile: fixtureProfile,
  };
  return { root, extensionPath, home, hostSource: fixtureHostSource, webviewSource, build };
}

test('Claude UI-патч устанавливается, не трогает Compacting и откатывается', async (context) => {
  const value = await fixture(context);
  const installer = new ClaudePatchInstaller(
    value.extensionPath,
    'test-version',
    value.home,
    value.build,
  );
  const installed = await installer.install();
  assert.equal(installed.installed, true);
  assert.equal(installed.changed, true);
  assert.equal(installed.compatibilityMode, 'exact');
  assert.match(installed.token, /^[a-f0-9]{64}$/);

  const patchedHost = await fs.readFile(path.join(value.extensionPath, 'extension.js'), 'utf8');
  const patchedWebview = await fs.readFile(
    path.join(value.extensionPath, 'webview', 'index.js'),
    'utf8',
  );
  assert.match(patchedHost, /connect-src http:\/\/127\.0\.0\.1:37491/);
  assert.match(patchedWebview, /__KODPAUZA_CLAUDE_UI_START__/);
  assert.match(patchedWebview, /k&&i!=="compacting"/);
  assert.match(patchedWebview, /__kpClaudeObserveVisibility/);
  assert.match(patchedWebview, /document\.visibilityState!=="visible"/);
  assert.match(patchedWebview, /elementFromPoint/);
  assert.match(patchedWebview, /\/visibility\?token=/);
  assert.match(patchedWebview, /\/activity\?token=/);
  assert.match(patchedWebview, /__kpClaudeUseActivity/);
  assert.match(patchedWebview, /__kpClaudeUseCanary/);
  assert.match(patchedWebview, /e\?\.canary===!0\?null:e/);
  assert.match(patchedWebview, /"kp-canary-"\+e\.adId\.slice\(-64\)/);
  assert.match(patchedWebview, /e\.format==="premium"/);
  assert.match(patchedWebview, /"data-kodpauza-ad":""/);
  assert.doesNotMatch(patchedWebview, /Спонсорское предложение/);
  assert.match(patchedWebview, /__kpClaudeSafeIcon/);
  assert.match(patchedWebview, /__kpClaudeSafeDomain/);
  assert.match(patchedWebview, /width:"14px"/);
  assert.match(patchedWebview, /width:"100%",maxWidth:"100%"/);
  assert.match(patchedWebview, /"data-kodpauza-format":"premium"/);
  assert.match(patchedWebview, /gridTemplateColumns:"22px minmax\(0,1fr\) auto"/);
  assert.match(patchedWebview, /borderLeft:"3px solid rgba\(245,158,11,.78\)"/);
  assert.match(patchedWebview, /background:"rgba\(245,158,11,.09\)"/);
  assert.match(patchedWebview, /children:"↗"/);
  assert.match(patchedWebview, /e\.advertiserName/);
  assert.match(patchedWebview, /e\.domain/);
  assert.match(patchedWebview, /Реклама ·/);
  assert.match(patchedWebview, /Рекламодатель:/);
  assert.doesNotMatch(patchedWebview, /Премиум|Спонсорское предложение/);
  assert.doesNotMatch(patchedWebview, /linear-gradient/);
  assert.doesNotMatch(patchedWebview, /https\?:\/\//);
  assert.doesNotThrow(() => new vm.Script(patchedWebview));

  const repeated = await installer.ensureInstalled();
  assert.equal(repeated.changed, false);
  assert.equal(repeated.token, installed.token);

  const restored = await installer.restore();
  assert.equal(restored.changed, true);
  assert.equal(
    await fs.readFile(path.join(value.extensionPath, 'extension.js'), 'utf8'),
    hostSource,
  );
  assert.equal(
    await fs.readFile(path.join(value.extensionPath, 'webview', 'index.js'), 'utf8'),
    value.webviewSource,
  );
});

test('UI-патч Claude принимает только безопасные inline-иконки', () => {
  const token = 'e'.repeat(64);
  const patched = patchClaudeWebviewSource(fixtureWebview(), token, profile);
  const runtime = patched.slice(
    patched.indexOf('/*__KODPAUZA_CLAUDE_UI_START__'),
    patched.indexOf('function oQe'),
  );
  const safeSvg = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16"/></svg>',
  )}`;
  const remoteIcon = 'https://tracker.example/icon.png';
  const unsafeSvg = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://tracker.example/pixel"/></svg>',
  )}`;
  const result = vm.runInNewContext(
    `${runtime};[__kpClaudeSafeIcon(${JSON.stringify(safeSvg)}),__kpClaudeSafeIcon(${JSON.stringify(remoteIcon)}),__kpClaudeSafeIcon(${JSON.stringify(unsafeSvg)})]`,
  );
  assert.equal(result[0], safeSvg);
  assert.equal(result[1], null);
  assert.equal(result[2], null);
});

test('premium Claude отображается отдельной компактной бренд-карточкой', () => {
  const { rendered, requests } = renderPatchedAd({
    active: true,
    adId: 'premium-ad',
    format: 'premium',
    advertiserName: 'Acme Cloud',
    domain: 'acme.example',
    text: 'Реклама · Acme Cloud · Серверы для быстрого старта',
    iconUrl: null,
  });

  assert.equal(rendered['data-kodpauza-ad'], '');
  assert.equal(rendered['data-kodpauza-format'], 'premium');
  assert.equal(rendered.role, 'link');
  assert.equal(rendered.tabIndex, 0);
  assert.equal(typeof rendered.onClick, 'function');
  assert.equal(typeof rendered.onKeyDown, 'function');
  assert.equal(rendered.style.display, 'grid');
  assert.equal(rendered.style.gridTemplateColumns, '22px minmax(0,1fr) auto');
  assert.equal(rendered.style.maxWidth, '100%');
  assert.equal(rendered.style.minWidth, 0);
  assert.equal(rendered.style.background, 'rgba(245,158,11,.09)');
  assert.equal(rendered.style.borderLeft, '3px solid rgba(245,158,11,.78)');
  assert.equal(rendered.style.borderRadius, '7px');

  const [brand, copy, arrow] = rendered.children;
  assert.equal(brand.style.width, '22px');
  assert.equal(brand.style.height, '22px');
  assert.equal(brand.children[1].children, 'A');
  assert.equal(copy.style.minWidth, 0);
  assert.equal(copy.children[0].children[0].children, 'Реклама · Acme Cloud');
  assert.equal(copy.children[0].children[1].children, 'acme.example');
  assert.equal(copy.children[1].children, 'Серверы для быстрого старта');
  assert.equal(arrow.children, '↗');
  assert.equal(arrow['aria-hidden'], 'true');

  let prevented = false;
  let stopped = false;
  rendered.onKeyDown({
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
  assert.equal(requests.length, 1);
  assert.match(requests[0][0], /\/click\?token=/);
  assert.equal(requests[0][1].body, 'premium-ad');
});

test('standard Claude сохраняет прежний однострочный формат, а небезопасный domain скрывается', () => {
  const { rendered } = renderPatchedAd({
    active: true,
    adId: 'standard-ad',
    format: 'standard',
    advertiserName: 'Acme',
    domain: 'bad..example',
    text: 'Реклама · Acme · Обычное объявление',
    iconUrl: 'https://tracker.example/icon.png',
  });

  assert.equal(rendered['data-kodpauza-format'], undefined);
  assert.equal(rendered.style.display, 'inline-flex');
  assert.equal(rendered.style.gap, '6px');
  assert.equal(rendered.style.border, undefined);
  assert.equal(rendered.children[0].style.width, '14px');
  assert.equal(rendered.children[0].children[1].children, 'A');
  assert.equal(rendered.children[1].children, 'Реклама · Acme · Обычное объявление');
  assert.doesNotMatch(rendered.title, /bad\.\.example/);
});

test('профиль Claude Code 2.1.212 патчит новый CSP-якорь и полностью откатывается', async (context) => {
  const value = await fixture(context, {
    hostSource: hostSource212,
    profile: CLAUDE_2_1_212_PROFILE,
  });
  const installer = new ClaudePatchInstaller(
    value.extensionPath,
    'test-version',
    value.home,
    value.build,
  );

  const installed = await installer.install();
  assert.equal(installed.compatibilityMode, 'exact');
  assert.match(
    await fs.readFile(path.join(value.extensionPath, 'extension.js'), 'utf8'),
    /\$\{h\}; connect-src http:\/\/127\.0\.0\.1:37491;/,
  );
  assert.match(
    await fs.readFile(path.join(value.extensionPath, 'webview', 'index.js'), 'utf8'),
    /__KODPAUZA_CLAUDE_UI_START__/,
  );

  const restored = await installer.restore();
  assert.equal(restored.changed, true);
  assert.equal(
    await fs.readFile(path.join(value.extensionPath, 'extension.js'), 'utf8'),
    value.hostSource,
  );
  assert.equal(
    await fs.readFile(path.join(value.extensionPath, 'webview', 'index.js'), 'utf8'),
    value.webviewSource,
  );
});

test('профиль Claude Code 2.1.214 сохраняет проверенную структуру 2.1.212', () => {
  const token = 'f'.repeat(64);
  const patchedHost = patchClaudeHostSource(hostSource212, CLAUDE_2_1_214_PROFILE);
  const patchedWebview = patchClaudeWebviewSource(fixtureWebview(), token, CLAUDE_2_1_214_PROFILE);

  assert.match(patchedHost, /\$\{h\}; connect-src http:\/\/127\.0\.0\.1:37491;/);
  assert.match(patchedWebview, /__KODPAUZA_CLAUDE_UI_START__/);
  assert.doesNotThrow(() => new vm.Script(patchedWebview));
});

test('профиль Claude Code 2.1.238 патчит новый accessibility spinner и CSP', () => {
  const token = '1'.repeat(64);
  const host =
    'prefix;<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ${p}; ${f}; ${h}; script-src \'nonce-${u}\'; ${g};">;suffix';
  const webview = `prefix;${CLAUDE_2_1_238_PROFILE.structuralSpinnerAnchor};suffix`;
  const patchedHost = patchClaudeHostSource(host, CLAUDE_2_1_238_PROFILE);
  const patchedWebview = patchClaudeWebviewSource(webview, token, CLAUDE_2_1_238_PROFILE);

  assert.match(patchedHost, /\$\{g\}; connect-src http:\/\/127\.0\.0\.1:37491;/);
  assert.match(patchedWebview, /__KODPAUZA_CLAUDE_UI_START__/);
  assert.match(
    patchedWebview,
    /"aria-hidden":"true",className:OG\.text,children:__kpClaudeAd&&i!=="compacting"/,
  );
  assert.match(
    patchedWebview,
    /className:H6\.visuallyHidden,children:i==="compacting"\?"Compacting conversation":"Claude is working"/,
  );
  assert.doesNotThrow(() => new vm.Script(patchedWebview));
});

test('профиль Claude Code 2.1.238 fail-closed при изменении accessibility spinner', () => {
  const changed = CLAUDE_2_1_238_PROFILE.structuralSpinnerAnchor.replace(
    '"aria-hidden":"true",className:OG.text',
    'className:OG.text',
  );

  assert.throws(
    () => patchClaudeWebviewSource(changed, '2'.repeat(64), CLAUDE_2_1_238_PROFILE),
    /активный spinner Claude Code/,
  );
});

test('профиль Claude Code 2.1.239 патчит переименованный accessibility spinner и CSP', () => {
  const token = '3'.repeat(64);
  const host =
    'prefix;<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ${p}; ${f}; ${h}; script-src \'nonce-${u}\'; ${g};">;suffix';
  const webview = `prefix;${CLAUDE_2_1_239_PROFILE.structuralSpinnerAnchor};suffix`;
  const patchedHost = patchClaudeHostSource(host, CLAUDE_2_1_239_PROFILE);
  const patchedWebview = patchClaudeWebviewSource(webview, token, CLAUDE_2_1_239_PROFILE);

  assert.match(patchedHost, /\$\{g\}; connect-src http:\/\/127\.0\.0\.1:37491;/);
  assert.match(patchedWebview, /__KODPAUZA_CLAUDE_UI_START__/);
  assert.match(
    patchedWebview,
    /"aria-hidden":"true",className:BG\.text,children:__kpClaudeAd&&i!=="compacting"/,
  );
  assert.match(
    patchedWebview,
    /className:H6\.visuallyHidden,children:i==="compacting"\?"Compacting conversation":"Claude is working"/,
  );
  assert.doesNotThrow(() => new vm.Script(patchedWebview));
});

test('профиль Claude Code 2.1.239 fail-closed при изменении accessibility spinner', () => {
  const changed = CLAUDE_2_1_239_PROFILE.structuralSpinnerAnchor.replace(
    '"aria-hidden":"true",className:BG.text',
    'className:BG.text',
  );

  assert.throws(
    () => patchClaudeWebviewSource(changed, '4'.repeat(64), CLAUDE_2_1_239_PROFILE),
    /активный spinner Claude Code/,
  );
});

test('профиль Claude Code 2.1.241 патчит переименованный accessibility spinner и CSP', () => {
  const token = '5'.repeat(64);
  const host =
    'prefix;<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ${p}; ${f}; ${h}; script-src \'nonce-${u}\'; ${g};">;suffix';
  const webview = `prefix;${CLAUDE_2_1_241_PROFILE.structuralSpinnerAnchor};suffix`;
  const patchedHost = patchClaudeHostSource(host, CLAUDE_2_1_241_PROFILE);
  const patchedWebview = patchClaudeWebviewSource(webview, token, CLAUDE_2_1_241_PROFILE);

  assert.match(patchedHost, /\$\{g\}; connect-src http:\/\/127\.0\.0\.1:37491;/);
  assert.match(patchedWebview, /__KODPAUZA_CLAUDE_UI_START__/);
  assert.match(
    patchedWebview,
    /"aria-hidden":"true",className:lZ\.text,children:__kpClaudeAd&&i!=="compacting"/,
  );
  assert.match(
    patchedWebview,
    /className:q6\.visuallyHidden,children:i==="compacting"\?"Compacting conversation":"Claude is working"/,
  );
  assert.doesNotThrow(() => new vm.Script(patchedWebview));
});

test('профиль Claude Code 2.1.241 fail-closed при изменении accessibility spinner', () => {
  const changed = CLAUDE_2_1_241_PROFILE.structuralSpinnerAnchor.replace(
    '"aria-hidden":"true",className:lZ.text',
    'className:lZ.text',
  );

  assert.throws(
    () => patchClaudeWebviewSource(changed, '6'.repeat(64), CLAUDE_2_1_241_PROFILE),
    /активный spinner Claude Code/,
  );
});

test('профиль Claude Code 2.1.245 патчит переименованный accessibility spinner и CSP', () => {
  const token = '7'.repeat(64);
  const host =
    'prefix;<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ${B}; ${N}; ${q}; script-src \'nonce-${U}\'; ${D};">;suffix';
  const webview = `prefix;${CLAUDE_2_1_245_PROFILE.structuralSpinnerAnchor};suffix`;
  const patchedHost = patchClaudeHostSource(host, CLAUDE_2_1_245_PROFILE);
  const patchedWebview = patchClaudeWebviewSource(webview, token, CLAUDE_2_1_245_PROFILE);

  assert.match(patchedHost, /\$\{D\}; connect-src http:\/\/127\.0\.0\.1:37491;/);
  assert.match(patchedWebview, /__KODPAUZA_CLAUDE_UI_START__/);
  assert.match(
    patchedWebview,
    /"aria-hidden":"true",className:Hi\.text,children:__kpClaudeAd&&Y!=="compacting"/,
  );
  assert.match(
    patchedWebview,
    /className:lO\.visuallyHidden,children:Y==="compacting"\?"Compacting conversation":"Claude is working"/,
  );
  assert.doesNotThrow(() => new vm.Script(patchedWebview));
});

test('профиль Claude Code 2.1.245 fail-closed при изменении accessibility spinner', () => {
  const changed = CLAUDE_2_1_245_PROFILE.structuralSpinnerAnchor.replace(
    '"aria-hidden":"true",className:Hi.text',
    'className:Hi.text',
  );

  assert.throws(
    () => patchClaudeWebviewSource(changed, '8'.repeat(64), CLAUDE_2_1_245_PROFILE),
    /активный spinner Claude Code/,
  );
});

test('профиль Claude Code 2.1.246 патчит переименованные accessibility spinner и CSP', () => {
  const token = '9'.repeat(64);
  const host =
    'prefix;<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ${B}; ${q}; ${N}; script-src \'nonce-${U}\'; ${O};">;suffix';
  const webview = `prefix;${CLAUDE_2_1_246_PROFILE.structuralSpinnerAnchor};suffix`;
  const patchedHost = patchClaudeHostSource(host, CLAUDE_2_1_246_PROFILE);
  const patchedWebview = patchClaudeWebviewSource(webview, token, CLAUDE_2_1_246_PROFILE);

  assert.match(patchedHost, /\$\{O\}; connect-src http:\/\/127\.0\.0\.1:37491;/);
  assert.match(patchedWebview, /__KODPAUZA_CLAUDE_UI_START__/);
  assert.match(
    patchedWebview,
    /"aria-hidden":"true",className:Wi\.text,children:__kpClaudeAd&&Y!=="compacting"/,
  );
  assert.match(
    patchedWebview,
    /className:dO\.visuallyHidden,children:Y==="compacting"\?"Compacting conversation":"Claude is working"/,
  );
  assert.doesNotThrow(() => new vm.Script(patchedWebview));
});

test('профиль Claude Code 2.1.246 fail-closed при изменении CSP', () => {
  const oldHost =
    'prefix;<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ${B}; ${N}; ${q}; script-src \'nonce-${U}\'; ${D};">;suffix';

  assert.throws(
    () => patchClaudeHostSource(oldHost, CLAUDE_2_1_246_PROFILE),
    /Content Security Policy Claude Code/,
  );
});

test('профиль Claude Code 2.1.247 патчит переименованные accessibility spinner и CSP', () => {
  const token = 'a'.repeat(64);
  const host =
    'prefix;<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ${H}; ${q}; ${N}; script-src \'nonce-${U}\'; ${O};">;suffix';
  const webview = `prefix;${CLAUDE_2_1_247_PROFILE.structuralSpinnerAnchor};suffix`;
  const patchedHost = patchClaudeHostSource(host, CLAUDE_2_1_247_PROFILE);
  const patchedWebview = patchClaudeWebviewSource(webview, token, CLAUDE_2_1_247_PROFILE);

  assert.match(patchedHost, /\$\{O\}; connect-src http:\/\/127\.0\.0\.1:37491;/);
  assert.match(patchedWebview, /__KODPAUZA_CLAUDE_UI_START__/);
  assert.match(
    patchedWebview,
    /"aria-hidden":"true",className:Wi\.text,children:__kpClaudeAd&&Y!=="compacting"/,
  );
  assert.match(
    patchedWebview,
    /className:dO\.visuallyHidden,children:Y==="compacting"\?"Compacting conversation":"Claude is working"/,
  );
  assert.doesNotThrow(() => new vm.Script(patchedWebview));
});

test('профиль Claude Code 2.1.247 fail-closed при старом spinner', () => {
  assert.throws(
    () =>
      patchClaudeWebviewSource(
        CLAUDE_2_1_246_PROFILE.structuralSpinnerAnchor,
        'b'.repeat(64),
        CLAUDE_2_1_247_PROFILE,
      ),
    /активный spinner Claude Code/,
  );
});

test('профиль Claude Code 2.1.250 патчит новые accessibility spinner и CSP', () => {
  const token = 'c'.repeat(64);
  const host =
    'prefix;<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ${H}; ${q}; ${N}; script-src \'nonce-${U}\'; ${O};">;suffix';
  const webview = `prefix;${CLAUDE_2_1_250_PROFILE.structuralSpinnerAnchor};suffix`;
  const patchedHost = patchClaudeHostSource(host, CLAUDE_2_1_250_PROFILE);
  const patchedWebview = patchClaudeWebviewSource(webview, token, CLAUDE_2_1_250_PROFILE);

  assert.match(patchedHost, /\$\{O\}; connect-src http:\/\/127\.0\.0\.1:37491;/);
  assert.match(patchedWebview, /__KODPAUZA_CLAUDE_UI_START__/);
  assert.match(
    patchedWebview,
    /"aria-hidden":"true",className:Fi\.text,children:__kpClaudeAd&&Y!=="compacting"/,
  );
  assert.match(
    patchedWebview,
    /className:dO\.visuallyHidden,children:Y==="compacting"\?"Compacting conversation":"Claude is working"/,
  );
  assert.doesNotThrow(() => new vm.Script(patchedWebview));
});

test('профиль Claude Code 2.1.250 fail-closed при старом spinner', () => {
  assert.throws(
    () =>
      patchClaudeWebviewSource(
        CLAUDE_2_1_247_PROFILE.structuralSpinnerAnchor,
        'd'.repeat(64),
        CLAUDE_2_1_250_PROFILE,
      ),
    /активный spinner Claude Code/,
  );
});

test('профиль Claude Code 2.1.251 патчит новые accessibility spinner и CSP', () => {
  const token = 'e'.repeat(64);
  const host =
    'prefix;<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ${B}; ${q}; ${N}; script-src \'nonce-${U}\'; ${O};">;suffix';
  const webview = `prefix;${CLAUDE_2_1_251_PROFILE.structuralSpinnerAnchor};suffix`;
  const patchedHost = patchClaudeHostSource(host, CLAUDE_2_1_251_PROFILE);
  const patchedWebview = patchClaudeWebviewSource(webview, token, CLAUDE_2_1_251_PROFILE);

  assert.match(patchedHost, /\$\{O\}; connect-src http:\/\/127\.0\.0\.1:37491;/);
  assert.match(patchedWebview, /__KODPAUZA_CLAUDE_UI_START__/);
  assert.match(
    patchedWebview,
    /"aria-hidden":"true",className:Fi\.text,children:__kpClaudeAd&&Y!=="compacting"/,
  );
  assert.match(
    patchedWebview,
    /className:aO\.visuallyHidden,children:Y==="compacting"\?"Compacting conversation":"Claude is working"/,
  );
  assert.doesNotThrow(() => new vm.Script(patchedWebview));
});

test('профиль Claude Code 2.1.251 fail-closed при старом spinner', () => {
  assert.throws(
    () =>
      patchClaudeWebviewSource(
        CLAUDE_2_1_250_PROFILE.structuralSpinnerAnchor,
        'f'.repeat(64),
        CLAUDE_2_1_251_PROFILE,
      ),
    /активный spinner Claude Code/,
  );
});

test('Claude UI-патч автоматически исправляет частичную установку', async (context) => {
  const value = await fixture(context);
  const installer = new ClaudePatchInstaller(
    value.extensionPath,
    'test-version',
    value.home,
    value.build,
  );
  const first = await installer.install();
  await fs.writeFile(path.join(value.extensionPath, 'extension.js'), hostSource);

  await assert.rejects(() => installer.inspect(), /применен частично/);
  const repaired = await installer.ensureInstalled();
  assert.equal(repaired.installed, true);
  assert.equal(repaired.changed, true);
  assert.notEqual(repaired.token, first.token);
});

test('Claude UI-патч автоматически обновляет старую ревизию', async (context) => {
  const value = await fixture(context);
  const installer = new ClaudePatchInstaller(
    value.extensionPath,
    'test-version',
    value.home,
    value.build,
  );
  const first = await installer.install();
  const manifestPath = path.join(value.home, 'claude-ui-patch.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.patchRevision = 8;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

  const updated = await installer.ensureInstalled();
  assert.equal(updated.installed, true);
  assert.equal(updated.changed, true);
  assert.notEqual(updated.token, first.token);
  assert.equal(JSON.parse(await fs.readFile(manifestPath, 'utf8')).patchRevision, 9);
});

test('Claude UI-патч принимает новую версию при неизменной структуре цели', async (context) => {
  const value = await fixture(context);
  const webviewPath = path.join(value.extensionPath, 'webview', 'index.js');
  await fs.appendFile(webviewPath, 'modified');
  const installer = new ClaudePatchInstaller(value.extensionPath, 'future-version', value.home);

  const installed = await installer.install();
  assert.equal(installed.installed, true);
  assert.equal(installed.compatibilityMode, 'structural');
  assert.match(await fs.readFile(webviewPath, 'utf8'), /__KODPAUZA_CLAUDE_UI_START__/);
});

test('Claude UI-патч выводит high-confidence профиль из переименованной неизвестной сборки', async (context) => {
  const value = await fixture(context, {
    hostSource: renamedHostSource,
    webviewSource: renamedFixtureWebview(),
  });
  const installer = new ClaudePatchInstaller(
    value.extensionPath,
    'future-renamed-version',
    value.home,
  );

  const installed = await installer.install();
  assert.equal(installed.installed, true);
  assert.equal(installed.compatibilityMode, 'structural');
  const patchedHost = await fs.readFile(path.join(value.extensionPath, 'extension.js'), 'utf8');
  const patchedWebview = await fs.readFile(
    path.join(value.extensionPath, 'webview', 'index.js'),
    'utf8',
  );
  assert.match(patchedHost, /\$\{ee\}; connect-src http:\/\/127\.0\.0\.1:37491;/);
  assert.match(patchedWebview, /let __kpClaudeAd=__kpClaudeUseAd\(\),A=mx/);
  assert.match(patchedWebview, /__kpClaudeAd&&x!=="compacting"/);
  assert.match(patchedWebview, /let\[e,t\]=st\(null\)/);
  assert.match(patchedWebview, /function __kpClaudeUseActivity\(\)\{ef\(/);
  assert.doesNotThrow(() => new vm.Script(patchedWebview));

  const restored = await installer.restore();
  assert.equal(restored.changed, true);
  assert.equal(
    await fs.readFile(path.join(value.extensionPath, 'extension.js'), 'utf8'),
    renamedHostSource,
  );
  assert.equal(
    await fs.readFile(path.join(value.extensionPath, 'webview', 'index.js'), 'utf8'),
    renamedFixtureWebview(),
  );
});

test('Claude UI-патч fail-closed отклоняет неоднозначный структурный spinner', async (context) => {
  const duplicated = renamedFixtureWebview().replace(
    'var post=1;',
    `${renamedFixtureWebview().replace('var pre=1;', '').replace('var post=1;', '')}var post=1;`,
  );
  const value = await fixture(context, {
    hostSource: renamedHostSource,
    webviewSource: duplicated,
  });
  const installer = new ClaudePatchInstaller(
    value.extensionPath,
    'future-ambiguous-version',
    value.home,
  );

  const status = await installer.inspect();
  assert.equal(status.compatible, false);
  assert.equal(status.compatibilityMode, 'unsupported');
  await assert.rejects(() => installer.install(), /не поддерживается|безопасно отключена/);
  assert.equal(
    await fs.readFile(path.join(value.extensionPath, 'extension.js'), 'utf8'),
    renamedHostSource,
  );
  assert.equal(
    await fs.readFile(path.join(value.extensionPath, 'webview', 'index.js'), 'utf8'),
    duplicated,
  );
});

test('Claude UI-патч fail-closed требует все независимые структурные якоря', async (context) => {
  const mutations = [
    (source) => source.replace('},120)', '},121)'),
    (source) => source.replace('[2000,3000,5000]', '[2000,3000,4000]'),
    (source) => source.replace('"data-permission-mode":w', '"data-mode":w'),
    (source) => source.replace('cur+"...",B+3', 'cur+"..",B+2'),
  ];

  for (const [index, mutate] of mutations.entries()) {
    const changed = mutate(renamedFixtureWebview());
    const value = await fixture(context, {
      hostSource: renamedHostSource,
      webviewSource: changed,
    });
    const installer = new ClaudePatchInstaller(
      value.extensionPath,
      `future-missing-anchor-${index}`,
      value.home,
    );
    const status = await installer.inspect();
    assert.equal(status.compatible, false, `mutation ${index} must fail closed`);
    assert.equal(status.compatibilityMode, 'unsupported');
    assert.equal(
      await fs.readFile(path.join(value.extensionPath, 'extension.js'), 'utf8'),
      renamedHostSource,
    );
    assert.equal(
      await fs.readFile(path.join(value.extensionPath, 'webview', 'index.js'), 'utf8'),
      changed,
    );
  }
});

test('Claude UI-патч fail-closed отклоняет измененный spinner', async (context) => {
  const value = await fixture(context);
  const webviewPath = path.join(value.extensionPath, 'webview', 'index.js');
  const changed = value.webviewSource.replace('i==="compacting"', 'i==="compressing"');
  await fs.writeFile(webviewPath, changed);
  const installer = new ClaudePatchInstaller(value.extensionPath, 'future-version', value.home);

  const status = await installer.inspect();
  assert.equal(status.compatible, false);
  assert.equal(status.compatibilityMode, 'unsupported');
  await assert.rejects(() => installer.install(), /не поддерживается|безопасно отключена/);
  assert.equal(
    await fs.readFile(path.join(value.extensionPath, 'extension.js'), 'utf8'),
    hostSource,
  );
  assert.equal(await fs.readFile(webviewPath, 'utf8'), changed);
});

test('Claude UI-патч fail-closed отклоняет неизвестный или неоднозначный CSP-якорь', async (context) => {
  const unsupportedHost = hostSource.replace('; ${v};">', '; worker-src ${w}; ${x};">');
  const unknown = await fixture(context, { hostSource: unsupportedHost });
  const installer = new ClaudePatchInstaller(unknown.extensionPath, 'future-version', unknown.home);

  const status = await installer.inspect();
  assert.equal(status.compatible, false);
  assert.equal(status.compatibilityMode, 'unsupported');
  await assert.rejects(() => installer.install(), /не поддерживается|безопасно отключена/);

  const ambiguous = await fixture(context, {
    hostSource: `${renamedHostSource}${renamedHostSource}`,
  });
  const ambiguousInstaller = new ClaudePatchInstaller(
    ambiguous.extensionPath,
    'future-ambiguous-csp',
    ambiguous.home,
  );
  const ambiguousStatus = await ambiguousInstaller.inspect();
  assert.equal(ambiguousStatus.compatible, false);
  assert.equal(ambiguousStatus.compatibilityMode, 'unsupported');

  assert.throws(
    () => patchClaudeHostSource(`${hostSource212}${hostSource212}`, CLAUDE_2_1_212_PROFILE),
    /2 вместо 1/,
  );
});

test('чистые функции Claude-патча отклоняют повторное применение', () => {
  const token = 'b'.repeat(64);
  const patchedHost = patchClaudeHostSource(hostSource, profile);
  const patchedWebview = patchClaudeWebviewSource(fixtureWebview(), token, profile);
  assert.throws(() => patchClaudeHostSource(patchedHost, profile), /уже присутствует/);
  assert.throws(() => patchClaudeWebviewSource(patchedWebview, token, profile), /уже присутствует/);
});
