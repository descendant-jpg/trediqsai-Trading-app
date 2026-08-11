// Web stubs for Stripe platform pay. @stripe/stripe-react-native imports
// native-only React Native internals, so it can never be bundled for web.
// Apple Pay / Google Pay are native-only surfaces anyway: on web we report
// platform pay as unsupported and the paywall falls back to its own CTA.
import React from 'react';

export function StripeProvider({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export const PlatformPay = {
  ButtonType: { Subscribe: 6 },
  ButtonStyle: { Black: 1 },
};

export function PlatformPayButton() {
  return null;
}

export async function isPlatformPaySupported(): Promise<boolean> {
  return false;
}

export function usePlatformPay() {
  return {
    confirmPlatformPayPayment: async () => ({
      error: { message: 'Platform Pay is only available in the native app.' },
    }),
  };
}
