import {copyFileSync,existsSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
// 插件运行时自足：主入口是 lib/index.mjs，worker 从 dari 的构建产物拷进同一个 lib。
const root=new URL('../../../../',import.meta.url);
const source=new URL('packages/dari/lib/model-worker.mjs',root);
if(!existsSync(fileURLToPath(source)))throw Error('先构建 dari');
copyFileSync(fileURLToPath(source),fileURLToPath(new URL('dist/dsh-plugin-dari/lib/model-worker.mjs',root)));
rmSync(fileURLToPath(new URL('dist/dsh-plugin-dari/dari-runtime',root)),{recursive:true,force:true});
