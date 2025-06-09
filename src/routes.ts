import { Router } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { server } from "./mcpServer.js";
import { handleToolCall } from "./handleToolCall.js";
import { tools } from './toolRegistry.js';
import { prisma } from "./utils.js";
import { getToolsForUser } from "./getUserTools.js";

const router = Router();
let transport: SSEServerTransport | null = null;

// SSE endpoint for establishing connection
router.get("/sse", (req, res) => {
  console.log("Incoming SSE connection");
  transport = new SSEServerTransport("/messages", res);
  server.connect(transport);
  console.log("SSE transport initialized");
});

// Handle MCP messages for SSE
router.post("/messages", (req, res) => {
  if (transport) {
    console.log("Received message via /messages:", req.body);
    transport.handlePostMessage(req, res);
  } else {
    console.warn("No SSE connection established");
    res.status(400).json({ error: "No SSE connection established" });
  }
});

// JSON-RPC endpoint for MCP communication
router.post("/mcp", async (req, res) => {
  try {
    const message: any = req.body;
    const userId = req.query.userId as string;
    console.log("Received /mcp request with userId:", userId);
    console.log("Request body:", JSON.stringify(message, null, 2));
    console.log("Request headers:", req.headers);

    if ('method' in message && 'id' in message) {
      const request = message;

      try {
        let result: any;

        switch (request.method) {
          case 'initialize':
            console.log("Initializing client connection");
            result = {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: {}
              },
              serverInfo: {
                name: "example-server",
                version: "1.0.0"
              }
            };
            break;

          case 'tools/list':
            console.log("Handling tools/list for user:", userId);
            const filteredTools = await getToolsForUser(userId, tools);
            console.log("Filtered tools for user:", filteredTools);
            result = { tools: filteredTools };
            break;

          case 'tools/call':
            console.log("Handling tools/call");

            if (!request.params) {
              console.warn("Missing parameters in tools/call request");
              throw new Error('Missing parameters for tools/call');
            }

            const { name, arguments: args } = request.params;
            console.log("Tool name:", name);
            console.log("Tool arguments:", args);

            const argsWithUser = { ...args, userId };
            console.log("Arguments with userId injected:", argsWithUser);

            result = await handleToolCall(name, argsWithUser);
            console.log("Tool call result:", result);
            break;

          default:
            console.warn("Unknown method:", request.method);
            throw new Error(`Method not found: ${request.method}`);
        }

        res.json({
          jsonrpc: '2.0' as const,
          result,
          id: request.id
        });

      } catch (error) {
        console.error("Error processing JSON-RPC request:", error);
        res.status(500).json({
          jsonrpc: '2.0' as const,
          error: {
            code: -32603,
            message: (error as Error).message
          },
          id: request.id
        });
      }
    } else if ('method' in message && !('id' in message)) {
      console.log("Received JSON-RPC notification:", message.method);
      res.status(204).send();
    } else {
      console.warn("Invalid JSON-RPC message format");
      res.status(400).json({
        jsonrpc: '2.0' as const,
        error: {
          code: -32600,
          message: 'Invalid Request - missing method'
        },
        id: message.id || null
      });
    }

  } catch (error) {
    console.error("Unhandled error in /mcp route:", error);
    res.status(400).json({
      jsonrpc: '2.0' as const,
      error: {
        code: -32700,
        message: 'Parse error or invalid request'
      },
      id: null
    });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  console.log("Health check requested");
  res.json({
    status: "ok",
    tools: tools.length,
    endpoints: ["/sse", "/mcp"]
  });
});

export { router as routes };
