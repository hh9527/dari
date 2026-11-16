# 能力边界

| 能力 | 提供方 | 独立验收 |
| --- | --- | --- |
| 解析、词法绑定、shadow、Schema 推导、名义类型及 Option | dari-core | comments、named-plans、shadow-bindings、selector |
| SQL 关系处理、联接、集合、分组、排序、上界 | dari-core | composition、pipeline-relations、set |
| 有限计算、日历及共享语义类型 | dari-core | calendar、context-block、unwrap-or、ports |
| 远端结果类型和领域算子约束 | ModelCheckPort | 独立夹具及 ports；生产能力由具体集成验收 |
| 已证明模型计划的参数绑定 | ModelExecutionPort | ports 验证不重新检查或规划 |
| 本地 SQL 执行 | DatabasePort；SQLite 工作库及按需导入 | 独立内存数据库 |
| tree、UseValue、Table、报告结构及数据回执 | dari-core | ports、selector、context-block |
| 生产图表、额外有限函数、报告样式 | HostPort | 集成方验收 |
| CLI、JSONL 服务、集成加载和独立运行包 | dari | 打包及服务验收 |
| 诊断、补全、悬停、跳转、文档符号 | dari 的 LSP | lsp |
| 业务模型源码、Wasm、知识检索、附件和消息投递 | 集成方 | 不进入语言核心 |

每个远端顶层节点至多 500 行；本地可组合无界 SQL 计划，物化前证明至多 500 行；每个展现输入至多 110 行。具体模型可拒绝尚未支持的远端算子组合。单元测试不需要业务仓库、运行服务或生产数据。
