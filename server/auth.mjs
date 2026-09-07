import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
export function createAuth({ username, passwordHash, now = Date.now }) {
  if (!username || !passwordHash || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash)) {
    throw new Error('Configure AUTH_USERNAME and AUTH_PASSWORD_HASH in .env.local or server environment.');
  }
  const sessions = new Map();
  let failures = 0, windowEnd = 0;
  const digest = token => createHash('sha256').update(token).digest('hex');
  const prune = () => { for (const [key, expires] of sessions) if (expires <= now()) sessions.delete(key); };
  return {
    login(name, password) {
      prune();
      if (now() >= windowEnd) { failures = 0; windowEnd = now() + 15 * 60_000; }
      if (failures >= 10) return { status: 429 };
      const valid = verifyPassword(password, passwordHash);
      if (!valid || name !== username) { failures++; return { status: 401 }; }
      failures = 0;
      const token = randomBytes(32).toString('hex');
      sessions.set(digest(token), now() + 8 * 3600_000);
      return { status: 200, token };
    },
    valid(token = '') { prune(); return /^[a-f0-9]{64}$/.test(token) && sessions.has(digest(token)); },
    logout(token = '') { sessions.delete(digest(token)); },
  };
}

export function loginHtml(error = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in | UAS Driver Insider</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#e7eaee;color:#152640;font:15px system-ui}main{width:min(420px,92vw);padding:36px;background:#f6f7f9;border:1px solid #c5ced8;border-radius:10px;box-shadow:0 12px 40px #17264015}img{width:250px;max-width:100%;height:auto}h1{font-size:25px;margin:24px 0 8px}p{color:#526177}label{display:block;margin-top:20px;font-weight:600}input{display:block;width:100%;padding:12px;margin-top:7px;border:1px solid #aab6c4;border-radius:4px;font:inherit;background:white}button{width:100%;padding:13px;margin-top:25px;background:#152640;color:white;border:0;border-radius:4px;font:600 15px system-ui;cursor:pointer}.error{color:#ad1e38}small{display:block;margin-top:20px;color:#526177}
  </style></head><body><main><img src="/united-autosports-logo.jpg" alt="United Autosports"><h1>UAS Driver Insider</h1><p>Sign in to access race analysis.</p>${error ? `<p class="error" role="alert">${error}</p>` : ''}<form action="/auth/login" method="post"><label>Username<input name="username" autocomplete="username" required maxlength="100" autofocus></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button type="submit">Sign in</button></form><small>Private access · United Autosports</small></main></body></html>`;
}
