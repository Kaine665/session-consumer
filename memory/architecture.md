# 架构：从 Session 到日报

## 问题起点

session-consumer 有 6 个 Provider，各产各的 Session 和 Message。日报只是其中一个消费品——未来还有时间线、搜索、统计等等。需要一条清晰的数据处理链路，每层职责明确。

## 链路

```
Providers (6 adapters)
  ↓ 各自读自己的数据源
Gateway (SessionGateway)
  ↓ 跨 Provider 合并去重，统一接口
Application (daily / timeline / ...)
  ↓ 业务逻辑：提取、分组、总结
Interface (CLI / REST / MCP)
  ↓ 暴露给用户或 Agent
```

## 边界原则

- **Provider 只做数据读取**，不做跨工具合并，不做 ghost 判断
- **Gateway 管合并去重**，按归一化路径做 key（`normalizeProjectPath`）
- **Application 管业务**，不关心数据从哪个 Provider 来
- **Interface 是薄壳**，只做参数解析和输出格式化

## 为什么不是 Gateway → Agent

一开始的想法是把 Gateway 产出的 SessionDigest 直接塞给 LLM。问题：

1. **没有 Application 层**：Gateway 是通用数据层，不该嵌日报逻辑；日报需要的 grouping、coverage check、ReAct self-correction 都是业务逻辑
2. **单次 LLM 调用不够**：日报需要 agent loop——读取→分析→发现遗漏→追问→补全→写回。这是 Claude Code 的能力，不是单次 API 调用能做到的
3. **用户可控 vs 全自动**：把 MCP Server + Skill 给用户的 Claude Code，用户可以调整、打断、重做。内部自动化管道虽然省事，但用户失去了控制权

## Application 层的两个方向

| 方向 | 做法 | 优势 |
|------|------|------|
| **A: MCP + Skill** | 用户 Claude Code 调 MCP 工具，按 Skill 手册生成日报 | 用户可控、可利用 Claude Code 的 agent loop |
| **B: 内部管道** | Programmatic pipeline，自动调 LLM，自动写回报 | 无需用户参与，适合定时任务 |

当前实现：方向 A 为主（MCP Server + Skill），方向 B 的 material-lab 做实验对比用。
