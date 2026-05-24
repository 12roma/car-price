import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

await mkdir(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(rootDir, 'utils/firebaseRepository.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  outfile: path.join(distDir, 'firebase.bundle.js'),
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});

console.log('Built dist/firebase.bundle.js');
