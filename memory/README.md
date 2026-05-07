# Memory

> 项目关键设计讨论与决策记录。不是文档，是曾经走过的路。

## 话题

| 文件 | 内容 |
|------|------|
| [architecture.md](architecture.md) | 从 Sessi… 到日报的完整数据处理链路设计 |
| [extract-layer.md](extract-layer.md) | 四层消息提取模型——为什么拆、怎么拆、边界在哪 |
| [mcp-server.md](mcp-server.md) | MCP Server + Skill——让 Claude Code 生成日报 |

## 关键决策

- **Extract 不截断**：抽取层只做类型分离（userMessages / assistantThinking / assistantText / assistantTools），不做数量裁剪。裁剪是 Compressor 的事。
- **两个旋钮分开**：Selector 只决定"要哪些字段"（WHAT），Compressor 只决定"取多少"（HOW MUCH）。不再出现两个地方同时控制 max count 的双重截断。
- **Claude Code 而非单次 LLM 调用**：日报生成需要 agent loop（思考→决策→调工具→循环），单次 API 调用做不到。MCP Server 提供工具，Skill 提供操作手册，用户的 Claude Code 来执行。
- **四层分离**：ContentBlock 直接拆成四类，不混合。Thinking / Text / Tool 三层各有独立语义，混在一起会让 LLM 难以判断工作内容。
