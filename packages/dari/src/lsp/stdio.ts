import {loadIntegration,argumentsOf} from '../load-integration.ts';
import {createCheckerIntegration} from '@hh9527/dari-model/checker-integration';
import {loadWorkspaceConfig} from '@hh9527/dari-model/config';
import {serveLsp} from './transport.ts';
try{
 const {flags}=argumentsOf(process.argv.slice(2));
 for(const flag of Object.keys(flags))if(!['integration','options','workspace'].includes(flag))throw Error('Unknown option --'+flag);
 const options=flags.options?JSON.parse(flags.options) as Record<string,unknown>:{};
 // 工作区默认取当前目录：Helix 等编辑器会把 language server 的 cwd 设为工作区根。
 const workspace=flags.workspace??process.cwd();
 // 模型只认两个来源：--options 显式指定，或工作区 dari.json 的 model。
 // 都没有时照常启动：模型相关的检查会以 model-unavailable 诊断提示，不回落任何默认模型。
 const declared=options.model;
 const model=typeof declared==='string'&&declared.length>0?declared:loadWorkspaceConfig(workspace).model;
 const settings=model?{...options,model}:options;
 const integration=flags.integration
  ?await loadIntegration(flags.integration,settings)
  :model?await createCheckerIntegration({model})
  :{};
 if(!model)process.stderr.write(`DARI LSP: 工作区 ${workspace} 没有声明 model，模型相关能力不可用\n`);
 try{await serveLsp(process.stdin,process.stdout,integration);}finally{await integration.close?.();}
}catch(error){process.stderr.write('DARI LSP: '+(error as Error).message+'\n');process.exitCode=1;}
