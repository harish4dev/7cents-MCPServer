import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

// Fake __dirname workaround for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Runtime registry
export const tools: Tool[] = [];
export const toolHandlers: Record<string, (args: any, userId?: string) => Promise<any>> = {};

export async function loadAllTools() {
  const toolsDir = path.resolve(__dirname, "toolsFolder");

  const files = await fs.readdir(toolsDir);

  for (const file of files) {
    if (!file.endsWith(".ts") && !file.endsWith(".js")) continue;

    const modulePath = path.join(toolsDir, file);
    const { tool, handler } = await import(modulePath);

    if (!tool?.name || typeof handler !== "function") {
      console.warn(`Skipping invalid tool module: ${file}`);
      continue;
    }

    tools.push(tool);
    toolHandlers[tool.name] = handler;
  }
}
