import {isDeepStrictEqual} from 'node:util';
import type {RenderBlock} from './host.ts';
import type {readPoints} from './point-knowledge.ts';

function publicDeclaration(item:ReturnType<typeof readPoints>['items'][number], heading:string):string[]|undefined {
  const c=item.dari;
  if(!c || c.available===false)return;
  const facts=item.facts;
  const name=heading.split('::').at(-1)!;
  const singleLine=(value:string)=>value.replace(/[\r\n`]/g,' ').trim();
  const lines:string[]=[];
  if(item.kind==='Dataset')return lines;
  if(item.kind==='Dimension'||item.kind==='Measure'){
    lines.push('# '+item.kind.toLowerCase()+' '+name+': '+c.type);
    if(item.kind==='Dimension'){
      for(const key of ['projectable','filterable','groupable']){
        if(facts[key]===true)lines.push('# @'+key);
      }
      const ops=facts.ops??facts.filters;
      if(Array.isArray(ops)&&ops.length)lines.push('# filters = '+ops.map(String).map(singleLine).join(', '));
    }
    if(item.kind==='Measure'&&facts.computed){
      const {op,left,right}=facts.computed;
      const operator=op==='Add'?'+':op==='Sub'?'-':undefined;
      if(operator&&typeof left==='string'&&typeof right==='string')
        lines.push('# 计算口径 '+singleLine(left)+' '+operator+' '+singleLine(right));
      return lines;
    }
    for(const key of ['aggregate','statistic']){
      if(typeof facts[key]==='string')lines.push('# '+key+' = '+singleLine(facts[key]));
    }
  }else if(item.kind==='Type'&&c.variants?.length){
    const labels=new Map<string,string>();
    if(Array.isArray(facts.variants))for(const variant of facts.variants){
      const label=variant.names?.find((value:unknown)=>typeof value==='string'&&value!==variant.name);
      if(typeof variant.name==='string'&&label)labels.set(variant.name,singleLine(label));
    }
    lines.push('type '+name+' = enum {');
    for(const symbol of c.variants){
      const variant=symbol.split('::').at(-1)!;
      lines.push('    '+variant+','+(labels.get(variant)?' # '+labels.get(variant):''));
    }
    lines.push('};');
  }else if(item.kind==='Type'){
    const representation=typeof facts.representation==='string'?facts.representation.replace(/^types\//,''):undefined;
    if(representation&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(representation)){
      lines.push('type '+name+' = struct('+representation+');');
    }else lines.push('# Value type '+name);
    const unit=facts.unit??c.presentation?.suffix;
    if(typeof unit==='string'&&unit)lines.push('# unit = '+singleLine(unit));
  }else if(item.kind==='Value'){
    lines.push('# '+name+': '+c.type);
  }else return;
  if(item.kind==='Dimension'&&Array.isArray(facts.canonical_order)&&facts.canonical_order.length){
    lines.push('# 支持按模型定义的顺序排序');
  }
  return lines;
}

/** Preserve exact definitions, presenting only nonredundant public metadata. */
export function renderInfo(_args:unknown,value:{data:ReturnType<typeof readPoints>}):RenderBlock[]{
  const sections:string[]=[];
  const literal=(v:unknown)=>JSON.stringify(v);
  for(const item of value.data.items){
    const c=item.dari;
    const heading=item.requestedSymbol??(c?.dataset&&c?.symbol?c.dataset+'::'+c.symbol:c?.symbol??c?.typeSymbol??c?.dataset??item.id);
    const declaration=publicDeclaration(item,heading);
    if(declaration){
      const facts=item.facts;
      const description=item.doc?.trim()||facts.description||facts.doc;
      const label=description||item.names?.[0]||(item.kind==='Dataset'?'可查询数据集。':undefined);
      const details:string[]=[];
      if(item.kind==='Dataset'){
        if(facts.kind==='Event')details.push('每行是一条事件记录。');
        if(facts.clock&&facts.kind==='Event')details.push('时间口径为事件发生时间。');
      }
      if(item.kind==='Measure'&&!description&&!facts.computed&&facts.aggregate==='Count'){
        const predicate=facts.predicate;
        if(!predicate)details.push('统计查询范围内的记录数。');
        else if(predicate.op==='Eq'&&typeof predicate.input?.Text==='string')
          details.push('只统计满足 '+(item.predicateMember??'模型预设分类')+' 为 `'+predicate.input.Text.replace(/[`\r\n]/g,' ')+'` 的记录。');
        else details.push('统计符合模型预设条件的记录数。');
      }
      const body=item.kind==='Type'&&declaration.some(line=>line.startsWith('type '))
        ?['```telora',...declaration,'```']
        :declaration.map(line=>'- '+line.replace(/^# /,''));
      sections.push([`### ${heading}`,...(label?['',String(label)]:[]),...(details.length?['',...details]:[]),
        ...(body.length?['',...body]:[])].join('\n'));
      continue;
    }
    const lines=[`## ${heading}`,'',`- kind: ${item.kind}`];
    const query=['dataset','entity','relation','field','dimension','measure','role'].filter(k=>Object.hasOwn(item,k));
    if(query.length)lines.push('- query: '+query.map(k=>`${k}=${literal(item[k])}`).join(', '));
    if(item.names?.length)lines.push('- names: '+literal(item.names));
    if(item.doc?.trim())lines.push('',item.doc);
    const facts={...item.facts};
    if(c && c.available!==false){
      for(const key of ['wire','wires','canonical_values','canonical_aliases'])delete facts[key];
      if(c?.type)delete facts.type;
      if(c?.variants?.length&&item.kind==='Type'){
        for(const key of ['variants','representation','arguments','field_types'])delete facts[key];
      }
    }
    // Suppress aliases only when the complete values agree; conflicts remain visible.
    for(const [alias,primary] of [['filters','ops'],['order','canonical_order']])
      if(Object.hasOwn(facts,alias)&&Object.hasOwn(facts,primary)&&isDeepStrictEqual(facts[alias],facts[primary]))delete facts[alias];
    for(const [key,v] of Object.entries(facts)){
      if(v===null||v===undefined||((key==='doc'||key==='description')&&v===''))continue;
      // Nested nulls, empty containers and literal values may affect expressions.
      if(typeof v==='object'&&!Array.isArray(v)||Array.isArray(v)&&v.some(x=>x!==null&&typeof x==='object')){
        const json=JSON.stringify(v),fence='`'.repeat(Math.max(3,...[...json.matchAll(/`+/g)].map(m=>m[0].length+1)));
        lines.push('',`### ${key}`,'',fence+'json',json,fence);
      }else lines.push(`- ${key}: ${literal(v)}`);
    }
    if(item.dari){
      lines.push('', '### .dari', '');

      if(c.available===false)lines.push('此知识点没有公开的 .dari 源码契约');
      else {
        if(c.dataset)lines.push('- dataset: `'+c.dataset+'`');
        if(c.symbol)lines.push('- symbol: `'+c.symbol+'`');
        if(c.type)lines.push('- type: `'+c.type+'`');
        for(const d of c.datasets??[])lines.push('- dataset: `'+d.symbol+'`');
        for(const m of c.members??[])lines.push('- '+m.kind+' `'+m.symbol+'`: `'+m.type+'`');
        for(const r of c.relations??(c.kind==='relation'?[c]:[]))lines.push('- relation `'+r.symbol+'`: '+r.from+' ('+r.fromCardinality+') → '+r.to+' ('+r.toCardinality+')');
      }
    }
    sections.push(lines.join('\n'));
  }
  for(const error of value.data.errors??[])sections.push(`## ${error.id}\n\n读取失败：${error.error}`);
  return [{type:'text',text:sections.join('\n\n')}];
}
