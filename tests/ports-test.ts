import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {check,analyze,show} from '../packages/dari-core/src/compiler.ts';
import {resolve} from '../packages/dari-core/src/runtime.ts';
import {sqlite} from '../packages/dari/src/adapters/sqlite.ts';
import {createFixtureModel} from '../packages/dari-core/src/testing/model.ts';
import {sharedTypes} from '../packages/dari-core/src/shared-types.ts';
const db=new DatabaseSync(':memory:');
const {model,stats}=createFixtureModel(sqlite(db));
const {execute,...checker}=model;
const executor={contractId:model.contractId,implementationId:model.implementationId,execute};
const source='data rows=query_remote! {let d=from(demo::DeviceKpi);let result=d |> project({name:d.name,cpu:d.cpu_usage});result |> order_by(desc(result.cpu)) |> top(2)};answer tree! {Answer [Table(data=rows)]};';
const p=check(source,checker);assert.equal(stats.checks,1);assert.equal(stats.executions,0);assert(!('execute'in checker));
try{
 db.exec("CREATE TABLE devices(id TEXT,name TEXT,cpu REAL,tenant TEXT);INSERT INTO devices VALUES('a','A',10,'x'),('b','B',50,'x')");
 const result=resolve(p,sqlite(db),{},{model:executor});assert.equal(stats.checks,1);assert.equal(stats.executions,1);assert.match(result.answer,/B/);
 assert.throws(()=>resolve(p,sqlite(db)),/Model contract changed/);
 assert.throws(()=>resolve(p,sqlite(db),{},{model:{...executor,implementationId:'changed'}}),/Model contract changed/);
 const local=check('data x=Ratio(0.12);answer tree! {Answer [UseValue(ref=x)]};');
 assert.equal(resolve(local,sqlite(db)).answer,'*12%*');assert.equal(show(local.bindings.get('x')!.type),'Ratio');assert(!sharedTypes.Ratio.codec!.operations!.includes('Sum'));
 const counted={...checker,check_type(...args:Parameters<typeof checker.check_type>){
  return {...checker.check_type(...args),hasTotal:true};
 }};
 const page=check(source.replace('top(2)','take(1)'),counted);
 const withTotal={...executor,execute(plan:unknown,parameters:unknown[],includeTotal?:boolean){
  assert.equal(includeTotal,true);
  return {...execute(plan,parameters),total:2};
 }};
 const delivered=resolve(page,sqlite(db),{},{model:withTotal});
 assert.match(delivered.answer,/共 2 条，展示 1 条/);
 assert.match(delivered.dataDocument,/共 2 条，展示 1 条/);
 const localCounts=(operator:string, predicate:string)=>resolve(check(
  `data src=table([{n:1},{n:2},{n:3}]);
   data page=query! {from(src).as!(r) |> filter(r.n>${predicate}) |> project({n:r.n}).as!(out) |> order_by(asc(out.n)) |> ${operator}(2)};
   answer tree! {Answer [Table(data=page,spec={allow_no_data:True}),UseValue(ref=page.fetched_count),UseValue(ref=page.total_count)]};`
 ),sqlite(db));
 assert.match(localCounts('take','0').answer,/共 3 条，展示 2 条/);
 assert.match(localCounts('top','0').answer,/共 2 条/);
 assert.match(localCounts('take','3').answer,/共 0 条/);
 assert.throws(()=>check(source.replace('top(2)','take(2)'),checker),/exact total/);
 const cleaned=source.split('answer tree!')[0].replace('top(2)','take(1)')+
  'data clean=query! {let r=from(rows);let out=r |> project({name:r.name});out |> order_by(asc(out.name))};'+
  'report summary=tree! {Report(title="Summary") [Table(data=clean)]};answer tree! {Answer [UseReport(ref=summary)]};';
 const report=resolve(check(cleaned,counted),sqlite(db),{},{model:withTotal});
 assert.match(report.artifacts['summary.html'],/<p>共 2 条，展示 1 条<\/p>/);
 assert.match(report.dataDocument,/共 2 条，展示 1 条/);
 assert.doesNotMatch(report.dataDocument,/远端按|表内按|[↑↓]/);
 const inherited=cleaned.replace('take(1)','take(2)').replace('out |> order_by(asc(out.name))','out');
 const inheritedReport=resolve(check(inherited,counted),sqlite(db),{},{model:withTotal});
 assert.deepEqual(inheritedReport.values.clean,[{name:'B'},{name:'A'}]);
 assert.doesNotMatch(inheritedReport.dataDocument,/表内按/);
 const sorted=cleaned.replace('project({name:r.name})','project({name:r.name,rate:r.cpu})')
  .replace('out |> order_by(asc(out.name))','out')
  .replace('Table(data=clean)','Table(data=clean,spec={labels:{rate:"CPU"}})');
 const sortedReport=resolve(check(sorted,counted),sqlite(db),{},{model:withTotal});
 assert.match(sortedReport.artifacts['summary.html'],/<th>CPU ↓<\/th>/);
 assert.match(sortedReport.dataDocument,/CPU ↓/);
 assert.doesNotMatch(inheritedReport.dataDocument,/[↑↓]/);
 const repeated=sorted.replace('};report summary',' |> order_by(desc(out.rate))};report summary');
 const repeatedReport=resolve(check(repeated,counted),sqlite(db),{},{model:withTotal});
 assert.match(repeatedReport.dataDocument,/CPU ↓/);
 const reversed=resolve(check(repeated.replace('desc(out.rate)','asc(out.rate)'),counted),sqlite(db),{},{model:withTotal});
 assert.doesNotMatch(reversed.dataDocument,/[↑↓]/);
 const wrong={...checker,check_type(...args:Parameters<typeof checker.check_type>){const result=checker.check_type(...args);result.receipt={...result.receipt,consumedStepIds:[]};return result;}};
 assert.throws(()=>check(source,wrong),/receipt/);
 const partial=analyze('data a=1;data b=missing;answer tree! {Answer []};');assert.equal(partial.program!.bindings.get('a')!.type.name,'Int');assert.equal(partial.diagnostics.length,1);
}finally{db.close();}
console.log('Independent ports: check has no execution, runtime has no re-planning, receipts/identities and shared semantic types passed');
