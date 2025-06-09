import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "./utils.js";

// Define available tools
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
  },{
    name: "Gmail_Sender",
    description: "sends mail uisng gmail",
    inputSchema: {
      type: "object",
      properties: {
        toMail: {
          type: "string",
          description: "mail address to send "
        },
        body:{
            type:"string",
            description:"body of the mail"
        },
        subject:{
            type:"string",
            description:"subject of the mail"
        }
      },
      required: ["toMail","body","subject"]
    }
  }
];

// Tool execution handlers
export async function handleToolCall(name: string, args: any) {
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
  
  // Extract userId from args (injected from route handler)
  const { userId, ...toolArgs } = args;
  
  
  switch (name) {
    case "get_weather":
      return handleWeatherTool(toolArgs, userId);
      
    case "calculate":
      return handleCalculateTool(toolArgs, userId);
      
    case "get_time":
      return handleTimeTool(userId);

     case "Gmail_Sender":
          return handleGmailSender(toolArgs,userId);
      
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function handleWeatherTool(args: any, userId?: string) {
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
  
  const userPrefix = userId ? `[User: ${userId}] ` : '';
  
  return {
    content: [
      {
        type: "text",
        text: `${userPrefix}Weather in ${mockWeather.location}: ${mockWeather.condition}, ${mockWeather.temperature}°C`
      }
    ]
  };
}

function handleCalculateTool(args: any, userId?: string) {
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
    const userPrefix = userId ? `[User: ${userId}] ` : '';
    
    return {
      content: [
        {
          type: "text",
          text: `${userPrefix}${args.expression} = ${result}`
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
}

function handleTimeTool(userId?: string) {
  const now = new Date();
  const userPrefix = userId ? `[User: ${userId}] ` : '';
  
  return {
    content: [
      {
        type: "text",
        text: `${userPrefix}Current time: ${now.toLocaleString()}`
      }
    ]
  };
}

import { google } from "googleapis";

async function handleGmailSender(args: any, userId?: string) {
  const { toMail, subject, body } = args;
  const user = userId ?? '';
  console.log(args,"this is args")

  const accessKey = await getAccessKey(user, "GMAIL_SENDER");
  const accessToken = accessKey?.accessToken;
  console.log(accessToken)

  if (!toMail  || !body || !accessToken) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Missing required parameters: toMail, subject, body, or accessToken.",
        },
      ],
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
          text: `✅ Email sent successfully to ${toMail}. Gmail Message ID: ${res.data.id}`,
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
    };
  }
}


async function getAccessKey(userId: string, toolId: string) {
  try {
    const accessKey = await prisma.accessKey.findUnique({
      where: {
        userId_toolId: {
          userId,
          toolId
        }
      },
      include: {
        user: true,
        tool: true
      }
    });

    if (!accessKey) {
      throw new Error(`No access key found for userId=${userId} and toolId=${toolId}`);
    }

    return accessKey;
  } catch (error) {
    console.error('Error fetching access key:', error);
    throw error;
  }
}