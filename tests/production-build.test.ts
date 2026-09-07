import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint, sourcePaths, verifyBuild } from '../server/production-build.mjs';

test('production rejects absent, stale and tampered builds', () => {
  const root = mkdtempSync(join(tmpdir(), 'uas-build-test-'));
  try {
    mkdirSync(join(root, 'app'));
    writeFileSync(join(root, 'app/page.tsx'), 'current report');
    assert.throws(() => verifyBuild(root), /No verified/);
    mkdirSync(join(root, 'dist/server'), { recursive: true });
    mkdirSync(join(root, 'dist/client'), { recursive: true });
    writeFileSync(join(root, 'dist/server/index.js'), 'current server');
    writeFileSync(join(root, 'dist/client/app.js'), 'current client');
    const stamp = () => writeFileSync(join(root, 'dist/build-info.json'), JSON.stringify({
      target: 'node', sourceHash: fingerprint(root, sourcePaths),
      outputHash: fingerprint(root, ['dist/client', 'dist/server']),
    }));
    stamp();
    assert.equal(verifyBuild(root).target, 'node');
    writeFileSync(join(root, 'app/page.tsx'), 'new report');
    assert.throws(() => verifyBuild(root), /stale/);
    stamp();
    writeFileSync(join(root, 'dist/client/app.js'), 'old client');
    assert.throws(() => verifyBuild(root), /artifacts/);
  } finally {
    // root is the exact unique directory returned by mkdtempSync, never a workspace.
    rmSync(root, { recursive: true, force: true });
  }
});
