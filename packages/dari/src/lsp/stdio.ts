import {loadIntegration,argumentsOf} from '../load-integration.ts';
import {serveLsp} from './transport.ts';
try{
 const {flags}=argumentsOf(process.argv.slice(2));
 for(const flag of Object.keys(flags))if(!['integration','options'].includes(flag))throw Error('Unknown option --'+flag);
 const integration=await loadIntegration(flags.integration,flags.options?JSON.parse(flags.options):{});
 try{await serveLsp(process.stdin,process.stdout,integration);}finally{await integration.close?.();}
}catch(error){process.stderr.write('DARI LSP: '+(error as Error).message+'\n');process.exitCode=1;}
