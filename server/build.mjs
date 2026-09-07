import { rmSync, lstatSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRoot, fingerprint, sourcePaths, outputPath } from './production-build.mjs';

process.chdir(projectRoot);
// Only these validated generated outputs are removed; build/ is required source.
for (const name of ['dist', '.next']) {
  const path = outputPath(name);
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Refusing to clean symlink ${name}`);
  rmSync(path, { recursive: true, force: true });
}
const sourceHash = fingerprint(projectRoot, sourcePaths);
const build = spawnSync(process.execPath, [resolve(projectRoot, 'node_modules/vinext/dist/cli.js'), 'build'], {
  cwd: projectRoot, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, UAS_BUILD_TARGET: 'node', NODE_ENV: 'production' },
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status || 1);
if (sourceHash !== fingerprint(projectRoot, sourcePaths)) throw new Error('Source changed during build; build again.');
if (!existsSync(resolve(projectRoot, 'dist/server/index.js'))) throw new Error('Missing production server output');
const info = { target: 'node', sourceHash, outputHash: fingerprint(projectRoot, ['dist/client', 'dist/server']),
  builtAt: new Date().toISOString(), commit: process.env.RENDER_GIT_COMMIT || null };
writeFileSync(resolve(projectRoot, 'dist/build-info.json'), JSON.stringify(info, null, 2));
console.log(`Driver Performance production build: ${sourceHash.slice(0, 12)}`);
