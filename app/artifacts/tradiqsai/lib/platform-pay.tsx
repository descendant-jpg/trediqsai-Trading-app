// Native entry point for Stripe platform pay (Apple Pay / Google Pay).
// Metro picks `platform-pay.web.tsx` for web, which stubs these out because
// @stripe/stripe-react-native ships native-only specs that break web bundling.
export {
  StripeProvider,
  PlatformPay,
  PlatformPayButton,
  isPlatformPaySupported,
  usePlatformPay,
} from '@stripe/stripe-react-native';
