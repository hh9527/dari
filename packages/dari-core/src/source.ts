/** Model sources use UTF-8 byte half-open ranges; the frontend uses UTF-16 offsets. */
export type SourceSpan={start:number;end:number};
export type InputOrigin={path:(string|number)[];span:SourceSpan;key?:true};
export type SourceEvidence={span?:SourceSpan;fields?:Record<string,SourceSpan>};
export class SourceOffsets {
 private bytes=new Map<number,number>();
 private chars=new Map<number,number>();
 constructor(source:string){
  let at=0,byte=0;this.bytes.set(0,0);this.chars.set(0,0);
  for(const char of source){at+=char.length;byte+=Buffer.byteLength(char);this.bytes.set(at,byte);this.chars.set(byte,at);}
 }
 toBytes(start:number,end:number):SourceSpan|undefined {
  const a=this.bytes.get(start),b=this.bytes.get(end);
  return a!==undefined&&b!==undefined&&a<=b?{start:a,end:b}:undefined;
 }
 toChars(span:SourceSpan):SourceSpan|undefined {
  if(!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||span.start<0||span.end<span.start||span.start===0&&span.end===0)return;
  const start=this.chars.get(span.start),end=this.chars.get(span.end);
  return start!==undefined&&end!==undefined?{start,end}:undefined;
 }
}
/** Canonical JSON for finite model intents: sorted UTF-8 keys, compact JSON values. */
export function canonicalIntent(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonicalIntent).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))).map(key=>JSON.stringify(key)+':'+canonicalIntent((value as Record<string,unknown>)[key])).join(',')+'}';
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isSafeInteger(value))return JSON.stringify(value);
 throw Error('Model intent requires JSON scalars and safe integers');
}
