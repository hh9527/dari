import {memberDirectory,type DirectoryMember} from './member-directory.ts';
import {encodePart,type SemanticGraph} from './knowledge-graph.ts';
import {knowledgePoints} from './point-knowledge.ts';
import {semanticId} from './semantic-id.ts';
import {lexicalQuery,matchLexical,normalizeLexical} from './knowledge-match.ts';

const record=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const fields=(texts:string[])=>texts.map(text=>({field:'name',text,weight:1}));
const unique=(texts:string[])=>[...new Set(texts)];
type Points=ReturnType<typeof knowledgePoints>;
type Point=Points extends Map<string,infer P>?P:never;
type Property={name:string;field:string;dimensions:string[];measures:string[];counters:string[];types:string[]};
type Candidate={entity:string;dataset:string;subject:string;property:Property;words:string[]};
type DiscoveryIndex={points:Points;entities:Map<string,string[]>;properties:Candidate[];values:Point[]};
const cache=new WeakMap<SemanticGraph,DiscoveryIndex>();
function discoveryIndex(graph:SemanticGraph):DiscoveryIndex {
  const cached=cache.get(graph);if(cached)return cached;
  const points=knowledgePoints(graph),entities=new Map<string,string[]>(),properties:Candidate[]=[];
  for(const p of points.values())if(p.kind==='Entity')entities.set(p.id,p.words);
  for(const [name,dataset] of Object.entries(graph.datasets)){
    if(!Array.isArray(dataset.subjects)||!Array.isArray(dataset.props))continue;
    const datasetId=semanticId('datasets/'+encodePart(name));
    for(const subject of dataset.subjects){
      if(!record(subject)||typeof subject.entity!=='string'||typeof subject.field!=='string')throw new Error('Invalid conceptual subject in '+datasetId);
      const entity=semanticId(subject.entity),subjectField=semanticId(subject.field);
      if(!entities.has(entity)||!points.has(subjectField))throw new Error('Unresolved conceptual subject in '+datasetId);
      entities.set(entity,unique([...entities.get(entity)!,...(points.get(datasetId)?.names??[])]));
      for(const raw of dataset.props){
        if(!record(raw)||typeof raw.name!=='string'||typeof raw.field!=='string'||['dimensions','measures','counters','types'].some(k=>!Array.isArray(raw[k])||raw[k].some((s:unknown)=>typeof s!=='string')))throw new Error('Invalid conceptual property in '+datasetId);
        const property:Property={name:raw.name,field:semanticId(raw.field),dimensions:raw.dimensions.map(semanticId),measures:raw.measures.map(semanticId),counters:raw.counters.map(semanticId),types:raw.types};
        const refs=[property.field,...property.dimensions,...property.measures,...property.counters];
        if(refs.some(ref=>!points.has(ref)))throw new Error('Unresolved conceptual property in '+datasetId);
        properties.push({entity,dataset:datasetId,subject:subjectField,property,words:unique([property.name,...refs.flatMap(ref=>points.get(ref)?.words??[])])});
      }
    }
  }
  const result={points,entities,properties,values:[...points.values()].filter(p=>p.kind==='Value')};cache.set(graph,result);return result;
}
function terms(raw:unknown,key:string,optional=false):string[]{
  if(raw===undefined&&optional)return [];
  if(!Array.isArray(raw)||raw.length>12||raw.some(s=>typeof s!=='string'||!s.trim()||s.length>200))throw new Error(key+' requires an array of at most 12 nonempty terms (200 characters each)');
  return unique(raw.map(s=>s.trim()));
}
/** Conceptual discovery returns existing query addresses; it never invents joins or grants operations. */
function discoverQuery(graph:SemanticGraph,args:Record<string,unknown>){
  if(!record(args)||Object.keys(args).some(k=>!['entity','member','value'].includes(k)))throw new Error('each query accepts {entity:string,member?:[...],value?:[...]}');
  if(typeof args.entity!=='string'||!args.entity.trim()||args.entity.length>200)throw new Error('query entity requires one nonempty term (at most 200 characters)');
  const entity=[args.entity],props=terms(args.member,'member',true),values=terms(args.value,'value',true);
  if(!props.length&&!values.length)throw new Error('provide at least one member or value term');
  const index=discoveryIndex(graph),matchedEntities=new Map<string,{q:string;score:number}[]>();
  const unmatched:{entity:string[];member:string[];value:string[]}={entity:[],member:[],value:[]};
  let classificationMatches: {candidate:Candidate; dimension:string; value:Point}[]=[];
  for(const q of entity){
    const query=lexicalQuery(q),hits=[...index.entities].map(([id,words])=>({id,score:matchLexical(query,fields(words)).score})).filter(h=>h.score>0).sort((a,b)=>b.score-a.score||compare(a.id,b.id));
    if(!hits.length){
      const exactValues=index.values.filter(value=>
        [decodeURIComponent(value.id.split('/').at(-1)!),...value.names]
          .some(name=>normalizeLexical(name.trim())===query.phrase));
      classificationMatches=index.properties.flatMap(candidate=>exactValues
        .filter(value=>candidate.property.types.includes(value.root))
        .flatMap(value=>candidate.property.dimensions
          .filter(id=>{
            const fact=index.points.get(id)!.fact;
            return fact.filterable===true&&fact.type===value.root&&fact.ops?.includes('Eq');
          })
          .map(dimension=>({candidate,dimension,value}))));
      for(const {candidate} of classificationMatches)matchedEntities.set(candidate.entity,[{q,score:1}]);
      if(!classificationMatches.length)unmatched.entity.push(q);
    }
    for(const hit of hits)matchedEntities.set(hit.id,[...(matchedEntities.get(hit.id)??[]),{q,score:hit.score}]);
  }
  const matchedDatasets=new Set(classificationMatches.map(({candidate})=>candidate.entity+'\n'+candidate.dataset));
  const candidates=index.properties.filter(p=>matchedDatasets.size
    ?matchedDatasets.has(p.entity+'\n'+p.dataset)
    :matchedEntities.has(p.entity));
  const selected=new Map<Candidate,{props:string[];values:{q:string;id:string;type:string;facts:Record<string,any>}[]}>();
  const select=(p:Candidate)=>{let match=selected.get(p);if(!match)selected.set(p,match={props:[],values:[]});return match;};
  for(const {candidate} of classificationMatches)select(candidate);
  for(const q of props){
    const query=lexicalQuery(q),hits=candidates.map(p=>({p,score:matchLexical(query,fields(p.words)).score})).filter(h=>h.score>0).sort((a,b)=>b.score-a.score||compare(a.p.entity+'/'+a.p.dataset+'/'+a.p.property.name,b.p.entity+'/'+b.p.dataset+'/'+b.p.property.name));
    if(!hits.length)unmatched.member.push(q);
    for(const hit of hits)select(hit.p).props.push(q);
  }
  for(const q of values){
    const query=lexicalQuery(q),hits=index.values.map(p=>({p,score:matchLexical(query,fields(p.words)).score})).filter(h=>h.score>0&&candidates.some(c=>c.property.types.includes(h.p.root))).sort((a,b)=>b.score-a.score||compare(a.p.id,b.p.id));
    if(!hits.length)unmatched.value.push(q);
    for(const hit of hits)for(const p of candidates)if(p.property.types.includes(hit.p.root))select(p).values.push({q,id:hit.p.id,type:hit.p.root,facts:hit.p.fact});
  }
  const results=[...selected].map(([p,matched])=>({
    ...p.property,entity:p.entity,dataset:p.dataset,subject:p.subject,matched,
    classifications:classificationMatches.filter(match=>match.candidate===p).map(({dimension,value})=>({dimension,variant:decodeURIComponent(value.id.split('/').at(-1)!)})),
    entries:unique([...p.property.dimensions,...p.property.measures,...p.property.counters]).map(id=>{
      const fact=index.points.get(id)!.fact;
      const type=typeof fact.type==='string'?fact.type
        :['Count','CountDistinct'].includes(fact.aggregate)?'Int'
        :typeof fact.output_type==='string'?({Integer:'Int',Number:'Float',Text:'String',Boolean:'Bool'} as Record<string,string>)[fact.output_type]??fact.output_type
        :p.property.types.length===1?p.property.types[0]:'未声明类型';
      return {id,type,kind:id.includes('/dimensions/')?'dimension':'measure'};
    })
  })).sort((a,b)=>compare(a.entity+'/'+a.dataset+'/'+a.name,b.entity+'/'+b.dataset+'/'+b.name));
  return {entities:[...matchedEntities].map(([id,matched])=>({id,matched})),results,unmatched};
}

export function discoverConcepts(graph:SemanticGraph,args:Record<string,unknown>){
  if(!record(args)||Object.keys(args).some(k=>k!=='queries')||!Array.isArray(args.queries)||!args.queries.length||args.queries.length>12)throw new Error('discover accepts {queries:[{entity:string,member?:[...],value?:[...]}]} with 1..12 queries');
  return {queries:args.queries.map(query=>{
    if(!record(query))throw new Error('each discovery query must be an object');
    return {query,...discoverQuery(graph,query)};
  })};
}

export function renderConcepts(_args:unknown,value:{data:ReturnType<typeof discoverConcepts>;contracts?:Record<string,{dataset?:string;symbol?:string;type?:string;variants?:string[]}>;clocks?:Record<string,string>}){
  const classificationLines=new Map<string,Set<string>>();
  const publicMembers=new Map<string,Map<string,DirectoryMember>>();
  const clockLines=new Map<string,string>();
  const groups=new Map<string,Map<string,Map<string,string>>>();
  for(const query of value.data.queries)for(const item of query.results){
    let datasets=groups.get(item.entity);
    if(!datasets)groups.set(item.entity,datasets=new Map());
    const dataset=item.entries.map(entry=>value.contracts?.[entry.id]?.dataset).find(Boolean)??item.dataset;
    let entries=datasets.get(dataset);
    if(!entries)datasets.set(dataset,entries=new Map());
    for(const {dimension,variant} of item.classifications){
      const contract=value.contracts?.[dimension];
      const symbol=contract?.variants?.find(name=>name.endsWith('::'+variant));
      if(!contract?.symbol||!symbol)continue;
      let conditions=classificationLines.get(dataset);
      if(!conditions)classificationLines.set(dataset,conditions=new Set());
      conditions.add('- 分类条件：`'+contract.symbol+' == '+symbol+'`');
    }
    const clockId=value.clocks?.[item.dataset];
    const clock=clockId?value.contracts?.[clockId]:undefined;
    if(clock?.symbol&&clock.type)clockLines.set(dataset,`- 主时间维度：\`${clock.symbol}: ${clock.type}\`，支持窗口筛选`);
    for(const entry of item.entries){
      if(entry.id===clockId&&clock?.symbol&&clock.type)continue;
      const contract=value.contracts?.[entry.id];
      const name=contract?.dataset&&contract?.symbol ? contract.symbol : entry.id;
      if(contract?.dataset&&contract.symbol&&contract.type){
        let members=publicMembers.get(contract.dataset);
        if(!members)publicMembers.set(contract.dataset,members=new Map());
        members.set(name,{kind:entry.kind as DirectoryMember['kind'],symbol:name,type:contract.type});
      }else entries.set(entry.kind+' '+name,contract?.type??entry.type);
    }
  }
  const lines:string[]=[];
  for(const [entity,datasets] of [...groups].sort(([a],[b])=>compare(a,b))){
    lines.push('# '+entity,'');
    for(const [dataset,entries] of [...datasets].sort(([a],[b])=>compare(a,b))){
      const members=publicMembers.get(dataset);
      const clockLine=clockLines.get(dataset);
      const notes=[...(clockLine?[clockLine]:[]),...(classificationLines.get(dataset)??[])];
      if(members?.size)lines.push(...memberDirectory(dataset,[...members.values()],2,true,notes),'');
      else lines.push('## '+dataset,'',...notes);
      for(const [name,type] of [...entries].sort(([a],[b])=>compare(a,b)))lines.push('- '+name+': '+type);
      lines.push('');
    }
  }
  for(const result of value.data.queries){
    for(const [kind,words] of Object.entries(result.unmatched))if(words.length)lines.push(result.query.entity+' · '+kind+' 无命中: '+words.join(', '));
  }
  if(!groups.size)lines.push('未找到符合条件的属性映射。');
  return [{type:'text' as const,text:lines.join('\n').trim()}];
}
