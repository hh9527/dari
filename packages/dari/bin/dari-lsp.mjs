#!/usr/bin/env node
// `dari lsp` 的薄壳：编辑器配置可以继续指向这个入口。
process.argv.splice(2, 0, 'lsp');
await import('../dist/cli.mjs');
