import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, lstatSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const sourcePaths = ['app', 'src', 'public', 'server', 'build', 'worker', 'db', '.openai/hosting.json',
  'package.json', 'package-lock.json', 'vite.config.ts', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs'];
export function filesIn(root, paths) {
  const files = [];
  const visit = name => {
    const path = resolve(root, name);
    if (!existsSync(path)) return;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Unexpected symlink: ${name}`);
    if (stat.isFile()) { files.push(name); return; }
    const entries = readdirSync(path, { withFileTypes: true });
    for (const entry of entries) {
      const child = `${name}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${child}`);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(child);
    }
  };
  for (const path of paths) visit(path);
  return files.sort();
}
export function fingerprint(root, paths) {
  const hash = createHash('sha256');
  for (const name of filesIn(root, paths)) {
    const data = readFileSync(resolve(root, name));
    hash.update(`${name}\0${data.length}\0`); hash.update(data);
  }
  return hash.digest('hex');
}
export function verifyBuild(root = projectRoot) {
  const marker = resolve(root, 'dist/build-info.json');
  if (!existsSync(marker)) throw new Error('No verified production build. Run npm run build from the repository root.');
  const info = JSON.parse(readFileSync(marker, 'utf8'));
  if (info.target !== 'node' || info.sourceHash !== fingerprint(root, sourcePaths)) {
    throw new Error('Production build is stale or is not a Node build. Run npm run build.');
  }
  if (!existsSync(resolve(root, 'dist/server/index.js')) ||
      info.outputHash !== fingerprint(root, ['dist/client', 'dist/server'])) {
    throw new Error('Production artifacts are missing or changed. Run npm run build.');
  }
  return info;
}
export function outputPath(name) {
  if (!['dist', '.next'].includes(name)) throw new Error('Not a generated output directory');
  const path = resolve(projectRoot, name);
  if (relative(projectRoot, path) !== name) throw new Error('Unsafe build output path');
  return path;
}
