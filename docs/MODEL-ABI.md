# 模型证明契约

公共类型定义在 dari-core 的 model.ts，协议身份为 dari-model/v3。适配器负责把具体后端协议映射为这些类型；引擎不要求某种模型语言、序列化框架或执行制品。

## 输入

IntentType 包含节点身份、模型发布的 Dataset/Member/Relation 符号、根节点、可选 pair 以及有稳定 id 的操作序列。参数只传类型与槽编号，运行期输入值在执行时提供。编码器对完整意图编码一次，同时产生结构化 wire、来源、规范 JSON、SHA-256 摘要、常量槽和参数类型。

## 输出与凭据

ModelCheckPort.check_type 返回 CheckedIntent：element、container、maxRows、plan 和 receipt。receipt 必须包含 contractId、inputDigest 和与输入完全一致的有序 consumedStepIds。未知或未实现的步骤由模型明确拒绝，不能静默忽略。

引擎核对回执、投影字段名与业务类型/可空性、容器及作者声明的 take 上界。模型仍负责领域权限、关系基数、聚合粒度和可用算子。源字段的可空性包含可选关系引入的缺失。

## 身份与执行

检查端和执行端都发布 contractId 与 implementationId。前者标识公开语义契约，后者标识具体执行实现；模型规则或代码变化必须更新相应身份。执行端 execute 消费 opaque plan 和参数值，在适配器指定的后端执行并返回行数据、列类型和上界；运行期再次核对列契约、实际行数及身份，不重新调用检查端。

Type 与 ValueCodec 分别保留业务名义类型、可用计算、parse/encode/decode、语义身份及 presentation。Percent、Ratio、EpochMillis、DateTimeUtc、DateTimeTz 和 TimeZone 是共同语义，不与业务命名空间绑定。映射到 SQLite 或其他后端的具体 wire 类型属于模型适配器；本地后处理固定使用独立 SQLite 工作库，远端可以使用其他方言或非 SQL 后端。核心不接收远端 SQL。

远端 rows 使用发布列类型的 wire 编码，适配器先规范化驱动返回值；核心检查精确字段集合、类型/可空性、结果上界并按 codec 解码。直接展示使用解码结果；query! 引用远端节点时再按 codec 编码导入本地临时表。一次执行共享取数缓存和物化缓存；临时表按已检查 Schema 建立，空结果亦保留结构。远端的排序在本地通过隐藏序号保持，展示不暴露内部列。

每个实际执行的远端阶段都必须证明上界不超过 500，本地下游 take 不能补救无界远端；图表、表格的输入上界为 110。执行时同时核对远端元数据、实际行数与展示限制。

## 验收

ports-test 验证独立检查/执行端、步骤回执、实现身份与共享类型；模型夹具验证参数化 SQL 与业务类型。生产模型协议及完整字段覆盖由集成项目测试，本仓不声称已经实现具体生产模型的全部领域能力。

## 结构化意图与来源

`EncodedIntent` 同时提供 `wire`、`json`、`digest`、`origins`、常量槽及参数类型。`wire` 是模型直接检查的有限 JSON 值；`json` 是同一值的规范 JSON，递归对象键按 UTF-8 字节排序、数组顺序保留、无额外空白，标量限于字符串、布尔、null 和安全整数。`digest` 为该规范 JSON 的 SHA-256。模型必须从实际收到的结构化值重新计算摘要，不能直接回显宿主给出的摘要。

`origins` 独立于业务字段，每项包含 `path`、`span` 和可选 `key: true`。path 从 wire 根开始，由字段名或数组索引组成；key 标记对象键来源，默认是值来源。span 为原始 DARI 文档的 UTF-8 字节半开区间。来源不参与业务值及其摘要；移动代码不会改变语义凭据。适配器负责将路径来源编码为后端支持的结构化来源，不要求某种执行语言或传输协议。

前端使用 UTF-16 offset，`SourceOffsets` 在原始文档上转换坐标并验证字符边界；中文、代理对与 CRLF 均按原文处理。重命名和计划展开保留作者表达式范围，不从生成后的符号长度推测范围。

## 模型诊断

适配器通过 `ModelCheckFailure` 携带诊断数组，每项为 message 与可选 locs。locs 保留模型规则和输入 subject；临时输入 source 为 `<input>`，start/end.offset 为原始 DARI 的 UTF-8 字节偏移，line 为 0。

引擎选择第一项有效输入 subject 为主范围，将独立诊断分别报告，保留所有来源及修复建议。无有效输入范围时使用已有语义诊断或查询位置，不把模型源码坐标误当 DARI 坐标。LSP 使用完整 UTF-16 范围，并在诊断 data.modelLocations 中保留后端来源。
