/** Local plan SQL currently targets SQLite semantics. Connections belong to the integrator. */
export type SqlRow=Record<string,unknown>;
export interface DatabasePort {
 readonly dialect:'sqlite';
 query(sql:string,parameters:readonly unknown[]):SqlRow[];
 registerFunction(name:string,options:{deterministic:boolean;varargs?:boolean},fn:(...args:any[])=>any):void;
}
