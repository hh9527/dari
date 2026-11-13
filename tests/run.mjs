import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=readdirSync(new URL('.',import.meta.url)).filter(x=>x.endsWith('-test.ts')).sort();
let failed=0;for(const file of files){const result=spawnSync(process.execPath,[new URL(file,import.meta.url).pathname],{stdio:'inherit'});if(result.status!==0)failed++;}
console.log(`${files.length-failed}/${files.length} test files passed`);if(failed)process.exitCode=1;
