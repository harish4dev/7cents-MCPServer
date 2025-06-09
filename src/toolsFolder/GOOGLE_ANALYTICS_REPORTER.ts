import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { prisma } from "../utils.js"; // Adjust this path if 'prisma' is located elsewhere
import dotenv from "dotenv"; // Import dotenv to load environment variables

dotenv.config(); // Load environment variables from .env file

// Tool metadata
export const tool: Tool = {
  name: "GOOGLE_ANALYTICS_REPORTER",
  description: "Fetch Google Analytics data and generate comprehensive reports",
  inputSchema: {
    type: "object",
    properties: {
      propertyId: {
        type: "string",
        description: "Google Analytics 4 Property ID (e.g., '123456789')",
      },
      startDate: {
        type: "string",
        description: "Start date in YYYY-MM-DD format (e.g., '2024-06-01')",
      },
      endDate: {
        type: "string",
        description: "End date in YYYY-MM-DD format (e.g., '2024-06-07')",
      },
      reportType: {
        type: "string",
        enum: ["overview", "traffic", "audience", "behavior", "conversions", "custom"],
        description: "Type of report to generate (default: 'overview')",
      },
      metrics: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Custom metrics for 'custom' report type (e.g., ['sessions', 'users', 'pageviews'])",
      },
      dimensions: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Custom dimensions for 'custom' report type (e.g., ['country', 'deviceCategory'])",
      },
      limit: {
        type: "number",
        description: "Maximum number of rows to return (default: 10, max: 100)",
      }
    },
    required: ["propertyId", "startDate", "endDate"],
  },
};

// Predefined report configurations
const REPORT_CONFIGS = {
  overview: {
    metrics: ['sessions', 'users', 'pageviews', 'bounceRate', 'averageSessionDuration'],
    dimensions: []
  },
  traffic: {
    metrics: ['sessions', 'users', 'newUsers'],
    dimensions: ['sessionSource', 'sessionMedium', 'sessionCampaign']
  },
  audience: {
    metrics: ['users', 'sessions', 'averageSessionDuration'],
    dimensions: ['country', 'city', 'deviceCategory', 'operatingSystem']
  },
  behavior: {
    metrics: ['pageviews', 'uniquePageviews', 'averageTimeOnPage', 'bounceRate'],
    dimensions: ['pagePath', 'pageTitle']
  },
  conversions: {
    metrics: ['conversions', 'totalRevenue', 'purchaseRevenue'],
    dimensions: ['sessionSource', 'sessionMedium']
  }
};

// Helper function to format duration from seconds
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

// Helper function to format percentage
function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// Helper function to format currency
function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

// Tool handler
export async function handler(args: any, userId?: string) {
  const { 
    propertyId,
    startDate, 
    endDate, 
    reportType = "overview",
    metrics: customMetrics = [],
    dimensions: customDimensions = [],
    limit = 10
  } = args;

  if (!propertyId || !startDate || !endDate || !userId) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Missing required parameters: propertyId, startDate, endDate, or userId.",
        },
      ],
      isError: true,
    };
  }

  // Validate date formats
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  
  if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Invalid date format. Please use YYYY-MM-DD format (e.g., '2024-06-01').",
        },
      ],
      isError: true,
    };
  }

  if (startDateObj >= endDateObj) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Start date must be before end date.",
        },
      ],
      isError: true,
    };
  }

  // Validate limit
  if (limit < 1 || limit > 100) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Limit must be between 1 and 100.",
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
        toolId: "GOOGLE_ANALYTICS_REPORTER",
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
          text: "❌ No access or refresh token found. Please authenticate Google Analytics first.",
        },
      ],
      isError: true,
    };
  }

  // Ensure environment variables are loaded for Google OAuth client
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
  const GOOGLE_CLIENT_SECRET =process.env.GOOGLE_CLIENT_SECRET as string;
  const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI as string;

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

  // Determine metrics and dimensions based on report type
  let reportMetrics: string[];
  let reportDimensions: string[];

  if (reportType === 'custom') {
    if (customMetrics.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "❌ Custom report type requires at least one metric.",
          },
        ],
        isError: true,
      };
    }
    reportMetrics = customMetrics;
    reportDimensions = customDimensions;
  } else {
    const config = REPORT_CONFIGS[reportType as keyof typeof REPORT_CONFIGS];
    if (!config) {
      return {
        content: [
          {
            type: "text",
            text: "❌ Invalid report type. Supported types: overview, traffic, audience, behavior, conversions, custom.",
          },
        ],
        isError: true,
      };
    }
    reportMetrics = config.metrics;
    reportDimensions = config.dimensions;
  }

  try {
    // Attempt to fetch analytics data with the current access token
    const analyticsData = google.analyticsdata({ version: 'v1beta', auth: oauth2Client });

    const request = {
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [
          {
            startDate: startDate,
            endDate: endDate,
          },
        ],
        metrics: reportMetrics.map(metric => ({ name: metric })),
        dimensions: reportDimensions.map(dimension => ({ name: dimension })),
        limit: limit,
      },
    };

    const response = await analyticsData.properties.runReport(request);
    const report = response.data;

    // Process the data
    const processedData: any = {
      reportInfo: {
        propertyId,
        dateRange: `${startDate} to ${endDate}`,
        reportType,
        generatedAt: new Date().toISOString(),
        totalRows: report.rowCount || 0
      },
      summary: {},
      detailedData: []
    };

    // Process summary metrics (first row, no dimensions)
    if (report.rows && report.rows.length > 0) {
      const firstRow = report.rows[0];
      if (firstRow.metricValues && report.metricHeaders) {
        report.metricHeaders.forEach((header, index) => {
          const metricName = header.name;
          const value = firstRow.metricValues![index].value;
          let formattedValue = value;

          // Format specific metrics
          if (metricName === 'averageSessionDuration') {
            formattedValue = formatDuration(parseFloat(value || '0'));
          } else if (metricName === 'bounceRate') {
            formattedValue = formatPercentage(parseFloat(value || '0'));
          } else if (metricName?.includes('Revenue') || metricName?.includes('revenue')) {
            formattedValue = formatCurrency(parseFloat(value || '0'));
          } else {
            formattedValue = parseInt(value || '0').toLocaleString();
          }

          processedData.summary[metricName??''] = {
            raw: value,
            formatted: formattedValue
          };
        });
      }

      // Process detailed data (with dimensions)
      if (reportDimensions.length > 0) {
        report.rows.forEach(row => {
          const rowData: any = {};
          
          // Add dimensions
          if (row.dimensionValues && report.dimensionHeaders) {
            report.dimensionHeaders.forEach((header, index) => {
              rowData[header.name!] = row.dimensionValues![index].value;
            });
          }

          // Add metrics
          if (row.metricValues && report.metricHeaders) {
            report.metricHeaders.forEach((header, index) => {
              const metricName = header.name!;
              const value = row.metricValues![index].value;
              rowData[metricName] = value;
            });
          }

          processedData.detailedData.push(rowData);
        });
      }
    }

    // Generate insights based on the data
    const insights = [];
    
    if (processedData.summary.sessions) {
      insights.push(`📊 Total sessions: ${processedData.summary.sessions.formatted}`);
    }
    
    if (processedData.summary.users) {
      insights.push(`👥 Unique users: ${processedData.summary.users.formatted}`);
    }
    
    if (processedData.summary.bounceRate) {
      const bounceRate = parseFloat(processedData.summary.bounceRate.raw);
      if (bounceRate < 0.4) {
        insights.push(`🎯 Excellent bounce rate: ${processedData.summary.bounceRate.formatted} - Users are highly engaged!`);
      } else if (bounceRate > 0.7) {
        insights.push(`⚠️  High bounce rate: ${processedData.summary.bounceRate.formatted} - Consider improving page content or loading speed`);
      } else {
        insights.push(`📈 Bounce rate: ${processedData.summary.bounceRate.formatted} - Within acceptable range`);
      }
    }

    if (reportDimensions.includes('country') && processedData.detailedData.length > 0) {
      const topCountry = processedData.detailedData[0];
      insights.push(`🌍 Top traffic source: ${topCountry.country} with ${parseInt(topCountry.sessions || topCountry.users).toLocaleString()} ${topCountry.sessions ? 'sessions' : 'users'}`);
    }

    if (reportDimensions.includes('deviceCategory') && processedData.detailedData.length > 0) {
      const topDevice = processedData.detailedData[0];
      insights.push(`📱 Primary device type: ${topDevice.deviceCategory}`);
    }

    const responseText = `📊 **Google Analytics Report Generated**

**Report Period:** ${startDate} to ${endDate}
**Report Type:** ${reportType.toUpperCase()}
**Property ID:** ${propertyId}

Here's your Google Analytics data:

\`\`\`json
${JSON.stringify(processedData, null, 2)}
\`\`\`

📋 **Key Insights:**
${insights.map(insight => `• ${insight}`).join('\n')}

💡 **Next Steps:**
• Ask me to explain any specific metrics
• Request a different report type for deeper analysis
• Get recommendations based on this data
• Compare with previous periods`;

    return {
      content: [
        {
          type: "text",
          text: responseText,
        },
      ],
    };

  } catch (error: any) {
    // --- Step 3: Handle token expiration/invalidity and attempt refresh ---
    if (error.code === 401 || (error.message && error.message.includes("invalid_grant"))) {
      console.warn("Access token expired or invalid. Attempting to refresh token...");

      if (!refreshToken) {
        return {
          content: [
            {
              type: "text",
              text: "❌ Access token expired and no refresh token found. Please re-authenticate Google Analytics.",
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
              toolId: "GOOGLE_ANALYTICS_REPORTER",
            },
          },
          data: {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken || refreshToken,
          },
        });

        // --- Step 5: Retry fetching analytics data with the new access token ---
        oauth2Client.setCredentials({ access_token: newAccessToken });
        
        // Retry the same request (duplicated code for clarity)
        const analyticsData = google.analyticsdata({ version: 'v1beta', auth: oauth2Client });

        const request = {
          property: `properties/${propertyId}`,
          requestBody: {
            dateRanges: [
              {
                startDate: startDate,
                endDate: endDate,
              },
            ],
            metrics: reportMetrics.map(metric => ({ name: metric })),
            dimensions: reportDimensions.map(dimension => ({ name: dimension })),
            limit: limit,
          },
        };

        const response = await analyticsData.properties.runReport(request);
        const report = response.data;

        // Process data (same logic as above)
        const processedData: any = {
          reportInfo: {
            propertyId,
            dateRange: `${startDate} to ${endDate}`,
            reportType,
            generatedAt: new Date().toISOString(),
            totalRows: report.rowCount || 0
          },
          summary: {},
          detailedData: []
        };

        if (report.rows && report.rows.length > 0) {
          const firstRow = report.rows[0];
          if (firstRow.metricValues && report.metricHeaders) {
            report.metricHeaders.forEach((header, index) => {
              const metricName = header.name;
              const value = firstRow.metricValues![index].value;
              let formattedValue = value;

              if (metricName === 'averageSessionDuration') {
                formattedValue = formatDuration(parseFloat(value || '0'));
              } else if (metricName === 'bounceRate') {
                formattedValue = formatPercentage(parseFloat(value || '0'));
              } else if (metricName?.includes('Revenue') || metricName?.includes('revenue')) {
                formattedValue = formatCurrency(parseFloat(value || '0'));
              } else {
                formattedValue = parseInt(value || '0').toLocaleString();
              }

              processedData.summary[metricName?metricName:''] = {
                raw: value,
                formatted: formattedValue
              };
            });
          }

          if (reportDimensions.length > 0) {
            report.rows.forEach(row => {
              const rowData: any = {};
              
              if (row.dimensionValues && report.dimensionHeaders) {
                report.dimensionHeaders.forEach((header, index) => {
                  rowData[header.name!] = row.dimensionValues![index].value;
                });
              }

              if (row.metricValues && report.metricHeaders) {
                report.metricHeaders.forEach((header, index) => {
                  const metricName = header.name!;
                  const value = row.metricValues![index].value;
                  rowData[metricName] = value;
                });
              }

              processedData.detailedData.push(rowData);
            });
          }
        }

        const responseText = `📊 **Google Analytics Report Generated (After Token Refresh)**

**Report Period:** ${startDate} to ${endDate}
**Report Type:** ${reportType.toUpperCase()}
**Property ID:** ${propertyId}

\`\`\`json
${JSON.stringify(processedData, null, 2)}
\`\`\`

📋 **Data successfully retrieved after authentication refresh.**`;

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };

      } catch (refreshError: any) {
        console.error("Error refreshing token:", refreshError);
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to refresh token or fetch analytics data: ${refreshError.message}. Please re-authenticate Google Analytics.`,
            },
          ],
          isError: true,
        };
      }
    } else {
      // General error, not related to token expiration/invalidity
      console.error("Failed to fetch analytics data (general error):", error);
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to fetch analytics data: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}