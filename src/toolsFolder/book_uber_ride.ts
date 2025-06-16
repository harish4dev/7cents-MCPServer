import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const tool: Tool = {
  name: "book_uber_ride",
  description: "Book an Uber ride by providing pickup and destination details",
  inputSchema: {
    type: "object",
    properties: {
      pickup_address: {
        type: "string",
        description: "Complete pickup address including city, ZIP code, state, and country"
      },
      destination_address: {
        type: "string", 
        description: "Complete destination address including city, ZIP code, state, and country"
      },
      pickup_latitude: {
        type: "number",
        description: "Pickup latitude (alternative to pickup_address)"
      },
      pickup_longitude: {
        type: "number",
        description: "Pickup longitude (alternative to pickup_address)"
      },
      destination_latitude: {
        type: "number",
        description: "Destination latitude (alternative to destination_address)"
      },
      destination_longitude: {
        type: "number",
        description: "Destination longitude (alternative to destination_address)"
      },
      product_id: {
        type: "string",
        description: "Uber product ID (e.g., UberX, UberPool). If not provided, will use default available product"
      },
      fare_id: {
        type: "string",
        description: "Upfront fare ID obtained from estimates (required for booking)"
      }
    },
    required: [],
    anyOf: [
      {
        required: ["pickup_address", "destination_address", "fare_id"]
      },
      {
        required: ["pickup_latitude", "pickup_longitude", "destination_latitude", "destination_longitude", "fare_id"]
      }
    ]
  }
};

export const handler = async (args: any, userId?: string) => {
  const { 
    pickup_address, 
    destination_address, 
    pickup_latitude, 
    pickup_longitude, 
    destination_latitude, 
    destination_longitude,
    product_id,
    fare_id
  } = args;

  try {
    // Initialize Uber client (you'll need to configure with actual credentials)
    const Uber = require('node-uber');
    const uber = new Uber({
      client_id: process.env.UBER_CLIENT_ID,
      client_secret: process.env.UBER_CLIENT_SECRET,
      server_token: process.env.UBER_SERVER_TOKEN,
      redirect_uri: process.env.UBER_REDIRECT_URI,
      name: process.env.UBER_APP_NAME || 'MCP Uber Tool',
      language: 'en_US',
      sandbox: process.env.UBER_SANDBOX === 'true' || true // Default to sandbox for safety
    });

    // Validate fare_id is provided
    if (!fare_id) {
      return {
        content: [
          {
            type: "text",
            text: "Error: fare_id is required for booking. Please get an estimate first to obtain the fare_id.",
          },
        ],
      };
    }

    // Prepare request parameters
    let requestParams: any = {
      fare_id: fare_id
    };

    // Add product_id if provided
    if (product_id) {
      requestParams.product_id = product_id;
    }

    // Use coordinates if provided, otherwise use addresses
    if (pickup_latitude && pickup_longitude && destination_latitude && destination_longitude) {
      requestParams.start_latitude = pickup_latitude;
      requestParams.start_longitude = pickup_longitude;
      requestParams.end_latitude = destination_latitude;
      requestParams.end_longitude = destination_longitude;
    } else if (pickup_address && destination_address) {
      requestParams.startAddress = pickup_address;
      requestParams.endAddress = destination_address;
    } else {
      return {
        content: [
          {
            type: "text",
            text: "Error: Please provide either coordinates (lat/lng) or complete addresses for both pickup and destination.",
          },
        ],
      };
    }

    // Create the ride request
    const result = await uber.requests.createAsync(requestParams);
    
    const userPrefix = userId ? `[User: ${userId}] ` : "";
    
    return {
      content: [
        {
          type: "text",
          text: `${userPrefix}Uber ride booked successfully!\n\nRide Details:\n- Request ID: ${result.request_id}\n- Status: ${result.status}\n- Driver: ${result.driver ? result.driver.name : 'Not assigned yet'}\n- Vehicle: ${result.vehicle ? `${result.vehicle.make} ${result.vehicle.model} (${result.vehicle.license_plate})` : 'Not assigned yet'}\n- ETA: ${result.eta ? `${result.eta} minutes` : 'Calculating...'}\n- Pickup: ${pickup_address || `${pickup_latitude}, ${pickup_longitude}`}\n- Destination: ${destination_address || `${destination_latitude}, ${destination_longitude}`}`,
        },
      ],
    };

  } catch (error: any) {
    const userPrefix = userId ? `[User: ${userId}] ` : "";
    
    // Handle specific Uber API errors
    if (error.message && error.message.includes('no_drivers_available')) {
      return {
        content: [
          {
            type: "text",
            text: `${userPrefix}Sorry, no drivers are currently available in your area. Please try again later.`,
          },
        ],
      };
    }
    
    if (error.message && error.message.includes('surge')) {
      return {
        content: [
          {
            type: "text",
            text: `${userPrefix}Surge pricing is in effect. Please confirm the higher fare and try booking again.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `${userPrefix}Error booking Uber ride: ${error.message || 'Unknown error occurred'}`,
        },
      ],
    };
  }
};