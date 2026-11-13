import type {DatabaseSync} from 'node:sqlite';
import type {DatabasePort} from '@hh9527/dari-core';
/** Non-owning adapter: opening, authorization, transactions and closing are the caller's responsibility. */
export function sqlite(db:DatabaseSync):DatabasePort {
 return {dialect:'sqlite',query(sql,parameters){return db.prepare(sql).all(...parameters as any[]);},registerFunction(name,options,fn){db.function(name,options,fn);}};
}
