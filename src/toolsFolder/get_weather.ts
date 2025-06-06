import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const tool: Tool = {
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
};

export const handler = async (args: any, userId?: string) => {
  const { location } = args;
  const mockWeather = {
    location,
    temperature: Math.floor(Math.random() * 30) + 10,
    condition: ["sunny", "cloudy", "rainy", "snowy"][Math.floor(Math.random() * 4)],
  };

  const userPrefix = userId ? `[User: ${userId}] ` : "";
  return {
    content: [
      {
        type: "text",
        text: `the tool is from the new structure ${userPrefix}Weather in ${mockWeather.location}: ${mockWeather.condition}, ${mockWeather.temperature}°C`,
      },
    ],
  };
};
