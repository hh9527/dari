# 模型证明契约

公共类型定义在 dari-core 的 model.ts，协议身份为 dari-model/v2。适配器负责把具体后端协议映射为这些类型；引擎不要求某种模型语言、序列化框架或执行制品。

## 输入

IntentType 包含节点身份、模型发布的 Dataset/Member/Relation 符号、根节点、可选 pair 以及有稳定 id 的操作序列。参数只传类型与槽编号，运行期输入值在执行时提供。编码器对完整意图编码一次，同时产生 JSON、SHA-256 摘要、常量槽和参数类型。

## 输出与凭据

ModelCheckPort.check_type 返回 CheckedIntent：element、container、maxRows、plan 和 receipt。receipt 必须包含 contractId、inputDigest 和与输入完全一致的有序 consumedStepIds。未知或未实现的步骤由模型明确拒绝，不能静默忽略。

引擎核对回执、投影字段名与业务类型/可空性、容器及作者声明的 take 上界。模型仍负责领域权限、关系基数、聚合粒度和可用算子。源字段的可空性包含可选关系引入的缺失。

## 身份与执行

检查端和执行端都发布 contractId 与 implementationId。前者标识公开语义契约，后者标识具体执行实现；模型规则或代码变化必须更新相应身份。执行端 bind 消费 opaque plan 和参数值，返回参数化 SQL、绑定值、列类型和上界；运行期再次核对列契约、实际行数及身份，不重新调用检查端。

Type 与 ValueCodec 分别保留业务名义类型、可用计算、parse/encode/decode、语义身份及 presentation。Percent、Ratio、EpochMillis、DateTimeUtc、DateTimeTz 和 TimeZone 是共同语义，不与业务命名空间绑定。映射到 SQLite 或其他后端的具体 wire 类型属于模型适配器；当前本地执行仅实现 SQLite 方言。

## 验收

ports-test 验证独立检查/执行端、步骤回执、实现身份与共享类型；模型夹具验证参数化 SQL 与业务类型。生产模型协议及完整字段覆盖由集成项目测试，本仓不声称已经实现具体生产模型的全部领域能力。
