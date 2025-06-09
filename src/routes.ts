import { Router } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { server } from "./mcpServer.js";
import { handleToolCall } from "./handleToolCall.js";
import { tools } from './toolRegistry.js';
import { prisma } from "./utils.js";
import { getToolsForUser } from "./getUserTools.js";

const router = Router();
let transport: SSEServerTransport | null = null;

// Add CORS middleware for MCP routes
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

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

// Handle GET requests to /mcp endpoint (for health checks/connection validation)
router.get("/mcp", async (req, res) => {
  try {
    const message: any = req.body;
    const userId = req.query.userId as string;
    console.log("Received /mcp POST request with userId:", userId);
    console.log("Request body:", JSON.stringify(message, null, 2));
    console.log("Request headers:", req.headers);

    // Validate userId
    if (!userId) {
      console.warn("Missing userId in query parameters");
      return res.status(400).json({
        jsonrpc: '2.0' as const,
        error: {
          code: -32602,
          message: 'Missing required userId parameter'
        },
        id: message?.id || null
      });
    }

    if ('method' in message && 'id' in message) {
      const request = message;

      try {
        let result: any;

        switch (request.method) {
          case 'initialize':
            console.log("Initializing client connection for user:", userId);
            result = {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: {},
                resources: {},
                prompts: {}
              },
              serverInfo: {
                name: "example-server",
                version: "1.0.0"
              }
            };
            break;

          case 'tools/list':
            console.log("Handling tools/list for user:", userId);
            try {
              const filteredTools = await getToolsForUser(userId, tools);
              console.log("Filtered tools for user:", filteredTools);
              result = { tools: filteredTools };
            } catch (error) {
              console.error("Error getting tools for user:", error);
              throw new Error(`Failed to get tools for user: ${(error as Error).message}`);
            }
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

            if (!name) {
              throw new Error('Missing tool name in tools/call');
            }

            const argsWithUser = { ...args, userId };
            console.log("Arguments with userId injected:", argsWithUser);

            try {
              result = await handleToolCall(name, argsWithUser);
              console.log("Tool call result:", result);
            } catch (error) {
              console.error("Error executing tool call:", error);
              throw new Error(`Tool execution failed: ${(error as Error).message}`);
            }
            break;

          case 'resources/list':
            console.log("Handling resources/list for user:", userId);
            // Return empty resources list for now
            result = { 
              resources: [] 
            };
            break;

          case 'prompts/list':
            console.log("Handling prompts/list for user:", userId);
            // Return empty prompts list for now
            result = { 
              prompts: [] 
            };
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
      // Handle JSON-RPC notifications (no response expected)
      console.log("Received JSON-RPC notification:", message.method);
      
      switch (message.method) {
        case 'notifications/cancelled':
          console.log("Request cancelled:", message.params);
          break;
        case 'notifications/progress':
          console.log("Progress notification:", message.params);
          break;
        default:
          console.log("Unknown notification method:", message.method);
      }
      
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

// JSON-RPC endpoint for MCP communication
router.post("/mcp", async (req, res) => {
  try {
    const message: any = req.body;
    const userId = req.query.userId as string;
    console.log("Received /mcp POST request with userId:", userId);
    console.log("Request body:", JSON.stringify(message, null, 2));
    console.log("Request headers:", req.headers);

    // Validate userId
    if (!userId) {
      console.warn("Missing userId in query parameters");
      return res.status(400).json({
        jsonrpc: '2.0' as const,
        error: {
          code: -32602,
          message: 'Missing required userId parameter'
        },
        id: message?.id || null
      });
    }

    if ('method' in message && 'id' in message) {
      const request = message;

      try {
        let result: any;

        switch (request.method) {
          case 'initialize':
            console.log("Initializing client connection for user:", userId);
            result = {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: {},
                resources: {},
                prompts: {}
              },
              serverInfo: {
                name: "example-server",
                version: "1.0.0"
              }
            };
            break;

          case 'tools/list':
            console.log("Handling tools/list for user:", userId);
            try {
              const filteredTools = await getToolsForUser(userId, tools);
              console.log("Filtered tools for user:", filteredTools);
              result = { tools: filteredTools };
            } catch (error) {
              console.error("Error getting tools for user:", error);
              throw new Error(`Failed to get tools for user: ${(error as Error).message}`);
            }
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

            if (!name) {
              throw new Error('Missing tool name in tools/call');
            }

            const argsWithUser = { ...args, userId };
            console.log("Arguments with userId injected:", argsWithUser);

            try {
              result = await handleToolCall(name, argsWithUser);
              console.log("Tool call result:", result);
            } catch (error) {
              console.error("Error executing tool call:", error);
              throw new Error(`Tool execution failed: ${(error as Error).message}`);
            }
            break;

          case 'resources/list':
            console.log("Handling resources/list for user:", userId);
            // Return empty resources list for now
            result = { 
              resources: [] 
            };
            break;

          case 'prompts/list':
            console.log("Handling prompts/list for user:", userId);
            // Return empty prompts list for now
            result = { 
              prompts: [] 
            };
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
      // Handle JSON-RPC notifications (no response expected)
      console.log("Received JSON-RPC notification:", message.method);
      
      switch (message.method) {
        case 'notifications/cancelled':
          console.log("Request cancelled:", message.params);
          break;
        case 'notifications/progress':
          console.log("Progress notification:", message.params);
          break;
        default:
          console.log("Unknown notification method:", message.method);
      }
      
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

// Health check endpoint with timing info
router.get("/health", (req, res) => {
  const startTime = Date.now();
  console.log("Health check requested");
  
  // Simulate small delay to test responsiveness
  setTimeout(() => {
    res.json({
      status: "ok",
      tools: tools.length,
      endpoints: ["/sse", "/mcp"],
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: Date.now() - startTime,
      environment: process.env.NODE_ENV || 'development',
      memory: process.memoryUsage(),
      // Add server readiness indicators
      ready: true,
      lastActivity: new Date().toISOString()
    });
  }, 10); // Small delay to test timing
});

// Catch-all for unsupported methods on /mcp
router.all("/mcp", (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    console.log(`Unsupported method ${req.method} on /mcp endpoint`);
    res.status(405).json({
      error: "Method Not Allowed",
      allowed: ["GET", "POST"],
      received: req.method
    });
  }
});

export { router as routes };