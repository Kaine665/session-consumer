# 四层消息提取模型

## 为什么是四层

原先 `SessionDigest` 只有一个 `actions: string[]` 字段，把 tool calls 和 text 混在一起。这导致：

- 看不清 AI 做了什么（调用工具 ≠ 说了什么 ≠ 想了什么）
- LLM 很难从混合列表中判断工作的真实内容
- Cursor 没有 thinking 块，Claude Code 有——不同 Provider 的混合方式不同

拆成四层后，每层有独立语义：

| 层 | ContentBlock 类型 | 含义 |
|----|------------------|------|
| `userMessages` | TextBlock (user role) | 用户要什么 |
| `assistantThinking` | ThinkingBlock | AI 怎么想的 |
| `assistantText` | TextBlock (assistant role) | AI 说了什么 |
| `assistantTools` | ToolUseBlock + toolUses fallback | AI 调了什么工具 |

## 提取规则

纯规则提取，不调 LLM：

1. **userMessages** — 所有 `role === "user"` 的消息的 `content` 中 `TextBlock.text`
2. **assistantThinking** — 所有 `ThinkingBlock.thinking`，去重
3. **assistantText** — 所有 assistant 消息的 `TextBlock.text`，去重
4. **assistantTools** — `ToolUseBlock` 转 `"toolName(args)"` 格式 + `m.toolUses` 做 fallback

## Selector vs Compressor 分离

- **Extract**（digest.ts）：从 ContentBlock 拆四层，**不截断**——完整保留
- **Selector**（selector.ts）：决定取哪些字段（WHAT）——`infoTypes: ["userMessages", "assistantTools"]` 等
- **Compressor**（compressor.ts）：每层独立裁剪数量（HOW MUCH）——`head(5)`, `headTail(3,2)`, `sample(3)`

两个旋钮不再混在一起。Selector 不管数量，Compressor 不管字段选择。

## 设计演进

1. 最初：`actions: string[]` 混合 tool + text
2. 讨论后：拆 tool / text / thinking 三层
3. 用户明确：加 userMessages，共四层
4. 实现：从 Message.content ContentBlock[] 直接解析，不依赖 top-level 快捷字段

关键认知：**不同 Provider 的 ContentBlock 结构不同**。Cursor 没有 ThinkingBlock，Codex 格式又不一样。提取函数通过类型判断做 fallback，保证跨 Provider 都能产出四层数据（空数组也比缺字段好）。
