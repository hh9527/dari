import assert from 'node:assert/strict';
import {analyze,check} from '../packages/dari-core/src/compiler.ts';
import {ModelCheckFailure,encodeIntent} from '../packages/dari-core/src/model.ts';
import {SourceOffsets,canonicalIntent} from '../packages/dari-core/src/source.ts';
import {createFixtureModel} from '../packages/dari-core/src/testing/model.ts';
import {LanguageServer} from '../packages/dari/src/lsp/server.ts';
const {model}=createFixtureModel();
const source='# 中文😀\r\ndata rows=query_remote! {\r\n from(demo::DeviceKpi).as!(device)\r\n |> project({label:device.name,cpu:device.cpu_usage})\r\n |> order_by(desc(device.cpu_usage)) |> take(2)\r\n};answer tree! {Answer []};';
let recorded:ReturnType<typeof encodeIntent>;
check(source,{...model,check_type(intent,encoded){recorded=encoded;return model.check_type(intent,encoded);}});
const offsets=new SourceOffsets(source),wire:any=recorded!.wire;
for(const [name,expr]of [['label','device.name'],['cpu','device.cpu_usage']]){
 const index=wire.steps.findIndex((s:any)=>s.kind==='project'),field=wire.steps[index].body.fields.findIndex((f:any)=>f.name===name),path=['steps',index,'body','fields',field,'value','member'];
 const origin=recorded!.origins.find(o=>!o.key&&JSON.stringify(o.path)===JSON.stringify(path));
 assert(origin,'missing member origin');assert.deepEqual(offsets.toChars(origin.span),{start:source.indexOf(expr),end:source.indexOf(expr)+expr.length});
 const key=recorded!.origins.find(o=>!o.key&&JSON.stringify(o.path)===JSON.stringify(['steps',index,'body','fields',field,'name']));
 assert.deepEqual(offsets.toChars(key!.span),{start:source.indexOf(name+':'),end:source.indexOf(name+':')+name.length});
}
const located=recorded!.origins.find(o=>!o.key&&o.path.at(-1)==='member')!;
const rule={source:'ontology/check',start:{line:9,offset:2},end:{line:9,offset:8}},input={source:'<input>',start:{line:0,offset:located.span.start},end:{line:0,offset:located.span.end}};
const failure={...model,check_type(){throw new ModelCheckFailure([{message:'not permitted',locs:[rule,input]},{message:'another error',locs:[input]}]);}};
const result=analyze(source,failure);assert.equal(result.diagnostics.length,2);
for(const d of result.diagnostics){assert.equal(d.at,source.indexOf('device.name'));assert.equal(d.end,d.at+'device.name'.length);assert.deepEqual(d.related?.[0],d.message==='not permitted'?rule:input);}
const notes:any[]=[];const server=new LanguageServer({checker:failure},(method,params)=>notes.push({method,params}));
server.handle('textDocument/didOpen',{textDocument:{uri:'file:///source.dari',text:source,version:1}});
const ds=notes.at(-1).params.diagnostics;assert.equal(ds.length,2);assert.equal(ds[0].range.end.character-ds[0].range.start.character,'device.name'.length);assert.deepEqual(ds[0].data.modelLocations,[input]);
const bad={...model,check_type(){throw new ModelCheckFailure([{message:'invalid location',locs:[{source:'<input>',start:{offset:2},end:{offset:3}}]}]);}};
assert.equal(analyze(source,bad).diagnostics[0].at,source.indexOf('query_remote!'));
assert.equal(offsets.toChars({start:2,end:3}),undefined);assert.equal(offsets.toChars({start:0,end:0}),undefined);
assert.deepEqual(new SourceOffsets('abc').toChars({start:0,end:1}),{start:0,end:1});
assert.equal(canonicalIntent({z:1,a:{z:2,a:'中\r\n😀'}}),'\u007b"a":{"a":"中\\r\\n😀","z":2},"z":1}');
const shifted=source.replace('# 中文😀','# different');
let shiftedEncoded:typeof recorded;
check(shifted,{...model,check_type(intent,encoded){shiftedEncoded=encoded;return model.check_type(intent,encoded);}});
assert.equal(recorded!.digest,shiftedEncoded!.digest);assert.notDeepEqual(recorded!.origins,shiftedEncoded!.origins);
console.log('Model source spans: UTF-8/UTF-16, CRLF, postfix bindings, projection keys, structured multi-diagnostics, LSP ranges and position-independent receipts passed');
