import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {check, resolve, proofTarget, type ModelPort} from '../packages/dari-core/src/index.ts';
import {dariHost} from '../packages/dari-model/src/dari-host.ts';
import {sqlite} from '../packages/dari/src/adapters/sqlite.ts';

const type = {kind:'scalar',name:'Int'};
const key = {kind:'scalar',name:'String'};
const fields = {hour:type, device:key, rate:type};
const id = 'sample';
let payload:{index:number;cells:[string,number][]}[] = [];
let calls = 0;
const model:ModelPort = {
 contractId:id, implementationId:id,
 datasets:{Sample:{id,symbol:'Sample',kind:'dataset',members:Object.fromEntries(
  Object.entries(fields).map(([name,type])=>[name,{id:name,symbol:name,owner:id,type,kind:name==='rate'?'measure':'dimension'}])
 )}},
 check_type(intent,encoded){
  const step=intent.steps.at(-1);
  assert.equal(step?.kind,'pivot');
  return {container:'table',element:{kind:'schema',fields},maxRows:step.options.max_rows,pivot:step.options,receipt:proofTarget(intent,id,encoded),plan:step.options};
 },
 execute(){
  calls++;
  return {rows:[],columns:Object.entries(fields).map(([name,t])=>({name,type:t.name,nullable:false})),max_rows:48,pivot:payload};
 }
};
const source=`data hourly=query_remote! {
 let a=from(Sample);
 let selected=a |> filter(${Array.from({length:12},(_,i)=>'a.device == "d'+i+'"').join(' || ')});
 let grouped=selected |> project({hour:a.hour,device:a.device,rate:a.rate});
 grouped |> pivot({index:$.hour,columns:$.device,values:$.rate,max_rows:48,max_columns:12})
};
report overview=tree! {Report(title="Overview") [Table(data=hourly)]};
answer tree! {Answer [UseReport(ref=overview),LineChart(data=hourly)]};`;
const unbounded=source.replace(/ let selected=.*;\n/, '').replace('grouped=selected','grouped=a');
assert.throws(()=>check(unbounded,model,{host:dariHost}),/requires a proven column bound/);
const thirteen=source.replace('a.device == "d11"', 'a.device == "d11" || a.device == "d12"');
assert.throws(()=>check(thirteen,model,{host:dariHost}),/column bound 13 exceeds max_columns/);
const ranked=unbounded.replace('max_columns:12','max_columns:12,rank_columns:[desc(sum($.rate)),asc($.device)]');
assert.doesNotThrow(()=>check(ranked,model,{host:dariHost}));
assert.throws(()=>check(ranked.replace(',asc($.device)',''),model,{host:dariHost}),/Use rank_columns/);
function closedDeviceModel(size:number):ModelPort {
 const variants=Array.from({length:size},(_,i)=>'d'+i);
 const identity=(value:unknown)=>value;
 const device={...key,codec:{variants,parse:identity,encode:identity,decode:identity}};
 const dataset=model.datasets.Sample;
 return {
  ...model,
  datasets:{Sample:{...dataset,members:{...dataset.members,device:{...dataset.members.device,type:device}}}},
  check_type(intent,encoded){
   const shape=model.check_type(intent,encoded);
   return {...shape,element:{kind:'schema',fields:{...fields,device}}};
  }
 };
}
assert.doesNotThrow(()=>check(unbounded,closedDeviceModel(12),{host:dariHost}));
assert.throws(()=>check(unbounded,closedDeviceModel(13),{host:dariHost}),/column bound 13 exceeds max_columns/);
assert.equal(calls,0);
const program=check(source,model,{host:dariHost});
const db=new DatabaseSync(':memory:');
try{
 const run=()=>resolve(program,sqlite(db),{},{model});
 payload=Array.from({length:48},(_,hour)=>({
  index:hour,cells:Array.from({length:12},(_,device)=>['d'+device,hour*100+device])
 }));
 const result=run();
 assert.equal(calls,1);
 const [long,wide]=result.dataDocument.split('```csv\n').slice(1).map(block=>block.split('\n```')[0].split('\n'));
 assert.equal(wide.length,49);
 assert.equal(long.length,577);
 assert.equal(wide[0].split(',').length,13);
 assert.equal((result.artifacts['overview.html'].match(/<th>/g)??[]).length,13);
 const keys=wide[0].split(',').slice(1);
 const expected=wide.slice(1).flatMap(line=>{
  const [hour,...values]=line.split(',');
  return values.map((value,i)=>[hour,keys[i],value].join(','));
 });
 assert.deepEqual(new Set(long.slice(1)),new Set(expected));
 payload=[{index:0,cells:[['d0',0]]},{index:1,cells:[['d1',2]]}];
 const sparse=run();
 assert.match(sparse.dataDocument,/hour,d0,d1\n0,0,\n1,,2/);
 assert.match(sparse.artifacts['overview.html'],/<td>0<\/td><td><\/td>/);
 assert.equal(calls,2);
 assert.throws(()=>check(source.replace('max_columns:12','max_columns:13'),model,{host:dariHost}),/at most 12 data columns/);
 assert.throws(()=>check(source.replace('max_rows:48','max_rows:111'),model,{host:dariHost}),/<= 110/);
}finally{db.close();}
