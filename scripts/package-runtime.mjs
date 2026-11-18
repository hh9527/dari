import {cpSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=process.argv[2];if(!output)throw Error('Usage: node scripts/package-runtime.mjs output-directory');
const target=resolve(output);if(existsSync(target))throw Error('Output directory already exists: '+target);
for(const name of ['dari']){
 const from=join(root,'packages',name),to=join(target,'node_modules/@local',name);
 if(!existsSync(join(from,'dist/cli.mjs')))throw Error('Build workspace before packaging');
 mkdirSync(to,{recursive:true});cpSync(join(from,'dist'),join(to,'dist'),{recursive:true});
 const manifest=JSON.parse(readFileSync(join(from,'package.json'),'utf8'));delete manifest.scripts;delete manifest.devDependencies;
 writeFileSync(join(to,'package.json'),JSON.stringify(manifest,null,2)+'\n');
}
// bin 由 dari 的 dist/cli.mjs 驱动：dari check|run|lsp；dari-lsp 只是 `dari lsp` 的薄壳。
mkdirSync(join(target,'bin'),{recursive:true});
const bin='../node_modules/@local/dari/dist/cli.mjs';
for(const [name,body]of [
 ['dari','#!/usr/bin/env node\nawait import("'+bin+'");\n'],
 ['dari-lsp','#!/usr/bin/env node\nprocess.argv.splice(2, 0, "lsp");\nawait import("'+bin+'");\n'],
])writeFileSync(join(target,'bin',name+'.mjs'),body,{mode:0o755});
for(const name of ['README.md','docs'])if(existsSync(join(root,name)))cpSync(join(root,name),join(target,name),{recursive:true});
console.log(target);
