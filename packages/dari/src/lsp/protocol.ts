export type Position={line:number;character:number};
export type Range={start:Position;end:Position};
export function offsetAt(text:string,p:Position):number {
 let offset=0;for(let line=0;line<p.line;line++){const next=text.indexOf('\n',offset);if(next<0)return text.length;offset=next+1;}
 const end=text.indexOf('\n',offset);return Math.min(offset+Math.max(0,p.character),end<0?text.length:end);
}
export function positionAt(text:string,offset:number):Position {const prefix=text.slice(0,Math.max(0,Math.min(offset,text.length)));return {line:(prefix.match(/\n/g)??[]).length,character:prefix.length-prefix.lastIndexOf('\n')-1};}
export function rangeAt(text:string,start:number,length:number):Range{return {start:positionAt(text,start),end:positionAt(text,start+length)};}
