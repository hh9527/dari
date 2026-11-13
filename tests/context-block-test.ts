import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {check} from '../packages/dari-core/src/compiler.ts';
import {resolve} from './support.ts';
import {sqlite} from '../packages/dari/src/adapters/sqlite.ts';
import {sharedTypes} from '../packages/dari-core/src/shared-types.ts';
const db=new DatabaseSync(':memory:');
const contextType={kind:'schema',fields:{epochMillis:sharedTypes.EpochMillis,timeZone:{kind:'option',inner:{kind:'scalar',name:'String'}}}};
const source=`data ctx = context! { now: Context::Now, tz: Context::ClientTz };
data again = context! { instant: Context::Now };
data result = do {
 let offset = 2;
 let shifted = do { let n = offset + 3; n * 2 };
 {first: ctx.now, second: again.instant, zone: ctx.tz, count: shifted}
};
answer tree! { Answer [UseValue(ref = result.first), UseValue(ref = result.second), UseValue(ref = result.zone), UseValue(ref = result.count)] };`;
const program=check(source,undefined,{contextType});
assert.equal(program.bindings.get('ctx')!.type.fields!.tz.name,'TimeZone');
assert.equal(program.bindings.get('result')!.type.fields!.count.name,'Int');
let captures=0;
const execution={get context(){captures++;return {epochMillis:captures*1000,timeZone:'Asia/Shanghai'};}};
assert.deepEqual(resolve(program,sqlite(db),{},execution).values.result,{first:1000,second:1000,zone:'Asia/Shanghai',count:10});
assert.equal(captures,1);
assert.deepEqual(resolve(program,sqlite(db),{},execution).values.result,{first:2000,second:2000,zone:'Asia/Shanghai',count:10});
assert.equal(captures,2);
const onlyNow=check('data c=context! { t: Context::Now }; answer tree! {Answer [UseValue(ref =c.t)]};',undefined,{contextType});
assert.equal(resolve(onlyNow,sqlite(db),{}, {context:{epochMillis:1,timeZone:null}}).values.c.t,1);
assert.throws(()=>resolve(program,sqlite(db),{}, {context:{epochMillis:1,timeZone:null}}),/invalid model scalar/);
assert.throws(()=>resolve(program,sqlite(db),{}, {context:{epochMillis:1,timeZone:'Mars/Olympus'}}),/invalid model scalar/);
for(const [expression,expected] of [
 ['do { let c=context! { t:Context::Now }; c }',/pure calculations/],
 ['do { let q=query_remote! {let a=from(demo::x);a}; q }',/pure calculations/],
 ['do { let x=1; let x=2; x }',/Duplicate local/],
 ['do { let x=y; let y=1; x }',/Unknown binding y/],
 ['context! { x: Context::Unknown }',/Context selection/],
 ['context! { x: Context::Now, x: Context::Now }',/Duplicate context/],
 ['{x: context! { t:Context::Now }}',/directly initialize/]
] as const)assert.throws(()=>check(`data result=${expression}; answer tree! {Answer []};`,undefined,{contextType}),expected);
assert.throws(()=>check('data x=do {let inner=1;inner};data y=inner;answer tree! {Answer []};'),/Unknown binding inner/);
db.close();
console.log('Context selection and pure do blocks passed');
