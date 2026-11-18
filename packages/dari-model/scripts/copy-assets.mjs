// tsc 只处理 TypeScript；worker 与 wasm 桥是运行时用的 .mjs，必须一起进 dist。
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = ['model-worker.mjs', 'located-input.mjs', 'telora-wasm.mjs'];
mkdirSync(join(root, 'dist'), { recursive: true });
for (const name of assets) copyFileSync(join(root, 'src', name), join(root, 'dist', name));
