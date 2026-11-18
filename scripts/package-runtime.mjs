import {cpSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=process.argv[2];if(!output)throw Error('Usage: node scripts/package-runtime.mjs output-directory');
const target=resolve(output);if(existsSync(target))throw Error('Output directory already exists: '+target);
// dari 是唯一制品：dist 直接铺在 runtime 根下，不再套一层 node_modules 包目录。
const from=join(root,'packages/dari');
if(!existsSync(join(from,'dist/cli.mjs')))throw Error('Build workspace before packaging');
mkdirSync(target,{recursive:true});
cpSync(join(from,'dist'),join(target,'dist'),{recursive:true});
// bin 由 dist/cli.mjs 驱动：dari check|run|lsp；dari-lsp 只是 `dari lsp` 的薄壳。
mkdirSync(join(target,'bin'),{recursive:true});
for(const [name,body]of [
 ['dari','#!/usr/bin/env node\nawait import("../dist/cli.mjs");\n'],
 ['dari-lsp','#!/usr/bin/env node\nprocess.argv.splice(2, 0, "lsp");\nawait import("../dist/cli.mjs");\n'],
])writeFileSync(join(target,'bin',name+'.mjs'),body,{mode:0o755});
for(const name of ['README.md','docs'])if(existsSync(join(root,name)))cpSync(join(root,name),join(target,name),{recursive:true});
console.log(target);
