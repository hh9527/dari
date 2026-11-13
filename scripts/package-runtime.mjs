import {cpSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=process.argv[2];if(!output)throw Error('Usage: node scripts/package-runtime.mjs output-directory');
const target=resolve(output);if(existsSync(target))throw Error('Output directory already exists: '+target);
for(const name of ['dari-core','dari']){
 const from=join(root,'packages',name),to=join(target,'node_modules/@hh9527',name);
 if(!existsSync(join(from,'dist/index.js')))throw Error('Build workspace before packaging');
 mkdirSync(to,{recursive:true});cpSync(join(from,'dist'),join(to,'dist'),{recursive:true});
 const manifest=JSON.parse(readFileSync(join(from,'package.json'),'utf8'));delete manifest.scripts;delete manifest.devDependencies;
 writeFileSync(join(to,'package.json'),JSON.stringify(manifest,null,2)+'\n');
 if(name==='dari')cpSync(join(from,'bin'),join(to,'bin'),{recursive:true});
}
mkdirSync(join(target,'bin'),{recursive:true});
for(const [name,entry]of [['dari','cli'],['dari-lsp','lsp/stdio']])writeFileSync(join(target,'bin',name+'.mjs'),'#!/usr/bin/env node\nawait import("../node_modules/@hh9527/dari/dist/'+entry+'.js");\n',{mode:0o755});
for(const name of ['README.md','docs'])if(existsSync(join(root,name)))cpSync(join(root,name),join(target,name),{recursive:true});
console.log(target);
