---
name: RevenueCat web key requirements
description: RevenueCat API-key behavior across the Expo native and web runtimes.
---

RevenueCat native sandbox/Test Store public keys must not be passed to the
RevenueCat web SDK. Web requires a Web Billing public API key, and rejecting
the key at startup can leave the Expo web app stuck in a loading state.

**Why:** The same Expo code runs on mobile and browser previews, but RevenueCat
validates their public key types differently.

**How to apply:** Use the sandbox key only for native development/Expo Go. On
web, initialize Purchases only when `EXPO_PUBLIC_REVENUECAT_WEB_API_KEY` is
configured; otherwise keep the existing non-purchase paywall fallback
available without invoking the SDK.