// 类型显示：数组要带元素类型，且与 Option/Table 一样是首字母大写的构造器写法。
import assert from 'node:assert/strict';
import {show} from '../packages/dari-core/src/compiler.ts';
const scalar = (name: string) => ({kind: 'scalar', name});
assert.equal(show({kind: 'array', inner: scalar('Int')}), 'Array(Int)');
assert.equal(show({kind: 'array'}), 'Array(?)');
assert.equal(show({kind: 'option', inner: {kind: 'array', inner: scalar('String')}}), 'Option(Array(String))');
assert.equal(show({kind: 'table', inner: {kind: 'schema', fields: {n: scalar('Int')}}}), 'Table(Schema({n: Int}))');
console.log('类型显示：Array(元素类型) 与 Option/Table 一致');
