---
name: Reanimated jsdom stub
description: Tests importing reanimated fail on native worklets; the global stub must keep shared values stable.
---

Reanimated 4 imports `react-native-worklets` native specs at module scope, so any component importing `react-native-reanimated` makes every jsdom test that mounts it fail at import time. The fix lives in the artifact's `test/setup.ts` as a global `vi.mock('react-native-reanimated', …)` stub (Proxy-based `Animated`, eager `useAnimatedStyle`, identity `withTiming`/`withDelay`).

**Why:** The subtle trap is `useSharedValue` — an early version returned a fresh `{ value }` object per render, so any effect keyed on a shared value (e.g. `[curtain, logoProgress]`) restarted on every re-render in tests even though real Reanimated returns stable hook results. A regression test asserting a one-shot timer then failed only in jsdom. The stub must use `React.useRef({ value: initial }).current`.

**How to apply:** When adding reanimated to a new Expo component, expect test failures until the setup stub covers the APIs used. Keep stub semantics faithful (stable identities, eager resolution) so timer/effect behavior under test matches production.
