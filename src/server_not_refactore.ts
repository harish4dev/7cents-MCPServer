import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  Tool, 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  InitializeRequestSchema,
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse
} from "@modelcontextprotocol/sdk/types.js";

const app = express();
app.use(express.json());

// Define tools
const tools: Tool[] = [
  {
    name: "get_weather",
    description: "Get current weather for a location",
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City name or coordinates"
        }
      },
      required: ["location"]
    }
  },
  {
    name: "calculate",
    description: "Perform basic math calculations",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Mathematical expression to evaluate"
        }
      },
      required: ["expression"]
    }
  },
  {
    name: "get_time",
    description: "Get current time",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// Create MCP server with tools capability
const server = new Server({
  name: "example-server",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {} // Enable tools
  }
});

// Register initialize handler
server.setRequestHandler(InitializeRequestSchema, async (request) => {
  return {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {}
    },
    serverInfo: {
      name: "example-server",
      version: "1.0.0"
    }
  };
});

// Register tool list handler using the imported schema
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Register tool call handler using the imported schema
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  // Check if args is provided
  if (!args) {
    return {
      content: [
        {
          type: "text",
          text: `No arguments provided for tool: ${name}`
        }
      ],
      isError: true
    };
  }
  
  switch (name) {
    case "get_weather":
      if (!args.location || typeof args.location !== 'string') {
        return {
          content: [
            {
              type: "text",
              text: "Location parameter is required and must be a string"
            }
          ],
          isError: true
        };
      }
      
      // Mock weather data - in real app, call weather API
      const mockWeather = {
        location: args.location,
        temperature: Math.floor(Math.random() * 30) + 10,
        condition: ["sunny", "cloudy", "rainy", "snowy"][Math.floor(Math.random() * 4)]
      };
      
      return {
        content: [
          {
            type: "text",
            text: `Weather in ${mockWeather.location}: ${mockWeather.condition}, ${mockWeather.temperature}°C`
          }
        ]
      };
      
    case "calculate":
      if (!args.expression || typeof args.expression !== 'string') {
        return {
          content: [
            {
              type: "text",
              text: "Expression parameter is required and must be a string"
            }
          ],
          isError: true
        };
      }
      
      try {
        // Note: In production, use a proper math parser instead of eval
        const result = Function(`"use strict"; return (${args.expression})`)();
        return {
          content: [
            {
              type: "text",
              text: `${args.expression} = ${result}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error calculating "${args.expression}": ${(error as Error).message}`
            }
          ],
          isError: true
        };
      }
      
    case "get_time":
      // No arguments needed for get_time
      const now = new Date();
      return {
        content: [
          {
            type: "text",
            text: `Current time: ${now.toLocaleString()}`
          }
        ]
      };
      
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

let transport: SSEServerTransport | null = null;

// SSE endpoint for establishing connection
app.get("/sse", (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  server.connect(transport);
});

// Handle MCP messages for SSE
app.post("/messages", (req, res) => {
  if (transport) {
    transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: "No SSE connection established" });
  }
});

// JSON-RPC endpoint for MCP communication
app.post("/mcp", async (req, res) => {
  try {
    const message: any = req.body;
    console.log("this req",req)
    console.log("this is req.body",req.body)
    
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
            result = { tools };
            break;
            
          case 'tools/call':
            if (!request.params) {
              throw new Error('Missing parameters for tools/call');
            }
            
            const { name, arguments: args } = request.params as any;
            result = await handleToolCall(name, args);
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

// Helper function to handle tool calls
async function handleToolCall(name: string, args: any) {
  if (!args) {
    return {
      content: [
        {
          type: "text",
          text: `No arguments provided for tool: ${name}`
        }
      ],
      isError: true
    };
  }
  
  switch (name) {
    case "get_weather":
      if (!args.location || typeof args.location !== 'string') {
        return {
          content: [
            {
              type: "text",
              text: "Location parameter is required and must be a string"
            }
          ],
          isError: true
        };
      }
      
      const mockWeather = {
        location: args.location,
        temperature: Math.floor(Math.random() * 30) + 10,
        condition: ["sunny", "cloudy", "rainy", "snowy"][Math.floor(Math.random() * 4)]
      };
      
      return {
        content: [
          {
            type: "text",
            text: `Weather in ${mockWeather.location}: ${mockWeather.condition}, ${mockWeather.temperature}°C`
          }
        ]
      };
      
    case "calculate":
      if (!args.expression || typeof args.expression !== 'string') {
        return {
          content: [
            {
              type: "text",
              text: "Expression parameter is required and must be a string"
            }
          ],
          isError: true
        };
      }
      
      try {
        const result = Function(`"use strict"; return (${args.expression})`)();
        return {
          content: [
            {
              type: "text",
              text: `${args.expression} = ${result}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error calculating "${args.expression}": ${(error as Error).message}`
            }
          ],
          isError: true
        };
      }
      
    case "get_time":
      const now = new Date();
      return {
        content: [
          {
            type: "text",
            text: `Current time: ${now.toLocaleString()}`
          }
        ]
      };
      
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok",
    tools: tools.length,
    endpoints: ["/sse", "/mcp"]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
  console.log(`Available tools: ${tools.map(t => t.name).join(", ")}`);
  console.log(`Endpoints: /sse (SSE), /mcp (JSON-RPC)`);
});