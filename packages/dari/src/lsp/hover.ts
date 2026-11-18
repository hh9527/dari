import type {Type} from '@local/dari-core';
/** hover 弹窗固定采用「签名 / 说明 / 细节」三段：签名用行内代码，长类型用 text 围栏，中文说明不进代码块。 */
export type HoverContent={signature:string;type?:string;description?:string;details?:string[]};
const WIDTH=64;
export const trimText=(text:string):string=>text.replace(/[\s。；;]+$/u,'');
const shortName=(name:string):string=>{
 const i=name.lastIndexOf('::');
 return i>=0?name.slice(i+2):name;
};
function inline(t:Type):string{
 if(t.kind==='schema')return 'Schema({'+Object.entries(t.fields??{}).map(([n,f])=>n+': '+inline(f)).join(', ')+'})';
 if(t.kind==='array')return 'Array('+(t.inner?inline(t.inner):'?')+')';
 if(['option','table'].includes(t.kind))return (t.kind==='option'?'Option':'Table')+'('+inline(t.inner!)+')';
 return shortName(t.displayName??t.name??t.kind);
}
function indent(text:string,pad:string):string{
 return text.split('\n').map((line)=>pad+line).join('\n');
}
/** 字段值可能是多行；续行同样缩进，闭合括号才能和字段名对齐。 */
function field(name:string,value:string):string{
 const [first,...rest]=value.split('\n');
 return '    '+name+': '+first+rest.map((line)=>'\n    '+line).join('');
}
/** 短类型保持单行；超宽或嵌套过深时按字段展开，便于在窄弹窗里阅读。 */
export function formatType(t:Type|string):string{
 if(typeof t==='string')return t;
 const flat=inline(t);
 if(flat.length<=WIDTH)return flat;
 if(t.kind==='schema'&&t.fields){
  // 多行展开必须带逗号：Schema 的字段是逗号分隔的，缺逗号会让语法高亮解析失败。
  const entries=Object.entries(t.fields);
  const rows=entries.map(([name,value],index)=>field(name,formatType(value))+(index<entries.length-1?',':''));
  return 'Schema({\n'+rows.join('\n')+'\n})';
 }
 if(['array','option','table'].includes(t.kind)&&t.inner){
  const label=t.kind==='array'?'Array':t.kind==='option'?'Option':'Table';
  return label+'(\n'+indent(formatType(t.inner),'    ')+'\n)';
 }
 return flat;
}
export function renderHover({signature,type,description,details}:HoverContent):{kind:'markdown';value:string}{
 const lines:string[]=[];
 const head=type?signature+': '+type:signature;
 if(!head.includes('\n')&&head.length<=WIDTH*1.5)lines.push('`'+head+'`');
 else lines.push('```text\n'+head+'\n```');
 const prose=description?trimText(description.trim()):'';
 if(prose)lines.push('',prose);
 const items=(details??[]).map((item)=>'- '+item);
 if(items.length)lines.push('',...items);
 return {kind:'markdown',value:lines.join('\n')};
}

const IDENT=/^[A-Za-z_][A-Za-z0-9_]*$/;
/** data 绑定用类型注解展示：`data win: Array(...)`。 */
export function renderDataHover(name:string,type:string,notes:string[]=[]):{kind:'markdown';value:string}{
 const comments=(IDENT.test(name)?[]:['# '+name]).concat(notes.map((note)=>'# '+note));
 // 末尾分号不能省：没有它解析器连 type_identifier 都建不出来，类型名会退化成普通标识符。
 const declaration='data '+(IDENT.test(name)?name:'_')+': '+type+';';
 return {kind:'markdown',value:['```dari',...comments,declaration,'```'].join('\n')};
}
/** 纯类型用合法 dari 声明承载，编辑器同一套语法查询就能给 Int/ic:: 上色。 */
export function renderTypeHover(name:string,type:string,notes:string[]=[]):{kind:'markdown';value:string}{
 const comments=(IDENT.test(name)?[]:['# '+name]).concat(notes.map((note)=>'# '+note));
 const declaration='type '+(IDENT.test(name)?name:'_')+' = '+type+';';
 return {kind:'markdown',value:['```dari',...comments,declaration,'```'].join('\n')};
}
