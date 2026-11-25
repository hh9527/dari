import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {check,show,type Type} from '../packages/dari-core/src/compiler.ts';
import {resolve} from '../packages/dari-core/src/runtime.ts';
import {sqlite} from '../packages/dari/src/adapters/sqlite.ts';
import type {ModelCheckPort,ValueCodec} from '../packages/dari-core/src/model.ts';
const codec=(integer:boolean):ValueCodec=>{
 const parse=(value:unknown)=>{if(typeof value!=='number'||!Number.isFinite(value)||(integer&&!Number.isSafeInteger(value)))throw Error('invalid count');return value;};
 return {parse,encode:parse,decode:parse,operations:['Compare','Mean','Min','Max']};
};
const mean:Type={kind:'nominal',name:'demo::MeanCount',inner:{kind:'scalar',name:'Float'},codec:codec(false)};
const count:Type={kind:'nominal',name:'demo::Count',inner:{kind:'scalar',name:'Int'},codec:codec(true),meanResult:mean};
const model:ModelCheckPort={contractId:'mean-contract',implementationId:'mean-v1',datasets:{},types:{'demo::Count':count,'demo::MeanCount':mean},check_type(){throw Error('A local mean must not call remote proof');}};
const program=check(`data rows=table([{n:demo::Count(1)},{n:demo::Count(2)}]);
 data result=query! {let r=from(rows);r |> project({n:avg(r.n),lo:min(r.n),hi:max(r.n)}) |> take_opt()};
 answer tree! {Answer [if let Some(row)=result [UseValue(ref=row.n)] else []]};`,model);
const fields=program.bindings.get('result')!.type.inner!.fields!;
assert.equal(show(fields.n),'Option(demo::MeanCount)');
assert.equal(show(fields.lo),'Option(demo::Count)');
assert.equal(show(fields.hi),'Option(demo::Count)');
assert.throws(()=>check('data rows=table([{n:demo::Count(1)}]);data result=query! {let r=from(rows);r |> project({n:avg(r.n)}) |> take_opt()};answer tree! {Answer []};',{...model,types:{...model.types,'demo::Count':{...count,meanResult:{kind:'scalar',name:'Int'}}}}),/meanResult requires/);
assert.throws(()=>check('data rows=table([{n:demo::Count(1)}]);data result=query! {let r=from(rows);r |> project({n:avg(r.n)}) |> take_opt()};answer tree! {Answer []};',{...model,types:{...model.types,'demo::Count':{...count,meanResult:undefined}}}),/model-declared floating meanResult/);
const db=new DatabaseSync(':memory:');
try{
 const result=resolve(program,sqlite(db),{},{model:{contractId:model.contractId,implementationId:model.implementationId,execute(){throw Error('Local execution does not call the model');}}});
 assert.deepEqual(result.values.result,{tag:'Some',value:{n:1.5,lo:1,hi:2}});
}finally{db.close();}
console.log('Nominal mean: model-declared floating result, integer extrema, fractional execution and no remote proof/execution passed');
