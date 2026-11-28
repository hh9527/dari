import {pivotSql} from './sqlite-pivot.ts';
import {DatabaseSync} from 'node:sqlite';
import {registerCalendarFunctions,registerSqliteRegexp} from '@local/dari-core';
import type {ModelCheckPort,ModelExecutionPort,Type} from '@local/dari-core';
import {openPostgres} from './postgres-executor.ts';
import {openModel} from './telora-model.ts';
import {dariHost} from './dari-host.ts';
import {infoContracts} from './dari-info-contract.ts';
/** Trusted integration loaded by the independent DARI service/LSP, never by draft source. */
export async function createIntegration(options:{model?:string;database?:string;postgres?:string;postgresEnv?:string}){
 if(!options.model)throw Error('DARI ontology integration requires model');
 const connectionString=options.postgres??(options.postgresEnv?process.env[options.postgresEnv]:undefined);
 if(options.postgresEnv&&!connectionString)throw Error('Missing PostgreSQL connection environment variable '+options.postgresEnv);
 if(options.database && connectionString)throw Error('Configure one remote database');
 const bridge=await openModel(options.model,connectionString?'Postgres':'Sqlite');
 const postgres=connectionString?openPostgres(connectionString):undefined;
 const checker:ModelCheckPort=bridge.model;
 let db:DatabaseSync|undefined;
 const executor:ModelExecutionPort={contractId:checker.contractId,implementationId:checker.implementationId,execute(plan,parameters,includeTotal){
  const query=bridge.bind(plan,parameters);
  if(!postgres&&!options.database)throw Error('Remote IC execution requires a database path');
  if(!postgres&&!db){
   const connection=new DatabaseSync(options.database!,{readOnly:true});
   const functions={registerFunction:connection.function.bind(connection)};
   registerCalendarFunctions(functions);
   registerSqliteRegexp(functions);
   db=connection;
  }
  if(query.pivot){
   const {index,columns,values,max_rows,max_columns}=query.pivot;
   const sql=pivotSql(query.sql,{index,columns,values,maxRows:max_rows,maxColumns:max_columns,rankColumns:query.pivot.rank_columns},
    postgres?'postgres':'sqlite',query.columns.find(column=>column.name===columns)?.type==='String');
   const packed=postgres?postgres.read({...query,sql}).rows:db!.prepare(sql).all(...query.bindings);
   const axes=packed[0];
   if(Number(axes.row_count)>max_rows)throw Error('Pivot index exceeds max_rows ('+max_rows+')');
   if(Number(axes.column_count)>max_columns)throw Error('Pivot columns exceed max_columns ('+max_columns+')');
   if(axes.null_axes||axes.duplicate_coordinates)throw Error('Pivot requires unique coordinates with nonnullable axes');
   return {rows:[],columns:query.columns,max_rows,pivot:packed.filter(row=>row.cells!==null).map(row=>({index:row.pivot_index,cells:JSON.parse(String(row.cells))}))};
  }
  if(postgres){
   const result=postgres.read(query,includeTotal?bridge.bind(plan,parameters,true):undefined);
   return {...result,columns:query.columns,max_rows:query.max_rows};
  }
  const readPage=()=>({rows:db!.prepare(query.sql).all(...query.bindings),columns:query.columns,max_rows:query.max_rows});
  if(!includeTotal)return readPage();
  const count=bridge.bind(plan,parameters,true);
  db!.exec('SAVEPOINT dari_total_rows');
  try{
   const page=readPage();
   const total=db!.prepare(count.sql).get(...count.bindings)?.total;
   return {...page,total:typeof total==='number'?total:undefined};
  }finally{
   db!.exec('RELEASE dari_total_rows');
  }
 }};
 const scalar=(name:string):Type=>({kind:'scalar',name});
 return {checker,executor,options:{host:dariHost,contextContractId:'dari-context/v2',contextType:{kind:'schema',fields:{now:scalar('DateTimeUtc'),epochMillis:scalar('EpochMillis'),timeZone:{kind:'option',inner:scalar('String')}}}},inspect:(points:unknown)=>{
  if(!Array.isArray(points))throw Error('inspect expects a list of knowledge points');return infoContracts(bridge.model,points);
 },close:async()=>{db?.close();await Promise.all([postgres?.close(),bridge.close()]);}};
}
