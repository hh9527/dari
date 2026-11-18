// 模型 worker 与 wasm 桥是运行期按路径加载的 .mjs，打包器不会内联，必须跟着 dist 走。
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, '..', 'dari-model', 'dist');
mkdirSync(join(root, 'dist'), { recursive: true });
for (const name of ['model-worker.mjs', 'located-input.mjs', 'telora-wasm.mjs']) {
  const file = join(from, name);
  if (!existsSync(file)) throw new Error(`缺少 ${file}；先构建 dari-model`);
  copyFileSync(file, join(root, 'dist', name));
}
