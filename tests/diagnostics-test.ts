import assert from 'node:assert/strict';
import {check} from '../packages/dari-core/src/compiler.ts';
import {DiagnosticFailure,modelErrorText} from '../packages/dari-core/src/diagnostics.ts';
function failure(source:string){try{check(source);assert.fail('Expected diagnostics');}catch(error){assert(error instanceof DiagnosticFailure);return error;}}
const syntax=failure(`answer tree! { Answer [
 UseValue(value: concat("x)","y")),
 UseValue(value: 2),
 UseValue(value: 3)
]};`);
assert.equal(syntax.diagnostics.length,3);
assert.match(syntax.message,/CheckFailed\n-----------/);
assert.match(syntax.message,/L2:/);assert.match(syntax.message,/L3:/);assert.match(syntax.message,/L4:/);
assert.match(syntax.message,/修复建议：tree!/);
assert(!syntax.message.includes('Missing attribute'));
const semantic=failure(`data bad=missing;
data dependent=bad + 1;
data fields={a:firstMissing,b:secondMissing};
answer tree! { Answer [p [UseValue(ref = thirdMissing),UseValue(ref = fourthMissing)]]};`);
assert.equal(semantic.diagnostics.length,5);
assert(!semantic.message.includes('Unknown binding bad'));
assert(!semantic.message.includes('One data answer'));
const mixed=failure('data bad = ;\ndata valid = 42;\ndata other = notDefined;\nanswer tree! {Answer [UseValue(ref = valid)]};');
assert.equal(mixed.diagnostics.length,2);
assert(!mixed.message.includes('Unknown binding valid'));
const types=failure('type Bad=Schema({a:Missing,b:OtherMissing});data input:Bad=input();answer tree! { Answer []};');
assert.equal(types.diagnostics.length,2);
const capped=failure(Array.from({length:25},(_,i)=>'data x'+i+' = missing'+i+';').join('\n')+'\nanswer tree! {Answer []};');
assert.equal(capped.diagnostics.length,25);
assert.equal((capped.message.match(/^- L/gm)??[]).length,20);
assert.match(capped.message,/另有 5 条错误/);
assert.equal(modelErrorText(JSON.stringify([{message:'unsupported comparison',locs:[{x:1}]}])),'unsupported comparison');
check('answer tree! { Answer [p ["正常"]]};');
console.log('DARI-style diagnostics: sibling syntax recovery, independent errors, upstream suppression, text/suggestions and bounded receipts passed');

// Unknown attribute names are diagnosed before interpreting their values/specs.
let hostCalls=0;
const host:any={contractId:'attribute-locations',components:['StackedBarChart'],functions:{},reportStyle:'',checkFigure(){hostCalls++;throw Error('spec is incomplete');},renderFigure(){throw Error('unused');}};
const chartSource='data sev_long=table([{n:1}]);answer tree! {Answer [\nStackedBarChart(data = sev_long, spec1 = {missing_field: absent})\n]};';
const chart=(()=>{try{check(chartSource,undefined,{host});assert.fail('Expected unknown attribute');}catch(error){assert(error instanceof DiagnosticFailure);return error;}})();
assert.equal(chart.diagnostics.length,1);assert.equal(chart.diagnostics[0].at,chartSource.indexOf('spec1'));
assert.match(chart.message,/Unknown figure attribute spec1/);assert.equal(hostCalls,0);
const attributes='answer tree! {Answer [p(title1="A",lang1="zh"),UseValue(ref1=missing)]};';
const unknown=failure(attributes);assert.equal(unknown.diagnostics.length,3);
for(const name of ['title1','lang1','ref1'])assert.equal(unknown.diagnostics.find(d=>d.message.includes(name))!.at,attributes.indexOf(name));
assert(!unknown.message.includes('Missing attribute'));assert(!unknown.message.includes('Unknown binding missing'));
const invalidData='answer tree! {Answer [Table(data = 42)]};';assert.equal(failure(invalidData).diagnostics[0].at,invalidData.indexOf('42'));

// A failed check retains independent warnings, including those preceding a bad plan.
const combinedSource=`data input=table([{n:1}]);
data warned=query! {let r=from(input).as!(r);r |> order_by(asc(r.n)) |> top(2)};
data bad=query! {let g=group_by_identity(a);g};
data other=unknown_value;
answer tree! {Answer [p ["固定 3 项"]]};`;
const combined=failure(combinedSource);
const errors=combined.diagnostics.filter(d=>d.severity!=='warning');
const warnings=combined.diagnostics.filter(d=>d.severity==='warning');
assert(errors.some(d=>d.code==='group-by-identity-input'));
assert(errors.some(d=>d.message.includes('unknown_value')));
assert.deepEqual(warnings.map(d=>d.code).sort(),['let-alias-shadow','numeric-text']);
assert.match(combined.message,/Warnings\n--------/);
assert.match(combined.message,/rows \|> group_by_identity\(a\)/);
assert.equal(errors.find(d=>d.code==='group-by-identity-input')!.at,combinedSource.indexOf('group_by_identity'));
assert(!combined.message.includes('Relation a is not an input'));
assert.equal(check('answer tree! {Answer [p ["固定 3 项"]]};').warnings[0].severity,'warning');
