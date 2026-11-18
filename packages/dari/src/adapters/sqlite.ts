import type {DatabaseSync} from 'node:sqlite';
import type {DatabasePort} from '@local/dari-core';
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
/** Local workspace adapter; the caller owns the writable SQLite connection. */
export function sqlite(db:DatabaseSync):DatabasePort {
 return {
  dialect:'sqlite',
  query(sql,parameters){return db.prepare(sql).all(...parameters as any[]);},
  materialize(name,columns,rows){
   db.exec('SAVEPOINT dari_materialize');
   try {
    db.exec('CREATE TEMP TABLE '+quote(name)+' ('+columns.map(c=>quote(c.name)+' '+c.type+(c.nullable?'':' NOT NULL')).join(', ')+')');
    const insert=db.prepare('INSERT INTO '+quote(name)+' VALUES ('+columns.map(()=>'?').join(', ')+')');
    for(const row of rows)insert.run(...columns.map(c=>row[c.name]) as any[]);
    db.exec('RELEASE dari_materialize');
   }catch(error){db.exec('ROLLBACK TO dari_materialize');db.exec('RELEASE dari_materialize');throw error;}
  },
  drop(name){db.exec('DROP TABLE IF EXISTS temp.'+quote(name));},
  registerFunction(name,options,fn){db.function(name,options,fn);}
 };
}
