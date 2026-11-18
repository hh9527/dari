# 编辑器集成

先构建 workspace，再启动 `dari lsp`（等价入口 `packages/dari/lib/dari.mjs lsp`）。查询文件改动后用 `just install-into-helix` 同步到本机 Helix（`HELIX_DIR` 可覆盖配置目录）。标准输出专用于 LSP 帧，日志写入标准错误。

Helix 的 languages.toml 示例：

```toml
[language-server.dari]
command = "node"
args = ["/absolute/path/dari/packages/dari/lib/dari.mjs", "lsp", "--workspace", "/absolute/path/to/workspace"]

[[language]]
name = "dari"
scope = "source.dari"
file-types = ["dari"]
comment-token = "#"
roots = ["dari.json", "package.json", ".git"]
language-servers = ["dari"]
```

`--workspace` 省略时，LSP 以打开的文件为准，从文件所在目录向上找 `dari.json` 作为工作区；找不到时只提供语法能力，并在 stderr 说明。编辑器给的 rootUri 常是仓库根（`.git` 优先），所以不作为依据。LSP 从该目录的 `dari.json` 读取 `model`，并用内置的 `dari-model` 检查器提供模型类型；也可以用 `--options '{"model":"..."}'` 直接指定。两者都没有时 LSP 照常启动，模型相关检查退化为 `model-unavailable` 诊断，不回落任何默认模型。

宿主需要自定义检查器、符号位置或图表组件类型时，追加 `--integration`、可信模块的绝对路径和 `--options`；内置检查器只覆盖模型类型，不提供图表组件的补全。LSP 不从待编辑文档执行模块加载。模型定义跳转通过 integration.symbols 的 `{uri, range}` 实现；没有发布位置时不虚构目标文件。

本地词法绑定支持声明顺序和 shadow 的定义跳转。补全使用检查期发布的 Schema；未完成字段会在内存中交给同一检查器恢复分析，不创建探测稿。当前不提供跨文件 DARI 导入、重命名、代码格式化或自动修复编辑；这些能力没有在 LSP initialize 中宣告。

语法高亮使用独立的 tree-sitter-dari 子模块。源码不变时无需重新生成编辑器解析器。
