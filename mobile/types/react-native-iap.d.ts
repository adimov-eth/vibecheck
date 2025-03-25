import 'react-native-iap';

declare module 'react-native-iap' {
  export interface SubscriptionIOS {
    localizedPrice: string;
  }

  export interface SubscriptionAndroid {
    price: number;
    subscriptionOfferDetails: {
      offerToken: string;
    }[];
  }
} 