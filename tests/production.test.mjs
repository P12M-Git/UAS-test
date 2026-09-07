import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { scryptSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

test('production gateway serves the current report, assets and private data', { timeout: 60000 }, async () => {
  const reservation = net.createServer();
  await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port;
  await new Promise(r => reservation.close(r));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const origin = 'https://production-test.example';
  const salt = 'b'.repeat(32), password = 'production-test-only';
  const child = spawn(process.execPath, ['server/start.mjs'], {
    cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, UAS_TEST_LIFECYCLE: '1', PORT: String(port), APP_ORIGIN: origin, AUTH_USERNAME: 'production-test',
      AUTH_PASSWORD_HASH: `${salt}:${scryptSync(password, salt, 64).toString('hex')}` },
  });
  let logs = '';
  child.stdout.on('data', c => { logs += c; });
  child.stderr.on('data', c => { logs += c; });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).status === 200; } catch {}
      if (ready) break;
      await new Promise(r => setTimeout(r, 250));
    }
    assert.ok(ready, logs);
    const health = await fetch(`${base}/healthz`);
    // Readiness can lag the gateway socket by a fraction of a second.
    if (health.status === 503) await new Promise(r => setTimeout(r, 1000));
    const status = await fetch(`${base}/healthz`);
    assert.equal(status.status, 200, logs);
    const info = await status.json();
    assert.equal(info.status, 'ready');
    assert.match(info.build, /^[a-f0-9]{12}$/);
    assert.equal((await fetch(`${base}/races/26ELMSR01_BARC.csv`)).status, 401);
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { Origin: origin },
      body: new URLSearchParams({ username: 'production-test', password }), redirect: 'manual' });
    assert.equal(login.status, 303, logs);
    assert.match(login.headers.get('set-cookie'), /HttpOnly.*Secure/);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    let response;
    for (let i = 0; i < 60; i++) {
      response = await fetch(base, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(3000) });
      if (response.status !== 503) break;
      await new Promise(r => setTimeout(r, 250));
    }
    assert.equal(response.status, 200, logs);
    assert.equal(response.headers.get('x-app-build'), info.build);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    assert.ok(!html.includes('UAS Driver Insider'));
    for (const label of ['DRIVER PERFORMANCE REPORT', 'Race Analysis', 'Overview', 'Driver Performance',
      'Lap Analysis', 'Traffic Performance', 'Season Summary', 'Category Benchmarks', 'Data / Session Info', 'SIGN OUT']) {
      assert.ok(html.includes(label), `Missing ${label}\n${logs}`);
    }
    const asset = html.match(/(?:src|href)="([^\"]+\.js[^\"]*)"/) || html.match(/import\s*["']([^"']+\.js)["']/);
    assert.ok(asset, 'No client JS in production HTML');
    assert.equal((await fetch(new URL(asset[1], base), { headers: { Cookie: cookie } })).status, 200, `Missing client asset ${asset[1]}`);
    for (const name of ['26ELMSR01_BARC', '26ELMSR02_RICA', '26ELMSR03_IMOL', '26ELMSR04_SPAF']) {
      const csv = await fetch(`${base}/races/${name}.csv`, { headers: { Cookie: cookie } });
      assert.equal(csv.status, 200, `CSV ${name}\n${logs}`);
      assert.match(await csv.text(), /LAP_NUMBER/);
    }
    assert.equal((await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Origin: origin, Cookie: cookie }, redirect: 'manual' })).status, 303);
    assert.equal((await fetch(`${base}/races/26ELMSR01_BARC.csv`, { headers: { Cookie: cookie } })).status, 401);
  } finally {
    // Gateway observes stdin EOF in this test so its child is stopped too.
    child.stdin.end();
    await Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(r, 2000))]);
    if (child.exitCode === null) child.kill();
  }
});
