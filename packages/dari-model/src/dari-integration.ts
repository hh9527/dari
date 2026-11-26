import {DatabaseSync} from 'node:sqlite';
import {registerCalendarFunctions,registerSqliteRegexp} from '@local/dari-core';
import type {ModelCheckPort,ModelExecutionPort,Type} from '@local/dari-core';
import {openModel} from './telora-model.ts';
import {dariHost} from './dari-host.ts';
import {infoContracts} from './dari-info-contract.ts';
/** Trusted integration loaded by the independent DARI service/LSP, never by draft source. */
export async function createIntegration(options:{model?:string;database?:string}){
 if(!options.model)throw Error('DARI ontology integration requires model');
 const bridge=await openModel(options.model);
 const checker:ModelCheckPort=bridge.model;
 let db:DatabaseSync|undefined;
 const executor:ModelExecutionPort={contractId:checker.contractId,implementationId:checker.implementationId,execute(plan,parameters,includeTotal){
  if(!options.database)throw Error('Remote IC execution requires a database path');
  if(!db){
   const connection=new DatabaseSync(options.database,{readOnly:true});
   const functions={registerFunction:connection.function.bind(connection)};
   registerCalendarFunctions(functions);
   registerSqliteRegexp(functions);
   db=connection;
  }
  const query=bridge.bind(plan,parameters);
  const readPage=()=>({rows:db!.prepare(query.sql).all(...query.bindings),columns:query.columns,max_rows:query.max_rows});
  if(!includeTotal)return readPage();
  const count=bridge.bind(plan,parameters,true);
  db.exec('SAVEPOINT dari_total_rows');
  try{
   const page=readPage();
   const total=db.prepare(count.sql).get(...count.bindings)?.total;
   return {...page,total:typeof total==='number'?total:undefined};
  }finally{
   db.exec('RELEASE dari_total_rows');
  }
 }};
 const scalar=(name:string):Type=>({kind:'scalar',name});
 return {checker,executor,options:{host:dariHost,contextContractId:'dari-context/v2',contextType:{kind:'schema',fields:{now:scalar('DateTimeUtc'),epochMillis:scalar('EpochMillis'),timeZone:{kind:'option',inner:scalar('String')}}}},inspect:(points:unknown)=>{
  if(!Array.isArray(points))throw Error('inspect expects a list of knowledge points');return infoContracts(bridge.model,points);
 },close:async()=>{db?.close();await bridge.close();}};
}
