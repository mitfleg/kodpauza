const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const hookScript = path.resolve(__dirname, '../resources/codex-hook.cjs');

test('hook отбрасывает stdin и отправляет bridge только событие и cwd', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-hook-script-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  const bridges = path.join(root, 'bridges');
  await fs.mkdir(workspace, { recursive: true });
  await fs.mkdir(bridges, { recursive: true });
  const received = [];
  const token = 'a'.repeat(64);
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      received.push({ authorization: request.headers.authorization, body, url: request.url });
      response.writeHead(204);
      response.end();
    });
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await fs.writeFile(path.join(bridges, 'test.json'), JSON.stringify({
    version: 1,
    instanceId: 'test',
    port: address.port,
    token,
    workspaceRoots: [workspace],
    updatedAt: new Date().toISOString()
  }));

  const secretPrompt = 'СЕКРЕТНЫЙ ТЕКСТ ПРОМПТА';
  const start = await runHook('start', root, workspace, JSON.stringify({
    hook_event_name: 'UserPromptSubmit',
    prompt: secretPrompt
  }));
  assert.equal(start.stdout, '');
  assert.equal(start.code, 0);
  assert.equal(received.length, 1);
  assert.equal(received[0].url, '/v1/codex/lifecycle');
  assert.equal(received[0].authorization, `Bearer ${token}`);
  assert.equal(received[0].body.includes(secretPrompt), false);
  assert.deepEqual(JSON.parse(received[0].body), {
    version: 1,
    event: 'start',
    cwd: await fs.realpath(workspace)
  });

  const stop = await runHook('stop', root, workspace, JSON.stringify({
    hook_event_name: 'Stop',
    last_assistant_message: secretPrompt
  }));
  assert.equal(stop.stdout, '{}\n');
  assert.equal(stop.code, 0);
  assert.equal(received.length, 2);
  assert.equal(received[1].body.includes(secretPrompt), false);

  const claude = await runHook('start', root, workspace, JSON.stringify({
    hook_event_name: 'UserPromptSubmit',
    prompt: secretPrompt
  }), 'claude');
  assert.equal(claude.stdout, '');
  assert.equal(claude.code, 0);
  assert.equal(received.length, 3);
  assert.equal(received[2].url, '/v1/claude/lifecycle');
  assert.equal(received[2].body.includes(secretPrompt), false);
});

function runHook(event, home, cwd, stdin, tool = 'codex') {
  return new Promise((resolve, reject) => {
    const args = tool === 'claude' ? [hookScript, 'claude', event] : [hookScript, event];
    const child = childProcess.spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, KODPAUZA_HOME: home },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}
