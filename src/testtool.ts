import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "./utils.js";
import { google } from "googleapis";

// =====================
// Define Available Tools
// =====================
export const tools: Tool[] = [
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
  },
  {
    name: "GMAIL_SENDER",
    description: "Send email using Gmail",
    inputSchema: {
      type: "object",
      properties: {
        toMail: {
          type: "string",
          description: "Recipient email address"
        },
        body: {
          type: "string",
          description: "Body of the email"
        },
        subject: {
          type: "string",
          description: "Subject of the email"
        }
      },
      required: ["toMail", "body", "subject"]
    }
  }
];

// =======================
// Tool Handler Registry
// =======================
type ToolHandlerFn = (args: any, userId?: string) => Promise<any>;

const toolHandlers: Record<string, ToolHandlerFn> = {
  get_weather: handleWeatherTool,
  calculate: handleCalculateTool,
  get_time: handleTimeTool,
  GMAIL_SENDER: handleGmailSender,
};

// ======================
// Tool Execution Handler
// ======================
export async function handleToolCall(name: string, args: any) {
  if (!args) {
    return {
      content: [{ type: "text", text: `No arguments provided for tool: ${name}` }],
      isError: true,
    };
  }

  const { userId, ...toolArgs } = args;

  // Restrict tools to those subscribed by the user
  const userTools = await prisma.userTool.findMany({
    where: { userId },
    select: { toolId: true }
  });
console.log("user tools -> ",userTools)
  const allowedTools = userTools.map(t => t.toolId);
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

// =========================
// Individual Tool Handlers
// =========================

async function handleWeatherTool(args: any, userId?: string) {
  if (!args.location || typeof args.location !== "string") {
    return {
      content: [{ type: "text", text: "Location must be a valid string." }],
      isError: true,
    };
  }

  const mockWeather = {
    location: args.location,
    temperature: Math.floor(Math.random() * 30) + 10,
    condition: ["sunny", "cloudy", "rainy", "snowy"][Math.floor(Math.random() * 4)],
  };

  const userPrefix = userId ? `[User: ${userId}] ` : "";

  return {
    content: [
      {
        type: "text",
        text: `${userPrefix}Weather in ${mockWeather.location}: ${mockWeather.condition}, ${mockWeather.temperature}°C`,
      },
    ],
  };
}

async function handleCalculateTool(args: any, userId?: string) {
  if (!args.expression || typeof args.expression !== "string") {
    return {
      content: [{ type: "text", text: "Expression must be a string." }],
      isError: true,
    };
  }

  try {
    const result = Function(`"use strict"; return (${args.expression})`)();
    const userPrefix = userId ? `[User: ${userId}] ` : "";

    return {
      content: [
        {
          type: "text",
          text: `${userPrefix}${args.expression} = ${result}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Error evaluating expression: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleTimeTool(userId?: string) {
  const now = new Date();
  const userPrefix = userId ? `[User: ${userId}] ` : "";

  return {
    content: [
      {
        type: "text",
        text: `${userPrefix}Current time: ${now.toLocaleString()}`,
      },
    ],
  };
}

async function handleGmailSender(args: any, userId?: string) {
  const { toMail, subject, body } = args;
  const user = userId ?? "";

  const accessKey = await getAccessKey(user, "GMAIL_SENDER");
  const accessToken = accessKey?.accessToken;

  if (!toMail || !body || !subject || !accessToken) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Missing parameters: toMail, subject, body, or accessToken.",
        },
      ],
      isError: true,
    };
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const emailLines = [
    `To: ${toMail}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];

  const email = emailLines.join("\n");
  const encodedMessage = Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `✅ Email sent to ${toMail}. Gmail Message ID: ${res.data.id}`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Failed to send email: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

// ==========================
// Access Key Utility
// ==========================
async function getAccessKey(userId: string, toolId: string) {
  try {
    const accessKey = await prisma.accessKey.findUnique({
      where: {
        userId_toolId: {
          userId,
          toolId,
        },
      },
      include: {
        user: true,
        tool: true,
      },
    });

    if (!accessKey) {
      throw new Error(`No access key found for userId=${userId} and toolId=${toolId}`);
    }

    return accessKey;
  } catch (error) {
    console.error("Error fetching access key:", error);
    throw error;
  }
}
