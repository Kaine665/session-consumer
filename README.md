# session-consumer

Multi-source AI coding session aggregator. Normalize, browse, search, and report on conversations across AI coding tools.

**6 providers, one unified view.** Claude Code, MyAgents, Cursor, Codex, Gemini, OpenCode — each stores session data in its own format and location. session-consumer reads them all, deduplicates projects across tools, and gives you a single interface to explore your AI-assisted work.

## Architecture

```
Providers (6 adapters) → Gateway → Application → Interface (CLI / REST / MCP)

packages/
├── core/       @sc/core    Domain model + Provider interface + services (zero runtime deps)
├── daily/      @sc/daily   Extract layer — 4-layer message parsing, compression, LLM material
├── timeline/               Timeline views across sessions
├── cli/        @sc/cli     Commander CLI (sc command) — thin shell, arg parsing + output
├── server/     @sc/server  REST API (Hono)
├── mcp/        @sc/mcp     MCP server — exposes session data as tools for Claude Code
├── web/        @sc/web     Web UI
└── desktop/                Electron desktop shell
```

### Core concept: Provider → Gateway → Application

- **Providers** only read their own data source. They don't know about other providers.
- **Gateway** aggregates across providers, deduplicates projects by normalized path, merges sessions.
- **Application** layers (daily, timeline) add business logic on top of gateway data.
- **Interface** layers (CLI, REST, MCP) expose data to users and agents.

### 4-layer message extraction

Messages are parsed from `ContentBlock[]` into four distinct layers:

| Layer | Source | Purpose |
|-------|--------|---------|
| `userMessages` | TextBlock on user messages | What the user asked |
| `assistantThinking` | ThinkingBlock | AI's reasoning |
| `assistantText` | TextBlock on assistant messages | AI's responses |
| `assistantTools` | ToolUseBlock + toolUses fallback | Tool calls made |

Extraction is pure rules — no LLM. Complete, no truncation.

## Features

- **Unified project view** — Same project across Claude Code, Cursor, and Codex appears once
- **Smart deduplication** — 4-level path resolution (direct → cross-drive → DFS → user-mapped)
- **Cross-tool search** — Full-text search across all 6 providers
- **Daily reports** — MCP server + Skill: let Claude Code read your sessions and generate work summaries
- **CLI** — `sc list projects`, `sc search "refactor auth"`, `sc timeline --project my-app`

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run typecheck
pnpm typecheck

# Run tests
pnpm test
```

### CLI

```bash
# List all projects with session counts
sc list projects

# View sessions for a project
sc view --project my-app

# Search across all sessions
sc search "database migration"
```

### MCP Server (for Claude Code)

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "session-consumer": {
      "command": "bun",
      "args": ["packages/mcp/dist/index.js"]
    }
  }
}
```

Tools exposed:

| Tool | Description |
|------|-------------|
| `list_projects` | List all available projects |
| `get_days` | Days with session counts for a project |
| `get_day_sessions` | Full 4-layer session data for a day |
| `get_session_detail` | Complete message history for a session |
| `save_daily_report` | Persist a generated daily report |
| `get_recent_reports` | List saved reports |
| `get_report` | Retrieve a specific report |

With the bundled [Skill](./packages/mcp/skill/SKILL.md), Claude Code can autonomously generate daily work reports: discover active days → load session data → analyze and group into tasks → save the report.

## Providers

| Provider | Data Source | Detection |
|----------|------------|-----------|
| Claude Code | `~/.claude/projects/*.jsonl` | `claude` CLI available |
| MyAgents | `~/.myagents/sessions/` | MyAgents registry |
| Cursor | `~/.cursor/chats/` workspace storage | Cursor paths exist |
| Codex | `~/.codex/sessions/` | `codex` CLI available |
| Gemini | `~/.gemini/sessions/` | `gemini` CLI available |
| OpenCode | `~/.opencode/history/` | OpenCode paths exist |

## License

Apache-2.0
