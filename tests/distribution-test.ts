import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
const root=mkdtempSync(join(tmpdir(),'dari-distribution-')),runtime=join(root,'runtime');
const repository=fileURLToPath(new URL('..',import.meta.url));
function run(args:string[],input?:string){const result=spawnSync(process.execPath,args,{cwd:root,input,encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr||String(result.error));return result.stdout;}
try{
 run([join(repository,'scripts/package-runtime.mjs'),runtime]);
 const cli=join(runtime,'bin/dari.mjs'),service=join(runtime,'node_modules/@hh9527/dari/dist/service.js');
 const file=join(root,'sample.dari'),dbfile=join(root,'sample.sqlite');
 writeFileSync(file,readFileSync(new URL('../examples/device.dari',import.meta.url)));
 const integration=join(root,'integration.mjs');writeFileSync(integration,`import {createFixtureModel} from ${JSON.stringify(pathToFileURL(join(runtime,'node_modules/@hh9527/dari-core/dist/testing/model.js')).href)};export function createIntegration(){const {model}=createFixtureModel();return {checker:model,executor:model};}`);
 const db=new DatabaseSync(dbfile);db.exec("CREATE TABLE devices(id TEXT,name TEXT,cpu REAL,tenant TEXT);INSERT INTO devices VALUES('a','A',20,'t'),('b','B',50,'t')");db.close();
 assert.match(run([cli,'check',file,'--integration',integration]),/readings: Table/);
 assert.match(run([cli,'run',file,'--integration',integration,'--database',dbfile,'--inputs','{"request":{"floor":5}}']),/50/);
 const requests=[{id:1,method:'check',source:'answer tree! {Answer []};'},{id:2,method:'resolve',source:'data x=1;answer tree! {Answer [UseValue(ref=x)]};'}].map(v=>JSON.stringify(v)).join('\n')+'\n';
 const replies=run([service,'--database',dbfile],requests).trim().split('\n').map(v=>JSON.parse(v));assert(!replies[0].error);assert.equal(replies[1].result.answer,'*1*');
 const frame=(v:any)=>{const b=JSON.stringify(v);return 'Content-Length: '+Buffer.byteLength(b)+'\r\n\r\n'+b;};
 const messages=[{jsonrpc:'2.0',id:1,method:'initialize',params:{}},{jsonrpc:'2.0',id:2,method:'shutdown'},{jsonrpc:'2.0',method:'exit'}].map(frame).join('');
 assert.match(run([join(runtime,'bin/dari-lsp.mjs')],messages),/completionProvider/);
 console.log('Packaged distribution: CLI, remote two-stage linkage, JSONL and LSP run outside the source workspace without installed dependencies');
}finally{rmSync(root,{recursive:true,force:true});}
