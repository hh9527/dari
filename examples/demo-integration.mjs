import {DatabaseSync} from 'node:sqlite';
import {createFixtureModel} from '@local/dari-core/testing';
export function createIntegration(options){
 let database;
 const {model}=createFixtureModel({query(sql,parameters){
  if(!options.database)throw Error('Demo execution requires --database');
  database??=new DatabaseSync(options.database,{readOnly:true});
  return database.prepare(sql).all(...parameters);
 }});
 return {checker:model,executor:model,close(){database?.close();}};
}
