import {sqlitePivotSql} from './sqlite-pivot.ts';
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
  if(query.pivot){
   const {index,columns,values,max_rows,max_columns}=query.pivot;
   const packed=db.prepare(sqlitePivotSql(query.sql,{index,columns,values,maxRows:max_rows,maxColumns:max_columns})).all(...query.bindings);
   const axes=packed[0];
   if(Number(axes.row_count)>max_rows)throw Error('Pivot index exceeds max_rows ('+max_rows+')');
   if(Number(axes.column_count)>max_columns)throw Error('Pivot columns exceed max_columns ('+max_columns+')');
   if(axes.null_axes||axes.duplicate_coordinates)throw Error('Pivot requires unique coordinates with nonnullable axes');
   return {rows:[],columns:query.columns,max_rows,pivot:packed.filter(row=>row.cells!==null).map(row=>({index:row.pivot_index,cells:JSON.parse(String(row.cells))}))};
  }
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
