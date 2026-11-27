import assert from 'node:assert/strict';
import {DatabaseSync} from "node:sqlite";
import {sqlite} from "../packages/dari/src/adapters/sqlite.ts";
import {check,resolve} from '../packages/dari-core/src/index.ts';
import {dariHost} from '../packages/dari-model/src/dari-host.ts';

const source = `
data rows = table([{cls:"A",n:1},{cls:"B",n:2},{cls:"C",n:3}]);
data labels = [{value:"A",label:"同一标签"},{value:"B",label:"同一标签"}];
data found = "A".lookup!(labels).unwrap_or!("其他");
answer tree! {Answer [
 Table(data=rows,spec={value_labels:{cls:$.cls.lookup!(labels).unwrap_or!("其他")}}),
 BarChart(data=rows,spec={category:$.cls,value:$.n,value_labels:{cls:lookup!($.cls,labels).unwrap_or!("其他")}})
]};
`;
const checked=check(source,undefined,{host:dariHost});
const result=resolve(checked,sqlite(new DatabaseSync(':memory:')));
assert.deepEqual(result.values.rows,[{cls:'A',n:1},{cls:'B',n:2},{cls:'C',n:3}]);
assert.match(result.dataDocument, /cls,n\n同一标签,1\n同一标签,2\n其他,3/);
assert.match(result.dataDocument, /\| 同一标签 \| 1 \|/);
assert.throws(()=>check(source.replace('{value:"A"','{value:1'),undefined,{host:dariHost}),/lookup key type|same type/);
