# DARI 语言

文中的 demo:: 符号用于说明模型契约；可直接运行的夹具示例见 examples/device.dari。生产图表及 time_windows 等宿主函数由 HostPort 注册。


注释使用 `#`，从 `#` 到行尾。字符串中的 `#` 是普通字符。

## 统一语义

DARI 是围绕数据获取、处理和展现的流水线定义语言，具有声明式、强类型、有边界、本地与远程两阶段证明的特点。type 定义类型，data 声明数据节点，节点引用建立 DAG。data 是数据结果可缓存的边界；let 在节点内部为计划片段或有限表达式命名，不新增数据节点或物化边界。执行从 answer 根节点按需展开。query_remote!、query!、tree! 分别表达模型取数、关系处理和展现。

query_remote! 在远端适配器执行，结果每次运行按节点缓存；直接展示不导入本地库。本地 query! 消费远端结果时，先按已证明 Schema 导入独立 SQLite 工作库，再执行本地 SQL 计划。远端与本地之间传递有类型的结果，不拼接 SQL；本地计划之间仍可组合。每个实际执行的远端阶段必须证明最多 500 行，单个图表或表格输入必须证明最多 110 行。

关系处理遵循有类型约束的 SQL 语义。query! / query_remote! 内 let 使用不可变、按声明顺序的词法作用域，支持同名 shadow：先在旧作用域中求右侧的类型与计划，再发布新绑定。新绑定可以有不同 Schema，已绑定的分支仍引用原来的计划。project 从输入成员推导输出 Schema，以绑定的名称引用结果列，没有凭空出现的行变量。单输入 project 可根据成员引用确定输入，多输入必须显式声明 join 或模型 Relation。先筛选源行再聚合与先聚合再筛选结果是不同计划，编译器保留作者表达的顺序。

后置宏 `.as!(name)` 是表达式位置的绑定语法糖，遵循与 let 相同的顺序 shadow 规则，绑定后仍返回原计划。query! 和 query_remote! 的筛选、投影等计划都可用它命名，后续步骤使用新绑定。模型关系遍历中，`connect(Relation)` 从当前节点推导对端 Dataset，后置绑定命名新对端；连续 connect 从最新节点继续，表达式仍携带整个关系计划。let 绑定整个计划，成员投影可使用各节点名称。关系方向、可空性与行粒度由模型证明，自关联使用 `connect(Relation, from_node, to_node)`，两个节点分别用 from(Dataset) 声明，参数顺序对应 Relation 发布的 from/to；管道输入可以是任一端，方向不由节点变量名推测。

源节点与处理后的计划推荐使用不同名称，例如 `let rows = from(Dataset).as!(a) |> filter(a.field < value);`。若写成 `let a = from(Dataset).as!(a) |> ...;`，外层 let 在右侧处理完后遮蔽同名后置绑定，检查器给出语义警告；后置绑定在右侧也没有引用时，警告同时标明未使用。该警告不限制独立 let 或管道步骤之间的正常 shadow。

```telora
data rows = query_remote! {
    let linked = from(demo::device_kpi).as!(a)
        |> connect(demo::relations::device_kpi_of_device).as!(b);
    let output = linked |> project({device: b.device_name, cpu: a.cpu_usage});
    output |> order_by(desc(output.cpu)) |> top(10)
};
```

顶层声明按节点职责区分。data name = expr; 声明数据，允许显式类型注解；report name = tree! { Report [...] }; 声明报告；answer tree! { Answer [...] }; 声明唯一交付根节点。report、answer 的根组件必须与声明匹配，data 的结果必须是数据类型。type 声明类型，let 仅在节点内部命名计划片段或有限表达式。所有具名节点共享同一名称空间。

```text
data topname = query_remote! {
    let a = from(demo::current_alarm);
    let selected = a |> filter(a.alarm_occur_utc_raw >= wins[0].start.epoch_millis
        && a.alarm_occur_utc_raw < wins[1].end.epoch_millis);
    let output = project({name:selected.alarm_name,cnt:selected.alarm_count});
    output |> order_by(desc(output.cnt)) |> top(10)
};
```

正式数据入口为 input、context 和模型 query_remote!。context 的 Schema 由宿主在检查时提供，执行时提供相同契约的值；本次执行首次使用时固定快照，语言不隐式猜测上下文字段或客户端时区。物理 source 仅由检查 API 的 allowTestSources 显式开放给内部夹具，默认检查与 CLI 均拒绝它，不属于正式语言。

宿主可将 contextContractId 与检查结果绑定，执行时必须携带相同身份；输入和 context 不接受 Schema 未声明的字段。上下文字段及身份由集成方声明。

## 证明契约

远程阶段由模型 check_type 证明领域 query_remote!，返回输出 Schema、上界及已验证的参数化计划；远程是模型契约边界，实际可由独立进程适配器承载。本地阶段证明有限关系算子、Schema 组合、作用域和展现对接。模型投影后的处理可继续由本地关系计划组合，两者通过结果类型接合。运行时绑定实际参数并检查值约束，模型查询不重新规划。交付上界不等同于计算成本上界。

模型成员、计划结构和投影在检查期确定；阈值等数据值可在执行期绑定。编译计划核对模型签发的输入摘要和完整步骤消费凭据，并记录模型发布的 contractId 与具体执行制品的 implementationId；resolve 执行前同时核对两者。公共符号由模型发布，宿主只建立索引。

## 计算与展现

有限算术、lookup、unwrap_or!、round、concat、case_when、is_some/is_none 和记录映射放在前序表达式或 query!。语言不开放手写函数、递归、循环和任意代码执行。tree! 组织组件、文本、引用和展示条件，UseValue 只接受 a.b.c 形式的直接标量引用。

远端按封闭枚举分类统计，并按数量降序展示完整分组。枚举能证明结果符合展示上界时，可省略 `take`。需要取前 N 且数量可能并列时，追加模型发布的稳定排序键。饼图直接使用查询结果。分类标签在图表的 `spec.value_labels` 中映射。

```dari
data class_rows = query_remote! {
    let a = from(demo::Items);
    let output = project({cls:a.category,total:a.count});
    output |> order_by(desc(output.total))
};

data class_labels = [
    {value: demo::Category::A, label: "甲类"},
    {value: demo::Category::B, label: "乙类"}
];

answer tree! {
    Answer [
        PieChart(data = class_rows, spec = {
            x: $.cls,
            value: $.total,
            value_labels: {cls: $.cls.lookup!(class_labels).unwrap_or!("未标注分类")}
        })
    ]
};
```

同一配置也适用于表格单元格、分类轴和系列图例，原值保留其身份与排序。键使用输入字段的业务类型并保持唯一，展示标签为静态文本。未命中时可用 `unwrap_or!` 给出文本兜底，也可沿用原值的显示。

映射结果参与本地计算时，使用 `value.lookup!(labels)`。它返回 `Option(T)`，其中 `T` 是映射表的统一值类型。映射表须为非空静态数组，输入为空或未命中时返回 `None`。

`case_when(condition, then_value, else_value)` 恰好接收三个参数，条件必须为非空 Bool，两支结果类型须兼容。多个条件嵌套于 else_value，例如 `case_when(a, "甲", case_when(b, "乙", "其他"))`。可空比较产生 Option(Bool)，空值表示不命中时用 `unwrap_or!(原条件, False)`；空值语义由业务决定。

本地 `ratio(a,b)` 与 `growth_rate(a,b)` 返回 Option(Ratio)，保留比例类型、受限算子及百分比展示语义；输入为空时返回 None，ratio 分母为零、growth_rate 基线非正时也返回 None。非空 Float 可显式构造 `Ratio(value)`，例如 Ratio(0.12) 展示为 12%；构造器不直接接受 Option(Float)，需要先按业务处理空值，不擅自补零。投影、round、avg/min/max 保留 Ratio；difference 在兼容的名义类型之间计算并保留该类型，包括 Percent 与 Ratio。计算结果的空值不因展示而补零。普通记录字段先在 data/do 中绑定，再用 UseValue(ref = prepared_value) 展示，无需构造占位表。

$.field 是组件中的受限字段投影语法。检查器记录输入 Schema 和字段类型，渲染器消费该检查期契约以核对字段访问。当前它不是可独立绑定、组合或复用的通用投影类型构造器，不消除空值，也不作为任意函数开放。

模型 property 的字段映射表达稳定的领域含义，例如数据库编码到业务 enum；lookup 表达本次任务的标签、分组或显示映射。跨任务共享的业务映射应进入模型，不在各分析稿里重复定义。lookup 编译为 SQL CASE 是执行位置选择，不把其结果变成模型的领域定义；tree! 只消费已经准备好的值。

`query_remote!` 中的计算字段与具名成员比较，例如 `a.class == Kind::Olt`，只接受同一业务类型；模型利用该字段的映射将条件下推为 raw 的 IN 集合判断。投影仍生成 CASE，半封闭映射保留 Unknown 和 NULL 的区别。raw 与语义类型不能直接比较。分类映射不授予排序能力：远端和本地语义分类均需独立声明业务顺序，raw 按自身类型排序。具体字段映射由模型集成发布。


## 空值默认值与标量引用

`unwrap_or!(value, default_expr)` 接收 Option(T) 和同一业务类型的 T，结果为 T。后置宏 `value.unwrap_or!(default_expr)` 展开为相同的前置形式；只有值为空时才求值默认表达式。普通计算和 query! 均支持，query! 中 lower 为 SQL COALESCE。query_remote! 的行级维度条件支持显式默认值：`filter((a.tenant_id == selected_tenant).unwrap_or!(False))`。可空参数为 None 时比较结果为空，由 False 默认值排除该行；True 默认值则接受未知条件。None 不会取消筛选。参数保留业务类型与内部 codec，模型负责检查；聚合度量阈值仍要求非空参数。

```text
data prepared = { cpu: map_opt(highest, $.cpu).unwrap_or!(default_cpu) };
answer tree! { Answer [UseValue(ref = prepared.cpu)] };
```

UseValue 的 ref 只接受直接引用，不接受字面量、调用或算术；记录与空值处理提前放在 data 中。precision 为可选展示精度，业务类型、引用标识和高亮保持不变。

## 行与空值

query_remote! 与 query! 的 take(n) 产生 Table(S)，take_opt() 产生 Option(S)。query_remote! 的 take_opt 通过模型证明 take(1) 计划，再在执行边界封装可选行。必须沿用模型对排序与粒度的校验。

query! 可连续 filter、project，也可在 take 后继续处理有界表。投影结果通过 let 绑定名称引用，例如 let output = project({...}); output |> order_by(desc(output.count))。新投影通过新的 let 名称显式绑定；局部名称不泄漏到节点外，不改变其他分支的计划。紧随投影的排序仍可引用该阶段的源字段，无需将排序字段加入输出；聚合后的源字段排序须满足分组约束。每次投影或筛选建立有类型的 SQL 阶段，不把行拉回 JS 手工计算。

每个算子对应显式计划节点，记录 inputType 与 result。ResultContract 统一包含元素 Schema、容器、有序键和行数上界；组件与后处理从绑定上的同一份结果契约读取性质。

行数上界沿计划传播：映射与筛选不扩大输入上界，连接采用乘积上界，左连接计入缺行保留，无分组聚合至多一行，take 取输入上界与参数的较小值。映射、筛选和 take 保留内部排序键；分组与聚合使旧顺序失效。连续两次 order_by 明确报错，多个排序条件放在同一次调用，例如 `order_by(desc(output.rank), asc(output.name))`，按参数顺序依次破除并列；take 后的 order_by 是独立重排。SQL 的内部排序列不会交付给作者，子查询别名使用阶段编号。

每个顶层 query_remote! 数据节点必须证明不超过 500 行；每个 Table 或图表输入必须证明不超过 110 行。已知输入上界时不强制重复 take。take_opt 改变容器类型，不能继续应用表算子。group_by 产生待投影的分组契约，只接受 project 消费；重复分组会给出分组诊断，不伪装成投影位置错误。

远端聚合可用末端 `pivot({index: $.hour, columns: $.category, values: $.metric, max_rows: 48, max_columns: 12})`。当前模型检查接受两个非空分组维度和一个度量的投影。结果类型为 `Pivot(Index, Key, Value)`，可直接作为 `Table` 或 `LineChart` 的 `data`，横轴、序列和指标来自 pivot 配置。检查时从有限枚举或显式键筛选证明序列数不超过 `max_columns`。SQLite 在远端分别核验整个结果的行数和序列数，超出任一预算时提交整次失败。图表的行数限制按索引轴计算。

`Table(data = hourly)` 和 `LineChart(data = hourly)` 共用一次 Pivot 查询。表格以索引为首列，为整个结果中出现的每个键生成一列，最多 12 个数据列。缺测和空指标留空，零照常展示。表格回执为宽 CSV，折线图回执为长 CSV。Pivot 表格支持 `spec.title` 和 `spec.allow_no_data`。

query_remote!/query! 共享算子的结果含义，但外部模型仍可拒绝尚未实现的组合；不能将 query! 的本地组合能力等同于具体模型已支持全部远端组合。

enum variant 使用 Type::Variant 静态符号，检查期验证成员存在。String 构造保留给普通 newtype，enum 不接受字符串构造；输入 JSON 的编码由模型 codec 负责，与源码的静态符号分离。

if let Some(name) = value 在 tree! 分支中收窄 Option(T) 为 T。name 只在成功分支可见，所有分支均检查。存在行不代表字段非空，可对可空字段继续解构。可选行在内部编码为 Some/None，字段空值以 null 承载；这些编码不属于作者表达。

## 声明顺序

当前按源码依赖顺序检查 type 和 data，只能引用先前声明。作者应先写依赖项，再写使用方；不支持前向引用。这使依赖图按构造无环，但不等同于已实现任意声明顺序的 DAG 解析。两遍名称收集与依赖排序不在本轮实现范围内。

## 完整输入上的关系组合

每个顶层 query_remote! 数据节点在 check 时必须证明结果至多 500 行，包括未使用的远端查询；下游本地 take 不能补救远端无界节点。query! 可保持无界 SQL 计划供后续组合，但不得将无界结果物化到 JS。展现输入必须证明至多 110 行，并满足组件类型与空数据规则。union/union_all/intersect/except 合并一致 Schema，semi_join/anti_join 使用存在性保留左行，top_per 在分组内排名，distinct 去重。各操作均在数据库执行，is_empty 使用 EXISTS 而非拉取数据。

有限标量包含文本 contains/not_contains/starts_with/ends_with、IPv4 in_subnet/not_in_subnet、整数余数和可选行 map_opt 投影。表常量通过 table([...]) 构造；空表需 Table(Schema) 注解。模型参数仍由模型生成 codec 解析；本地 query! 在执行时验证 IPv4 子网。query_remote! 对发布了相应网段筛选能力的 IPv4 维度支持 in_subnet 和 not_in_subnet，CIDR 字符串字面量由模型在检查时验证。

### 关系绑定与管道组合

let 和后置 .as! 声明关系名称，算子参数引用已有绑定，不用对象键模拟别名。join、left_join、semi_join、anti_join 写为 left |> join(right, condition)；union、union_all、intersect、except 写为 left |> intersect(right)。可以继续串接关系算子；最终通过 project 为联接输出命名。对象只表达字段结构，例如 project({...}) 和 group_by({...})。

本地分组可以由封闭枚举或 Bool 键证明结果上界。可空键额外计入一个 NULL 组。多个有限分组键取基数乘积，并与已有输入上界取较小值。远端分组上界由模型证明。

query_remote! 的两期对齐写为 left |> pair(right)。普通关联使用 input |> connect(Relation).as!(peer)，显式端点使用 input |> connect(Relation, from_node, to_node)，后者也可用 .as! 命名当前端点。Relation 的 from/to 顺序决定显式端点顺序。没有隐式 out；投影结果用 let result = ... 或 .as!(result) 命名，后续引用 result.field。显式 let out 是普通绑定。

```text
data overlap = query! {
  let a = from(top_port);
  let b = from(top_bandwidth);
  a |> semi_join(b, a.device_id == b.device_id)
    |> project({device_id:a.device_id})
    |> distinct()
};
data overlap_count = query! {
  let r = from(overlap);
  r |> project({total:count()})
};
```

semi_join 按存在性保留左侧行，不因右侧多次命中而复制左侧行；统计重合设备数时，先对设备标识去重。

### 比例的显示尺度

模型以类型 property 发布 presentation 元数据，包含 multiplier 和 suffix，业务 newtype 继承内层的显示约定。Percent(12) 与 Ratio(0.12) 均显示为 12%；正文 UseValue、表格和图表消费同一类型契约。计算、比较、排序及编码继续使用原数值。空值保持无数据语义。

图表的 value_min 等显示轴参数使用显示尺度，例如百分比坐标轴从 99% 开始时写 value_min:99。显式 unit 必须与类型声明的显示单位一致。图表内嵌 CSV 保留原数值，读取时结合类型显示尺度与 spec 理解。

### 模型查询中的空值筛选

query_remote! 的行级 filter 支持 is_some(node.optional_dimension) 与 is_none(node.optional_dimension)，分别按 SQL 的非 NULL / NULL 语义下推，支持与其他维度条件通过 && / || 组合。参数必须是模型发布的可空、可筛选维度成员；聚合度量不作为行级空值筛选对象。空字符串属于非 NULL 值，不会被 is_some 排除。

```text
f |> filter(is_some(f.frame__manufacturer))
  |> filter(is_none(f.frame__remark) || f.frame_name == "frame-a")
```

### 非空投影

project({field:not_none(expr)}) 在声明输出列时同时声明非空约束：expr 必须为 Option(T)，该列输出为 T；任一标记列的投影结果为空时，整行被排除。普通投影保持原可空性。not_none 只允许位于投影字段最外层，不作为一般函数或分支类型收窄机制。

query! 接受可推导的投影表达式，包含聚合结果；query_remote! 接受已发布的可空成员投影，由模型完成校验及 SQL lowering。筛除发生在计算投影结果之后、后续排序及 take 之前，不把聚合结果的非空约束提前到源数据上。空字符串仍是非空值。带内置 pair 排名的 query_remote! 暂不接受该投影，需在后续 query! 中使用。

```text
let result = r |> project({name:r.name,manufacturer:not_none(r.manufacturer)});
result |> order_by(asc(result.name)) |> top(10)
```

公共源码中的绑定、字段、函数、参数及图表配置采用 snake_case；类型、枚举成员和扩展组件采用 PascalCase，HTML 元素保留标签名称。时间窗口边界使用 epoch_millis/date_time_utc，时区选项使用 time_zone；图表使用 allow_no_data、value_min、x_axis、formats、x_label、value_label、connect_nulls、entity_color，layout 使用 label_font、title_font、slant_ticks、tick_count。底层 JS 库的名称通过宿主适配，不构成源码别名。

## 共享标量与时间

模型与 DARI 共享 Percent、Ratio、EpochMillis、DateTimeUtc、DateTimeTz、TimeZone 的语义身份。业务模型通过 property 声明共享身份或继承关系；语言按发布契约识别，不依赖业务模型名称。语义身份、parse/encode/decode 与 presentation 分别发布。Percent 与 Ratio 保留受限的计算能力，展示策略不赋予额外算术能力。

顶层 `data ctx = context! { now: Context::Now, tz: Context::ClientTz };` 按静态选择项推导 Schema：now 为 EpochMillis，tz 为 TimeZone。客户端时区缺失或无效时报错；只选择 Now 时不要求时区。EpochMillis 使用整数毫秒编码，DateTimeUtc 使用 ISO 时间字符串编码，DateTimeTz 使用带偏移与 IANA 时区的字符串编码。构造器接收各自的非空编码值。to_epoch_millis(t)、to_datetime_utc(t)、to_datetime_tz(t,TimeZone("Asia/Shanghai")) 表达显式转换，并保留输入可空性。DateTimeTz 保留瞬时值、偏移和时区，检查偏移与时区的一致性；比较及排序按瞬时值进行。

EpochMillis 支持加减整数毫秒偏移；两个 EpochMillis 相减得到整数毫秒时长。日历分桶使用 calendar_bucket，UTC 分桶使用 utc_bucket，见后文；日期区间按 LocalDate/DateRange 组合，不能假定每天固定 24 小时。

## 时间展示

计算值与展示解耦：EpochMillis / DateTimeUtc 表达确定时刻，DateTimeTz 为同一时刻附带地区时区；LocalDate 只有日历日期，不参与时区转换。显示格式不改变原值、类型、分组或排序。不要截取 UTC 字符串来获得本地日期。

```dari
data ctx = context! { now: Context::Now, tz: Context::ClientTz };
data date_format = { time_zone: ctx.tz, date_style: DateStyle::Date };
data local_now = to_datetime_tz(ctx.now, ctx.tz);
data today = date_of(local_now);
answer tree! { Answer [
    UseValue(ref = ctx.now, format = date_format),
    UseValue(ref = local_now),
    Table(data = daily, spec = { formats: { day: date_format } }),
    LineChart(data = daily, spec = {
        x: $.day, value: $.cpu,
        formats: { day: date_format }
    })
] };
```

示例中的 daily 是先前取得的有界表，day 为 EpochMillis / DateTimeUtc / DateTimeTz，cpu 为数值指标。`formats` 的键为输入字段名，UseValue 的 `format` 使用同一配置。time_zone 接受非空 TimeZone（如 ctx.tz 或预先构造的 TimeZone），date_style 使用 DateStyle::Date / DateTime / Time。配置结构和枚举在检查期确定；time_zone 的类型在检查期校验，实际地区值来自本次执行的缓存数据节点。

未指定格式时，EpochMillis / DateTimeUtc 明确按 UTC 展示；DateTimeTz 按自身地区展示。默认 DateTime 显示日期、时分秒、实际 UTC 偏移和地区名，以区分夏令时回拨的重复时刻。Date 只显示 YYYY-MM-DD；Time 只显示 HH:mm:ss。LocalDate 原样显示 YYYY-MM-DD，不接受 time_zone 或非 Date 的 date_style。空值保留为空，不伪造日期，不采用服务器默认时区。

LineChart / AreaChart 从字段类型推导横轴：三种时刻类型为连续时间轴，LocalDate / String 为类别轴，普通数值为数值轴。需要显式选择时使用 x_axis: Axis::Time / Category / Value；Time 要求时刻类型，Value 要求数值。轴标签、axis pointer、tooltip 与交付数据采用同一时间格式；原始输入仍保留在 SVG 元数据。DateTimeTz 连续轴包含不同地区时必须显式指定统一 time_zone。类别轴的格式若把不同瞬时值压成同一标签会报错，避免图表悄悄合并数据。

`date_of(instant, zone)` 计算 LocalDate；单参数 `date_of(zoned)` 要求 DateTimeTz，使用其自带地区。date_of 与日期区间运算用于前序 data/do；行级日历聚合在 query! / query_remote! 使用 calendar_bucket。地区分桶键保持 DateTimeUtc，表格或图表通过 formats 显示对应地区的日期；无需把分组键降成 String。地区日可能为 23 / 25 小时，不能用固定 86400000 毫秒代替日历日期推进。

## 类型化查询组合

查询组合借鉴 LINQ 的表达式计划机制。每个关系算子消费上一节点的结果契约，产生新的结果契约；契约包括行 Schema、容器形态、有序性及行数上界。表达式在检查阶段构成计划，执行阶段由模型 SQL 或本地 SQL 实现。具名 let 表达作用域和计划引用，project 定义新的行类型，后续字段访问遵循该类型。

| 算子 | 输入条件 | 输出契约 |
|---|---|---|
| filter | Table(S)，谓词为 Bool | 保留 S、排序和上界，行数可减少 |
| project | Table(S)，字段表达式可推导 | Table(Snew)，非聚合投影保留排序及上界 |
| project 中的 not_none | 字段表达式为 Option(T) | 字段为 T，排除该字段为空的整行 |
| left_join | 两张表，连接谓词为 Bool | 右侧字段为 Option(T)，须显式 project 命名输出 |
| group_by | Table(S)，分组键有效 | 分组计划，由 project 定义聚合结果 |
| order_by | 字段具有比较能力 | 保留 Schema 和上界，建立排序契约 |
| take(n) | 已有排序或至多一行，n 为 1..500 | Table(S)，上界为原上界与 n 的较小值 |
| take_opt() | 已有排序或至多一行 | Option(S)，至多一行 |
| map_opt | Option(S)，有效的 $.field | Option(T)，嵌套可空性归一化 |

filter 中的 is_some 只产生谓词，不隐式改变字段类型。需要非空字段时在 project 中使用 not_none，确保类型收窄对应明确的行过滤。时间转换保留可空性；业务 newtype 的计算规则独立于物理存储类型。排序和上界可随 data 结果继续传递，节点结果按需求值并在一次 resolve 内缓存。

query 的领域能力由外部模型证明，query! 的关系组合由本地检查器证明；两者共享结果契约。通过语言检查的模型表达式还须获得模型凭据，才能进入执行计划。tree! 消费准备好的值及展现投影，计算在前序数据节点完成。

## 显式环境交互入口

query_remote! { ... } 与 context! { ... } 是具有专门语义的宏入口。context! 只能直接初始化顶层 data，选择项为 Context::Now 和 Context::ClientTz；同次 resolve 共享宿主快照。query_remote! 在检查期申请模型证明，执行期绑定参数取数。! 标记特殊语法或语义结构，不等同于立即执行或副作用。

`data x = do { let a = ...; a };` 表达局部纯计算。let 不可变、按依赖顺序声明、仅块内可见，末尾表达式决定返回类型。do 可以嵌套或引用数据节点，不能嵌入 context!/query_remote!/query!/tree! 或输入、取数入口；关系处理放在独立 query!/query_remote! 数据节点中。缓存边界由顶层 data 决定，do 不创建缓存节点。

图表及 Table 直接内联在 answer 或 report 的 tree! 中。answer 中图表生成 SVG 附件及 Markdown 图片引用，Table 输出 Markdown；report 中图表及表格嵌入 HTML。两处保留 spec 与最终展示输入数据，分别渲染，不共享渲染缓存；引用同一 data 节点仍共享单次 resolve 内的数据结果。

## 数值展示与堆叠

展示宿主发布封闭枚举 Stack，spec.stack 使用 Stack::None、Stack::Total、Stack::Percent，默认 None。Total 表达原值堆叠，Percent 表达类别内加总后归一为百分比。分组柱状图、分组条形图和面积图支持堆叠；业务指标须允许 Sum。宽表不同指标只支持并列展示，Stack::None 合法。展示单位相同不代表具备加总能力。

数值展示默认最多两位小数并去掉末尾零，Int 保留完整整数。Percent(12) 与 Ratio(0.12) 显示为 12%。模型可通过 @quantity::display_precision(n) 发布可继承的默认精度；显式配置优先于模型默认，模型默认优先于系统默认。图表和 Table 使用 spec.precision，正文使用 UseValue(ref = prepared, precision = 3)，n 为 0..12 的静态整数。精度只影响轴刻度、标签、提示框、正文与表格显示，不改查询、排序、几何值和 SVG 内嵌原始输入。

query! { ... } 使用关系计划专用语法。query_remote!、query!、tree!、context! 的 ! 均标记专门的语法或语义边界，不等同于副作用或立即执行；具体求值阶段由各自契约确定。filter、project、order_by、take 等普通管道算子保持函数调用形式。


有序结果用 `top(N)` 回答排名问题，返回完整的入榜结果。清单需要同时说明完整规模时，使用末尾的 `take(N)`，总数按同一口径在截取前计算。远端模型须证明能提供精确总数。表格自动显示总数和实际展示条数。正文需要引用计数时可用 `page.total_count` 或 `page.fetched_count`，两者均为 `Int`。空结果的两个计数均为 0。逐行投影和重排保留清单总数。

## 诊断反馈契约

每条反馈定位到行列和数据/展示节点，描述实际与期望的类型或能力。关键类型与计划检查直接产生稳定的错误类别、原因和修复建议；文本统一渲染，保留多个独立错误并抑制上游失败引发的重复错误。其余错误保留原始描述，只有能确定修复方式时才补建议。

可空条件必须显式决定空值含义：若空值表示不满足，可用 unwrap_or!(原条件, False)；若需保留相应行，则按业务选择 True 或独立表达空值条件。反馈尽可能引用作者原始表达式，不泄露内部计划别名。建议不会替作者选择排序字段、默认值或统计口径，不通过删条件、剥离业务类型、扩大上界来绕过检查。

同一稿件及契约下，check 通过而 submit 失败，默认视为实现缺陷。凡由源码、静态配置和已发布契约决定的失败，均须在检查阶段报告。算子已获准但执行器缺少对应实现、SQL lowering 生成不可执行的 SQL、模型结果违反已证明的契约，均属于实现缺陷。

执行阶段的诊断须定位负责节点并说明具体原因。允许在执行阶段报告的情况包括实际输入或上下文值不满足要求、依赖实际查询结果的条件未满足（例如组件要求有数据而结果为空）、稿件或模型契约在两次调用之间变化，以及数据库或交付服务故障。可空性和输入类型的静态错误由检查阶段报告。空结果仅在业务口径允许时使用 allow_no_data。

## 可组合日历准备

日历准备在顶层 data 或纯 do 块中完成，生成的标量端点可以传给 query!/query_remote!。当前实现不在 SQL 行表达式中展开这些日历准备函数；固定时长分桶与批量分割仍属于 RFC 0008 的后续范围。

```telora
data ctx = context! { now: Context::Now, tz: Context::ClientTz };
data window = do {
    let today = date_of(ctx.now, ctx.tz);
    let dates = calendar_period(today, CalendarUnit::Week);
    at_zone(dates, ctx.tz)
};
```

- LocalDate：合法的 YYYY-MM-DD 日期，范围 0001..9999，无时区与时分秒
- TimeZone：有效 IANA 时区；通过 TimeZone("Asia/Shanghai") 或 Context::ClientTz 获得
- CalendarUnit：Year / Quarter / Month / Week / Day
- Weekday：Monday / Tuesday / Wednesday / Thursday / Friday / Saturday / Sunday，默认 Monday
- DateOverflow：Reject / Clamp，默认 Reject；月末溢出只有显式选择 Clamp 才收敛
- DateRange / TimeRange：可信半开区间，端点分别为 LocalDate / EpochMillis；允许 start == end，拒绝 start > end，普通对象不能冒充区间，区间不能作为数据库表的标量列

| 函数 | 参数与结果 |
| --- | --- |
| date_of | instant, TimeZone → LocalDate；或 DateTimeTz → LocalDate（自带地区） |
| calendar_floor / calendar_ceil | LocalDate, CalendarUnit, 可选 Weekday → LocalDate |
| calendar_period | LocalDate, CalendarUnit, 可选 Weekday → DateRange |
| shift_date | LocalDate, CalendarUnit, Int, 可选 DateOverflow → LocalDate |
| shift_dates | DateRange, CalendarUnit, Int, 可选 DateOverflow → DateRange |
| date_range | LocalDate, LocalDate → DateRange |
| time_range | instant, instant → TimeRange |
| at_zone | DateRange, TimeZone → TimeRange |
| intersection / overlaps | 两个同类区间 → 同类区间 / Bool |
| contains | 区间, 同类端点 → Bool |
| is_empty | 区间 → Bool；表为空的既有重载也保留 |

instant 接受 EpochMillis / DateTimeUtc / DateTimeTz。这些日历准备函数当前要求非空输入，不自动吞掉 None。calendar_ceil 在已对齐时保持原日。intersection 不相交时返回位于较晚起点的空区间。at_zone 按时区日历求当天最早存在的瞬时值，整个日期不存在时报错。输出端点使用 `.start` / `.end`；时间展示通过 format/formats 配置，不必为显示修改分组键。

完整组合见 [calendar.dari](examples/calendar.dari)。input! 暂未实现。

## 数据库 UTC 分桶

`utc_bucket(value, CalendarUnit::Day)` 接受 DateTimeUtc，返回 DateTimeUtc；Option(DateTimeUtc) 输入保留 Option。单位必须直接使用静态 CalendarUnit 枚举成员，支持 Year/Quarter/Month/Week/Day。周固定从周一 UTC 00:00 开始，桶起点用于分组和排序。当前接口不接受时区、字符串单位或隐式 EpochMillis 转换。

本地 query! 先投影桶，再按投影结果分组：

```telora
data rows = query! {
    let a = from(samples);
    let bucketed = a |> project({day: utc_bucket(a.ts, CalendarUnit::Day), cpu: a.cpu});
    let grouped = bucketed |> group_by({day: bucketed.day})
        |> project({day: bucketed.day, cpu: avg(bucketed.cpu)});
    grouped |> order_by(asc(grouped.day)) |> top(100)
};
```

模型 query_remote! 在投影中把分桶维度与模型度量一起声明，维度作为分组键，度量使用模型已经发布的聚合规则：

```telora
data rows = query_remote! {
    let a = from(demo::device_kpi);
    let grouped = a |> project({day: utc_bucket(a.device_kpi_ts_raw, CalendarUnit::Day), cpu: a.cpu_usage});
    grouped |> order_by(asc(grouped.day)) |> top(100)
};
```

query_remote! 在投影中接受直接 DateTimeUtc 维度，或 `utc_bucket(to_datetime_utc(a.epoch), CalendarUnit::Day)` 这样的显式 EpochMillis 转换后分桶；也支持单独投影 `to_datetime_utc(a.epoch)`。转换的源必须为直接 EpochMillis/DateTimeUtc 维度，结果保持 DateTimeUtc 及来源可空性。通过已投影字段排序。模型检查权限、类型与聚合语义，再生成原生 SQL 分组；不在宿主取回原始行后分组。示例中的 demo 符号示意模型契约，具体能力由集成方发布。

utc_bucket 不补齐没有记录的桶，不改变业务度量的聚合能力；本地 UDF 与模型 SQL 使用相同 UTC 周期定义。地区日历分桶见下节；固定时长分桶尚未提供。

## 地区时区分桶

`calendar_bucket(value, unit, zone)` 接受 DateTimeUtc、静态 CalendarUnit 和非空 TimeZone，输出 DateTimeUtc；输入时间可空时保留 Option。支持 Year/Quarter/Month/Week/Day，Week 从周一开始。地区规则按输入瞬时值应用，不把当前偏移套用到所有历史数据。

```telora
data ctx = context! { tz: Context::ClientTz };
data daily = query_remote! {
    let a = from(demo::device_kpi);
    let grouped = a |> project({
        day: calendar_bucket(a.device_kpi_ts_raw, CalendarUnit::Day, ctx.tz),
        cpu: a.cpu_usage,
    });
    grouped |> order_by(asc(grouped.day)) |> top(100)
};
```

EpochMillis 来源写成 `calendar_bucket(to_datetime_utc(a.epoch), CalendarUnit::Day, ctx.tz)`。固定地区也使用地区身份，如 `data zone = TimeZone("America/New_York");`，不接受裸 String 或隐式 UtcOffset。示例使用 `America/New_York` 演示语法；实际地区应来自用户要求或上下文，不能从示例推定。地区桶与 UTC 桶都返回桶键的 UTC 表达；展示时用 formats 指定地区与日期样式，无需变更桶键类型。

query! 中使用同一表达式，先投影桶再分组。query_remote! 第一版的 zone 是类型化参数，来自顶层 data；模型成员中的普通 String 时区字段尚未自动提升为 TimeZone。检查期由模型证明时间类型、单位和时区参数契约，执行期绑定实际地区 ID。SQLite 适配固定注册 dari_calendar_bucket，PostgreSQL 使用原生三参数 date_trunc；UQL 不支持此算子。执行侧不另行选择语义或回退固定偏移。

桶键的本地午夜解释与 PostgreSQL 对齐：重复午夜选择较后的瞬时值，不存在的午夜按跳变前偏移解释。它是日历分组的规范键；判断日期区间的覆盖边界仍使用 DateRange/at_zone 的区间契约，不能把特殊跳变日的桶键直接视为最早事件边界。无效地区 ID 报错，不回退服务器时区或 UTC。SQLite 使用宿主 Intl/IANA 数据，规则版本随运行环境固定；升级时区数据后应重新检查并计算结果。

字段选择器 `$.field` 由组件 data 或 map_opt 的输入行提供类型上下文；`$.x.y` 逐级检查记录字段；`$.x?.y` 的 `?` 要求 x 为 Option，遇到 None 则在选择器边界返回 None，否则继续取字段。含 `?` 的选择器返回 Option(最终字段类型)，不叠加 Option；普通 `.` 不隐式穿透 Option。选择器不是任意表达式或匿名函数，UseValue(ref = prepared.value) 仍使用具名数据引用。
