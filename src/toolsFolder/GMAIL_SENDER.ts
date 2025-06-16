import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { prisma } from "../utils.js";
import dotenv from "dotenv";

dotenv.config();

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

// Helper function to check if token needs refresh
function shouldRefreshToken(expiryDate?: Date): boolean {
  if (!expiryDate) return true;
  
  // Refresh if token expires within next 5 minutes
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return expiryDate <= fiveMinutesFromNow;
}

// Helper function to refresh access token
async function refreshAccessToken(oauth2Client: any, userId: string, refreshToken: string) {
  try {
    console.log("Attempting to refresh access token...");
    
    const tokenResponse = await oauth2Client.refreshAccessToken();
    const newAccessToken = tokenResponse.credentials.access_token;
    const newRefreshToken = tokenResponse.credentials.refresh_token;
    
    if (!newAccessToken) {
      throw new Error("No access token received from refresh");
    }

    // Calculate expiry time (Google tokens typically last 1 hour)
    const expiryDate = new Date(Date.now() + 3600 * 1000); // 1 hour from now

    // Update database with new tokens
    await prisma.accessKey.update({
      where: {
        userId_toolId: {
          userId,
          toolId: "GMAIL_SENDER",
        },
      },
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken || refreshToken,
        expiryDate: expiryDate,
      },
    });

    console.log("Access token refreshed successfully");
    return newAccessToken;
  } catch (error: any) {
    console.error("Token refresh failed:", error);
    throw new Error(`Token refresh failed: ${error.message}`);
  }
}

// Helper function to send email
async function sendEmail(gmail: any, toMail: string, subject: string, body: string) {
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

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: rawEmail,
    },
  });

  return res;
}

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

  // Validate environment variables
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    console.error("Missing Google OAuth environment variables:", {
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
      hasRedirectUri: !!GOOGLE_REDIRECT_URI,
    });
    return {
      content: [
        {
          type: "text",
          text: "❌ Server configuration error: Google OAuth credentials not set.",
        },
      ],
      isError: true,
    };
  }

  // Retrieve tokens from database
  const accessKey = await prisma.accessKey.findUnique({
    where: {
      userId_toolId: {
        userId,
        toolId: "GMAIL_SENDER",
      },
    },
  });

  if (!accessKey?.refreshToken) {
    return {
      content: [
        {
          type: "text",
          text: "❌ No refresh token found. Please authenticate Gmail first.",
        },
      ],
      isError: true,
    };
  }

  let accessToken = accessKey.accessToken;
  const refreshToken = accessKey.refreshToken;
  const tokenExpiryDate = accessKey.expiryDate;

  // Initialize OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  // Check if token needs refresh before attempting to use it
  if (shouldRefreshToken(tokenExpiryDate) || !accessToken) {
    try {
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      accessToken = await refreshAccessToken(oauth2Client, userId, refreshToken);
    } catch (error: any) {
      console.error("Proactive token refresh failed:", error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to refresh token: ${error.message}. Please re-authenticate Gmail.`,
          },
        ],
        isError: true,
      };
    }
  }

  // Set credentials for API calls
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    // Attempt to send email
    const res = await sendEmail(gmail, toMail, subject, body);
    
    return {
      content: [
        {
          type: "text",
          text: `✅ Email sent to ${toMail}. Gmail Message ID: ${res.data.id}`,
        },
      ],
    };
  } catch (error: any) {
    console.error("Email sending failed:", error);
    
    // Handle various OAuth-related errors
    const isAuthError = error.code === 401 || 
                       error.code === 403 ||
                       (error.message && (
                         error.message.includes("invalid_client") ||
                         error.message.includes("invalid_grant") ||
                         error.message.includes("unauthorized") ||
                         error.message.includes("forbidden")
                       ));

    if (isAuthError && refreshToken) {
      try {
        console.log("Authentication error detected, attempting token refresh...");
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const newAccessToken = await refreshAccessToken(oauth2Client, userId, refreshToken);
        
        // Retry with new token
        oauth2Client.setCredentials({
          access_token: newAccessToken,
          refresh_token: refreshToken,
        });
        
        const retryGmail = google.gmail({ version: "v1", auth: oauth2Client });
        const res = await sendEmail(retryGmail, toMail, subject, body);

        return {
          content: [
            {
              type: "text",
              text: `✅ Email sent to ${toMail} after token refresh. Gmail Message ID: ${res.data.id}`,
            },
          ],
        };
      } catch (refreshError: any) {
        console.error("Token refresh and retry failed:", refreshError);
        return {
          content: [
            {
              type: "text",
              text: `❌ Authentication failed and token refresh unsuccessful: ${refreshError.message}. Please re-authenticate Gmail.`,
            },
          ],
          isError: true,
        };
      }
    } else {
      // Non-auth related error
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
}