// Mandatory authentication gateway for both npm run dev and npm start.
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { createAuth, loginHtml } from './auth.mjs';
import { projectRoot, verifyBuild, filesIn } from './production-build.mjs';

process.chdir(projectRoot);
const dev = process.argv.includes('--dev');
if (dev && existsSync('.env.local')) process.loadEnvFile('.env.local');
const buildInfo = dev ? null : verifyBuild();
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const auth = createAuth({ username: process.env.AUTH_USERNAME, passwordHash: process.env.AUTH_PASSWORD_HASH });
let publicOrigin;
if (!dev) {
  const origin = new URL(process.env.APP_ORIGIN || 'invalid');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.origin !== process.env.APP_ORIGIN) throw new Error('APP_ORIGIN must be an exact HTTPS origin without a trailing slash');
  publicOrigin = origin.origin;
}
const cookieName = dev ? 'uas_session' : '__Host-uas_session';
const cookie = (token, age = 28800) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${dev ? '' : '; Secure'}`;
const tokenFor = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
const allowedOrigin = req => dev
  ? [`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)
  : req.headers.origin === publicOrigin;

// Serve only files in the verified build, after authentication. Also avoids
// Vinext 0.0.50's Windows static cache using backslashes as URL keys.
const staticFiles = new Map(dev ? [] : filesIn(projectRoot, ['dist/client'])
  .filter(name => !name.includes('/.') && !name.endsWith('.html') && !name.endsWith('.map'))
  .map(name => [name.slice('dist/client'.length), resolve(projectRoot, name)]));
const contentTypes = { '.js': 'text/javascript', '.css': 'text/css', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };

const reservation = net.createServer();
await new Promise(r => reservation.listen(0, '127.0.0.1', r));
const internalPort = reservation.address().port;
await new Promise(r => reservation.close(r));
const child = spawn(process.execPath, [resolve('node_modules/vinext/dist/cli.js'), dev ? 'dev' : 'start', '-p', String(internalPort), '-H', '127.0.0.1'], {
  cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  env: { ...process.env, PORT: String(internalPort), ...(!dev ? { UAS_BUILD_TARGET: 'node', NODE_ENV: 'production' } : {}) },
});
// Internal server is loopback-only: never expose it directly in hosting.
child.stdout.on('data', chunk => process.stdout.write(chunk.toString().replaceAll(`http://127.0.0.1:${internalPort}`, `http://localhost:${port}`)));
child.stderr.pipe(process.stderr);
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (buildInfo) res.setHeader('X-App-Build', buildInfo.sourceHash.slice(0, 12));
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (path === '/healthz' && req.method === 'GET') {
    const probe = http.get({ hostname: '127.0.0.1', port: internalPort, path: '/', timeout: 3000 }, upstream => {
      let html = '';
      upstream.on('data', chunk => { html += chunk; });
      upstream.on('end', () => {
        const ready = upstream.statusCode === 200 && html.includes('DRIVER INSIDERS') && html.includes('Race Analysis');
        res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: ready ? 'ready' : 'starting', build: buildInfo?.sourceHash.slice(0, 12) || 'development', commit: buildInfo?.commit || null }));
      });
    });
    probe.on('timeout', () => probe.destroy());
    probe.on('error', () => { if (!res.writableEnded) { res.writeHead(503); res.end('{"status":"unavailable"}'); } });
    return;
  }
  const html = (status, error = '') => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    res.end(loginHtml(error));
  };
  if (path === '/auth/login' && req.method === 'POST') {
    if (!allowedOrigin(req)) { res.writeHead(403); res.end('Invalid origin'); return; }
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 4096) { res.writeHead(413); res.end('Request too large'); return; }
      }
      const form = new URLSearchParams(body);
      const password = form.get('password') || '';
      if (password.length > 256) { html(401, 'Invalid username or password.'); return; }
      const result = auth.login(form.get('username') || '', password);
      if (result.status !== 200) {
        if (result.status === 429) res.setHeader('Retry-After', '900');
        html(result.status, result.status === 429 ? 'Too many attempts. Try again in 15 minutes.' : 'Invalid username or password.');
        return;
      }
      auth.logout(tokenFor(req));
      res.writeHead(303, { 'Set-Cookie': cookie(result.token), Location: '/' }); res.end(); return;
    } catch { res.writeHead(400); res.end('Invalid request'); return; }
  }
  if (path === '/auth/logout' && req.method === 'POST') {
    if (!allowedOrigin(req)) { res.writeHead(403); res.end(); return; }
    auth.logout(tokenFor(req));
    res.writeHead(303, { 'Set-Cookie': cookie('', 0), Location: '/login' }); res.end(); return;
  }
  if (!auth.valid(tokenFor(req))) {
    if (req.method === 'GET' && (path === '/' || path === '/login')) html(200);
    else if (req.headers.accept?.includes('text/html')) { res.writeHead(303, { Location: '/login' }); res.end(); }
    else { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"error":"Sign in required"}'); }
    return;
  }
  if (path === '/login') { res.writeHead(303, { Location: '/' }); res.end(); return; }
  if (!dev && staticFiles.has(path) && ['GET', 'HEAD'].includes(req.method)) {
    const file = staticFiles.get(path);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).on('error', () => res.destroy()).pipe(res);
    return;
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: internalPort, path: req.url, method: req.method, headers: req.headers }, response => {
    res.writeHead(response.statusCode, { ...response.headers, 'cache-control': 'no-store', 'x-frame-options': 'DENY' });
    response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end('Application starting. Refresh shortly.'); });
  req.pipe(upstream);
});
server.on('upgrade', (req, socket, head) => {
  if (!auth.valid(tokenFor(req)) || !allowedOrigin(req)) { socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
  const upstream = net.connect(internalPort, '127.0.0.1', () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${req.rawHeaders.reduce((s, v, i) => s + v + (i % 2 ? '\r\n' : ': '), '')}\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
});
server.on('error', error => { console.error(error.message); child.kill(); process.exit(1); });
server.listen(port, dev ? '127.0.0.1' : '0.0.0.0', () => console.log(`Driver Performance ${dev ? 'development' : `production build ${buildInfo.sourceHash.slice(0, 12)}`} · ${publicOrigin || `http://localhost:${port}`} · root: ${projectRoot}`));
child.on('error', error => { console.error(error.message); server.close(); process.exit(1); });
child.on('exit', code => { server.close(); process.exit(code || 1); });
if (process.env.UAS_TEST_LIFECYCLE === '1') { process.stdin.resume(); process.stdin.on('end', () => { child.kill(); server.close(); process.exit(0); }); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(); server.close(); process.exit(0); });
