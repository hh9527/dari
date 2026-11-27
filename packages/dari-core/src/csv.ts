/** Preserve column order and distinguish an empty string from a missing cell. */
export function csvCells(rows: readonly (readonly unknown[])[]): string {
 const cell=(value:unknown):string=>{
  if(value===null||value===undefined)return '';
  const text=typeof value==='object'?JSON.stringify(value):String(value);
  return text===''||/[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;
 };
 return rows.map(row=>row.map(cell).join(',')).join('\n');
}
