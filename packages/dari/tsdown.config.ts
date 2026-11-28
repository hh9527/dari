import { defineConfig } from 'tsdown';

// 发布主程序以及独立的模型和 PostgreSQL worker。
// 库（dari-core / dari-model）在构建期被内联，不单独产出文件。
export default defineConfig([
  {
    entry: { dari: 'src/cli.ts' },
    banner: '#!/usr/bin/env node',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outDir: 'lib',
    clean: false,
    dts: false,
    hash: false,
    unbundle: false,
    outExtensions: () => ({ js: '.mjs' }),
    deps: { alwaysBundle: [/^@local\/dari/, /^echarts/, /^zrender/, /^tslib$/, /^@js-temporal\//, /^jsbi$/] },
    loader: { '.md': 'text' },
  },
  {
    // worker 自带依赖：胶水 + located-input + telora-wasm 打成一个文件。
    entry: {
      'model-worker': '../dari-model/src/model-worker.mjs',
      'postgres-worker': '../dari-model/src/postgres-worker.mjs',
    },
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outDir: 'lib',
    clean: false,
    dts: false,
    hash: false,
    unbundle: false,
    deps: { alwaysBundle: [/^pg$/] },
    outExtensions: () => ({ js: '.mjs' }),
  },
]);
