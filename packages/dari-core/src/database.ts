/** Local plan SQL currently targets SQLite semantics. Connections belong to the integrator. */
export type SqlRow=Record<string,unknown>;
export type LocalColumn={name:string;type:'integer'|'real'|'text';nullable:boolean};
export interface DatabasePort {
 readonly dialect:'sqlite';
 query(sql:string,parameters:readonly unknown[]):SqlRow[];
 materialize(name:string,columns:readonly LocalColumn[],rows:readonly SqlRow[]):void;
 drop(name:string):void;
 registerFunction(name:string,options:{deterministic:boolean;varargs?:boolean},fn:(...args:any[])=>any):void;
}

export function registerSqliteRegexp(db:Pick<DatabasePort,'registerFunction'>){
 const patterns=new Map<string,RegExp>();
 db.registerFunction('regexp',{deterministic:true},(pattern:any,input:any)=>{
  if(pattern===null||input===null)return null;
  let regex=patterns.get(String(pattern));if(!regex){regex=new RegExp(String(pattern));patterns.set(String(pattern),regex);}
  return Number(regex.test(String(input)));
 });
}
