import {analyze,show,type Program,type Type, type CheckOptions} from '@local/dari-core';
import {builtinTypes,contextSelectors,builtinComponents,commonAttributes,tokenize,Fault,type Token} from '@local/dari-core';
import type {Integration} from '../integration.ts';
import {offsetAt,positionAt,rangeAt,type Position} from './protocol.ts';
import {formatType,renderDataHover,renderHover,renderTypeHover,trimText,type HoverContent} from './hover.ts';

type Entry={name:string;at:number;end:number;visible:number;scope:number;scopeEnd:number;kind:string};
type Document={uri:string;text:string;version:number;program?:Program;entries:Entry[]};
const keywords=['data','type','report','answer','let','query!','query_remote!','tree!','context!','do','if','else','Some','None','True','False'];
const functions=['from','project','filter','group_by','group_by_identity','order_by','asc','desc','take','take_opt','connect','pair','join','left_join','semi_join','anti_join','union','union_all','intersect','except','distinct','top_per','count','sum','avg','min','max','lookup','unwrap_or!','not_none','is_some','is_none','is_empty','map_opt','ratio','growth_rate','difference','round','concat','case_when','contains','not_contains','starts_with','ends_with','in_subnet','not_in_subnet','to_datetime_utc','to_epoch_millis','to_datetime_tz','utc_bucket','calendar_bucket','date_of','month_of','year_of','day_of','week_of','date_range','at_zone'];
const typeConstructors:Record<string,string>={Schema:'Schema({field: Type, ...})：具名记录类型',Table:'Table(Schema({...}))：表类型',Option:'Option(T)：可空标量或可选行类型'};
const components=Object.keys(builtinComponents);
function entries(source:string):Entry[]{
 let tokens:Token[];try{tokens=tokenize(source);}catch(error){if(!(error instanceof Fault))throw error;tokens=tokenize(source.slice(0,error.at));}
 const result:Entry[]=[],scopes:{start:number;end:number}[]=[{start:0,end:source.length}],stack=[0];
 const braces:number[]=[];
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i],next=tokens[i+1];
  if(t.text==='{'){
   const isScope=tokens[i-1]?.text==='do'||tokens[i-1]?.text==='!'&&['query','query_remote'].includes(tokens[i-2]?.text);
   if(isScope){scopes.push({start:t.at,end:source.length});stack.push(scopes.length-1);braces.push(scopes.length-1);}else braces.push(-1);
  }else if(t.text==='}'){
   const scope=braces.pop();if(scope!==undefined&&scope>=0){scopes[scope].end=t.at;stack.pop();}
  }
  const declared=['data','type','report','let'].includes(t.text)&&next?.kind==='id'&&tokens[i+2]?.text!=='(';
  const alias=t.text==='as'&&next?.text==='!'&&tokens[i+2]?.text==='('&&tokens[i+3]?.kind==='id';
  if(declared||alias){const name=alias?tokens[i+3]:next,scope=stack.at(-1)!;let visible=name.at+name.text.length;
   if(!alias){let depth=0;for(let j=i+2;j<tokens.length;j++){if(['(','[','{'].includes(tokens[j].text))depth++;if([')',']','}'].includes(tokens[j].text))depth--;if(tokens[j].text===';'&&depth===0){visible=tokens[j].at+1;break;}}}
   result.push({name:name.text,at:name.at,end:name.at+name.text.length,visible,scope,scopeEnd:0,kind:alias?'let':t.text});
  }
 }
 return result.map(e=>({...e,scope:scopes[e.scope].start,scopeEnd:scopes[e.scope].end}));
}
function wordAt(text:string,at:number){const part=(i:number)=>/[A-Za-z_0-9]/.test(text[i]??'')||text[i]===':'&&(text[i-1]===':'||text[i+1]===':');let start=at,end=at;while(start>0&&part(start-1))start--;while(end<text.length&&part(end))end++;return {start,end,name:text.slice(start,end)};}
function visible(doc:Document,at:number){return doc.entries.filter(e=>(e.scope===0||e.scope<=at&&at<=e.scopeEnd)&&(e.visible<=at||e.at<=at&&at<=e.end));}
function declaration(doc:Document,name:string,at:number){return visible(doc,at).filter(e=>e.name===name).sort((a,b)=>b.scope-a.scope||b.at-a.at)[0];}
function typeOf(doc:Document,name:string,at:number):Type|undefined {
 const symbol=declaration(doc,name,at);
 if(symbol?.scope===0)return doc.program?.bindings.get(name)?.type??doc.program?.types.get(name);
 const checked=doc.program?.references.find(r=>r.at===symbol?.at&&r.path[0]===name);
 if(checked)return checked.rootType;
 const refs=doc.program?.references.filter(r=>r.path[0]===name&&(!symbol||r.at>=symbol.visible&&r.at<=symbol.scopeEnd)&&declaration(doc,name,r.at)?.at===symbol?.at)??[];
 return refs.find(r=>r.at>=at)?.rootType??refs.at(-1)?.rootType;
}

/** Uses the compiler's partial analysis, not a parallel editor type system. */
export class LanguageServer {
 readonly documents=new Map<string,Document>();
 shutdown=false;
 private integrationRef:Integration;
 get integration():Integration{return this.integrationRef;}
 setIntegration(next:Integration){this.integrationRef=next;}
 readonly notify:(method:string,params:unknown)=>void;
 constructor(integration:Integration={},notify:(method:string,params:unknown)=>void=()=>{}){this.integrationRef=integration;this.notify=notify;}
 private analyze(doc:Document){
  if(Buffer.byteLength(doc.text)>262144){this.notify('textDocument/publishDiagnostics',{uri:doc.uri,version:doc.version,diagnostics:[{range:rangeAt(doc.text,0,1),severity:1,source:'dari',message:'Document exceeds 256 KiB'}]});return;}
  const result=analyze(doc.text,this.integration.checker,this.integration.options);doc.program=result.program;doc.entries=entries(doc.text);
  const findings=[...result.diagnostics,...result.program?.warnings??[]];
  this.notify('textDocument/publishDiagnostics',{uri:doc.uri,version:doc.version,diagnostics:findings.map(d=>({range:rangeAt(doc.text,d.at,d.end!==undefined?d.end-d.at:wordAt(doc.text,d.at).end-d.at||1),severity:d.code==='model-unavailable'||result.program?.warnings.includes(d)?2:1,source:'dari',code:d.code??d.stage,...(d.related?{data:{modelLocations:d.related}}:{}),message:[d.message,d.reason&&'原因：'+d.reason,d.suggestion&&'修复建议：'+d.suggestion].filter(Boolean).join('\n')}))});
 }
 handle(method:string,params:any):unknown {
  if(method==='initialize')return {capabilities:{positionEncoding:'utf-16',textDocumentSync:{openClose:true,change:2},completionProvider:{triggerCharacters:['.',':','$']},hoverProvider:true,definitionProvider:true,documentSymbolProvider:true},serverInfo:{name:'dari',version:'0.1.0'}};
  if(method==='shutdown'){this.shutdown=true;return null;}
  if(this.shutdown)throw Error('Server has shut down');
  if(method==='initialized'||method==='$/cancelRequest'||method==='workspace/didChangeConfiguration')return null;
  if(method==='textDocument/didOpen'){const d=params.textDocument;const doc:Document={uri:d.uri,text:d.text,version:d.version,entries:[]};this.documents.set(doc.uri,doc);this.analyze(doc);return null;}
  if(method==='textDocument/didClose'){this.documents.delete(params.textDocument.uri);this.notify('textDocument/publishDiagnostics',{uri:params.textDocument.uri,diagnostics:[]});return null;}
  const doc=this.documents.get(params?.textDocument?.uri);if(!doc)return null;
  if(method==='textDocument/didChange'){
   if(params.textDocument.version<=doc.version)return null;
   for(const change of params.contentChanges){const start=change.range?offsetAt(doc.text,change.range.start):0,end=change.range?offsetAt(doc.text,change.range.end):doc.text.length;doc.text=doc.text.slice(0,start)+change.text+doc.text.slice(end);}
   doc.version=params.textDocument.version;this.analyze(doc);return null;
  }
  const at=params.position?offsetAt(doc.text,params.position):0;
  if(method==='textDocument/completion')return this.complete(doc,at);
  if(method==='textDocument/hover'){
   const word=wordAt(doc.text,at);
   const range=rangeAt(doc.text,word.start,word.end-word.start);
   const reply=(content:HoverContent)=>({contents:renderHover(content),range});
   for(const node of doc.program?.treeNodes??[]){
    if(node.at===word.start&&node.name===word.name&&node.contract){
     const c=node.contract,attrs={...c.attributes,...commonAttributes};
     const signature=node.name+'('+Object.entries(c.attributes).map(([key,a])=>key+(a.required?'':'?')).join(', ')+')';
     const details=Object.entries(attrs).map(([key,a])=>'`'+key+'`'+(a.required?'（必填）':'（可选）')+'：`'+a.type+'` — '+trimText(a.description));
     return reply({signature,description:c.description,details});
    }
    const attr=node.attributes.find(a=>a.at===word.start&&a.name===word.name),contract=attr&&(node.contract?.attributes[attr.name]??commonAttributes[attr.name]);
    if(attr&&contract)return reply({signature:node.name+'.'+attr.name,type:formatType(attr.type??contract.type),description:(contract.required?'必填 · ':'可选 · ')+trimText(contract.description)});
   }
   const ref=doc.program?.references.find(r=>r.at<=word.start&&r.at+(r.path.join('.').length)>=word.end);
   const type=ref?(word.start===ref.at?ref.rootType:ref.type):typeOf(doc,word.name,at);
   const model=this.integration.checker,dataset=model?.datasets[word.name];
   const types=new Map([...Object.entries(builtinTypes),...Object.entries(this.integration.options?.host?.types??{}),...Object.entries(model?.types??{}),...doc.program?.types??[]]);
   const published=types.get(word.name),split=word.name.lastIndexOf('::'),enumName=word.name.slice(0,split),member=word.name.slice(split+2),enumType=split>=0?types.get(enumName):undefined;
   const context=Object.hasOwn(contextSelectors,word.name)?contextSelectors[word.name]:undefined;
   if(context)return reply({signature:word.name,type:formatType(context.type),description:context.description});
   if(!type&&word.name==='Context')return reply({signature:'Context',description:'context! 的上下文选择器命名空间',details:Object.entries(contextSelectors).map(([name,c])=>'`Context::'+name+'`：`'+formatType(c.type)+'` — '+trimText(c.description))});
   if(!type&&enumType?.codec?.variants?.includes(member))return {contents:renderTypeHover(word.name,formatType(enumType)),range};
   if(!type&&published?.codec?.variants)return {contents:renderTypeHover(word.name,published.inner?formatType(published.inner):'String',['取值：'+published.codec.variants.join('、')]),range};
   if(type)return {contents:renderDataHover(word.name,formatType(type)),range};
   if(published)return {contents:renderTypeHover(word.name,formatType(published.fields?published:published.inner??published)),range};
   if(!type&&Object.hasOwn(typeConstructors,word.name))return reply({signature:word.name,description:typeConstructors[word.name]});
   if(dataset)return reply({signature:'Dataset '+dataset.symbol,details:Object.entries(dataset.members).map(([name,m])=>'`'+name+'`：`'+formatType(m.type)+'`')});
   return null;
  }
  if(method==='textDocument/definition'){
   const word=wordAt(doc.text,at),ref=doc.program?.references.find(r=>r.at<=word.start&&r.at+r.path.join('.').length>=word.end);
   const external=this.integration.symbols?.[ref?.symbol??word.name];if(external)return external;
   const symbol=declaration(doc,word.name,word.start);return symbol?{uri:doc.uri,range:rangeAt(doc.text,symbol.at,symbol.end-symbol.at)}:null;
  }
  if(method==='textDocument/documentSymbol')return doc.entries.filter(e=>e.scope===0).map(e=>({name:e.name,kind:e.kind==='type'?5:13,detail:doc.program?.bindings.get(e.name)?show(doc.program.bindings.get(e.name)!.type):e.kind,range:rangeAt(doc.text,e.at,e.end-e.at),selectionRange:rangeAt(doc.text,e.at,e.end-e.at)}));
  return undefined;
 }
 private complete(doc:Document,at:number){
  const prefix=doc.text.slice(0,at);
  const selector=/\$\.([A-Za-z_0-9]*)$/.exec(prefix);
  if(selector){
   let tokens:Token[]=[];try{tokens=tokenize(prefix);}catch(error){if(error instanceof Fault)tokens=tokenize(prefix.slice(0,error.at));else throw error;}
   const opens:number[]=[];for(let i=0;i<tokens.length;i++){if(tokens[i].text==='(')opens.push(i);if(tokens[i].text===')')opens.pop();}
   const start=opens.at(-1);let data:string|undefined;
   if(start!==undefined)for(let i=start+1;i<tokens.length-2;i++)if(tokens[i].text==='data'&&tokens[i+1].text==='='&&tokens[i+2].kind==='id'){data=tokens[i+2].text;break;}
   const row=data?doc.program?.bindings.get(data)?.type.inner:undefined;
   return {isIncomplete:!row,items:Object.entries(row?.fields??{}).filter(([name])=>name.startsWith(selector[1])).map(([label,t])=>({label,kind:5,detail:show(t)}))};
  }
  const match=/([A-Za-z_][A-Za-z_0-9]*)(?:\.([A-Za-z_][A-Za-z_0-9]*))*\.([A-Za-z_0-9]*)$/.exec(prefix);
  if(match){
   const start=match.index,path=prefix.slice(start).split('.'),partial=path.pop()!;
   // Recover an unfinished field with a bare row reference, then ask the same checker.
   const repaired=doc.text.slice(0,start)+path.join('.')+doc.text.slice(at),proof=analyze(repaired,this.integration.checker,this.integration.options);
   const ref=proof.program?.references.find(r=>r.at===start),known=typeOf(doc,path[0],at);
   let type=ref?.type??known;
   if(!ref)for(const part of path.slice(1))type=type?.fields?.[part];
   return {isIncomplete:!type,items:Object.entries(type?.fields??{}).filter(([name])=>name.startsWith(partial)).map(([label,t])=>({label,kind:5,detail:show(t)}))};
  }
  const model=this.integration.checker,items=new Map<string,any>();
  const add=(label:string,kind:number,detail?:string)=>items.set(label,{label,kind,detail});
  keywords.forEach(name=>add(name,14));functions.forEach(name=>add(name,3));Object.keys(typeConstructors).forEach(name=>add(name,7));
  [...components,...this.integration.options?.host?.components??[]].forEach(name=>add(name,7));
  visible(doc,at).forEach(e=>add(e.name,e.kind==='type'?7:6,typeOf(doc,e.name,at)?show(typeOf(doc,e.name,at)!):e.kind));
  Object.keys(model?.datasets??{}).forEach(name=>add(name,6,'Dataset'));
  Object.keys(model?.relations??{}).forEach(name=>add(name,6,'Relation'));
  add('Context',9,'context! 选择器命名空间');
  for(const [name,c]of Object.entries(contextSelectors))add(name,20,show(c.type));
  const types=new Map([...Object.entries(builtinTypes),...Object.entries(this.integration.options?.host?.types??{}),...Object.entries(model?.types??{}),...doc.program?.types??[]]);
  for(const [name,type]of types){add(name,7,show(type));type.codec?.variants?.forEach(v=>add(name+'::'+v,20));}
  return {isIncomplete:false,items:[...items.values()]};
 }
}
