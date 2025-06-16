import { Tool } from "@modelcontextprotocol/sdk/types.js";
// Change this line - use ES module import instead of require
import Uber from 'node-uber';

export const tool: Tool = {
  name: "get_uber_price",
  description: "Get price estimates for Uber rides between pickup and destination locations",
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
        description: "Destination longitude (alternative to destination_addresses)"
      },
      seats: {
        type: "number",
        description: "Number of seats needed (defaults to 2, maximum 2)",
        minimum: 1,
        maximum: 2
      }
    },
    required: ["pickup_address", "destination_address"],
    // anyOf: [
    //   {
    //     required: ["pickup_address", "destination_address"]
    //   },
    //   {
    //     required: ["pickup_latitude", "pickup_longitude", "destination_latitude", "destination_longitude"]
    //   }
    // ]
  }
};

export const handler = async (args: any, userId?: string) => {
  const userPrefix = userId ? `[User: ${userId}] ` : "";
  
  console.log(`${userPrefix}Starting Uber price estimation...`);
  console.log(`${userPrefix}Received args:`, JSON.stringify(args, null, 2));

  const { 
    pickup_address, 
    destination_address, 
    pickup_latitude, 
    pickup_longitude, 
    destination_latitude, 
    destination_longitude,
    seats = 2
  } = args;

  try {
    console.log(`${userPrefix}Initializing Uber client...`);
    
    // Initialize Uber client with proper configuration
    const uberConfig = {
      client_id: 'phone-only-user-82b47e2f-41c2-40d1-b286-8d7a8a28b355@fake.uber.com',
      client_secret: 'phone-only-user-82b47e2f-41c2-40d1-b286-8d7a8a28b355@fake.uber.com',
      server_token: 'IA.VUNmGAAAAAAAEgASAAAABwAIAAwAAAAAAAAAEgAAAAAAAAGsAAAAFAAAAAAADgAQAAQAAAAIAAwAAAAOAAAAgAAAABwAAAAEAAAAEAAAAE7pZ-qwut_9COH6kZd8Jx5cAAAAdWyC4QKBJkvY588pg4pq8D9IGrayatp2iQPyZrHramzOsf-uYM_0nGULDbwe5n9ZAbpUYU6rsmEiJ2wtlOlA2rToFZ9QUlqP2gsYrN-E4lTSJ9sY7KvLr9RPnF4MAAAAKFfZu9Zcpz1yELKuJAAAAGIwZDg1ODAzLTM4YTAtNDJiMy04MDZlLTdhNGNmOGUxOTZlZQ',
      redirect_uri: process.env.UBER_REDIRECT_URI,
      name: process.env.UBER_APP_NAME || 'MCP Uber Tool',
      language: 'en_US',
      sandbox: process.env.UBER_SANDBOX === 'true' || true // Default to sandbox for safety
    };

    console.log(`${userPrefix}Uber config:`, {
      ...uberConfig,
      server_token: uberConfig.server_token.substring(0, 20) + '...' // Truncate for security
    });

    const uber = new Uber(uberConfig);
    console.log(`${userPrefix}Uber client initialized successfully`);

    let result;
    
    // Use coordinates if provided, otherwise use addresses
    if (pickup_latitude && pickup_longitude && destination_latitude && destination_longitude) {
      console.log(`${userPrefix}Using coordinates for price estimation:`);
      console.log(`${userPrefix}Pickup: ${pickup_latitude}, ${pickup_longitude}`);
      console.log(`${userPrefix}Destination: ${destination_latitude}, ${destination_longitude}`);
      console.log(`${userPrefix}Seats: ${seats}`);
      
      result = await uber.estimates.getPriceForRouteAsync(
        pickup_latitude, 
        pickup_longitude, 
        destination_latitude, 
        destination_longitude,
        seats
      );
    } else if (pickup_address && destination_address) {
      console.log(`${userPrefix}Using addresses for price estimation:`);
      console.log(`${userPrefix}Pickup: ${pickup_address}`);
      console.log(`${userPrefix}Destination: ${destination_address}`);
      console.log(`${userPrefix}Seats: ${seats}`);
      
      result = await uber.estimates.getPriceForRouteByAddressAsync(
        pickup_address,
        destination_address,
        seats
      );
    } else {
      console.log(`${userPrefix}Error: Missing required parameters`);
      return {
        content: [
          {
            type: "text",
            text: "Error: Please provide either coordinates (lat/lng) or complete addresses for both pickup and destination.",
          },
        ],
      };
    }

    console.log(`${userPrefix}API call completed. Result:`, JSON.stringify(result, null, 2));
    
    // Format the price estimates
    if (result && result.prices && result.prices.length > 0) {
      console.log(`${userPrefix}Found ${result.prices.length} price estimates`);
      
      let priceInfo = `${userPrefix}Uber Price Estimates:\n\n`;
      priceInfo += `Route: ${pickup_address || `${pickup_latitude}, ${pickup_longitude}`} → ${destination_address || `${destination_latitude}, ${destination_longitude}`}\n`;
      priceInfo += `Seats: ${seats}\n\n`;
      
      result.prices.forEach((price: any, index: number) => {
        console.log(`${userPrefix}Processing price option ${index + 1}:`, price);
        
        priceInfo += `${index + 1}. ${price.display_name}\n`;
        priceInfo += `   💰 Price: ${price.estimate}\n`;
        priceInfo += `   🚗 Product ID: ${price.product_id}\n`;
        priceInfo += `   📏 Distance: ${price.distance ? price.distance + ' miles' : 'N/A'}\n`;
        priceInfo += `   ⏱️ Duration: ${price.duration ? Math.round(price.duration / 60) + ' minutes' : 'N/A'}\n`;
        
        if (price.surge_multiplier && price.surge_multiplier > 1) {
          priceInfo += `   ⚡ Surge: ${price.surge_multiplier}x\n`;
        }
        
        if (price.high_estimate && price.low_estimate) {
          priceInfo += `   📊 Range: $${price.low_estimate} - $${price.high_estimate}\n`;
        }
        
        priceInfo += `\n`;
      });
      
      console.log(`${userPrefix}Successfully formatted price information`);
      
      return {
        content: [
          {
            type: "text",
            text: priceInfo,
          },
        ],
      };
    } else {
      console.log(`${userPrefix}No prices found in result. Full result:`, result);
      
      return {
        content: [
          {
            type: "text",
            text: `${userPrefix}No price estimates available for this route. Please check if the addresses are valid or if Uber operates in these areas.`,
          },
        ],
      };
    }

  } catch (error: any) {
    console.error(`${userPrefix}Error occurred:`, error);
    console.error(`${userPrefix}Error message:`, error.message);
    console.error(`${userPrefix}Error stack:`, error.stack);
    
    // Log additional error details
    if (error.response) {
      console.error(`${userPrefix}HTTP Response Status:`, error.response.status);
      console.error(`${userPrefix}HTTP Response Data:`, error.response.data);
    }
    
    // Handle specific errors
    if (error.message && error.message.includes('geocoding')) {
      return {
        content: [
          {
            type: "text",
            text: `${userPrefix}Error: Unable to find the specified address. Please provide a complete address including city, ZIP code, state, and country.`,
          },
        ],
      };
    }
    
    if (error.message && error.message.includes('outside_coverage')) {
      return {
        content: [
          {
            type: "text",
            text: `${userPrefix}Error: Uber service is not available in the specified area.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `${userPrefix}Error getting Uber price estimates: ${error.message || 'Unknown error occurred'}`,
        },
      ],
    };
  }
};

// IA.VUNmGAAAAAAAEgASAAAABwAIAAwAAAAAAAAAEgAAAAAAAAGsAAAAFAAAAAAADgAQAAQAAAAIAAwAAAAOAAAAgAAAABwAAAAEAAAAEAAAAE7pZ-qwut_9COH6kZd8Jx5cAAAAdWyC4QKBJkvY588pg4pq8D9IGrayatp2iQPyZrHramzOsf-uYM_0nGULDbwe5n9ZAbpUYU6rsmEiJ2wtlOlA2rToFZ9QUlqP2gsYrN-E4lTSJ9sY7KvLr9RPnF4MAAAAKFfZu9Zcpz1yELKuJAAAAGIwZDg1ODAzLTM4YTAtNDJiMy04MDZlLTdhNGNmOGUxOTZlZQ