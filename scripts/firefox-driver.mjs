import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { firefox } from '@playwright/test';

export const firefoxUrl = 'moz-extension://53423a26-924b-4dc4-aab1-e465830d9785/newtab.html';
export async function launchFirefox(profile) {
  profile ??= resolve('.browser-test', 'firefox-' + randomUUID());
  await mkdir(profile, { recursive: true });
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
  await writeFile(resolve(profile, 'user.js'), [
    'user_pref("marionette.port", ' + port + ');',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("extensions.webextensions.uuids", "{\\"speed-dial-x@pawelermakov.github.io\\":\\"53423a26-924b-4dc4-aab1-e465830d9785\\"}");',
  ].join('\n'));
  const logPath = resolve(profile, 'firefox.log');
  const log = openSync(logPath, 'w');
  let child;
  try {
    child = spawn(firefox.executablePath(), ['--headless', '--no-remote', '--profile', profile,
      '--marionette', '--remote-allow-system-access'], { windowsHide: true, stdio: ['ignore', log, log] });
  } finally { closeSync(log); }
  let launchError;
  child.once('error', error => { launchError = error; });
  let socket;
  for (let n = 0; n < 100; n++) {
    try {
      socket = await new Promise((resolve, reject) => {
        const client = net.createConnection(port, '127.0.0.1');
        client.once('connect', () => resolve(client));
        client.once('error', reject);
      });
      break;
    } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!socket) { child.kill(); throw new Error(`Firefox Marionette did not start. ${launchError?.message ?? ''} Log: ${logPath}`); }
  let buffer = Buffer.alloc(0), sequence = 0;
  const waiters = new Map();
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const colon = buffer.indexOf(58);
      if (colon < 0) break;
      const length = Number(buffer.subarray(0, colon).toString());
      if (buffer.length < colon + 1 + length) break;
      const packet = JSON.parse(buffer.subarray(colon + 1, colon + 1 + length).toString());
      buffer = buffer.subarray(colon + 1 + length);
      if (!Array.isArray(packet)) continue; // Protocol greeting.
      const waiter = waiters.get(packet[1]);
      if (!waiter) continue;
      clearTimeout(waiter.timer); waiters.delete(packet[1]);
      packet[2] ? waiter.reject(new Error(JSON.stringify(packet[2]))) : waiter.resolve(packet[3]?.value ?? packet[3]);
    }
  });
  function command(name, parameters = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { waiters.delete(id); reject(new Error('Marionette timeout: ' + name)); }, 35000);
      waiters.set(id, { resolve, reject, timer });
      const payload = JSON.stringify([0, id, name, parameters]);
      socket.write(Buffer.byteLength(payload) + ':' + payload);
    });
  }
  async function exec(body, ...args) {
    const result = await command('WebDriver:ExecuteAsyncScript', {
      script: 'const done = arguments[arguments.length - 1]; (async () => {' + body +
        '})().then(value => done({ value }), error => done({ error: String(error) }));',
      args, newSandbox: false,
    });
    if (result.error) throw new Error(result.error);
    return result.value;
  }
  async function until(body, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await exec(body)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Firefox condition failed: ' + body);
  }
  async function close() {
    try { await command('WebDriver:DeleteSession'); } catch { /* Already stopped. */ }
    socket.end();
    child.kill();
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  }
  try {
    await command('WebDriver:NewSession', {});
    // A session/visible browser window can exist even when Windows blocks all tab processes.
    // Check content access before installing the extension, so this is a launch failure.
    await command('WebDriver:GetCurrentURL');
    await command('WebDriver:SetTimeouts', { pageLoad: 15000, script: 30000, implicit: 0 });
    await command('Addon:Install', { path: resolve('.output/firefox-mv2'), temporary: true });
    return { command, exec, until, close, profile };
  } catch (error) {
    await close();
    const output = await readFile(logPath, 'utf8').catch(() => '');
    if (process.platform === 'win32' && /Failed to launch (?:tab|utility) subprocess.*SpawnTarget/.test(output)) {
      throw new Error(`Windows blocked Firefox child processes (SpawnTarget). Run browser tests from a regular terminal or outside the coding-agent sandbox; keep Firefox sandboxing enabled. Log: ${logPath}`, { cause: error });
    }
    throw new Error(`${error.message}\nFirefox log: ${logPath}`, { cause: error });
  }
}
