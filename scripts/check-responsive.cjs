const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kodpauza-ui-'));
const outputDir = path.join(os.tmpdir(), 'kodpauza-ui-screens');
fs.mkdirSync(outputDir, { recursive: true });
const authTokens = new Map();
const webBaseUrl = (process.env.KODPAUZA_UI_BASE_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);
const apiBaseUrl = (process.env.KODPAUZA_API_BASE_URL ?? 'http://localhost:4000').replace(
  /\/+$/,
  '',
);
const webOrigin = new URL(webBaseUrl).origin;

const scenarios = [
  { name: 'home-desktop', path: '/', width: 1440, height: 1000 },
  { name: 'install-desktop', path: '/install', width: 1440, height: 1000 },
  { name: 'home-mobile', path: '/', width: 375, height: 812 },
  { name: 'install-mobile', path: '/install', width: 375, height: 812 },
  {
    name: 'developer-desktop',
    path: '/developer',
    width: 1440,
    height: 1000,
    email: 'dev@kodpauza.local',
    password: 'dev123456',
  },
  {
    name: 'developer-mobile',
    path: '/developer',
    width: 375,
    height: 812,
    email: 'dev@kodpauza.local',
    password: 'dev123456',
  },
  {
    name: 'developer-events-desktop',
    path: '/developer/events',
    width: 1440,
    height: 1000,
    email: 'dev@kodpauza.local',
    password: 'dev123456',
  },
  {
    name: 'developer-payouts-desktop',
    path: '/developer/payouts',
    width: 1440,
    height: 1000,
    email: 'dev@kodpauza.local',
    password: 'dev123456',
  },
  {
    name: 'developer-integration-desktop',
    path: '/developer/integration',
    width: 1440,
    height: 1000,
    email: 'dev@kodpauza.local',
    password: 'dev123456',
  },
  {
    name: 'advertiser-desktop',
    path: '/advertiser',
    width: 1440,
    height: 1000,
    email: 'adv@kodpauza.local',
    password: 'adv123456',
  },
  {
    name: 'advertiser-mobile',
    path: '/advertiser',
    width: 375,
    height: 812,
    email: 'adv@kodpauza.local',
    password: 'adv123456',
  },
  {
    name: 'advertiser-campaigns-desktop',
    path: '/advertiser/campaigns',
    width: 1440,
    height: 1000,
    email: 'adv@kodpauza.local',
    password: 'adv123456',
  },
  {
    name: 'advertiser-new-desktop',
    path: '/advertiser/new',
    width: 1440,
    height: 1000,
    email: 'adv@kodpauza.local',
    password: 'adv123456',
  },
  {
    name: 'advertiser-billing-desktop',
    path: '/advertiser/billing',
    width: 1440,
    height: 1000,
    email: 'adv@kodpauza.local',
    password: 'adv123456',
  },
  {
    name: 'admin-desktop',
    path: '/admin',
    width: 1440,
    height: 1000,
    email: 'admin@kodpauza.local',
    password: 'admin123456',
  },
  {
    name: 'admin-mobile',
    path: '/admin',
    width: 375,
    height: 812,
    email: 'admin@kodpauza.local',
    password: 'admin123456',
  },
  {
    name: 'admin-campaigns-desktop',
    path: '/admin/campaigns',
    width: 1440,
    height: 1000,
    email: 'admin@kodpauza.local',
    password: 'admin123456',
  },
  {
    name: 'admin-users-desktop',
    path: '/admin/users',
    width: 1440,
    height: 1000,
    email: 'admin@kodpauza.local',
    password: 'admin123456',
  },
  {
    name: 'admin-finance-desktop',
    path: '/admin/finance',
    width: 1440,
    height: 1000,
    email: 'admin@kodpauza.local',
    password: 'admin123456',
  },
  {
    name: 'admin-security-desktop',
    path: '/admin/security',
    width: 1440,
    height: 1000,
    email: 'admin@kodpauza.local',
    password: 'admin123456',
  },
  {
    name: 'auth-register-redirect',
    path: '/register',
    expectedPath: '/developer',
    width: 1440,
    height: 1000,
    email: 'dev@kodpauza.local',
    password: 'dev123456',
  },
];

function requestJson(requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path: requestPath, method },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(
              new Error(`Chrome returned invalid JSON for ${requestPath}: ${body.slice(0, 200)}`),
            );
          }
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

function requestText(requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path: requestPath, method },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve(body));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await requestJson('/json/version');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Chrome DevTools endpoint did not start.');
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
    this.errors = [];
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result ?? {});
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params?.exceptionDetails?.text ?? 'Runtime exception');
      }
      if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
        this.errors.push(message.params.entry.text);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
        this.errors.push(
          message.params.args?.map((item) => item.value ?? item.description).join(' ') ??
            'console.error',
        );
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function loginToken(email, password) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${apiBaseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (response.status === 429 && attempt === 0) {
      const retryAfter = Math.max(1, Number(response.headers.get('retry-after') ?? 1));
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 + 250));
      continue;
    }
    const data = await response.json();
    if (!response.ok || !data.token)
      throw new Error(data.error || `Could not authenticate ${email}`);
    return data.token;
  }
  throw new Error(`Could not authenticate ${email}`);
}

async function prepareTokens() {
  const credentials = new Map();
  for (const scenario of scenarios) {
    if (scenario.email) credentials.set(scenario.email, scenario.password);
  }
  for (const [email, password] of credentials) {
    authTokens.set(email, await loginToken(email, password));
  }
}

async function waitForReady(client, expectedPath) {
  let state = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    state = await evaluate(
      client,
      `({ href: location.href, path: location.pathname, ready: document.readyState, hasMain: Boolean(document.querySelector('main')) })`,
    );
    if (state.path === expectedPath && state.ready === 'complete' && state.hasMain) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Page ${expectedPath} did not become ready: ${JSON.stringify(state)}`);
}

async function runScenario(scenario) {
  const target = await requestJson(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Page.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: scenario.width,
    height: scenario.height,
    deviceScaleFactor: 1,
    mobile: scenario.width < 768,
  });

  const token = scenario.email ? authTokens.get(scenario.email) : null;
  if (scenario.email && !token) throw new Error(`Missing token for ${scenario.email}`);
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try {
      if (location.origin === ${JSON.stringify(webOrigin)}) {
        ${
          token
            ? `localStorage.setItem('kodpauza_token', ${JSON.stringify(token)});`
            : "localStorage.removeItem('kodpauza_token');"
        }
      }
    } catch {}`,
  });

  await client.send('Page.navigate', { url: `${webBaseUrl}${scenario.path}` });
  await waitForReady(client, scenario.expectedPath ?? scenario.path);
  await new Promise((resolve) => setTimeout(resolve, scenario.email ? 1600 : 500));

  const report = await evaluate(
    client,
    `(() => {
    const elements = [...document.querySelectorAll('body *')];
    const overflow = elements
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1))
      .slice(0, 8)
      .map(({ element, rect }) => ({
        tag: element.tagName.toLowerCase(),
        className: String(element.className || '').slice(0, 100),
        text: String(element.textContent || '').trim().slice(0, 80),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      }));
    return {
      url: location.href,
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() || '',
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      registerLinks: document.querySelectorAll('a[href="/register"]').length,
      loginLinks: document.querySelectorAll('a[href="/login"]').length,
      downloadLinks: document.querySelectorAll('a[download][href$="kodpauza.vsix"]').length,
      overflow,
    };
  })()`,
  );

  const metrics = await client.send('Page.getLayoutMetrics');
  const width = Math.ceil(metrics.cssContentSize?.width ?? scenario.width);
  const height = Math.min(6000, Math.ceil(metrics.cssContentSize?.height ?? scenario.height));
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  const screenshotPath = path.join(outputDir, `${scenario.name}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  client.close();
  await requestText(`/json/close/${target.id}`);

  const relevantErrors = client.errors.filter((message) => !message.includes('favicon.ico'));
  return {
    name: scenario.name,
    expectedPath: scenario.expectedPath ?? scenario.path,
    screenshotPath,
    ...report,
    errors: relevantErrors,
  };
}

async function main() {
  if (!fs.existsSync(chromePath)) throw new Error(`Google Chrome not found at ${chromePath}`);
  await prepareTokens();
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  try {
    await waitForChrome();
    const reports = [];
    for (const scenario of scenarios) reports.push(await runScenario(scenario));
    console.log(JSON.stringify(reports, null, 2));

    const failures = reports.filter(
      (report) =>
        report.scrollWidth > report.clientWidth ||
        report.overflow.length > 0 ||
        report.errors.length > 0 ||
        !report.h1 ||
        new URL(report.url).pathname !== report.expectedPath ||
        (report.name.includes('desktop') &&
          /developer|advertiser|admin/.test(report.name) &&
          (report.registerLinks > 0 || report.loginLinks > 0)) ||
        (report.name.startsWith('install') && report.downloadLinks !== 1),
    );
    if (failures.length) {
      console.error(`UI audit failed for: ${failures.map((item) => item.name).join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
