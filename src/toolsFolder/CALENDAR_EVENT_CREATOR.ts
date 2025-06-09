import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { prisma } from "../utils.js"; // Adjust this path if 'prisma' is located elsewhere
import dotenv from "dotenv"; // Import dotenv to load environment variables

dotenv.config(); // Load environment variables from .env file

// Tool metadata
export const tool: Tool = {
  name: "CALENDAR_EVENT_CREATOR",
  description: "Create Google Calendar events with attendees, reminders, and meeting details",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Event title/summary",
      },
      description: {
        type: "string",
        description: "Event description (optional)",
      },
      startDateTime: {
        type: "string",
        description: "Start date and time in ISO format (e.g., '2024-06-15T10:00:00')",
      },
      endDateTime: {
        type: "string",
        description: "End date and time in ISO format (e.g., '2024-06-15T11:00:00')",
      },
      timeZone: {
        type: "string",
        description: "Time zone (e.g., 'America/New_York', 'Asia/Kolkata'). Defaults to 'UTC'",
      },
      attendees: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Array of attendee email addresses (optional)",
      },
      location: {
        type: "string",
        description: "Event location (optional)",
      },
      reminderMinutes: {
        type: "array",
        items: {
          type: "number"
        },
        description: "Reminder times in minutes before event (e.g., [15, 60] for 15min and 1hr reminders)",
      },
      createMeetLink: {
        type: "boolean",
        description: "Whether to create a Google Meet link for the event (default: false)",
      },
      visibility: {
        type: "string",
        enum: ["default", "public", "private"],
        description: "Event visibility (default: 'default')",
      },
      calendarId: {
        type: "string",
        description: "Calendar ID to create event in (default: 'primary' for main calendar)",
      }
    },
    required: ["title", "startDateTime", "endDateTime"],
  },
};

// Tool handler
export async function handler(args: any, userId?: string) {
  const { 
    title, 
    description, 
    startDateTime, 
    endDateTime, 
    timeZone = "UTC",
    attendees = [],
    location,
    reminderMinutes = [15], // Default 15-minute reminder
    createMeetLink = false,
    visibility = "default",
    calendarId = "primary"
  } = args;

  if (!title || !startDateTime || !endDateTime || !userId) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Missing required parameters: title, startDateTime, endDateTime, or userId.",
        },
      ],
      isError: true,
    };
  }

  // Validate date formats
  const startDate = new Date(startDateTime);
  const endDate = new Date(endDateTime);
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Invalid date format. Please use ISO format (e.g., '2024-06-15T10:00:00').",
        },
      ],
      isError: true,
    };
  }

  if (startDate >= endDate) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Start time must be before end time.",
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
        toolId: "CALENDAR_EVENT_CREATOR",
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
          text: "❌ No access or refresh token found. Please authenticate Google Calendar first.",
        },
      ],
      isError: true,
    };
  }

  // Ensure environment variables are loaded for Google OAuth client
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
  const GOOGLE_CLIENT_SECRET =process.env.GOOGLE_CLIENT_SECRET as string;
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI as string;

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
    // Attempt to create calendar event with the current access token
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    // Prepare event object
    const eventResource: any = {
      summary: title,
      description: description || undefined,
      location: location || undefined,
      start: {
        dateTime: startDateTime,
        timeZone: timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: timeZone,
      },
      visibility: visibility,
      reminders: {
        useDefault: false,
        overrides: reminderMinutes.map((minutes: number) => ({
          method: 'popup',
          minutes: minutes,
        })),
      },
    };

    // Add attendees if provided
    if (attendees.length > 0) {
      eventResource.attendees = attendees.map((email: string) => ({ email }));
    }

    // Add Google Meet conference if requested
    if (createMeetLink) {
      eventResource.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      };
    }

    const response = await calendar.events.insert({
      calendarId: calendarId,
      requestBody: eventResource,
      conferenceDataVersion: createMeetLink ? 1 : undefined,
      sendUpdates: attendees.length > 0 ? 'all' : 'none', // Send invites if there are attendees
    });

    const event = response.data;
    let successMessage = `✅ Calendar event created successfully!\n`;
    successMessage += `📅 Title: ${event.summary}\n`;
    successMessage += `🕐 Start: ${new Date(event.start?.dateTime || '').toLocaleString()}\n`;
    successMessage += `🕐 End: ${new Date(event.end?.dateTime || '').toLocaleString()}\n`;
    successMessage += `🔗 Event Link: ${event.htmlLink}\n`;
    
    if (event.location) {
      successMessage += `📍 Location: ${event.location}\n`;
    }
    
    if (attendees.length > 0) {
      successMessage += `👥 Attendees: ${attendees.join(', ')}\n`;
    }
    
    if (event.conferenceData?.entryPoints?.[0]?.uri) {
      successMessage += `🎥 Google Meet: ${event.conferenceData.entryPoints[0].uri}\n`;
    }
    
    successMessage += `📋 Event ID: ${event.id}`;

    return {
      content: [
        {
          type: "text",
          text: successMessage,
        },
      ],
    };
  } catch (error: any) {
    // --- Step 3: Handle token expiration/invalidity and attempt refresh ---
    if (error.code === 401 || (error.message && error.message.includes("invalid_grant"))) {
      console.warn(
        "Access token expired or invalid. Attempting to refresh token..."
      );

      if (!refreshToken) {
        return {
          content: [
            {
              type: "text",
              text: "❌ Access token expired and no refresh token found. Please re-authenticate Google Calendar.",
            },
          ],
          isError: true,
        };
      }

      try {
        // Use the refresh token to get a new access token
        const tokenResponse = await oauth2Client.refreshAccessToken();
        const newAccessToken = tokenResponse.credentials.access_token;
        const newRefreshToken = tokenResponse.credentials.refresh_token;

        if (!newAccessToken) {
          throw new Error("Failed to get new access token during refresh.");
        }

        // --- Step 4: Update the database with the new access token ---
        await prisma.accessKey.update({
          where: {
            userId_toolId: {
              userId,
              toolId: "CALENDAR_EVENT_CREATOR",
            },
          },
          data: {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken || refreshToken,
          },
        });

        // --- Step 5: Retry creating the calendar event with the new access token ---
        oauth2Client.setCredentials({ access_token: newAccessToken });
        const calendar = google.calendar({ version: "v3", auth: oauth2Client });

        // Prepare event object (same as before)
        const eventResource: any = {
          summary: title,
          description: description || undefined,
          location: location || undefined,
          start: {
            dateTime: startDateTime,
            timeZone: timeZone,
          },
          end: {
            dateTime: endDateTime,
            timeZone: timeZone,
          },
          visibility: visibility,
          reminders: {
            useDefault: false,
            overrides: reminderMinutes.map((minutes: number) => ({
              method: 'popup',
              minutes: minutes,
            })),
          },
        };

        if (attendees.length > 0) {
          eventResource.attendees = attendees.map((email: string) => ({ email }));
        }

        if (createMeetLink) {
          eventResource.conferenceData = {
            createRequest: {
              requestId: `meet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              conferenceSolutionKey: {
                type: 'hangoutsMeet',
              },
            },
          };
        }

        const response = await calendar.events.insert({
          calendarId: calendarId,
          requestBody: eventResource,
          conferenceDataVersion: createMeetLink ? 1 : undefined,
          sendUpdates: attendees.length > 0 ? 'all' : 'none',
        });

        const event = response.data;
        let successMessage = `✅ Calendar event created successfully after token refresh!\n`;
        successMessage += `📅 Title: ${event.summary}\n`;
        successMessage += `🕐 Start: ${new Date(event.start?.dateTime || '').toLocaleString()}\n`;
        successMessage += `🕐 End: ${new Date(event.end?.dateTime || '').toLocaleString()}\n`;
        successMessage += `🔗 Event Link: ${event.htmlLink}\n`;
        
        if (event.location) {
          successMessage += `📍 Location: ${event.location}\n`;
        }
        
        if (attendees.length > 0) {
          successMessage += `👥 Attendees: ${attendees.join(', ')}\n`;
        }
        
        if (event.conferenceData?.entryPoints?.[0]?.uri) {
          successMessage += `🎥 Google Meet: ${event.conferenceData.entryPoints[0].uri}\n`;
        }
        
        successMessage += `📋 Event ID: ${event.id}`;

        return {
          content: [
            {
              type: "text",
              text: successMessage,
            },
          ],
        };
      } catch (refreshError: any) {
        console.error("Error refreshing token:", refreshError);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to refresh token or create event after refresh: ${refreshError.message}. Please re-authenticate Google Calendar.`,
            },
          ],
          isError: true,
        };
      }
    } else {
      // General error, not related to token expiration/invalidity
      console.error("Failed to create calendar event (general error):", error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to create calendar event: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}