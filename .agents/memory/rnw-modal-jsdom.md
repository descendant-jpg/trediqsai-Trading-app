---
name: RNW Modal unmount in jsdom tests
description: Why react-native-web Modals never unmount after close in vitest/jsdom, and how to assert dismissal.
---

react-native-web `Modal` (animationType slide/fade) only unmounts its content after a CSS
`animationend` event. In jsdom this never happens: no CSS animations run, and the modal
portal is appended to `document.body` outside the React root container, so even manually
fired `fireEvent.animationEnd` never reaches React's delegated handler.

**How to apply:** In jsdom tests, don't assert the modal content disappears after close.
Instead assert the exit state — the animation wrapper (`[class*="animationKeyframes"]`)
gains a `pointerEvents` (none) class when `visible` flips false. Also: RNW `Switch`
renders with `role="switch"` (not checkbox); click that element to toggle.
