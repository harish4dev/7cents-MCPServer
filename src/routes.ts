import { Router } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { server } from "./mcpServer.js";
// import { tools, handleToolCall } from "./testtool";
import { handleToolCall } from "./handleToolCall.js";
import {tools} from './toolRegistry.js'
import { prisma } from "./utils.js";
import { getToolsForUser } from "./getUserTools.js";
const router = Router();
let transport: SSEServerTransport | null = null;

// SSE endpoint for establishing connection
router.get("/sse", (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  server.connect(transport);
});

// Handle MCP messages for SSE
router.post("/messages", (req, res) => {
  if (transport) {
    transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: "No SSE connection established" });
  }
});

// JSON-RPC endpoint for MCP communication
router.post("/mcp", async (req, res) => {
  try {
    const message: any = req.body;
    console.log("headder sent ny the client",req.headers)
    const userId = req.query.userId as string; // Extract userId from query string
    console.log("the user id is there:", userId);
    
    // Validate JSON-RPC format
    if (!message.jsonrpc || message.jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0' as const,
        error: {
          code: -32600,
          message: 'Invalid Request - missing or invalid jsonrpc field'
        },
        id: message.id || null
      });
    }

    // Handle JSON-RPC request
    if ('method' in message && 'id' in message) {
      // This is a request (has method and id)
      const request = message;
      
      try {
        let result: any;
        
        switch (request.method) {
          case 'initialize':
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
              const filteredTools = await getToolsForUser(userId, tools);
              result = { tools: filteredTools };
              
             break
              
            
          case 'tools/call':
            if (!request.params) {
              throw new Error('Missing parameters for tools/call');
            }
            
            const { name, arguments: args } = request.params as any;
            
            // Inject userId into args before calling tool
            const argsWithUser = { ...args, userId };
            
            result = await handleToolCall(name, argsWithUser);
            break;
            
          default:
            throw new Error(`Method not found: ${request.method}`);
        }
        
        // Success response
        res.json({
          jsonrpc: '2.0' as const,
          result,
          id: request.id
        });
        
      } catch (error) {
        // Error response
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
      // This is a notification (has method but no id)
      res.status(204).send();
    } else {
      // Invalid message format
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
    res.status(400).json({
      jsonrpc: '2.0' as const,
      error: {
        code: -32700,
        message: 'Parse error'
      },
      id: null
    });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({ 
    status: "ok",
    tools: tools.length,
    endpoints: ["/sse", "/mcp"]
  });
});

export default router;