# 在本仓库工作

开始修改前完整阅读当前公共规则，同一会话已读取时可以复用：

- https://raw.githubusercontent.com/hh9527/agent-rules/main/rules/content-and-expression.md
- https://raw.githubusercontent.com/hh9527/agent-rules/main/rules/development-workflow.md

本仓采用 npm workspace，dari-core 不导入 dari、具体数据库驱动、业务模型或宿主框架。语言类型规则只在 core 中实现；CLI、服务及 LSP 使用同一前端。新功能同步核对 docs、examples 和编辑器资产。类型检查使用 npm run typecheck，行为验收使用 npm test；构建和部署为不同动作。
