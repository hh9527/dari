# DARI

围绕数据获取、处理和展现的声明式流水线语言。类型系统证明各处理环节可以对接，模型通过独立接口证明远端查询；执行期绑定实际参数并核对结果契约。

同一 npm workspace 包含两个独立包：

| 包 | 职责 |
| --- | --- |
| `@local/dari-core` | 解析、名称绑定、类型检查、SQL DAG、执行、共享语义及模型/数据库/展现端口 |
| `@local/dari` | CLI、JSONL 服务、LSP、可信集成模块加载及 SQLite 适配器 |

核心不依赖 DSH、Telora、业务模型或具体数据库驱动。本地后处理固定使用 SQLite；远端执行由集成适配器负责，数据库和方言独立。远端结果仅在被本地 query! 消费时导入工作库，直接展示不导入。

## 开发与使用

需要 Node.js 24 及以上版本。

```sh
npm ci
npm run build
npm test
node packages/dari/lib/dari.mjs check examples/local.dari
node packages/dari/lib/dari.mjs run examples/local.dari
```

`check` 不读取业务行。`run` 创建独立内存 SQLite 工作库，`--database` 将业务数据库路径交给可信 integration，由适配器只读打开，图表或报告产物通过 `--output directory` 输出。两者均可配置 `--integration module.mjs --options '{...}'`。模型取数示例见 `examples/device.dari`，可使用独立夹具 `examples/demo-integration.mjs`，它查询 `devices(id,name,cpu,tenant)` 表；这些示例不依赖生产模型。

```sh
node packages/dari/lib/dari.mjs check examples/device.dari --integration examples/demo-integration.mjs
```

DARI 文件不能加载模块或执行任意 JavaScript；integration 是由启动命令选择的可信宿主代码。包之间通过各自公开出口引用，集成方按 [集成接口](docs/INTEGRATION.md) 提供模型与展现实现。

## 编辑器

```sh
node packages/dari/lib/dari.mjs lsp --workspace /path/to/workspace
node packages/dari/lib/dari.mjs lsp --integration /path/to/integration.mjs --options '{...}'
```

LSP 使用标准 stdio 协议，提供多错误诊断、修复建议、补全、悬停、局部定义跳转和文档符号，支持增量文本变更与 UTF-16 位置。解析和类型来自同一编译前端。未配置模型时，远端证明明确显示为待完成，独立的本地节点仍继续检查；已发布的模型源位置可由 integration.symbols 提供。

Helix 配置与能力边界见 [编辑器集成](docs/EDITORS.md)。tree-sitter 位于 `editors/tree-sitter-dari` 子模块，初始化使用 `git submodule update --init`。

## 打包与部署

```sh
npm run build
node scripts/package-runtime.mjs /path/to/new-runtime-directory
```

运行包包含两个包的编译结果和启动入口，无需访问当前源码工作区或安装生产依赖。运行服务：

```sh
node /path/to/runtime/node_modules/@local/dari/dist/service.js \
  --integration /path/to/integration.mjs --options '{...}' \
  --database /path/to/database.sqlite
```

服务接收 JSONL 的 `check`、`resolve` 请求，可选 `inspect` 交给集成方处理。编辑器和检查服务不会调用模型执行期端口。源码兼容能力与职责见 [能力边界](docs/CAPABILITIES.md)，完整语法见 [语言设计](docs/LANGUAGE.md)。
