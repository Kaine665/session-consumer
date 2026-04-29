#!/usr/bin/env node
import { Command } from "commander";
import {
  ClaudeCodeProvider,
  CodexProvider,
  CursorProvider,
  GeminiProvider,
  OpenCodeProvider,
  MyAgentsProvider,
} from "@sc/core";
import { listProjects, listSessions } from "./commands/list.js";
import { viewSession } from "./commands/view.js";
import { searchCommand } from "./commands/search.js";

const providers = [
  ClaudeCodeProvider,
  CodexProvider,
  CursorProvider,
  GeminiProvider,
  OpenCodeProvider,
  MyAgentsProvider,
];

const program = new Command();

program
  .name("sc")
  .description("Multi-source AI session browser — list, search, and view conversations across AI coding tools")
  .version("0.1.0");

program
  .command("list [type]")
  .description("List projects or sessions. Default: projects.")
  .option("-p, --project <name>", "Filter by project name")
  .option("-n, --limit <n>", "Max results", "20")
  .action(async (type, opts) => {
    if (type === "sessions") {
      await listSessions(providers, opts);
    } else {
      await listProjects(providers, opts);
    }
  });

program
  .command("view <sessionId>")
  .description("View a session's messages")
  .option("-n, --limit <n>", "Max messages", "50")
  .action(async (sessionId, opts) => {
    await viewSession(providers, sessionId, opts);
  });

program
  .command("search <query>")
  .description("Full-text search across all sessions")
  .option("-p, --provider <name>", "Filter by provider")
  .option("-t, --type <type>", "Filter by message type (user|assistant|system)")
  .option("-n, --limit <n>", "Max results", "20")
  .action(async (query, opts) => {
    await searchCommand(providers, query, opts);
  });

program.parse();
