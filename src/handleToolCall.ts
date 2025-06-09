import { toolHandlers } from "./toolRegistry.js";
import { prisma } from "./utils.js";

export async function handleToolCall(name: string, args: any) {
  if (!args) {
    return {
      content: [{ type: "text", text: `No arguments provided for tool: ${name}` }],
      isError: true,
    };
  }

  const { userId, ...toolArgs } = args;

  const userTools = await prisma.userTool.findMany({
    where: { userId },
    select: { toolId: true },
  });

  const allowedTools = userTools.map((t) => t.toolId);
  if (!allowedTools.includes(name)) {
    return {
      content: [{ type: "text", text: `❌ Access denied. Tool "${name}" is not subscribed for this user.` }],
      isError: true,
    };
  }

  const handler = toolHandlers[name];
  if (!handler) {
    return {
      content: [{ type: "text", text: `❌ Tool "${name}" is not implemented.` }],
      isError: true,
    };
  }

  return await handler(toolArgs, userId);
}
