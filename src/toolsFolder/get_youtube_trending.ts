import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const tool: Tool = {
  name: "get_youtube_trending",
  description: "Get trending YouTube videos for a specific topic or category",
  inputSchema: {
    type: "object",
    properties: {
      prompts: {
        type: "string",
        description: "Topic or category to search for trending videos (e.g., 'esports', 'gaming', 'music', 'tech', etc.)"
      }
    },
    required: ["prompts"]
  }
};

export const handler = async (args: any, userId?: string) => {
  const { prompts } = args;
  
  try {
    const response = await fetch('https://store7cents.app.n8n.cloud/webhook/7ccb5392-a191-41b6-bf2f-8e333ab95a0c', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompts: prompts
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const userPrefix = userId ? `[User: ${userId}] ` : "";
    
    return {
      content: [
        {
          type: "text",
          text: `${userPrefix}Trending YouTube videos for "${prompts}":\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    const userPrefix = userId ? `[User: ${userId}] ` : "";
    return {
      content: [
        {
          type: "text",
          text: `${userPrefix}Error fetching YouTube trending videos: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
  }
};