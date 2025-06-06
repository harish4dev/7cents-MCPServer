import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { 
  ListToolsRequestSchema,
  InitializeRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./toolRegistry";

// Create MCP server with tools capability
export const server = new Server({
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

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Note: Tool call handling is done directly in the HTTP routes 
// to access request context (like userId from query params)