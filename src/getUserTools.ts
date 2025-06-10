// utils/getUserTools.ts or inside the same file above switch block

import { prisma } from "./utils.js";

interface Tool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
  outputSchema?: object;
  annotations?: object;
}


export const getToolsForUser = async (
  userId: string,
  allTools: Tool[]
): Promise<Tool[]> => {
  const userToolEntries = await prisma.userTool.findMany({
    where: {
      userId,
      // authorized: true, // optional
    },
    select: {
      toolId: true,
    },
  });

  const subscribedToolIds = userToolEntries.map((entry) => entry.toolId);

  const filteredTools = allTools.filter((tool) =>
    subscribedToolIds.includes(tool.name)
  );

  return filteredTools;
};
