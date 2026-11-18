import {existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadIntegration,argumentsOf} from '../load-integration.ts';
import {createIntegration} from '@local/dari-model';
import {loadWorkspaceConfig} from '@local/dari-model';
import {serveLsp} from './transport.ts';
import type {Integration} from '../integration.ts';
try{
 const {flags}=argumentsOf(process.argv.slice(2));
 for(const flag of Object.keys(flags))if(!['integration','options','workspace'].includes(flag))throw Error('Unknown option --'+flag);
 const options=flags.options?JSON.parse(flags.options) as Record<string,unknown>:{};
 // 工作区以打开的文件为准：从文件所在目录向上找 dari.json。
 // 编辑器给的 rootUri 常是仓库根（.git 优先），不能直接用；--workspace 可强制指定。
 const fromFile=(uri:string|undefined):string|undefined=>{
  if(!uri?.startsWith('file://'))return undefined;
  let dir:string;
  try{dir=dirname(fileURLToPath(uri));}catch{return undefined;}
  const start=dir;
  for(;;){
   if(existsSync(join(dir,'dari.json')))return dir;
   const up=dirname(dir);
   if(up===dir)return start;
   dir=up;
  }
 };
 // 没有文件时无法判断属于哪个工作区（initialize 的 rootUri 常常是仓库根），先不建，等 didOpen。
 const locate=(context:{rootUri?:string;fileUri?:string}):string|undefined=>
  flags.workspace??fromFile(context.fileUri)??undefined;
 const cache=new Map<string,Integration>();
 await serveLsp(process.stdin,process.stdout,async(context)=>{
  const workspace=locate(context);
  if(!workspace)return {};
  const cached=cache.get(workspace);
  if(cached)return cached;
  // 模型只认 --options 或工作区 dari.json；都没有时照常启动，模型检查退化为 model-unavailable。
  const declared=options.model;
  const model=typeof declared==='string'&&declared.length>0?declared:loadWorkspaceConfig(workspace).model;
  let integration:Integration;
  if(!model){process.stderr.write(`DARI LSP: 工作区 ${workspace} 没有声明 model，模型相关能力不可用\n`);integration={};}
  else{
   const settings={...options,model};
   integration=flags.integration?await loadIntegration(flags.integration,settings):await createIntegration({model});
  }
  cache.set(workspace,integration);
  return integration;
 });
}catch(error){process.stderr.write('DARI LSP: '+(error as Error).message+'\n');process.exitCode=1;}
