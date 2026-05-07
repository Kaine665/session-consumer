# CLAUDE.md

session-consumer — 多数据源 AI 会话聚合器。跨 AI 编程工具（Claude Code / MyAgents / Cursor / Codex / Gemini / OpenCode）统一浏览、搜索、回溯对话。

## 行为准则

这些准则来自 Karpathy 对 LLM 编码常见问题的总结，适用于本项目的所有修改。

### 1. 先想清楚再动手
- 不确定的事情说清楚，不要猜。有多义时列出选项。
- 有更简单的方法就说出来。该 push back 就 push back。

### 2. 简洁至上
- 只写解决问题的最小量代码。不要加没被要求的功能。
- 不要为单次使用的代码写抽象。不要处理不可能发生的错误。
- 200 行能写成 50 行就重写。

### 3. 手术式修改
- 只改必须改的。不要顺手"优化"无关代码、格式、注释。
- 匹配已有代码风格。你改的代码产生的孤立引用可以删，但别动原有的死代码。
- 每条改动行都能追溯到用户请求。

### 4. 目标驱动执行
- 把模糊任务转成可验证目标（"加验证"→"写测试覆盖无效输入再让它通过"）。
- 多步任务先列计划再执行。

---

## 项目架构

```
packages/
├── core/       @sc/core   领域模型 + Provider 接口 + 服务层（零运行时依赖，除 better-sqlite3）
├── cli/        @sc/cli    Commander CLI（sc 命令），薄壳，只做参数解析和输出
└── server/     @sc/server REST API（hono）
```

### 核心领域类型

| 类型 | 定义 | 关键字段 |
|------|------|----------|
| `Session` | 一次 AI 对话 | `provider`, `projectPath`, `messageCount`, `hasToolUse`, `isWorktree` |
| `Message` | 一条消息（user/assistant/system） | `ContentBlock[]`, `TokenUsage`, `costUSD`, `toolUses` |
| `Project` | 一个文件系统项目（跨工具聚合后） | `path`, `providers[]`, `sessionCount`, `resolutionMethod` |

### Provider 接口

6 个 Provider 适配器实现统一接口：

```typescript
interface SessionProvider {
  id: ProviderId;           // "claude-code" | "codex" | "cursor" | "gemini" | "opencode" | "myagents"
  detect(): boolean;        // 检测该工具是否安装
  scanProjects(): Promise<Project[]>;
  loadSessions(projectPath: string): Promise<Session[]>;
  loadMessages(filePath: string, sessionId: string): Promise<Message[]>;
  search(query: string): Promise<Message[]>;
}
```

每个 Provider **只负责从自己的数据源读出数据**，不关心其他 Provider，不做跨工具合并。

### 服务层边界

| 模块 | 职责 | 不负责 |
|------|------|--------|
| `aggregator.ts` | 跨 Provider 合并去重，4 级路径解析 | 不解析具体的 slug/路径格式 |
| `normalizer.ts` | JSONL 解析、路径归一化、slug 还原（DFS）、跨盘符查找 | 不做 Provider 层面的决策 |
| `project-mapping-store.ts` | 读写 `project-mappings.json`（C 层用户映射表） | 不关心 MyAgents——这是自己的文件 |
| `timeline.ts` | 跨会话时间线构建、过滤、分组、统计 | 不修改数据 |
| `searcher.ts` | 跨 Provider 全文搜索、排序 | 不做索引持久化 |
| `diagnostics.ts` | 数据质量检查（孤消息、失配会话） | 不修复数据 |

### Aggregator 的 4 级路径解析（优先级从高到低）

```
A 层（自动）: direct → cross-drive → dfs-resolved → worktree-detected
C 层（人工）: 查询 project-mappings.json 用户映射表
B 层（启发）: 路径尾部匹配（≥3 段）→ tail-matched
D 层（兜底）: unresolved / synthetic / skipped-temp
```

关键设计：**合成路径（`__provider__/xxx`）不会被 B 层尾匹配误吃**——合成路径与真实路径不可能尾部重合。

### 关键抽象边界

- **Provider 只做数据读取**，不做路径合并，不做 ghost 判断
- **Aggregator 只管合并**，按归一化路径做 key（`normalizeProjectPath` = 小写盘符 + 统一分隔符 + 去末尾斜杠）
- **C 层映射表** 是独立模块，存在项目根目录 `project-mappings.json`，不碰 MyAgents 目录
- **CLI 是薄壳**，只解析参数 → 调服务层 → 格式化输出

### 路径解析的核心挑战

Claude Code 和 Cursor 用 lossy slug 编码项目路径（`-` 替代分隔符）。`resolveSlugPath` 用 DFS + 跨盘查找来解决。当 DFS 也失败时，`resolveSlugPathOrNull` 返回 null（而非盲解码残损路径），防止假路径流入尾匹配。

### 开发命令

```bash
pnpm build       # 构建所有包
pnpm typecheck   # 类型检查
pnpm test        # 运行测试
pnpm verify      # typecheck + build + test（pre-commit hook）
```

### 修改禁区

- 不要往 `~/.myagents/` 写任何文件——那是 MyAgents 的目录，与本项目无关
- Provider 之间不要互相引用
- 不要在 CLI 层写业务逻辑
