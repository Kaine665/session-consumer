import { MCPServer } from "./protocol.js";
import * as tools from "./tools/index.js";

const server = new MCPServer();

// ─── Register tools ────────────────────────────────────────────────────────

server.registerTool(
  {
    name: "list_projects",
    description:
      "List all available project names that have AI coding session data. Use this first to discover what projects are available for analysis.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  async () => tools.listProjects(),
);

server.registerTool(
  {
    name: "get_days",
    description:
      "Get a list of days with session counts for a given project. Use this to find which days have activity, then use get_day_sessions to get the full data for a specific day.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name to query (use list_projects to find available names).",
        },
        since: {
          type: "string",
          description: "Optional start date in YYYY-MM-DD format.",
        },
        until: {
          type: "string",
          description: "Optional end date in YYYY-MM-DD format.",
        },
      },
      required: ["projectName"],
    },
  },
  async (args) => tools.getDays(args as { projectName: string; since?: string; until?: string }),
);

server.registerTool(
  {
    name: "get_day_sessions",
    description:
      "Get all sessions for a specific day with four-layer data: userMessages, assistantThinking, assistantText, assistantTools. This is the core data for generating a daily report. Each session has a 1-based index for cross-referencing.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name to query.",
        },
        date: {
          type: "string",
          description: "The date in YYYY-MM-DD format.",
        },
      },
      required: ["projectName", "date"],
    },
  },
  async (args) => tools.getDaySessions(args as { projectName: string; date: string }),
);

server.registerTool(
  {
    name: "get_session_detail",
    description:
      "Get the full message history for a specific session, including complete ContentBlock data. Use this when you need to dig deeper into a session beyond the four-layer summary.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "The session ID to look up.",
        },
      },
      required: ["sessionId"],
    },
  },
  async (args) => tools.getSessionDetail(args as { sessionId: string }),
);

server.registerTool(
  {
    name: "save_daily_report",
    description:
      "Save a generated daily report to persistent storage. The report will be retrievable later via get_recent_reports or get_report.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name this report belongs to.",
        },
        date: {
          type: "string",
          description: "The date this report covers (YYYY-MM-DD).",
        },
        summary: {
          type: "string",
          description: "A one-line summary of the day's work.",
        },
        tasks: {
          type: "array",
          description: "Task items grouped from sessions.",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              sessionCount: { type: "number" },
              messageCount: { type: "number" },
              sessionRefs: {
                type: "array",
                items: { type: "number" },
                description: "1-based session indices this task aggregates.",
              },
            },
            required: ["description", "sessionCount", "messageCount", "sessionRefs"],
          },
        },
        fullText: {
          type: "string",
          description: "The full markdown report text as displayed to the user.",
        },
      },
      required: ["projectName", "date", "summary", "tasks", "fullText"],
    },
  },
  async (args) =>
    tools.saveDailyReport(args as {
      projectName: string;
      date: string;
      summary: string;
      tasks: Array<{
        description: string;
        sessionCount: number;
        messageCount: number;
        sessionRefs: number[];
      }>;
      fullText: string;
    }),
);

server.registerTool(
  {
    name: "get_recent_reports",
    description:
      "List recently saved daily reports. Use this to check if a report already exists for a date before generating a new one.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "Optional project name filter.",
        },
        limit: {
          type: "number",
          description: "Max number of reports to return (default: all, max: 100).",
        },
      },
      required: [],
    },
  },
  async (args) => tools.getRecentReports(args as { projectName?: string; limit?: number }),
);

server.registerTool(
  {
    name: "get_report",
    description:
      "Retrieve a previously saved daily report for a specific project and date.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: {
          type: "string",
          description: "The project name.",
        },
        date: {
          type: "string",
          description: "The date in YYYY-MM-DD format.",
        },
      },
      required: ["projectName", "date"],
    },
  },
  async (args) => tools.getReport(args as { projectName: string; date: string }),
);

// ─── Start ─────────────────────────────────────────────────────────────────

server.start();
