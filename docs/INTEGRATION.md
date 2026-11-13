# 集成接口

`dari-core` 定义类型与证明规则；`dari` 组合 CLI、服务和编辑器。集成模块导出 `createIntegration(options)`，可以异步加载模型契约，然后返回检查与执行时使用的端口。

```ts
import type {Integration} from '@hh9527/dari';
export async function createIntegration(options): Promise<Integration> {
    return {
        checker,  // ModelCheckPort
        executor, // ModelExecutionPort
        options: {host, contextType, contextContractId},
        symbols,  // 可选的模型符号源码位置
        inspect,  // 可选的应用知识查询，不属于语言类型规则
        close
    };
}
```

## 模型的两阶段链接

`ModelCheckPort` 发布 contractId、implementationId、types、datasets、relations 以及 `check_type(intent, encoded)`。输入包含类型化意图、稳定步骤身份及一次编码得到的 JSON/摘要/参数类型槽。返回 CheckedIntent：结果元素类型、容器、行数上界、opaque plan 与完整消费凭据。检查器不需要实现 `bind`，不接收运行期输入值，不读取业务行。

`ModelExecutionPort` 发布相同身份与 `bind(plan, parameters)`，只对已经证明的计划绑定值，返回参数化 SQL、绑定参数和输出列契约。执行器不需要实现 `check_type`。调用 `resolve(program, database, inputs, {model:executor, context, contextContractId})` 时显式提供执行端口；身份变化、输出列变化、超出上界均拒绝执行，不重新规划。

端口当前为同步接口；集成模块可异步初始化，网络/进程模型可由适配器使用持久工作进程桥接。语言文件不决定模型的位置、协议或技术栈。`ModelPort` 是两个接口的交集，集成方可以用同一个对象同时实现，但引擎分阶段消费。

生成代码、Wasm、RPC、业务知识地址及生产模型源码均属于集成方。模型的 wire 协议到 Type、ValueCodec 和 PreparedQuery 的转换也由集成方实现。公共证明契约见 [模型 ABI](MODEL-ABI.md)。

## 数据库

`DatabasePort` 由连接所有者提供 `query(sql, parameters)` 和 `registerFunction(...)`，当前 dialect 为 sqlite。核心生成 SQL DAG，不导入 node:sqlite。可使用 `@hh9527/dari/sqlite` 的非拥有型适配器包装 DatabaseSync，连接创建、权限、事务与关闭均由调用方负责。

## 展现与上下文

`HostPort` 注册扩展组件、类型化有限函数、格式化和渲染。核心内置表格与 tree 结构，生产图表实现及 HTML/附件投递由宿主提供。源码中不认识宿主框架。

contextType/contextContractId 由集成方在检查时提供，执行请求提供相同身份和实际 context。没有内置的客户端会话、业务时区或预设字段。

## JSONL 服务

请求包含 `id`、`method` 及参数；响应包含同一 id 和 result，或可读的 error 文本。

- check：source，返回公开绑定类型与 warning
- resolve：source、inputs、context、contextContractId，返回 answer、artifacts、queries、dataDocument、deliveryId
- inspect：input，只有集成方实现此能力时可用

服务按源码、模型契约、模型实现、展现与 context 身份缓存已检查计划。运行时仍校验实际端口身份。`Program` 是包含 codec/端口对象的进程内计划，不承诺可 JSON 序列化。

## 组件悬停契约

LSP 对 `tree!` 的组件名和属性名提供悬停说明，包含用途、类型和必填性；数据引用属性同时显示检查器得到的具体类型。内置组件说明与必填属性校验共享 core 的组件契约。宿主扩展组件可通过 `HostPort.componentContracts` 提供说明；未提供时展示通用的图表 data、nodes、spec 契约，详细配置仍由 `checkFigure` 校验。

内置类型、宿主发布类型、模型类型及其枚举成员统一参与 hover 与补全。Context 是 context! 的选择器命名空间，展示各选择项的返回类型；它不是可构造的值类型。
