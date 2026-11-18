import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve as pathResolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {check,show} from '@local/dari-core';
import {resolve} from '@local/dari-core';
import {sqlite} from './adapters/sqlite.ts';
import {renderDiagnostics} from '@local/dari-core';
import {loadIntegration,argumentsOf} from './load-integration.ts';
import type {Integration} from './integration.ts';
import {runLsp} from './lsp/stdio.ts';
import {runService} from './service.ts';
let integration:Integration={};
try{
 const {positional:[command,file],flags}=argumentsOf(process.argv.slice(2));
 if(command==='lsp')await runLsp(process.argv.slice(2));
 else if(command==='serve')await runService(process.argv.slice(2));
 else if(!['check','run'].includes(command)||!file)throw Error('Usage: dari check|run file.dari [--integration module.js] [--options json] [--database file.sqlite] [--inputs json] [--context json] [--context-contract id] [--output directory]\n       dari lsp [--workspace dir] [--options json] [--integration module.js]');
 else {
 for(const flag of Object.keys(flags))if(!['integration','options','database','inputs','context','context-contract','output'].includes(flag))throw Error('Unknown option --'+flag);
 integration=await loadIntegration(flags.integration,{...(flags.options?JSON.parse(flags.options):{}),...(flags.database?{database:flags.database}:{})});
 const source=readFileSync(file,'utf8'),p=check(source,integration.checker,integration.options);
 if(command==='check'){console.log([...p.bindings].filter(([,b])=>!b.internal).map(([name,b])=>name+': '+show(b.type)).join('\n'));if(p.warnings.length)console.log(renderDiagnostics(source,p.warnings,'Warnings'));}
 else{
  const db=new DatabaseSync(':memory:');
  try{const result=resolve(p,sqlite(db),flags.inputs?JSON.parse(flags.inputs):{},{model:integration.executor,context:flags.context?JSON.parse(flags.context):undefined,contextContractId:flags['context-contract']});
   if(Object.keys(result.artifacts).length&&!flags.output)throw Error('Artifacts require --output directory');
   if(flags.output){const dir=pathResolve(flags.output);mkdirSync(dir,{recursive:true});for(const [name,content]of Object.entries(result.artifacts))writeFileSync(join(dir,name),content);writeFileSync(join(dir,'answer.md'),result.answer);writeFileSync(join(dir,'data.md'),result.dataDocument);}
   console.log(result.answer);
  }finally{db.close();}
 }
 }
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}finally{await integration.close?.();}
