---
name: Blank white screen on Expo web
description: Diagnosing full-screen white render in the Expo app on web
---
Rule: if the Expo app renders a blank white page on web but DOM logs show components mounted, suspect a zero-height flex chain — `GestureHandlerRootView` has NO default flex on web, so any non-router screen rendered under it collapses. Give it `style={{ flex: 1 }}`.
**Why:** expo-router's Stack fills absolutely and masks the problem; it only appeared when the auth gate rendered a plain screen outside the router.
**How to apply:** any time a screen is rendered directly in the root layout (outside Stack/Tabs), verify every wrapper in the chain has height on web.
