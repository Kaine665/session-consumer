---
name: session-consumer-daily-report
description: Generate concise daily work reports from AI coding session data. Use this skill when the user asks for a daily summary, work report, or "what did I do today" — it queries session-consumer MCP tools, analyzes sessions, and produces a structured report.
version: 0.1.0
tags: [reporting, productivity, sessions]
allowed-tools:
  - mcp__session-consumer__list_projects
  - mcp__session-consumer__get_days
  - mcp__session-consumer__get_day_sessions
  - mcp__session-consumer__get_session_detail
  - mcp__session-consumer__save_daily_report
  - mcp__session-consumer__get_recent_reports
  - mcp__session-consumer__get_report
---

# Daily Report Skill

Generate a daily work report from AI coding session data stored by session-consumer.

## Pre-condition

The user must have configured the session-consumer MCP server in their Claude Code settings. All tools are prefixed with `mcp__session-consumer__`.

## Workflow

### Step 1: Discover the target

If the user says "today", compute the date. If they say "yesterday", compute it. If they say a specific date, use it. If ambiguous, ask.

Then call `get_days` with the project name to confirm there are sessions for that date.

### Step 2: Load the sessions

Call `get_day_sessions(projectName, date)`. Each session has:
- `index` — 1-based number, used in `sessionRefs`
- `userMessages` — what the user asked (complete)
- `assistantThinking` — AI's reasoning blocks
- `assistantText` — AI's text responses
- `assistantTools` — tool calls (file writes, commands, etc.)
- `provider`, `messageCount`, `durationMinutes`

### Step 3: Analyze and group

Read through all sessions. Group related sessions into tasks. Look for:
- Sessions working on the same feature or bug
- Sessions about the same topic (e.g., "refactoring X", "fixing Y")
- Sessions that reference the same files or concepts

Key principles:
- **Group by what was accomplished, not by session boundaries.** One task may span multiple sessions.
- **Every session MUST be assigned to exactly one task.** Sessions without a task are data loss.
- **Use the four layers to understand intent, not just tools.** `assistantThinking` tells you what the AI was reasoning about; `userMessages` tells you what the user wanted.
- **3-8 tasks max**, ordered by significance.

### Step 4: Write the report

Output format:

```json
{
  "summary": "One sentence capturing the day's main theme",
  "tasks": [
    {
      "description": "What was concretely accomplished",
      "sessionCount": 2,
      "messageCount": 520,
      "sessionRefs": [1, 4]
    }
  ]
}
```

Rules:
- `summary` captures the main theme, not just a list
- `description` is in Chinese, specific — "修复思考中卡住的 Bug（366 条消息）" not "修 Bug"
- `sessionRefs` uses 1-based session indices
- Every session appears in exactly one task's `sessionRefs`
- Skip trivial sessions (single "你好" with no follow-up)
- If user messages are mostly prompts/templates ("> "), note it as system configuration work

### Step 5: Verify coverage

Count all session indices from the day and verify they all appear in at least one task. If any session is unaccounted for, either:
- Assign it to the closest matching task
- Create a new task for it
- Explicitly note why it was skipped

### Step 6: Save the report

Call `save_daily_report(projectName, date, summary, tasks, fullText)`.

`fullText` should be a human-readable markdown version:

```markdown
# 工作日报 — {date}

## 概述
{summary}

## 今日工作
1. **{task description}** — {sessionCount} 个会话, {messageCount} 条消息
2. ...

## 数据来源
- {sessionCount} 个会话, {totalMessages} 条消息
- Providers: {providers}
```

### Step 7: Present to user

Show the markdown report to the user. Mention it was saved to `~/.sc/reports/`.

## Deep Dives

If a session looks interesting but you can't tell what happened from the four-layer summary, call `get_session_detail(sessionId)` to get the complete message history with full ContentBlock data.

## Checking Past Reports

Before generating, call `get_recent_reports(projectName, limit: 5)` to see if a report already exists for this date. If it does and the user didn't ask for a redo, tell them.
