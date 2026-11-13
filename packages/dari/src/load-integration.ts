import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Integration} from './integration.ts';
export async function loadIntegration(path?:string,options:Record<string,unknown>={}):Promise<Integration>{
 if(!path)return {};
 const module=await import(pathToFileURL(resolve(path)).href);
 if(typeof module.createIntegration!=='function')throw Error('Integration module must export createIntegration(options)');
 const integration=await module.createIntegration(options);
 if(!integration||typeof integration!=='object')throw Error('createIntegration must return an Integration');
 if(integration.checker&&(!integration.checker.contractId||!integration.checker.implementationId||typeof integration.checker.check_type!=='function'))throw Error('Invalid ModelCheckPort');
 if(integration.executor&&(!integration.executor.contractId||!integration.executor.implementationId||typeof integration.executor.bind!=='function'))throw Error('Invalid ModelExecutionPort');
 return integration;
}
export function argumentsOf(args:string[]){
 const positional:string[]=[],flags:Record<string,string>={};
 for(let i=0;i<args.length;i++){const arg=args[i];if(!arg.startsWith('--'))positional.push(arg);else{const value=args[++i];if(!value||value.startsWith('--'))throw Error('Missing value for '+arg);if(Object.hasOwn(flags,arg.slice(2)))throw Error('Duplicate option '+arg);flags[arg.slice(2)]=value;}}
 return {positional,flags};
}
