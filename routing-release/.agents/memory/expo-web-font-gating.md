---
name: Expo web font gating
description: Why the root layout must never withhold rendering while custom fonts load, and how to keep text visible on web.
---

Never gate the root layout's render on `useFonts` (no early `return null`, no
boot-screen branch that owns the whole tree). Mount the provider tree
immediately and let custom fonts swap in when they resolve.

**Why:** a font gate at the root makes every failure mode of font loading look
identical to a fatal crash — a blank/dark web preview with no bundler error and
no browser exception. That symptom sends debugging toward hook order, providers,
and Metro caches, none of which are the cause. Web font fetches are also slow or
flaky far more often than native ones.

**How to apply:** treat custom fonts as progressive enhancement. Screens may
reference `fontFamily: 'Inter_*'`; react-native-web falls back to platform fonts
until the family is registered, so text stays visible the whole time. If a
timeout/state flag stops feeding a conditional render, delete it rather than
leaving it dangling — a half-removed gate is the next person's red herring.
Verify with a screenshot that text is *readable*, not merely that the layout
painted.
