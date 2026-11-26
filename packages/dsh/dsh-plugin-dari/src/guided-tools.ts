import {encodePart,semanticId} from '@local/dari-model';
import {ENABLE_KNOWLEDGE_SEARCH} from '@local/dari-model';
import {discoverConcepts,renderConcepts} from '@local/dari-model';
import {renderInfo} from '@local/dari-model';
import {renderSearch,renderRoutes} from '@local/dari-model';
import {searchPoints,routePoints} from '@local/dari-model';
import { readPoints } from '@local/dari-model';
import { isRecord, type ToolDefinition, type ToolExec } from '@local/dari-model';
import type { Knowledge } from '@local/dari-model';
import {readWindow} from '@local/dari-model';
const readTextLines=(text:string,rel:string,offset:unknown,limit:unknown,_tool:string)=>readWindow([text],rel,offset,limit);
import { helpFiles, helpEntries } from './help-files.ts';
import { OBJECT_OUTPUT, renderWorkRead } from '@local/dari-model';

/** Agent surface: fixed knowledge queries; typed relation expressions stay in data analysis drafts. */
export function guidedTools(definitions: ToolDefinition[], knowledge: Knowledge, infoContracts?: (points:any[],exec:ToolExec)=>Promise<Record<string,unknown>>): ToolDefinition[] {
  const files = { ...helpFiles };
  const check = (args: unknown, allowed: string[]): Record<string, unknown> => {
    if (!isRecord(args) || Object.keys(args).some(k => !allowed.includes(k))) throw new Error('Use only the declared tool parameters: ' + allowed.join(', '));
    return args;
  };
  const method = async (name:string,args:Record<string,unknown>,exec:ToolExec) => {
    exec.signal?.throwIfAborted();
    const entry=knowledge.ensureWorkspace(exec);
    const index=await knowledge.ensureIndex(entry);
    exec.signal?.throwIfAborted();
    if(name==='info'){
      let data=readPoints(index.knowledge,{ids:args.ids});
      const ids=[...new Set(args.ids as string[])];
      const requests=new Map<string,string>();
      if(infoContracts){
        const symbols=data.errors?.filter(error=>error.id.includes('::')&&!error.id.includes('/')&&error.id.split('.').length<=2&&!error.id.endsWith('.'))??[];
        if(symbols.length){
          const publicTypes=new Map(Array.from(index.canonicalTypeIds??[],([id,canonical])=>['types/'+encodePart(canonical),id]));
          const publicId=(id:string)=>{
            const [root,type,...path]=id.split('/');
            if(root!=='types')return id;
            return [publicTypes.get(root+'/'+type)??root+'/'+type,...path].join('/');
          };
          const locations=await infoContracts(symbols.map(({id})=>{
            const [symbol,member]=id.split('.');
            return {id,kind:'Symbol',symbol,member};
          }),exec) as Record<string,{knowledgeId?:string}>;
          for(const id of ids){
            const location=locations[id]?.knowledgeId;
            if(location)requests.set(id,publicId(location));
          }
          data=readPoints(index.knowledge,{ids:ids.map(id=>requests.get(id)??id)});
        }
      }
      if(infoContracts&&data.items.length){
        const points=data.items.map(item=>{
          const point:any={id:item.id,kind:item.kind};
          for(const key of ['dataset','dimension','measure','relation'])if(item[key]!==undefined)point[key]=item[key];
          if(item.kind==='Entity')point.datasets=Object.entries(index.knowledge.datasets).filter(([,d])=>Array.isArray(d.subjects)&&d.subjects.some((s:any)=>semanticId(s.entity)===item.id)).map(([id])=>id);
          if(item.kind==='Type')point.type=item.id;
          if(item.kind==='Value'&&item.id.startsWith('types/')){const parts=item.id.split('/');point.type=parts.slice(0,2).join('/');point.variant=decodeURIComponent(parts[3]);}
          const canonical=point.type&&index.canonicalTypeIds?.get(point.type);
          if(canonical)point.type='types/'+encodePart(canonical);
          if(item.kind==='Field'&&item.dataset){
            const d=index.knowledge.datasets[item.dataset];point.members=[];
            for(const [section,kind] of [['dimensions','dimension'],['measures','measure']])for(const [id,m] of Object.entries((d?.[section]??{}) as Record<string,any>))if(typeof m.field==='string'&&semanticId(m.field)===item.id)point.members.push({id,kind});
          }
          return point;
        });
        const contracts=await infoContracts(points,exec);
        for(const item of data.items){
          item.dari=contracts[item.id];
          const field=item.facts.predicate?.field;
          if(item.kind!=='Measure'||typeof field!=='string')continue;
          const dataset=index.knowledge.datasets[item.dataset];
          if(!dataset)continue;
          const anchor='datasets/'+encodePart(item.dataset)+'/fields/'+encodePart(field);
          const dimensions=Object.entries((dataset.dimensions??{}) as Record<string,{field?:string}>)
            .filter(([,dimension])=>dimension.field&&semanticId(dimension.field)===anchor);
          if(dimensions.length===1)item.predicateMember=dimensions[0][0];
        }
      }
      const items=new Map(data.items.map(item=>[item.id,item]));
      const errors=new Map((data.errors??[]).map(error=>[error.id,error]));
      data.items=ids.flatMap(id=>{
        const item=items.get(requests.get(id)??id);
        return item?[{...item,...(requests.has(id)?{requestedSymbol:id}:{})}]:[];
      });
      data.errors=ids.flatMap(id=>{
        const error=errors.get(requests.get(id)??id);
        return error?[{...error,id}]:[];
      });
      if(!data.errors.length)delete data.errors;
      return {ok:true,model:entry.modelHash,data};
    }
    if(name==='discover'){
      const data=discoverConcepts(index.knowledge,args);
      const points=new Map<string,{id:string;kind:string;dataset:string;dimension?:string;measure?:string}>();
      const clocks:Record<string,string>=Object.create(null);
      for(const query of data.queries)for(const result of query.results){
        const dataset=decodeURIComponent(result.dataset.slice('datasets/'.length));
        const fact=index.knowledge.datasets[dataset];
        if(typeof fact?.clock==='string'){
          const clock=result.dataset+'/fields/'+encodePart(fact.clock);
          const dimensions=Object.entries((fact.dimensions??{}) as Record<string,{
            field?:string;filterable?:boolean;ops?:string[];input?:{op?:string};
          }>).filter(([,dimension])=>dimension.field&&semanticId(dimension.field)===clock
            &&dimension.input?.op==='column'&&dimension.filterable
            &&dimension.ops?.includes('Ge')&&dimension.ops.includes('Lt'));
          if(dimensions.length===1){
            const [dimension]=dimensions[0];
            const id=result.dataset+'/dimensions/'+encodePart(dimension);
            clocks[result.dataset]=id;
            points.set(id,{id,kind:'Dimension',dataset,dimension});
          }
        }
        for(const entry of result.entries){
          const [, ,section,id]=entry.id.split('/').map(decodeURIComponent);
          points.set(entry.id,{id:entry.id,kind:section==='dimensions'?'Dimension':'Measure',dataset,
            ...(section==='dimensions'?{dimension:id}:{measure:id})});
        }
      }
      const contracts=infoContracts&&points.size?await infoContracts([...points.values()],exec):{};
      return {ok:true,model:entry.modelHash,data,contracts,clocks};
    }
    if(name==='routes'){
      const {from,to,via}=args;
      if(typeof from!=='string'||typeof to!=='string'||(via!==undefined&&(!Array.isArray(via)||via.some(id=>typeof id!=='string'))))
        throw new Error('routes requires from and to Dataset IDs and an optional ordered via array');
      const ids=[...new Set([from,to,...(via??[])])];
      const publicIds=ids.filter(id=>id.includes('::'));
      const resolved=infoContracts&&publicIds.length
        ?await infoContracts(publicIds.map(id=>({id,kind:'Symbol',symbol:id})),exec) as Record<string,{knowledgeId?:string}>
        :{};
      const endpoint=(id:string)=>{
        if(!id.includes('::'))return id;
        const root=resolved[id]?.knowledgeId;
        if(!root||!/^datasets\/[^/]+$/.test(root))throw new Error('Unknown published Dataset: '+id);
        return root;
      };
      const data=routePoints(index.knowledge,{from:endpoint(from),to:endpoint(to),via:via?.map(endpoint)});
      const points=new Map<string,{id:string;kind:string;dataset?:string;relation?:string}>();
      for(const id of [data.from,data.to,...data.via,...data.paths.flatMap(path=>path.nodes)]){
        if(id.startsWith('datasets/'))points.set(id,{id,kind:'Dataset',dataset:decodeURIComponent(id.slice('datasets/'.length))});
      }
      for(const path of data.paths)for(const edge of path.edges){
        points.set(edge.relation,{id:edge.relation,kind:'Relation',relation:decodeURIComponent(edge.relation.slice('relations/'.length))});
      }
      const contracts=infoContracts&&points.size
        ?await infoContracts([...points.values()],exec) as Record<string,{dataset?:string;symbol?:string}>
        :{};
      const labels=Object.fromEntries(Object.entries(contracts).flatMap(([id,contract])=>{
        const label=contract.dataset??contract.symbol;
        return label?[[id,label]]:[];
      }));
      return {ok:true,model:entry.modelHash,data,labels};
    }
    return {ok:true,model:entry.modelHash,data:searchPoints(index.knowledge,args)};
  };
  const fixed: ToolDefinition[] = [
    {
      name: 'dari_kg_discover',
      description: 'Find Dataset, Dimension, Measure and Value Type using fuzzy entity, member and named value terms. Use only verbatim ASCII English vocabulary returned by dari_vocab. Include at least one member or value term. Values find members via their owning type. Copy the returned public IDs verbatim into dari_kg_info.',
      parameters:{type:'object',properties:{queries:{type:'array',minItems:1,maxItems:12,items:{type:'object',properties:{entity:{type:'string',minLength:1,maxLength:200},member:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:200}},value:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:200}}},required:['entity'],additionalProperties:false}}},required:['queries'],additionalProperties:false},
      output:{schema:OBJECT_OUTPUT,render:renderConcepts},
      async execute(raw,exec){return method('discover',check(raw,['queries']),exec);},
    },
    {
      name:'dari_kg_search',
      description:'Lexical knowledge search: {q:[...],scope:[...]}. Prerequisite: call dari_vocab. Every q item must be a verbatim ASCII English vocabulary entry returned by dari_vocab, preserving spelling and case; never use Chinese, raw user wording, translations, rewrites, abbreviations or concatenated terms. Ask dari_vocab again if needed. scope uses actual knowledge IDs or declared categories, not vocabulary terms. Both arrays are required and nonempty; all q terms share the same scope. Category scopes datasets/entities/types find roots; exact root IDs search their members. Content directories restrict search to a section; types/ID/references searches enabled direct reference sites. Multiple scopes form a union. Valid empty scopes return no matches; unknown scopes are errors. Partial words and small English typos are supported. Returns at most 10 matches per term, grouped by parent ID; append the displayed relative name to that exact parent to obtain an dari_kg_info ID. Use dari_vocab for unfamiliar vocabulary, then search its terms to discover actual IDs. Use dari_kg_routes for relationships. No business data reads.',
      parameters:{type:'object',properties:{q:{type:'array',minItems:1,maxItems:12,items:{type:'string',minLength:1,maxLength:200}},scope:{type:'array',minItems:1,maxItems:12,items:{type:'string'}}},required:['q','scope'],additionalProperties:false},
      output:{schema:OBJECT_OUTPUT,render:renderSearch},
      async execute(raw,exec){return method('search',check(raw,['q','scope']),exec);},
    },
    {
      name:'dari_kg_routes',
      description:'Find the shortest cycle-free relationship paths satisfying {from,to,via?}, using published Dataset IDs from discovery, such as model::Dataset. Entity knowledge IDs also resolve to carrier Datasets. via is an optional ordered list of required nodes; omit it for unconstrained shortest paths. Entity nodes resolve through datasets carrying their identity. No fixed hop limit. Returns at most 20 paths from the first matching depth in stable order, with full node/relation IDs, declared edge direction, traversal cardinality, and whether each relation has a model guard. Explicit no-path/return-truncation status. These declarations do not prove aggregation safety: read the relevant measure constraints with dari_kg_info and validate the query with dari_check.',
      parameters:{type:'object',properties:{from:{type:'string'},to:{type:'string'},via:{type:'array',items:{type:'string'}}},required:['from','to'],additionalProperties:false},
      output:{schema:OBJECT_OUTPUT,render:renderRoutes},
      async execute(raw,exec){return method('routes',check(raw,['from','to','via']),exec);},
    },
    {
      name: 'dari_kg_info', description: 'Read 1..64 exact IDs returned by discovery, such as model::Dataset, model::Dataset::member and model::Type. Published query concepts are returned as Markdown sections with the full ID, a description and a Telora code block. IDs returned by routes or scoped search are also accepted.',
      parameters:{type:'object',properties:{ids:{type:'array',minItems:1,maxItems:64,items:{type:'string'}}},required:['ids'],additionalProperties:false},
      output: {schema:OBJECT_OUTPUT,render:renderInfo},
      async execute(raw,exec){return method('info',check(raw,['ids']),exec);},
    },

  ];
  const builtinRead: ToolDefinition = {
    name: 'dari_read',
    description: 'Read built-in method manuals only. workflow.md, dari.md and rules.md are already fully loaded in the system context: do not read them to start a task; reread only for exact quotation or after context compression. Figure-specific manuals remain on demand. path="dari://help/" lists manuals; path="dari://help/<name>.md" reads one. offset/limit select line windows. Use the host file tools for local files and DARI source.',
    parameters: {type:'object',properties:{path:{type:'string'},offset:{type:'integer',minimum:1},limit:{type:'integer',minimum:1,maximum:2000}},required:['path'],additionalProperties:false},
    output: {schema:OBJECT_OUTPUT,render:renderWorkRead},
    async execute(raw) {
      const args=check(raw,['path','offset','limit']);
      if(args.path==='dari://help/') {
        const catalog=helpEntries(files).map(entry=>entry.name).join('\n');
        return readTextLines(catalog,'dari://help/',args.offset,args.limit,'dari_read');
      }
      if(typeof args.path!=='string'||!Object.hasOwn(files,args.path)) throw new Error('Use dari://help/ to list built-in manuals; read local files with the host file tools');
      return readTextLines(files[args.path],args.path,args.offset,args.limit,'dari_read');
    },
  };
  return [builtinRead, ...definitions, ...fixed.filter(tool=>ENABLE_KNOWLEDGE_SEARCH||tool.name!=='dari_kg_search')];
}
