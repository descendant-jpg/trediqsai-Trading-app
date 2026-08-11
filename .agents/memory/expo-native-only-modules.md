---
name: Native-only modules in the Expo artifact
description: Why native-only React Native SDKs must be imported through a platform-split wrapper, not directly.
---

Native-only SDKs (Stripe's React Native SDK is the reference case) must never be imported directly by any module that the web bundle reaches — especially the Expo Router root layout. Import them through a platform-split wrapper pair (`<name>.tsx` + `<name>.web.tsx`) and let the web file export inert stubs.

**Why:** These packages ship codegen specs that import native-only React Native internals. Metro refuses to bundle them for web and fails the *entire* bundle with `Importing native-only module ... on web`, which surfaces as a bundle 500 and a white preview — not as a scoped error at the import site. Because the root layout is on every route's path, one such import takes down the whole web app, and a passing `tsc` says nothing about it since the failure is bundler-level, not type-level.

**How to apply:** After adding any native-only dependency, restart Expo and fetch the web entry bundle directly (`curl` the `entry.bundle` URL under the resolved `expo-router` path) and confirm HTTP 200 with no `"type":"...Error"` JSON body. A passing typecheck plus a clean-looking Metro startup log is not sufficient evidence — Metro logs the resolution failure only when the bundle is requested. Web stubs should report the capability as unsupported so UI falls back gracefully rather than pretending the native surface exists.
