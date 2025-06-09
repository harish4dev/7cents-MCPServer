import express from "express";
import {routes} from "./routes.js";
// import { tools } from "./testtool";
import { loadAllTools, tools } from "./toolRegistry.js";

(async () => {
  await loadAllTools();
  console.log("Registered tools:", tools.map(t => t.name));
})();


const app = express();
app.use(express.json());

// Use routes
app.use(routes);

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`MCP Server running on  ada port ${PORT}`);
  console.log(`Available tools: ${tools.map(t => t.name).join(", ")}`);
  console.log(`Endpoints: /sse (SSE), /mcp (JSON-RPC), /health`);
});