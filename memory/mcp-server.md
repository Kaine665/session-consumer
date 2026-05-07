# MCP Server + Skill：让 Claude Code 生成日报

## 核心洞察

单次 LLM API 调用的局限：
- 输入 → 输出，一次性。做不到"发现遗漏 → 回查 → 补全"
- 日报需要 agent loop：读取全天 sessions → 分析 → 发现某个 session 没覆盖 → 调工具查详情 → 重新归类 → 写回报

Claude Code 有 agent loop——它能思考、决策、调用工具、循环。这就是为什么日报生成不应该是一次 API 调用，而应该是一个 Claude Code task。

## 两层设计

### MCP Server（工具层）

7 个工具，覆盖完整工作流：

| 工具 | 用途 |
|------|------|
| `list_projects` | 发现有哪些项目可分析 |
| `get_days` | 查看某项目有哪些天有活动 |
| `get_day_sessions` | 获取某天全部 Session 的四层数据 |
| `get_session_detail` | 深入查看某个 Session 的完整消息 |
| `save_daily_report` | 保存生成的日报 |
| `get_recent_reports` | 查看已有日报，避免重复生成 |
| `get_report` | 取回特定日报 |

### Skill（操作手册）

`packages/mcp/skill/SKILL.md` — 告诉 Claude Code **怎么用**这些工具生成日报：

1. 确认目标日期
2. `get_days` 确认有数据
3. `get_day_sessions` 加载四层数据
4. 分析归类（按工作内容，不按 session 边界）
5. 覆盖检查（每个 session 都要有归属）
6. `save_daily_report` 写回

## 为什么工具层和协议层分离

```
MCP 协议 (protocol.ts)     ← JSON-RPC over stdio，和 Claude Code 通信
    ↓ 调 handler
Tool 函数 (tools/index.ts) ← 纯 TypeScript 函数，不依赖协议
    ↓ 调 Gateway
Extract 层 (@sc/daily)     ← 四层数据提取
```

好处：
- 协议怎么换（MCP stdio / REST / CLI）都不影响工具逻辑
- 测试不用起服务器，直接 import 函数调
- 未来加 HTTP API，工具函数复用

## 产品方向

用户明确：**"把组织好的 session，给到用户的 Claude Code"** 而不是内部自动化。

理由：
- Claude Code 的 loop 能力远强于单次 LLM API
- 用户可以调整、打断、重做——控制权在用户手里
- Skill 文件可以被用户修改定制
- 默认配一个 Claude Code，也能换 Codex 等其他 Runtime
