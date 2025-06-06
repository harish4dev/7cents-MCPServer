import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { prisma } from "../utils"; // Adjust this path if 'prisma' is located elsewhere
import dotenv from "dotenv"; // Import dotenv to load environment variables

dotenv.config(); // Load environment variables from .env file

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

  // --- Step 1: Retrieve access and refresh tokens from the database ---
  const accessKey = await prisma.accessKey.findUnique({
    where: {
      userId_toolId: {
        userId,
        toolId: "GMAIL_SENDER",
      },
    },
  });

  let accessToken = accessKey?.accessToken;
  const refreshToken = accessKey?.refreshToken;

  // If no access token and no refresh token, prompt for authentication
  if (!accessToken && !refreshToken) {
    return {
      content: [
        {
          type: "text",
          text: "❌ No access or refresh token found. Please authenticate Gmail first.",
        },
      ],
      isError: true,
    };
  }

  // Ensure environment variables are loaded for Google OAuth client
  const GOOGLE_CLIENT_ID = "1094703493635-3vpbdaqqhg3jqq1os8anl3bofqnph7lq.apps.googleusercontent.com";
  const GOOGLE_CLIENT_SECRET ="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"
  const GOOGLE_REDIRECT_URI = 'http://localhost:3333/api/auth/google/callback';

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    console.error("Missing Google OAuth environment variables.");
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

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

  // --- Step 2: Set credentials for the OAuth2 client ---
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  try {
    // Attempt to send email directly with the current access token.
    // The googleapis client will internally use the refresh token if the
    // access token is expired and a refresh token is available.
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
    // --- Step 3: Handle token expiration/invalidity and attempt refresh ---
    // Common error codes for token expiration: 401 (Unauthorized)
    // or specific messages like "invalid_grant" from Google's token endpoint.
    if (error.code === 401 || (error.message && error.message.includes("invalid_grant"))) {
      console.warn(
        "Access token expired or invalid. Attempting to refresh token..."
      );

      if (!refreshToken) {
        return {
          content: [
            {
              type: "text",
              text: "❌ Access token expired and no refresh token found. Please re-authenticate Gmail.",
            },
          ],
          isError: true,
        };
      }

      try {
        // Use the refresh token to get a new access token
        const tokenResponse = await oauth2Client.refreshAccessToken();
        const newAccessToken = tokenResponse.credentials.access_token;
        const newRefreshToken = tokenResponse.credentials.refresh_token; // Google *might* issue a new refresh token

        if (!newAccessToken) {
          throw new Error("Failed to get new access token during refresh.");
        }

        // --- Step 4: Update the database with the new access token (and refresh token if it changed) ---
        await prisma.accessKey.update({
          where: {
            userId_toolId: {
              userId,
              toolId: "GMAIL_SENDER",
            },
          },
          data: {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken || refreshToken, // Update refresh token only if a new one is provided
          },
        });

        // --- Step 5: Retry sending the email with the new access token ---
        oauth2Client.setCredentials({ access_token: newAccessToken }); // Update the client with the newly acquired token
        const gmail = google.gmail({ version: "v1", auth: oauth2Client }); // Re-initialize gmail client with updated auth

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

        return {
          content: [
            {
              type: "text",
              text: `✅ Email sent to ${toMail} after token refresh. Gmail Message ID: ${res.data.id}`,
            },
          ],
        };
      } catch (refreshError: any) {
        console.error("Error refreshing token:", refreshError);
        // If refreshing fails (e.g., refresh token is revoked), user needs to re-authenticate
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to refresh token or send email after refresh: ${refreshError.message}. Please re-authenticate Gmail.`,
            },
          ],
          isError: true,
        };
      }
    } else {
      // General error, not related to token expiration/invalidity
      console.error("Failed to send email (general error):", error);
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