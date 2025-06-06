import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { prisma } from "../utils";

// Tool metadata
export const tool: Tool = {
  name: "GMAIL_SENDER",
  description: "Send email using Gmail",
  inputSchema: {
    type: "object",
    properties: {
      toMail: {
        type: "string",
        description: "Recipient email address",
      },
      subject: {
        type: "string",
        description: "Subject of the email",
      },
      body: {
        type: "string",
        description: "Body of the email",
      },
    },
    required: ["toMail", "subject", "body"],
  },
};

// Tool handler
export async function handler(args: any, userId?: string) {
  const { toMail, subject, body } = args;

  if (!toMail || !subject || !body || !userId) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Missing required parameters: toMail, subject, body, or userId.",
        },
      ],
      isError: true,
    };
  }

  // Lookup access token for user
  const accessKey = await prisma.accessKey.findUnique({
    where: {
      userId_toolId: {
        userId,
        toolId: "GMAIL_SENDER",
      },
    },
  });

  const accessToken = accessKey?.accessToken;
  if (!accessToken) {
    return {
      content: [
        {
          type: "text",
          text: "❌ No access token found. Please authenticate Gmail first.",
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

  const rawEmail = Buffer.from(emailLines.join("\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: rawEmail,
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
