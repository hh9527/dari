import {copyFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
// 插件运行时自足：主入口是 lib/index.mjs，worker 从 dari 的构建产物拷进同一个 lib。
const root=new URL('../../../../',import.meta.url);
for(const worker of ['model-worker.mjs','postgres-worker.mjs']){
 copyFileSync(new URL('packages/dari/lib/'+worker,root),new URL('dist/dsh-plugin-dari/lib/'+worker,root));
}
rmSync(fileURLToPath(new URL('dist/dsh-plugin-dari/dari-runtime',root)),{recursive:true,force:true});
