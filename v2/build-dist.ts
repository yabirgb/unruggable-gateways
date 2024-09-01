import { readFileSync, writeFileSync, mkdirSync, rmdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import pkg from './package.json';
import tsc from './tsconfig.json'; // parses json comments

const baseDir = fileURLToPath(new URL('./', import.meta.url));
const distDir = join(baseDir, 'dist');
const packageFile = join(baseDir, 'package.json');
const tsconfigFile = join(baseDir, 'tsconfig.json');

function log(...a: any) {
  console.log(performance.now().toFixed(0).padStart(5), ...a);
}

// save a copy of config files
const packageOriginal = readFileSync(packageFile);
const tsconfigOriginal = readFileSync(tsconfigFile);

// ensure correct starting state
if (pkg.type !== 'module') {
  throw new Error(`unexpected package type: ${pkg.type}`);
}
log(`Saved configuration`);

// verify build
log(`Typechecking...`);
spawnSync('bun', ['tsc', '-p', '.', '--noEmit']);
log('Ready!');

// clear dist
rmdirSync(distDir, { recursive: true });
mkdirSync(distDir);
log(`Cleaned ${distDir}`);

// remove tests
tsc.include = tsc.include.filter((x) => !`^test\b`.match(x));
writeFileSync(tsconfigFile, JSON.stringify(tsc));

try {
  build('commonjs', 'cjs');
  build('module', 'esm');
} finally {
  writeFileSync(packageFile, packageOriginal);
  writeFileSync(tsconfigFile, tsconfigOriginal);
  log(`Restored configuration`);
}

function build(packageType: string, dirName: string) {
  pkg.type = packageType;
  writeFileSync(packageFile, JSON.stringify(pkg));
  log(`Set package type: "${packageType}"`);
  const dir = join(distDir, dirName);
  spawnSync('bun', [
    'tsc',
    '-p',
    '.',
    '--outDir',
    dir,
    '--declaration',
    '--declarationMap',
  ]);
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ type: packageType, sideEffects: false })
  );
  log(`Built ${dirName}: ${dir}`);
}
