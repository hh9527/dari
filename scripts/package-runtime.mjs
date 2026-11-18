import {cpSync,mkdirSync,readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=process.argv[2];if(!output)throw Error('Usage: node scripts/package-runtime.mjs output-directory');
const target=resolve(output);if(existsSync(target))throw Error('Output directory already exists: '+target);
const from=join(root,'packages/dari');
if(!existsSync(join(from,'lib/dari.mjs')))throw Error('Build workspace before packaging');
// 制品只有两个 JS：主入口与 worker；package.json 的 bin 直接指向主入口。
mkdirSync(join(target,'lib'),{recursive:true});
for(const name of ['dari.mjs','model-worker.mjs'])cpSync(join(from,'lib',name),join(target,'lib',name));
chmodSync(join(target,'lib/dari.mjs'),0o755);
const manifest=JSON.parse(readFileSync(join(from,'package.json'),'utf8'));
delete manifest.scripts;delete manifest.devDependencies;delete manifest.exports;
writeFileSync(join(target,'package.json'),JSON.stringify(manifest,null,2)+'\n');
for(const name of ['README.md','docs'])if(existsSync(join(root,name)))cpSync(join(root,name),join(target,name),{recursive:true});
console.log(target);
