import type {ModelCheckPort} from '@hh9527/dari-core';
import {openModel} from './telora-model.ts';
/** 只带模型检查能力的 integration：给 LSP 这类不渲染图表、不执行查询的宿主用。 */
export async function createCheckerIntegration(options:{model?:string}){
 if(!options.model)throw Error('DARI ontology integration requires model');
 const bridge=await openModel(options.model);
 const checker:ModelCheckPort=bridge.model;
 return {checker,options:{},close:async()=>{await bridge.close();}};
}
