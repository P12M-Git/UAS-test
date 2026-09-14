import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
export function createAuth({ username, passwordHash, usersJson, now = Date.now }) {
  const configError = () => new Error('Configure AUTH_USERS_JSON as a non-empty username-to-scrypt-hash object, or legacy AUTH_USERNAME and AUTH_PASSWORD_HASH.');
  let entries;
  if (usersJson !== undefined) {
    let parsed;
    try { parsed = JSON.parse(usersJson); } catch { throw configError(); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw configError();
    entries = Object.entries(parsed);
  } else entries = [[username, passwordHash]];
  if (!entries.length || entries.length > 100 || entries.some(([name, hash]) =>
    typeof name !== 'string' || !name.trim() || name !== name.trim() || name.length > 100 ||
    typeof hash !== 'string' || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash))) throw configError();
  const users = new Map(entries);
  const sessions = new Map();
  const attempts = new Map(); // Bounded by configured users plus one unknown-user bucket.
  const digest = token => createHash('sha256').update(token).digest('hex');
  const prune = () => { for (const [key, expires] of sessions) if (expires <= now()) sessions.delete(key); };
  return {
    login(name, password) {
      prune();
      const bucket = users.has(name) ? name : null;
      let attempt = attempts.get(bucket);
      if (!attempt || now() >= attempt.windowEnd) {
        attempt = { failures: 0, windowEnd: now() + 15 * 60_000 }; attempts.set(bucket, attempt);
      }
      if (attempt.failures >= 10) return { status: 429 };
      // Unknown usernames still incur the same password hashing cost.
      const valid = typeof password === 'string' && password.length <= 256 &&
        verifyPassword(password, users.get(name) || entries[0][1]);
      if (!valid || !users.has(name)) { attempt.failures++; return { status: 401 }; }
      attempt.failures = 0;
      const token = randomBytes(32).toString('hex');
      sessions.set(digest(token), now() + 8 * 3600_000);
      return { status: 200, token };
    },
    valid(token = '') { prune(); return /^[a-f0-9]{64}$/.test(token) && sessions.has(digest(token)); },
    logout(token = '') { sessions.delete(digest(token)); },
  };
}

export function loginHtml(error = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in | DRIVER INSIDERS - U.RAICE</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#e7eaee;color:#152640;font:15px system-ui}main{width:min(420px,92vw);padding:36px;background:#f6f7f9;border:1px solid #c5ced8;border-radius:10px;box-shadow:0 12px 40px #17264015}img{width:250px;max-width:100%;height:auto}h1{font-size:25px;margin:24px 0 8px}p{color:#526177}label{display:block;margin-top:20px;font-weight:600}input{display:block;width:100%;padding:12px;margin-top:7px;border:1px solid #aab6c4;border-radius:4px;font:inherit;background:white}button{width:100%;padding:13px;margin-top:25px;background:#152640;color:white;border:0;border-radius:4px;font:600 15px system-ui;cursor:pointer}.error{color:#ad1e38}small{display:block;margin-top:20px;color:#526177}
  </style></head><body><main><h1>DRIVER INSIDERS - U.RAICE</h1><p>Sign in to access race analysis.</p>${error ? `<p class="error" role="alert">${error}</p>` : ''}<form action="/auth/login" method="post"><label>Username<input name="username" autocomplete="username" required maxlength="100" autofocus></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button type="submit">Sign in</button></form><small>© Pol RG</small></main></body></html>`;
}
