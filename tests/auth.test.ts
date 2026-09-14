import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { createAuth } from '../server/auth.mjs';
const salt = 'a'.repeat(32);
const passwordHash = `${salt}:${scryptSync('test-only-password', salt, 64).toString('hex')}`;
test('multiple users have independent passwords, throttles and sessions; new config replaces legacy', () => {
  let time=0;
  const secondHash=`${salt}:${scryptSync('another-test-password',salt,64).toString('hex')}`;
  const auth=createAuth({usersJson:JSON.stringify({first:passwordHash,second:secondHash}),username:'legacy',passwordHash,now:()=>time});
  assert.equal(auth.login('legacy','test-only-password').status,401);
  assert.equal(auth.login('first','another-test-password').status,401);
  const a=auth.login('first','test-only-password'),b=auth.login('second','another-test-password');
  assert.equal(a.status,200);assert.equal(b.status,200);
  auth.logout(a.token);assert.equal(auth.valid(a.token),false);assert.equal(auth.valid(b.token),true);
  for(let i=0;i<10;i++)assert.equal(auth.login('first','wrong').status,401);
  assert.equal(auth.login('first','test-only-password').status,429);
  assert.equal(auth.login('second','another-test-password').status,200);
  time=15*60_000;assert.equal(auth.login('first','test-only-password').status,200);
});
test('invalid multi-user config cannot fall back to the old account',()=>{
  for(const usersJson of ['', '{}', '[]', 'null', '{', JSON.stringify({Pol:'plaintext'}),JSON.stringify({' ':passwordHash})])
    assert.throws(()=>createAuth({usersJson,username:'legacy',passwordHash}));
});
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
