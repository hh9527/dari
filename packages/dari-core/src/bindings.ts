import {Fault,type Node} from './syntax.ts';
import type {Diagnostic} from './diagnostics.ts';

// Resolve lexical relation bindings to a DAG of ordinary typed query/select plans.
// This phase resolves names and input dependencies; the compiler/model still owns typing.
type Scope=Map<string,Node>;
type Relation={
 kind:'relation';language:'query'|'select';bindings:Node[];start:Node;steps:Node[];
 branches?:Node[];editorBindings?:Node[];scope:Scope;orderingScope?:Scope;row:Node;projected:boolean;key:object;
};
type Local=Relation|{kind:'value';name:string};
const ref=(name:string,at:number):Node=>({k:'ref',path:[name],at});
const call=(name:string,args:Node[],at:number):Node=>({k:'call',name,args,at});
function fail(n:Node,message:string,details:import('./syntax.ts').FaultDetails={}):never{throw new Fault(message,n.at,details);}
const display=(n:Node)=>String((n.displayPath??n.path)[0]);
const parts=(n:Node)=>n.k==='pipeline'?n:{start:n,steps:[],at:n.at};
const sets=new Set(['union','union_all','intersect','except']);
const joins=new Set(['join','left_join','semi_join','anti_join']);

// Give every lexical binding its own identity before plans are expanded or
// model nodes are hoisted. Resolve each RHS before publishing its new name.
export function resolvePlanNames(block:Node,report?:(diagnostic:Diagnostic)=>void):Node{
 if(!['query','select'].includes(block.k)||block.loweredBindings||block.resolvedNames)return block;
 const names=new Map<string,string>();let next=0;
 const bind=(name:string)=>{const id='@local/'+next+++'/'+name;names.set(name,id);return id;};
 function expression(n:Node):Node{
  if(n.k==='ref'){const name=names.get(n.path[0]);return name?{...n,path:[name,...n.path.slice(1)],displayPath:n.displayPath??n.path}:n;}
  if(n.k==='alias'){const value=expression(n.value);return {...n,value,displayName:n.name,name:bind(n.name)};}
  if(n.k==='pipeline'){const start=expression(n.start),steps=n.steps.map(expression);return {...n,start,steps};}
  if(n.k==='call'){
   const args=n.args.map(expression);
   return {...n,args};
  }
  if(n.k==='binary')return {...n,left:expression(n.left),right:expression(n.right)};
  if(n.k==='unary')return {...n,value:expression(n.value)};
  if(n.k==='object')return {...n,fields:n.fields.map((f:Node)=>({...f,value:expression(f.value)}))};
  if(n.k==='array')return {...n,items:n.items.map(expression)};
  return n;
 }
 const bindings=block.bindings.map((b:Node)=>{
  const value=expression(b.value);
  if(report){
   const aliases:Node[]=[],used=new Set<string>();
   function scan(n:Node){
    if(n.k==='alias'&&n.displayName===b.name)aliases.push(n);
    if(n.k==='ref')used.add(n.path[0]);
    for(const v of Object.values(n)){
     if(Array.isArray(v)){for(const item of v)if(item&&typeof item==='object'&&'k'in item)scan(item);}
     else if(v&&typeof v==='object'&&'k'in v)scan(v as Node);
    }
   }
   scan(value);
   for(const alias of aliases){
    const unused=!used.has(alias.name);
    report({at:alias.nameAt??alias.at,stage:'type',code:'let-alias-shadow',
     message:'let '+b.name+' shadows .as!('+b.name+') after its initializer'+(unused?'; the postfix binding is unused':''),
     reason:'let 在右侧计划处理完成后发布新绑定，遮蔽右侧同名的 .as! 绑定；后续 '+b.name+' 指向整个计划的当前结果，可能已是其他节点',
     suggestion:'源节点与计划使用不同名称，例如 let rows = from(...).as!('+b.name+') |> filter('+b.name+'.field < value); 若只需源节点，写 let '+b.name+' = from(...);'});
   }
  }
  return {...b,value,displayName:b.name,name:bind(b.name)};
 });
 const start=expression(block.start),steps=block.steps.map(expression);
 return {...block,bindings,start,steps,resolvedNames:true};
}

export function hasPlanBindings(n:Node):boolean{
 return ['query','select'].includes(n.k)&&!n.loweredBindings;
}

export function lowerPlanBindings(declaration:Node,fresh:()=>string,globals:ReadonlySet<string>=new Set()):Node[]{
 const block=declaration.value,locals=new Map<string,Local>(),definitions:Node[]=[];
 let aliasIndex=0;const materialized=new Map<object,string>(),captures=new Map<string,string>();
 const alias=(at:number)=>ref('r'+aliasIndex++,at);
 function emit(value:Node,label:string):string{
  const name=fresh();definitions.push({k:'internal_plan',name,value,at:value.at,internal:true,owner:declaration.owner??declaration.name,label});return name;
 }
 function ast(r:Relation):Node{return {k:r.language,bindings:r.bindings,start:r.start,branches:r.branches,steps:r.steps,editorBindings:r.editorBindings,at:block.at,end:block.end,loweredBindings:true};}
 function materialize(r:Relation,label:string):string{
  const previous=materialized.get(r.key);if(previous)return previous;
  const name=emit(ast(r),label);materialized.set(r.key,name);return name;
 }
 function observe(r:Relation,b:Node){
  if(b.nameAt===undefined)return;
  r.editorBindings=[...r.editorBindings??[],{k:'ref',path:r.row.path,displayPath:[b.displayName??b.name],at:b.nameAt,after:r.steps.length}];
 }
 function rewrite(n:Node,scope:Scope):Node{
  if(n.k==='ref'){
   const replacement=scope.get(n.path[0]);
   if(replacement)return {...n,path:[...replacement.path,...n.path.slice(1)],displayPath:n.displayPath??n.path};
   const local=locals.get(n.path[0]);
   if(local?.kind==='value')return {...n,path:[local.name,...n.path.slice(1)]};
   if(local?.kind==='relation')fail(n,'Relation '+display(n)+' is not an input of this plan',{code:'relation-scope',reason:'投影后的字段属于新的结果；远端投影前的字段仍属于具体模型节点',suggestion:'为当前结果绑定名称：let output = input |> project({...}) |> distinct(); output |> order_by(asc(output.field))；多源字段先用 join 或 connect 建立输入'});
   if(globals.has(n.path[0])){
    let name=captures.get(n.path[0]);if(!name){name=emit(ref(n.path[0],n.at),n.path[0]);captures.set(n.path[0],name);}
    return {...n,path:[name,...n.path.slice(1)]};
   }
   if(n.path[0]==='out')fail(n,'Unknown binding out; bind a project result with let and use that name');
   return n;
  }
  if(n.k==='call')return {...n,args:n.args.map((a:Node)=>rewrite(a,scope))};
  if(n.k==='binary')return {...n,left:rewrite(n.left,scope),right:rewrite(n.right,scope)};
  if(n.k==='unary')return {...n,value:rewrite(n.value,scope)};
  if(n.k==='object')return {...n,fields:n.fields.map((f:Node)=>({...f,value:rewrite(f.value,scope)}))};
  if(n.k==='array')return {...n,items:n.items.map((a:Node)=>rewrite(a,scope))};
  return {...n};
 }
 function groupStart(n:Node):never{
  const input=n.args[0],name=input?.k==='ref'?(input.displayPath??input.path).join('.'):'rows';
  if(n.name==='group_by_identity')throw new Fault('group_by_identity requires a pipeline input',n.at,{
   code:'group-by-identity-input',reason:'group_by_identity 是计划算子；完整输入计划放在 |> 左侧，括号内指定该计划中的身份节点',
   suggestion:'写为 let grouped = rows |> group_by_identity('+name+');，随后从 grouped |> project({...}) 继续；rows 是输入计划，'+name+' 是 from/connect 绑定的节点'
  });
  throw new Fault('group_by requires a pipeline input',n.at,{
   code:'group-by-input',reason:'group_by 是关系计划算子；输入关系放在 |> 左侧，括号内只放分组键对象',
   suggestion:'按键分组写为 '+name+' |> group_by({key: '+name+'.field})，随后 |> project({...})；全表计数直接写 '+name+' |> project({n: count()})，无需 group_by({})'
  });
 }
 function fromTable(name:string,at:number):Relation{
  const a=alias(at);
  return {kind:'relation',language:'select',bindings:[{k:'let',name:a.path[0],value:call('from',[ref(name,at)],at),at}],start:a,steps:[],scope:new Map(),row:a,projected:false,key:{}};
 }
 function useRelation(name:string,n:Node):Relation{
  const local=locals.get(name);
  if(!local||local.kind!=='relation')fail(n,'Unknown relation binding '+display(n),{code:'relation-input',reason:'join/set 的输入必须是当前计划中已引入的关系，顶层 data 不是局部关系绑定',suggestion:'先写 let a = from(data_a); let b = from(data_b); 再写 a |> semi_join(b, a.id == b.id) 或 a |> intersect(b)；已有局部关系则核对名称和声明顺序'});
  // Bindings are immutable: composing a plan never alters its sibling branches.
  return {...local,scope:new Map(local.scope),steps:[...local.steps],bindings:[...local.bindings]};
 }
 function inputForProjection(n:Node):Relation{
  const found=new Set<string>();
  function scan(v:Node){
   if(v.k==='ref'&&v.path.length>1&&locals.get(v.path[0])?.kind==='relation')found.add(v.path[0]);
   if(v.k==='call')v.args.forEach(scan);
   if(v.k==='object')v.fields.forEach((f:Node)=>scan(f.value));
   if(v.k==='binary'){scan(v.left);scan(v.right);}if(v.k==='unary')scan(v.value);if(v.k==='array')v.items.forEach(scan);
  }
  n.args.forEach(scan);
  if(found.size!==1)fail(n,found.size?'project references multiple input relations; bind their join/Relation explicitly, then use joined |> project({...})':'project has no unambiguous input relation; use input |> project({...})');
  const name=[...found][0];return useRelation(name,n);
 }
 function combine(left:Relation,n:Node):Relation{
  const pair=n.name==='pair',joined=joins.has(n.name),right=n.args[0];
  if(n.args.length!==(joined?2:1)||right?.k!=='ref'||right.path.length!==1)fail(n,n.name+' requires a pipeline input and a bound right relation'+(joined?', followed by a condition':''),{code:'relation-input',suggestion:'先 let a = from(data_a); let b = from(data_b); 再 a |> '+n.name+'(b'+(joined?', a.id == b.id':'')+')'});
  const inputs=[left,useRelation(right.path[0],right)];
  if(inputs[0].key===inputs[1].key)fail(n,'Use distinct bound relation inputs; introduce a separate from(...) binding for a self join');
  if(pair){
   if(block.k!=='query'||inputs.some(r=>r.language!=='query'||r.projected||r.steps.length))fail(n,'pair requires two independent bound model nodes');
   const scope=new Map<string,Node>(),bindings=inputs.flatMap(r=>r.bindings);
   inputs.forEach(r=>{for(const [key,value]of r.scope)scope.set(key,value);});
   return {kind:'relation',language:'query',bindings,start:call('pair',inputs.map(r=>r.row),n.at),steps:[],scope,row:inputs[0].row,projected:false,key:{}};
  }
  if(n.name==='union_all'&&inputs.every(r=>r.language==='query'&&r.projected&&!r.steps.some(step=>['take','top','take_opt','pivot'].includes(step.name)))){
   const branches=inputs.flatMap(r=>r.branches&&r.steps.length===0?r.branches:[{...ast(r),at:r.steps.at(-1)!.at,end:r.steps.at(-1)!.end}]);
   return {kind:'relation',language:'query',bindings:[],start:n,branches,steps:[],
    scope:new Map(),row:ref('out',n.at),projected:true,key:{}};
  }
  if(block.k==='query'&&inputs.some(r=>r.language==='query'&&!r.projected))fail(n,'Model nodes join through an explicit published Relation using connect; query results join in query!');
  const scope=new Map<string,Node>(),bindings:Node[]=[],members:Node[]=[];
  inputs.forEach((r,i)=>{
   const a=alias(n.at),source=materialize(r,i?'right input':'left input');
   bindings.push({k:'let',name:a.path[0],value:call('from',[ref(source,n.at)],n.at),at:n.at});
   for(const [name,value]of r.scope){
    if(joined&&scope.has(name))fail(n,'Join inputs share a relation binding; introduce independent from(...) bindings');
    scope.set(name,value.path[0]==='out'||value.path[0]===r.row.path[0]&&r.start.k==='ref'?a:{...a,path:[...a.path,...value.path]});
   }
   members.push(a);
  });
  const start:Node={k:'combine',name:n.name,inputs:members,condition:joined?rewrite(n.args[1],scope):undefined,at:n.at};
  const resultScope=joined?scope:new Map([...left.scope.keys()].map(name=>[name,ref('out',n.at)]));
  return {kind:'relation',language:'select',bindings,start,steps:[],scope:resultScope,row:ref('out',n.at),projected:!joined,key:{}};
 }
 function apply(input:Relation,operation:Node):Relation{
  if(joins.has(operation.name)||sets.has(operation.name)||operation.name==='pair')return combine(input,operation);
  if(input.steps.some(s=>s.name==='pivot'))fail(operation,'pivot is terminal');
  let r={...input,steps:[...input.steps],scope:new Map(input.scope)};
  if(operation.name==='connect'&&r.language==='query'&&!r.projected){
   const args=operation.args;
   if(args.length!==3||args.slice(1).some((v:Node)=>v.k!=='ref'||v.path.length!==1))fail(operation,'connect requires a Relation symbol and two bound nodes');
   for(const endpoint of args.slice(1)){
    if(r.scope.has(endpoint.path[0]))continue;
    const other=useRelation(endpoint.path[0],endpoint);
    if(other.language!=='query'||other.projected||other.steps.length)fail(endpoint,'connect endpoints must be bound model nodes');
    r.bindings.push(...other.bindings.filter((b:Node)=>!r.bindings.some((a:Node)=>a.name===b.name)));
    r.scope.set(endpoint.path[0],other.row);
   }
  }
  // Preserve model ownership of ordering/selection whenever it can consume the
  // complete query; post-projection transforms become ordinary SQL plan nodes.
  if(r.language==='query'&&r.projected&&(!['order_by','take','top','take_opt','pivot'].includes(operation.name)||r.steps.some((s:Node)=>['take','top','take_opt'].includes(s.name)))){
   // Keep remote ordering/take inside its acquisition boundary. A local
   // successor consumes bounded rows, never a fragment of remote SQL.
   const scope=r.scope,name=materialize(r,'query projection');
   const definition=definitions.find(d=>d.name===name);
   if(definition)definition.remoteSplit??=operation;
   r=fromTable(name,operation.at);
   for(const key of scope.keys())r.scope.set(key,r.row);
  }
  const operationScope=operation.name==='order_by'?new Map([...r.orderingScope??[],...r.scope]):r.scope;
  const step=rewrite(operation,operationScope);
  if(operation.name==='connect'&&r.language==='query'){
   const endpoints=step.args.slice(1);
   const peer=endpoints.find((v:Node)=>v.path[0]!==r.row.path[0]);
   if(peer)r.row=peer;
  }
  r.steps.push(step);
  if(operation.name==='project'){
   r.orderingScope=r.scope;r.projected=true;r.row=ref('out',operation.at);
   // A projected relation has only its own named output; source row names
   // remain lexical bindings but cannot silently turn into projected columns.
   r.scope=new Map();
  }
  if(operation.name!=='project'&&operation.name!=='order_by')r.orderingScope=undefined;
  r.key={};return r;
 }
 function expression(value:Node):Relation{
  const part=parts(value),binding=part.start.k==='alias'?part.start:undefined;
  const start=binding?.value??part.start,steps=part.steps;let relation:Relation;
  if(start.k==='call'&&['group_by','group_by_identity'].includes(start.name))groupStart(start);
  if(start.k==='alias')relation=expression(start);
  else if(start.k==='ref'&&start.path.length===1)relation=useRelation(start.path[0],start);
  else if(start.k==='call'&&start.name==='from'&&block.k==='query'){
   const a=alias(start.at);relation={kind:'relation',language:'query',bindings:[{k:'let',name:a.path[0],value:start,at:start.at}],start:a,steps:[],scope:new Map(),row:a,projected:false,key:{}};
  }else if(start.k==='call'&&start.name==='from'){
   if(start.args.length!==1||start.args[0].k!=='ref'||start.args[0].path.length!==1)fail(start,'from requires a bound table');
   const arg=start.args[0],local=locals.get(arg.path[0]);
   relation=local?.kind==='relation'?fromTable(materialize(local,arg.path[0]),start.at):fromTable(arg.path[0],start.at);
  }else if(start.k==='call'&&start.name==='project')relation=apply(inputForProjection(start),start);
  else if(start.k==='call'&&(joins.has(start.name)||sets.has(start.name)||start.name==='pair'))fail(start,start.name+' requires a pipeline input; use left |> '+start.name+'(right'+(joins.has(start.name)?', condition':'')+')');
  else fail(start,'A relation plan starts with a bound relation, from(...) or an unambiguous project({...})');
  if(binding){
   relation.scope.set(binding.name,relation.row);observe(relation,binding);locals.set(binding.name,relation);
  }
  for(const operation of steps){
   let step=operation;const bindings:Node[]=[];
   while(step.k==='alias'){bindings.unshift(step);step=step.value;}
   relation=apply(relation,step);
   for(const binding of bindings){relation.scope.set(binding.name,relation.row);observe(relation,binding);locals.set(binding.name,relation);}
  }
  return relation;
 }
 for(const binding of block.bindings){
  const {start}=parts(binding.value);
  const plan= binding.value.k==='pipeline'||start.k==='alias'||start.k==='call'&&['from','project','pair',...joins,...sets].includes(start.name)||start.k==='ref'&&locals.get(start.path[0])?.kind==='relation';
  if(!plan){if(start.k==='call'&&['group_by','group_by_identity'].includes(start.name))groupStart(start);const name=emit(rewrite(binding.value,new Map()),binding.name);definitions.at(-1)!.editorBinding=binding;locals.set(binding.name,{kind:'value',name});continue;}
  const relation=expression(binding.value);
  relation.scope.set(binding.name,relation.row);
  observe(relation,binding);locals.set(binding.name,relation);
 }
 const result=expression({k:'pipeline',start:block.start,steps:block.steps,at:block.at});
 if((joins.has(result.start.name)||result.language==='query')&&!result.projected)fail(block,'Return a projected relation with named output fields');
 return [...definitions,{...declaration,value:ast(result)}];
}
