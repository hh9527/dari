import { defineConfig } from 'tsdown';

// 单一入口：src/cli.ts → dist/cli.mjs，`dari check|run|lsp` 三个子命令都在里面。
// 库依赖（dari-core、dari-model）与图表依赖一律打进产物：dari 这个包要自足，
// 落到任何空目录都能直接跑（部署时只拷 dist/ 与 bin/）。
export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  dts: false,
  hash: false,
  unbundle: false,
  outExtensions: () => ({ js: '.mjs' }),
  deps: { alwaysBundle: [/^@hh9527\/dari/, /^echarts/, /^zrender/, /^tslib$/, /^@js-temporal\//, /^jsbi$/] },
  loader: { '.md': 'text' },
});
