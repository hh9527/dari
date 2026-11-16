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
