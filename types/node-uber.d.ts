declare module 'node-uber' {
    interface UberPrice {
      display_name: string;
      estimate: string;
      product_id: string;
      distance?: number;
      duration?: number;
      surge_multiplier?: number;
      high_estimate?: number;
      low_estimate?: number;
    }
  
    interface UberPriceResponse {
      prices: UberPrice[];
    }
  
    interface UberEstimates {
      getPriceForRouteAsync(
        startLat: number,
        startLng: number,
        endLat: number,
        endLng: number,
        seats?: number
      ): Promise<UberPriceResponse>;
      
      getPriceForRouteByAddressAsync(
        startAddress: string,
        endAddress: string,
        seats?: number
      ): Promise<UberPriceResponse>;
    }
  
    interface UberConfig {
      client_id: string;
      client_secret: string;
      server_token: string;
      redirect_uri?: string;
      name?: string;
      language?: string;
      sandbox?: boolean;
    }
  
    class Uber {
      constructor(config: UberConfig);
      estimates: UberEstimates;
    }
  
    export = Uber;
  }