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
