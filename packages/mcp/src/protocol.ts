/**
 * Minimal MCP (Model Context Protocol) implementation over stdio.
 * Handles JSON-RPC 2.0 message framing, request/response routing.
 */

export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export type JSONRPCMessage = JSONRPCRequest | JSONRPCResponse | JSONRPCNotification;

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolHandler {
  (args: Record<string, unknown>): Promise<unknown>;
}

/** MCP Server that handles the protocol lifecycle over stdio. */
export class MCPServer {
  private tools = new Map<string, { def: MCPTool; handler: ToolHandler }>();
  private initialized = false;

  /** Register a tool that Claude Code can call. */
  registerTool(tool: MCPTool, handler: ToolHandler): void {
    this.tools.set(tool.name, { def: tool, handler });
  }

  /** Start listening on stdin and responding on stdout. */
  async start(): Promise<void> {
    process.stdin.setEncoding("utf-8");

    let buffer = "";
    process.stdin.on("data", async (chunk: string) => {
      buffer += chunk;

      // MCP uses newline-delimited JSON over stdio
      while (buffer.includes("\n")) {
        const newlineIdx = buffer.indexOf("\n");
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (!line) continue;

        try {
          const msg = JSON.parse(line) as JSONRPCMessage;
          await this.handleMessage(msg);
        } catch {
          this.sendError(null, -32700, "Parse error");
        }
      }
    });

    // Keep process alive
    process.stdin.resume();
  }

  private async handleMessage(msg: JSONRPCMessage): Promise<void> {
    // Notifications
    if (!("id" in msg)) {
      if (msg.method === "notifications/initialized") {
        // Client confirms init is done — ready for tool calls
      }
      return;
    }

    const { id, method, params } = msg as JSONRPCRequest;

    switch (method) {
      case "initialize":
        this.handleInitialize(id, params);
        break;
      case "tools/list":
        this.handleListTools(id);
        break;
      case "tools/call":
        await this.handleToolCall(id, params);
        break;
      default:
        this.sendError(id, -32601, `Method not found: ${method}`);
    }
  }

  private handleInitialize(id: number | string, _params?: Record<string, unknown>): void {
    this.initialized = true;
    this.sendResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "session-consumer",
        version: "0.1.0",
      },
    });
  }

  private handleListTools(id: number | string): void {
    const tools = [...this.tools.values()].map((t) => t.def);
    this.sendResult(id, { tools });
  }

  private async handleToolCall(id: number | string, params?: Record<string, unknown>): Promise<void> {
    const toolName = params?.name as string | undefined;
    if (!toolName) {
      this.sendError(id, -32602, "Missing tool name");
      return;
    }

    const entry = this.tools.get(toolName);
    if (!entry) {
      this.sendError(id, -32602, `Unknown tool: ${toolName}`);
      return;
    }

    try {
      const args = (params?.arguments as Record<string, unknown>) || {};
      const result = await entry.handler(args);
      this.sendResult(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      });
    } catch (err) {
      this.sendResult(id, {
        content: [
          {
            type: "text",
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      });
    }
  }

  private sendResult(id: number | string, result: unknown): void {
    this.write({ jsonrpc: "2.0", id, result });
  }

  private sendError(id: number | string | null, code: number, message: string): void {
    this.write({ jsonrpc: "2.0", id: id ?? 0, error: { code, message } });
  }

  private write(msg: JSONRPCResponse): void {
    process.stdout.write(JSON.stringify(msg) + "\n");
  }
}
