import type {Readable,Writable} from 'node:stream';
import {LanguageServer} from './server.ts';
import type {Integration} from '../integration.ts';
/** JSON-RPC/LSP framing uses UTF-8 byte counts; diagnostics use UTF-16 positions.
 *  integration 可以是工厂：initialize 到达后才能知道 rootUri，工作区要据此解析。 */
type IntegrationContext={rootUri?:string;fileUri?:string};
type IntegrationFactory=(context:IntegrationContext)=>Integration|Promise<Integration>;
export async function serveLsp(input:Readable,output:Writable,source:Integration|IntegrationFactory={}){
 const send=(value:unknown)=>{const body=JSON.stringify(value);output.write('Content-Length: '+Buffer.byteLength(body)+'\r\n\r\n'+body);};
 const factory=typeof source==='function'?source:undefined;
 let integration:Integration=factory?{}:source as Integration;
 let rootUri:string|undefined,server:LanguageServer|undefined;
 // 工作区来自编辑器给的文件/根，而不是进程 cwd；文件一打开就按它解析一次。
 const ensure=async(context:IntegrationContext)=>{
  if(factory)integration=await factory(context);
  if(!server)server=new LanguageServer(integration,(method,params)=>send({jsonrpc:'2.0',method,params}));
  else server.setIntegration(integration);
 };
 let buffer=Buffer.alloc(0),length:number|undefined;
 for await(const chunk of input){
  buffer=Buffer.concat([buffer,Buffer.from(chunk)]);
  while(true){
   if(length===undefined){const end=buffer.indexOf('\r\n\r\n');if(end<0){if(buffer.length>8192)throw Error('LSP header too large');break;}
    const match=/(?:^|\r\n)Content-Length:\s*(\d+)(?:\r\n|$)/i.exec(buffer.subarray(0,end).toString());if(!match)throw Error('LSP Content-Length required');
    length=Number(match[1]);if(length>8*1024*1024)throw Error('LSP message too large');buffer=buffer.subarray(end+4);
   }
   if(buffer.length<length)break;
   const body=buffer.subarray(0,length).toString();buffer=buffer.subarray(length);length=undefined;let message:any;
   try{message=JSON.parse(body);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}});continue;}
   if(message.method==='exit'){if(!server?.shutdown)process.exitCode=1;return;}
   try{
    if(message.method==='initialize'&&typeof message.params?.rootUri==='string')rootUri=message.params.rootUri;
    const context:IntegrationContext=message.method==='textDocument/didOpen'
      ?{rootUri,fileUri:message.params?.textDocument?.uri}
      :{rootUri};
    await ensure(context);
    const result=server!.handle(message.method,message.params);if(Object.hasOwn(message,'id'))send(result===undefined?{jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}}:{jsonrpc:'2.0',id:message.id,result});}
   catch(error){if(Object.hasOwn(message,'id'))send({jsonrpc:'2.0',id:message.id,error:{code:-32603,message:(error as Error).message}});else process.stderr.write('DARI LSP: '+(error as Error).message+'\n');}
  }
 }
}
