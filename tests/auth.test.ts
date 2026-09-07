import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { createAuth } from '../server/auth.mjs';
const salt = 'a'.repeat(32);
const passwordHash = `${salt}:${scryptSync('test-only-password', salt, 64).toString('hex')}`;
test('login validates both credentials, sessions expire and logout revokes', () => {
  let time = 100;
  const auth = createAuth({ username: 'test', passwordHash, now: () => time });
  assert.equal(auth.login('other', 'test-only-password').status, 401);
  assert.equal(auth.login('test', 'wrong').status, 401);
  const first = auth.login('test', 'test-only-password');
  assert.ok(auth.valid(first.token));
  assert.equal(auth.valid('fabricated'), false);
  auth.logout(first.token);
  assert.equal(auth.valid(first.token), false);
  const second = auth.login('test', 'test-only-password');
  time += 8 * 3600_000;
  assert.equal(auth.valid(second.token), false);
});
test('ten failed attempts are throttled and configuration fails closed', () => {
  const auth = createAuth({ username: 'test', passwordHash });
  for (let i=0; i<10; i++) assert.equal(auth.login('test', 'wrong').status, 401);
  assert.equal(auth.login('test', 'test-only-password').status, 429);
  assert.throws(() => createAuth({ username: '', passwordHash: '' }));
});
