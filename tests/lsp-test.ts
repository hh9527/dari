import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {LanguageServer} from '../packages/dari/src/lsp/server.ts';
import {serveLsp} from '../packages/dari/src/lsp/transport.ts';
import {positionAt} from '../packages/dari/src/lsp/protocol.ts';
import {createFixtureModel} from '../packages/dari-core/src/testing/model.ts';
const notifications:any[]=[];
const server=new LanguageServer({},(method,params)=>notifications.push({method,params}));
const uri='file:///workspace/sample.dari';
function open(text:string){server.handle('textDocument/didOpen',{textDocument:{uri,text,version:1,languageId:'dari'}});}
function ask(method:string,text:string,at:number):any{open(text);return server.handle('textDocument/'+method,{textDocument:{uri},position:positionAt(text,at)});}
assert.equal((server.handle('initialize',{}) as any).capabilities.positionEncoding,'utf-16');
open('data a=missing;data b=other;answer tree! {Answer []};');assert.equal(notifications.at(-1).params.diagnostics.length,2);
const text='data a=42;data b=a+1;answer tree! {Answer [UseValue(ref=b)]};';
assert.match(ask('hover',text,text.indexOf('a+1')).contents.value,/Int/);
assert.equal(ask('definition',text,text.indexOf('a+1')).range.start.character,5);
const local='data samples=table([{name:"a",value:1}]);data rows=query! {let a=from(samples);let result=a |> project({name:a.name,value:a.value});result |> order_by(asc(result.name)) |> take(1)};answer tree! {Answer [Table(data=rows)]};';
assert.equal(ask('definition',local,local.indexOf('a.name')).range.start.character,local.indexOf('a=from'));
const complete=local.replace('a.name','a.');
const items=ask('completion',complete,complete.indexOf('a.')+2).items;
assert(items.some((i:any)=>i.label==='name'),JSON.stringify(items));assert(items.some((i:any)=>i.label==='value'));
const selector='data rows=table([{name:"A",value:1}]);answer tree! {Answer [Table(data=rows,spec={columns:[$.]})]};';
assert(ask('completion',selector,selector.indexOf('$.')+2).items.some((i:any)=>i.label==='value'));
const emoji='data title="中文😀";data a=missing;answer tree! {Answer []};';open(emoji);assert.equal(notifications.at(-1).params.diagnostics[0].range.start.character,emoji.indexOf('missing'));
server.handle('textDocument/didChange',{textDocument:{uri,version:2},contentChanges:[{range:{start:{line:0,character:emoji.indexOf('missing')},end:{line:0,character:emoji.indexOf('missing')+7}},text:'1'}]});assert.equal(notifications.at(-1).params.diagnostics.length,0);
const remote='data rows=query_remote! {let d=from(demo::DeviceKpi);let result=d |> project({name:d.name});result |> order_by(asc(result.name)) |> take(1)};answer tree! {Answer []};';open(remote);assert(notifications.at(-1).params.diagnostics.some((d:any)=>d.code==='model-unavailable'&&d.severity===2));
const {model}=createFixtureModel();const location={uri:'file:///model/catalog.txt',range:{start:{line:0,character:0},end:{line:0,character:4}}};const remoteServer=new LanguageServer({checker:model,symbols:{'demo::DeviceKpi.name':location}});remoteServer.handle('textDocument/didOpen',{textDocument:{uri,text:remote,version:1}});assert.equal(model.implementationId,'dari-fixture-implementation-v2');
assert.deepEqual(remoteServer.handle('textDocument/definition',{textDocument:{uri},position:positionAt(remote,remote.indexOf('d.name')+2)}),location);
const remoteIncomplete=remote.replace('d.name','d.');remoteServer.handle('textDocument/didChange',{textDocument:{uri,version:2},contentChanges:[{text:remoteIncomplete}]});
assert((remoteServer.handle('textDocument/completion',{textDocument:{uri},position:positionAt(remoteIncomplete,remoteIncomplete.indexOf('d.')+2)}) as any).items.some((i:any)=>i.label==='cpu_usage'));
const input=new PassThrough(),output=new PassThrough();let data=Buffer.alloc(0);output.on('data',chunk=>data=Buffer.concat([data,chunk]));const running=serveLsp(input,output);
const frame=(v:any)=>{const body=JSON.stringify(v);return Buffer.from('Content-Length: '+Buffer.byteLength(body)+'\r\n\r\n'+body);};
const message=frame({jsonrpc:'2.0',id:1,method:'initialize',params:{}});input.write(message.subarray(0,8));input.write(message.subarray(8));input.end(Buffer.concat([frame({jsonrpc:'2.0',id:2,method:'shutdown'}),frame({jsonrpc:'2.0',method:'exit'})]));await running;
assert.match(data.toString(),/"id":1/);assert.match(data.toString(),/"id":2/);assert.match(data.toString(),/dari/);
console.log('LSP: shared diagnostics/types, local definitions, incomplete member completion, UTF-16 edits, offline proof status and framed transport passed');

// Declaration hovers use compiler-owned lexical binding types, before any use.
for(const [name,offset,pattern] of [
 ['a',local.indexOf('a=from'),/name: String/],
 ['result',local.indexOf('result=a'),/value: Int/],
 ['a',local.indexOf('a.name'),/name: String/]
] as const){const hover=ask('hover',local,offset);assert(hover,`${name} hover missing at ${offset}`);assert.match(hover.contents.value,pattern);}
const block='data x=do {let n=1;let m=n+1;m};answer tree! {Answer [UseValue(ref=x)]};';
assert.match(ask('hover',block,block.indexOf('n=1')).contents.value,/n: Int/);
const shadow='data input=table([{id:1}]);data rows=query! {let r=from(input);let r=r |> project({label:"A"});r |> order_by(asc(r.label)) |> take(1)};answer tree! {Answer []};';
assert.match(ask('hover',shadow,shadow.indexOf('r=from')).contents.value,/id: Int/);
assert.match(ask('hover',shadow,shadow.indexOf('r=r')).contents.value,/label: String/);
const alias=local.replace('let a=from(samples);','let unused=from(samples).as!(a);');
assert.match(ask('hover',alias,alias.indexOf('as!(a)')+4).contents.value,/name: String/);
remoteServer.handle('textDocument/didOpen',{textDocument:{uri,text:remote,version:3}});
for(const offset of [remote.indexOf('d=from'),remote.indexOf('result=d')])assert((remoteServer.handle('textDocument/hover',{textDocument:{uri},position:positionAt(remote,offset)}) as any)?.contents.value);
const stageAlias=local.replace('let result=a |> project({name:a.name,value:a.value});','let unused=a |> project({name:a.name,value:a.value}).as!(result);');
assert.match(ask('hover',stageAlias,stageAlias.indexOf('as!(result)')+4).contents.value,/value: Int/);
const remoteAlias=remote.replace('let d=from(demo::DeviceKpi);','let unused=from(demo::DeviceKpi).as!(d);');
remoteServer.handle('textDocument/didOpen',{textDocument:{uri,text:remoteAlias,version:4}});
assert.match((remoteServer.handle('textDocument/hover',{textDocument:{uri},position:positionAt(remoteAlias,remoteAlias.indexOf('as!(d)')+4)}) as any).contents.value,/cpu_usage:/);

// Tree node and attribute names carry their component contract, not lexical names.
const tree='data rows=table([{name:"A",n:1}]);data value=42;report report=tree! {Report(title="Summary") [p [UseValue(ref=value,precision=1)],Table(data=rows)]};answer tree! {Answer [UseReport(ref=report)]};';
assert.match(ask('hover',tree,tree.indexOf('Report(title')).contents.value,/Report\(/);
assert.match(ask('hover',tree,tree.indexOf('Table(data')).contents.value,/data: Table\(Schema\)/);
assert.match(ask('hover',tree,tree.indexOf('data=rows')).contents.value,/Table\.data: Table\(Schema\(\{name: String, n: Int\}\)\)/);
assert.match(ask('hover',tree,tree.indexOf('ref=value')).contents.value,/UseValue\.ref: Int/);
assert.match(ask('hover',tree,tree.indexOf('precision=')).contents.value,/可选.*小数位数/);
assert.match(ask('hover',tree,tree.indexOf('title=')).contents.value,/Report\.title: String/);
assert.match(ask('hover',tree,tree.indexOf('p [')).contents.value,/段落/);
assert.equal(ask('hover',tree,tree.indexOf('"Summary"')+2),null);
const brokenTree=tree.replace('data=rows','data=missing');
assert.match(ask('hover',brokenTree,brokenTree.indexOf('data=missing')).contents.value,/Table\.data: Table\(Schema\)/);
const chartHost:any={contractId:'lsp-test',components:['TestChart'],functions:{},reportStyle:'',checkFigure(){},renderFigure(){return {kind:'chart',content:''}}};
const chartServer=new LanguageServer({options:{host:chartHost}}),chart='data rows=table([{n:1}]);answer tree! {Answer [TestChart(data=rows,spec={value:$.n})]};';
chartServer.handle('textDocument/didOpen',{textDocument:{uri,text:chart,version:1}});
const chartHover=(offset:number)=>chartServer.handle('textDocument/hover',{textDocument:{uri},position:positionAt(chart,offset)}) as any;
assert.match(chartHover(chart.indexOf('TestChart(')).contents.value,/宿主.*TestChart/);
assert.match(chartHover(chart.indexOf('data=rows')).contents.value,/n: Int/);
assert.match(chartHover(chart.indexOf('spec=')).contents.value,/Schema/);

// Native types and host enums come from the checker catalogue, including members.
const timeHost:any={contractId:'time-hover',components:[],functions:{},reportStyle:'',types:{TimeUnit:{kind:'nominal',name:'TimeUnit',inner:{kind:'scalar',name:'String'},codec:{variants:['Day','Week']}}}};
const timeServer=new LanguageServer({options:{host:timeHost,contextType:{kind:'schema',fields:{epochMillis:{kind:'scalar',name:'EpochMillis'},timeZone:{kind:'option',inner:{kind:'scalar',name:'String'}}}}}});
const time='data ctx=context! {now:Context::Now,tz:Context::ClientTz};data unit=TimeUnit::Day;data dates=calendar_period(LocalDate("2026-02-01"),CalendarUnit::Week);answer tree! {Answer []};';
timeServer.handle('textDocument/didOpen',{textDocument:{uri,text:time,version:1}});
const timeHover=(word:string,offset=0)=>timeServer.handle('textDocument/hover',{textDocument:{uri},position:positionAt(time,time.indexOf(word)+offset)}) as any;
assert.match(timeHover('TimeUnit::Day').contents.value,/TimeUnit::Day: TimeUnit/);
assert.match(timeHover('TimeUnit::Day',10).contents.value,/TimeUnit::Day: TimeUnit/);
assert.match(timeHover('Context::Now').contents.value,/Context::Now: EpochMillis/);
assert.match(timeHover('Context::ClientTz').contents.value,/TimeZone/);
assert.match(timeHover('CalendarUnit::Week').contents.value,/CalendarUnit::Week: CalendarUnit/);
assert.match(timeHover('LocalDate(').contents.value,/type LocalDate/);
const completions=(timeServer.handle('textDocument/completion',{textDocument:{uri},position:positionAt(time,time.indexOf('TimeUnit::Day'))}) as any).items;
for(const name of ['TimeUnit','TimeUnit::Day','Context','Context::Now','CalendarUnit::Week','DateStyle::Date','DateOverflow::Clamp'])assert(completions.some((item:any)=>item.label===name),name);
for(const [word,pattern]of [['TimeUnit',/enum TimeUnit.*Day, Week/],['Context',/Context::Now: EpochMillis/],['DateStyle',/Date, DateTime, Time/],['Weekday',/Monday.*Sunday/],['TimeUnit::Missing',null]] as const){
 const source='data value='+word+';answer tree! {Answer []};';timeServer.handle('textDocument/didOpen',{textDocument:{uri,text:source,version:2}});const hover=timeServer.handle('textDocument/hover',{textDocument:{uri},position:positionAt(source,source.indexOf(word))}) as any;
 if(pattern)assert.match(hover.contents.value,pattern);else assert.equal(hover,null);
}
