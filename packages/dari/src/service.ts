import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {check,show,type Program} from '@hh9527/dari-core';
import {resolve} from '@hh9527/dari-core';
import {sqlite} from './adapters/sqlite.ts';
import {renderDiagnostics} from '@hh9527/dari-core';
import {loadIntegration,argumentsOf} from './load-integration.ts';
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
const requests=lines[Symbol.asyncIterator]();
const {flags}=argumentsOf(process.argv.slice(2));
for(const flag of Object.keys(flags))if(!['integration','options','database'].includes(flag))throw Error('Unknown option --'+flag);
const integration=await loadIntegration(flags.integration,flags.options?JSON.parse(flags.options):{});
const programs=new Map<string,Program>();
try{
 for await(const line of requests){
  let id:unknown;
  try{
   if(Buffer.byteLength(line)>2*1024*1024)throw Error('Request exceeds 2 MiB');
   const request=JSON.parse(line);id=request.id;let result:unknown;
   if(request.method==='inspect'){
    if(!integration.inspect)throw Error('Integration does not provide inspect');result=await integration.inspect(request.input);
   }else if(['check','resolve'].includes(request.method)){
    if(typeof request.source!=='string'||Buffer.byteLength(request.source)>262144)throw Error('Expected source up to 256 KiB');
    const key=createHash('sha256').update(JSON.stringify([request.source,integration.checker?.contractId,integration.checker?.implementationId,integration.options?.host?.contractId,integration.options?.contextContractId])).digest('hex');
    let p=programs.get(key);
    if(!p){p=check(request.source,integration.checker,integration.options);if(programs.size>=8)programs.delete(programs.keys().next().value!);programs.set(key,p);}
    if(request.method==='check')result={types:[...p.bindings].filter(([,b])=>!b.internal).map(([name,b])=>({name,type:show(b.type)})),warnings:p.warnings.length?renderDiagnostics(p.source,p.warnings,'Warnings'):undefined};
    else{
     if(!flags.database)throw Error('Execution requires --database');const db=new DatabaseSync(flags.database,{readOnly:true});
     try{const run=resolve(p,sqlite(db),request.inputs??{},{model:integration.executor,context:request.context,contextContractId:request.contextContractId});result={answer:run.answer,artifacts:run.artifacts,queries:run.queries,dataDocument:run.dataDocument,deliveryId:run.deliveryId};}finally{db.close();}
    }
   }else throw Error('Unknown DARI service method');
   process.stdout.write(JSON.stringify({id,result})+'\n');
  }catch(error){process.stdout.write(JSON.stringify({id,error:error instanceof Error?error.message:String(error)})+'\n');}
 }
}finally{await integration.close?.();}
