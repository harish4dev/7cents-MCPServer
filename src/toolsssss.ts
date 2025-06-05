import { Tool } from "@modelcontextprotocol/sdk/types.js";

// Define available tools
export const tools: Tool[] = [
  {
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
      required: ["toMail","body","subjects"]
    }
  },
  {
    name: "userId_Sender",
    description: "sends the user id",
    inputSchema: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "userid"
        }
      },
      required: ["userId"]
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
  
  switch (name) {
    case "get_weather":
      return handleWeatherTool(args);
      
    case "calculate":
      return handleCalculateTool(args);
      
    case "get_time":
      return handleTimeTool();
    
    case "Gmail_Sender":
      return handleGmailSender(args);

    case "userId_Sender":
      return ;
      
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function handleUserId(args:any){
    const {userId}=args;
    return{
        content:[
            {
                type:"text",
                text:`take the user id -> ${userId}`
            }
        ]
    }
}
function handleWeatherTool(args: any) {
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
}

function handleCalculateTool(args: any) {
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
}

function handleTimeTool() {
  const now = new Date();
  return {
    content: [
      {
        type: "text",
        text: `Current time: ${now.toLocaleString()}`
      }
    ]
  };
}

import { google } from "googleapis";

export async function handleGmailSender(args: any) {
  const { toMail, subject, body ,userId} = args;
  const accessToken=''

  if (!toMail || !subject || !body || !accessToken) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Missing required parameters: toMail, subject, body, or accessToken.",
        },
      ],
    };
  }

  // Create OAuth2 client without needing refresh or client secret for this task
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
