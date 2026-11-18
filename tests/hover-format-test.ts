// hover 渲染：短签名用行内代码、长类型用 text 围栏、中文说明不进入代码块。
import assert from 'node:assert/strict';
import {formatType,renderDataHover,renderHover,renderTypeHover} from '../packages/dari/src/lsp/hover.ts';
const scalar = (name: string) => ({kind: 'scalar', name});
const schema = (fields: Record<string, unknown>) => ({kind: 'schema', fields});
const row = schema({label: scalar('String'), zone: scalar('String')});
assert.equal(formatType(row), 'Schema({label: String, zone: String})');
const wide = schema({a: scalar('Int'), b: schema({nested: scalar('String'), more: scalar('Float')}), c: scalar('DateTimeUtc')});
const wideText = formatType(wide);
assert.ok(wideText.includes('\n'), '超宽类型应展开为多行');
assert.ok(wideText.startsWith('Schema({\n    a: Int,'));
assert.ok(wideText.includes('b: Schema({'), '多行展开的字段之间必须有逗号');
assert.equal(formatType({kind: 'array', inner: scalar('ic::ns::Thing')}), 'Array(Thing)');
const short = renderHover({signature: 'win', type: 'Array(Int)', description: '窗口列表。'});
assert.equal(short.value, '`win: Array(Int)`\n\n窗口列表');
const long = renderHover({signature: 'row', type: wideText, description: '数据行'});
assert.ok(long.value.startsWith('```text\nrow: Schema({'));
assert.ok(!long.value.includes('```dari'));
const details = renderHover({signature: 'Table', description: '展示有界表格', details: ['`data`（必填）：`Table(Schema)` — 输入数据表']});
assert.equal(details.value, '`Table`\n\n展示有界表格\n\n- `data`（必填）：`Table(Schema)` — 输入数据表');
console.log('hover 渲染：行内签名、长类型展开、说明与细节分层');

assert.equal(renderTypeHover('win', 'Array(Int)').value, '```dari\ntype win = Array(Int);\n```');
assert.equal(renderTypeHover('TimeUnit::Day', 'TimeUnit').value, '```dari\n# TimeUnit::Day\ntype _ = TimeUnit;\n```');
assert.equal(renderTypeHover('TimeUnit', 'String', ['取值：Day、Week']).value, '```dari\n# 取值：Day、Week\ntype TimeUnit = String;\n```');
console.log('hover 渲染：纯类型走合法 dari 声明，非标识符名称退化为注释');

assert.equal(renderDataHover('win', 'Array(Int)').value, '```dari\ndata win: Array(Int);\n```');
assert.equal(renderDataHover('a.name', 'Int').value, '```dari\n# a.name\ndata _: Int;\n```');
console.log('hover 渲染：data 绑定用类型注解');
