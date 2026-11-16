import type {SqlRow} from './database.ts';
import type {Type} from './compiler.ts';
import {canonicalIntent,type InputOrigin,type SourceEvidence} from './source.ts';
import type {ModelLocation} from './syntax.ts';
import {createHash} from 'node:crypto';
export const MODEL_ABI_VERSION='dari-model/v3';

export type ValueCodec={variants?:readonly string[];order?:readonly string[];operations?:readonly string[];parse(value:unknown):unknown;encode(value:unknown):unknown;decode(value:unknown):unknown};

// Exported identities are static model symbols, never runtime String parameters.
export type DatasetSymbol = {
    kind:'dataset'; id:string; symbol:string; members:Record<string,MemberSymbol>;
};
export type MemberSymbol = {
    kind:'dimension'|'measure'; id:string; symbol:string; owner:string; type:Type;
};
export type RelationSymbol={kind:'relation';id:string;symbol:string;from:string;to:string;fromCardinality:'One'|'Optional'|'Many0'|'Many1';toCardinality:'One'|'Optional'|'Many0'|'Many1'};
export type NodeType = {kind:'node';index:number;id:string;dataset:DatasetSymbol};
export type QueryExprType =
    {kind:'literal';value:null|boolean|number|string;type:Type} |
    {kind:'parameter';index:number;type:Type} |
    {kind:'member';node:number;member:MemberSymbol} |
    {kind:'mapped_comparison';node:number;member:MemberSymbol;logical:string;value:string;op:'Eq'|'Ne'} |
    {kind:'calendar_bucket';node:number;member:MemberSymbol;conversion?:true;unit:'Year'|'Quarter'|'Month'|'Week'|'Day';timeZone:QueryExprType} |
    {kind:'to_datetime_utc';node:number;member:MemberSymbol} |
    {kind:'utc_bucket';node:number;member:MemberSymbol;conversion?:true;unit:'Year'|'Quarter'|'Month'|'Week'|'Day'} |
    {kind:'output';name:string} |
    {kind:'record';fields:Record<string,QueryExprType>} |
    {kind:'call';name:string;args:QueryExprType[]} |
    {kind:'binary';op:string;left:QueryExprType;right:QueryExprType} |
    {kind:'unary';op:string;value:QueryExprType};
export type QueryOperation =
    {kind:'connect';relation:RelationSymbol;from:number;to:number} |
    {kind:'group_by_identity';node:number} |
    {kind:'filter';predicate:QueryExprType} |
    {kind:'project';value:QueryExprType} |
    {kind:'order_by';terms:{direction:'Asc'|'Desc';value:QueryExprType}[]} |
    {kind:'take';count:number} |
    {kind:'take_opt'};
// This is the dependent query type passed to the model's semantic checker.
export type IntentType = {kind:'query';nodes:NodeType[];root:number;pair?:{left:number;right:number};steps:(QueryOperation&{id:string})[]};
export type ProofReceipt={contractId:string;inputDigest:string;consumedStepIds:string[]};
export type ModelShape = {element:Type;container:'table'|'option';maxRows?:number};
export type CheckedIntent = ModelShape & {plan:unknown;receipt:ProofReceipt};
export type ResultColumn = {name:string;type:string;nullable:boolean};
export type ModelCheckPort = {
    contractId:string;
    implementationId:string;
    types?:Record<string,Type>;
    datasets:Record<string,DatasetSymbol>;
    relations?:Record<string,RelationSymbol>;
    check_type(intent:IntentType,encoded:EncodedIntent):CheckedIntent;
};
/** Backend rows use the published column encoding; execution never re-plans the query. */
export type RemoteResult={rows:SqlRow[];columns:ResultColumn[];max_rows?:number};
/** The adapter owns lowering, backend connections and execution. */
export type ModelExecutionPort={
    contractId:string;
    implementationId:string;
    execute(plan:unknown,parameters:unknown[]):RemoteResult;
};
export type ModelPort=ModelCheckPort & ModelExecutionPort;
export function storage(t:Type):{type:string;nullable:boolean}{
    const nullable=t.kind==='option';let base=nullable?t.inner!:t;
    while(base.kind==='nominal')base=base.inner!;
    if(base.kind!=='scalar')throw Error('Model transport columns require logical scalars');
    return {type:base.name==='Rfc3339'?'DateTimeUtc':base.name==='TimeZone'?'String':base.name!,nullable};
}

// This encodes the complete finite intent. It performs no domain lowering.
export function encodeIntent(intent:IntentType,sourceOf:(value:object)=>SourceEvidence|undefined=()=>undefined){
    const evidence=new WeakMap<object,SourceEvidence>();
    function mark<T extends object>(wire:T,source:object):T{const entry=sourceOf(source);if(entry)evidence.set(wire,entry);return wire;}
    function expression(e:QueryExprType):unknown{return mark(expressionValue(e) as object,e);}
    const constants=new Map<number,unknown>(),parameterTypes=new Map<number,Type>();
    let next=0;
    function scan(e:QueryExprType){if(e.kind==='calendar_bucket')scan(e.timeZone);if(e.kind==='parameter')next=Math.max(next,e.index+1);if(e.kind==='binary'){scan(e.left);scan(e.right);}if(e.kind==='unary')scan(e.value);if(e.kind==='record')Object.values(e.fields).forEach(scan);if(e.kind==='call')e.args.forEach(scan);}
    for(const s of intent.steps){if(s.kind==='filter')scan(s.predicate);if(s.kind==='project')scan(s.value);if(s.kind==='order_by')s.terms.forEach(t=>scan(t.value));}
    function expressionValue(e:QueryExprType):unknown{
        switch(e.kind){
            case 'member':return {kind:e.kind,node:intent.nodes[e.node].id,member:e.member.symbol};
            case 'mapped_comparison':return {kind:e.kind,value:expression({kind:'member',node:e.node,member:e.member}),logical:e.logical,member:e.value,op:e.op};
            case 'calendar_bucket':return {kind:e.kind,value:expression({kind:e.conversion?'to_datetime_utc':'member',node:e.node,member:e.member}),unit:e.unit,timeZone:expression(e.timeZone)};
            case 'to_datetime_utc':return {kind:e.kind,value:expression({kind:'member',node:e.node,member:e.member})};
            case 'utc_bucket':return {kind:e.kind,value:expression({kind:e.conversion?'to_datetime_utc':'member',node:e.node,member:e.member}),unit:e.unit};
            case 'output':return {kind:e.kind,name:e.name};
            case 'record':return {kind:e.kind,fields:Object.entries(e.fields).map(([name,value])=>{const field={name,value:expression(value)},span=sourceOf(e)?.fields?.[name];if(span)evidence.set(field,{span,fields:{name:span}});return field;})};
            case 'call':return {kind:e.kind,name:e.name,args:e.args.map(expression)};
            case 'binary':return {kind:e.kind,op:e.op,left:expression(e.left),right:expression(e.right)};
            case 'unary':return {kind:e.kind,op:e.op,value:expression(e.value)};
            case 'literal':case 'parameter':{
                const index=e.kind==='literal'?next++:e.index;
                if(e.kind==='literal')constants.set(index,e.value);
                parameterTypes.set(index,e.type);
                const base=e.type.kind==='option'?e.type.inner!:e.type;
                const logical=base.modelLogical??(base.kind==='nominal'||base.name==='TimeZone'?base.name:undefined);
                return {kind:'parameter',index,input_type:storage(e.type).type,nullable:e.type.kind==='option',...(logical?{logical}:{})};
            }
            default:throw Error('Unsupported intent expression '+(e as {kind:string}).kind);
        }
    }
    const wire=mark({root:intent.nodes[intent.root].id,...(intent.pair?{pair:{left:intent.nodes[intent.pair.left].id,right:intent.nodes[intent.pair.right].id}}:{}),nodes:intent.nodes.map(n=>mark({id:n.id,dataset:n.dataset.symbol},n)),steps:intent.steps.map(step=>{
        let body:unknown;
        switch(step.kind){
            case 'connect':body={relation:step.relation.symbol,from:intent.nodes[step.from].id,to:intent.nodes[step.to].id};break;
            case 'filter':body=expression(step.predicate);break;
            case 'project':body=expression(step.value);break;
            case 'order_by':body={terms:step.terms.map(t=>({direction:t.direction,value:expression(t.value)}))};break;
            case 'group_by_identity':body={node:intent.nodes[step.node].id};break;
            case 'take':body={count:step.count};break;
            case 'take_opt':body={};break;
            default:throw Error('Unsupported model operation '+(step as {kind:string}).kind);
        }
        if(body&&typeof body==='object'&&!evidence.has(body))mark(body,step);
        return mark({id:step.id,kind:step.kind,body},step);
    })},intent);
    const origins:InputOrigin[]=[];
    function collect(value:unknown,path:(string|number)[],parent?:SourceEvidence['span']){
        const entry=value&&typeof value==='object'?evidence.get(value):undefined,span=entry?.span??parent;
        if(span)origins.push({path,span});
        if(Array.isArray(value))value.forEach((item,i)=>collect(item,[...path,i],span));
        else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){const field=entry?.fields?.[key]??span;if(field)origins.push({path:[...path,key],span:field,key:true});collect(item,[...path,key],field);}
    }
    collect(wire,[]);
    const json=canonicalIntent(wire),digest=createHash('sha256').update(json).digest('hex');
    return {wire,origins,json,digest,constants,parameterTypes};
}

export type EncodedIntent=ReturnType<typeof encodeIntent>;
export function proofTarget(intent:IntentType,contractId:string,encoded:EncodedIntent):ProofReceipt{
    return {contractId,inputDigest:encoded.digest,consumedStepIds:intent.steps.map(s=>s.id)};
}
export function verifyReceipt(actual:ProofReceipt|undefined,expected:ProofReceipt){
    if(!actual||actual.contractId!==expected.contractId||actual.inputDigest!==expected.inputDigest||!Array.isArray(actual.consumedStepIds)||actual.consumedStepIds.length!==expected.consumedStepIds.length||actual.consumedStepIds.some((id,i)=>id!==expected.consumedStepIds[i]))throw Error('Model proof receipt does not cover the complete intent');
}

/** Structured backend diagnostics retain rule locations and temporary input subjects. */
export type ModelDiagnostic={message:string;locs?:ModelLocation[]};
export class ModelCheckFailure extends Error {
 readonly diagnostics:ModelDiagnostic[];
 constructor(diagnostics:ModelDiagnostic[]){super(diagnostics.map(d=>d.message).join('; ')||'Model query validation failed');this.diagnostics=diagnostics;}
}
