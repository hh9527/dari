import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {check,type Type} from '../packages/dari-core/src/compiler.ts';
import {resolve} from '../packages/dari-core/src/runtime.ts';
import {proofTarget,storage,type ModelPort,type DatasetSymbol,type ResultColumn} from '../packages/dari-core/src/model.ts';
import type {SqlRow,DatabasePort} from '../packages/dari-core/src/database.ts';
import {sharedTypes} from '../packages/dari-core/src/shared-types.ts';
import {sqlite} from '../packages/dari/src/adapters/sqlite.ts';
const scalar=(name:string):Type=>({kind:'scalar',name});
const phase:Type={kind:'nominal',name:'demo::Phase',inner:scalar('Int'),codec:{variants:['Up','Down'],parse(v){if(v!=='Up'&&v!=='Down')throw Error('Invalid Phase');return v;},encode(v){return v==='Up'?10:v==='Down'?20:assert.fail('Invalid Phase');},decode(v){return v===10?'Up':v===20?'Down':assert.fail('Invalid phase wire');}}};
const fields={id:scalar('String'),rate:sharedTypes.Ratio,phase,active:scalar('Bool'),clock:sharedTypes.DateTimeUtc,epoch:sharedTypes.EpochMillis,n:{kind:'option',inner:scalar('Int')} as Type};
const dataset:DatasetSymbol={kind:'dataset',id:'device',symbol:'demo::Device',members:Object.fromEntries(Object.entries(fields).map(([name,type])=>[name,{kind:'dimension',id:name,symbol:name,owner:'device',type}]))};
const sample=(id:string,n:number|null=1):SqlRow=>({id,rate:0.12,phase:10,active:1,clock:'2026-11-16T00:00:00.000Z',epoch:1794787200000,n});
function fixture(rows:SqlRow[]){
 const db=new DatabaseSync(':memory:'),adapter=sqlite(db),trace={calls:0,imports:0,drops:0,sql:[] as string[]};
 const local:DatabasePort={...adapter,query(sql,args){assert(!sql.includes('REMOTE_ONLY'));trace.sql.push(sql);return adapter.query(sql,args);},materialize(...args){trace.imports++;adapter.materialize(...args);},drop(name){trace.drops++;adapter.drop(name);}};
 const model:ModelPort={contractId:'remote-boundary/v1',implementationId:'remote-boundary/impl1',datasets:{'demo::Device':dataset},types:{'demo::Phase':phase},
  check_type(intent,encoded){const step=intent.steps.find(s=>s.kind==='project');assert(step?.kind==='project'&&step.value.kind==='record');const output=Object.fromEntries(Object.entries(step.value.fields).map(([name,value])=>{assert(value.kind==='member');return [name,value.member.type];}));const count=intent.steps.find(s=>s.kind==='take'||s.kind==='take_opt');const maxRows=count?.kind==='take'?count.count:count?.kind==='take_opt'?1:undefined;const columns=Object.entries(output).map(([name,t])=>({name,...storage(t)}));return {element:{kind:'schema',fields:output},maxRows,container:count?.kind==='take_opt'?'option':'table',receipt:proofTarget(intent,model.contractId,encoded),plan:{request:'REMOTE_ONLY',columns,max_rows:maxRows}};},
  execute(plan){trace.calls++;const p=plan as {request:string;columns:ResultColumn[];max_rows:number};assert.equal(p.request,'REMOTE_ONLY');return {rows:rows.map(row=>Object.fromEntries(p.columns.map(c=>[c.name,row[c.name]]))),columns:p.columns,max_rows:p.max_rows};}
 };
 const run=(source:string)=>resolve(check(source,model),local,{},{model});
 const clean=()=>assert.deepEqual(db.prepare("SELECT name FROM sqlite_temp_master WHERE type='table'").all(),[]);
 return {db,model,trace,local,run,clean};
}
const remote=(n:number,columns='id:a.id,rate:a.rate,phase:a.phase,active:a.active,clock:a.clock,epoch:a.epoch,n:a.n')=>`data raw=query_remote! {from(demo::Device).as!(a) |> project({${columns}}).as!(r) |> order_by(asc(r.id)) |> take(${n})};`;
const answer=(body:string)=>'answer tree! {Answer ['+body+']};';
{
 const f=fixture([sample('Z',null),sample('A'),sample('M')]);
 try {
  const direct=f.run(remote(3)+answer('Table(data=raw)'));assert.equal(f.trace.calls,1);assert.equal(f.trace.imports,0);assert.equal(f.trace.sql.length,0);assert.deepEqual(direct.values.raw[0],{id:'Z',rate:0.12,phase:'Up',active:true,clock:'2026-11-16T00:00:00.000Z',epoch:1794787200000,n:null});
  const result=f.run(remote(3)+`data top=query! {from(raw).as!(r) |> project({id:r.id,rate:r.rate,phase:r.phase,active:r.active,clock:r.clock,epoch:r.epoch,n:r.n}).as!(out) |> take(2)};data other=query! {from(raw).as!(r) |> project({id:r.id}).as!(out) |> take(1)};`+answer('Table(data=raw),Table(data=top),Table(data=other)'));
  assert.equal(f.trace.calls,2);assert.equal(f.trace.imports,1);assert.equal(f.trace.drops,1);assert.deepEqual(result.values.top,[result.values.raw[0],result.values.raw[1]]);assert.deepEqual(result.values.other,[{id:'Z'}]);f.clean();
  const before=f.trace.calls;f.run(remote(500)+answer('"unused"'));assert.equal(f.trace.calls,before);f.clean();
 }finally{f.db.close();}
}
{
 const f=fixture([]);try{const r=f.run(remote(3)+`data rows=query! {from(raw).as!(a) |> project({id:a.id}).as!(r) |> take(2)};`+answer('Table(data=rows,spec={allow_no_data:True})'));assert.deepEqual(r.values.rows,[]);assert.equal(f.trace.imports,1);f.clean();}finally{f.db.close();}
}
{
 const f=fixture(Array.from({length:500},(_,i)=>sample(String(i))));try{
  assert.throws(()=>check(remote(501)+answer('"unused"'),f.model),/500|bound/);
  assert.throws(()=>check(remote(500)+answer('Table(data=raw)'),f.model),/Table input data \(raw\).*110[\s\S]*已证明至多 500 行[\s\S]*调整远端节点 raw/);
  assert.equal(check(remote(50)+answer('Table(data=raw)'),f.model).bindings.get('raw')?.result?.maxRows,50);
  const r=f.run(remote(500)+`data rows=query! {from(raw).as!(r) |> project({id:r.id}).as!(out) |> take(110)};`+answer('Table(data=rows)'));assert.equal(r.values.rows.length,110);assert.equal(f.trace.calls,1);assert.equal(f.trace.imports,1);f.clean();
  assert.throws(()=>f.run(remote(499)+`data rows=query! {from(raw).as!(r) |> project({id:r.id}).as!(out) |> take(1)};`+answer('Table(data=rows)')),/exceeds published row bound/);assert.equal(f.trace.imports,1);f.clean();
 }finally{f.db.close();}
}
{
 const f=fixture([sample('a')]);try{
  const source=remote(1)+`data rows=query! {from(raw).as!(r) |> project({id:r.id}).as!(out) |> take(1)};`+answer('Table(data=rows)');
  const broken={...f.local,query(){throw Error('forced local failure');}};assert.throws(()=>resolve(check(source,f.model),broken,{},{model:f.model}),/forced local failure/);assert.equal(f.trace.drops,1);f.clean();
  const invalid={...f.model,execute(...args:Parameters<typeof f.model.execute>){const r=f.model.execute(...args);r.rows[0].epoch='wrong';return r;}};assert.throws(()=>resolve(check(source,invalid),f.local,{},{model:invalid}),/EpochMillis|Value violates/);assert.equal(f.trace.imports,1);f.clean();
  const single=remote(1,'id:a.id').replace('take(1)','take_opt()')+answer('if let Some(row)=raw [UseValue(ref=row.id)] else ["empty"]');assert.match(f.run(single).answer,/a/);assert.equal(f.trace.imports,1);
 }finally{f.db.close();}
}
{
 const f=fixture([sample('a')]);try{
  const split='data raw=query_remote! {from(demo::Device).as!(a) |> project({id:a.id}).as!(r) |> filter(r.id!="x") |> order_by(asc(r.id)) |> take(1)};'+answer('Table(data=raw)');
  assert.throws(()=>check(split,f.model),(error:Error)=>{
   assert.match(error.message,/Remote execution requires a proven result bound/);
   assert.match(error.message,/此 filter 开始本地处理/);
   assert.match(error.message,/此处之后的 take 无法限制远端取数/);
   assert.match(error.message,/filter\(\(?r\.id/);
   assert.match(error.message,new RegExp('L1:'+ (split.indexOf('filter(')+1) + ' '));
   assert.doesNotMatch(error.message,/@block\//);
   return true;
  });
  const source=remote(3,'id:a.id')+`data rows=query! {let a=from(raw);let b=from(raw);a |> join(b,a.id==b.id) |> project({id:a.id}).as!(r) |> order_by(asc(r.id)) |> take(3)};`+answer('Table(data=rows)');assert.deepEqual(f.run(source).values.rows,[{id:'a'}]);assert.equal(f.trace.calls,1);assert.equal(f.trace.imports,1);f.clean();
 }finally{f.db.close();}
}
console.log('Remote boundary: opaque non-SQL execution, lazy imports, shared caches, ordering, codecs, empty results, cleanup and independent 500/110 bounds passed');
