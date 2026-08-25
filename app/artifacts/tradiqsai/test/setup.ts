import { vi } from 'vitest';

// Expo native modules expect device globals that jsdom intentionally does not
// provide. Keep these doubles small and shared so screen tests only need to
// mock the app-level behavior they exercise.
vi.mock('expo-router', () => ({
  Stack: () => null,
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ granted: false })),
  MediaTypeOptions: { Images: 'Images' },
}));

vi.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  readAsStringAsync: vi.fn(async () => ''),
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(async () => undefined),
  selectionAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error', Warning: 'warning', Success: 'success' },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-web-browser', () => ({
  openBrowserAsync: vi.fn(async () => ({ type: 'dismiss' })),
  dismissBrowser: vi.fn(),
}));

vi.mock('expo', () => ({
  reloadAppAsync: vi.fn(),
}));

// react-native-toast-message ships untransformed JSX in its dist, which the
// Vitest pipeline cannot parse. Stub it globally; suites that assert on
// toasts override this with their own spying mock.
vi.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: Object.assign(() => null, { show: vi.fn(), hide: vi.fn() }),
}));

// Reanimated 4 imports react-native-worklets native specs at module scope,
// which jsdom cannot load. Stub the small API surface app components use;
// animations resolve to their end state so screens render deterministically.
vi.mock('react-native-reanimated', async () => {
  const RN = await import('react-native');
  const React = await import('react');
  const identity = (v: unknown) => v;
  const Animated = new Proxy(function Animated() {}, {
    get: (_target, prop) => {
      if (prop === 'createAnimatedComponent') return (c: unknown) => c;
      return (RN as unknown as Record<string | symbol, unknown>)[prop] ?? RN.View;
    },
  });
  return {
    __esModule: true,
    default: Animated,
    // Stable per component lifetime, matching real Reanimated semantics —
    // effects keyed on shared values must not restart on re-render.
    useSharedValue: (initial: unknown) => React.useRef({ value: initial }).current,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useAnimatedProps: (fn: () => unknown) => fn(),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming: identity,
    withSpring: identity,
    withDelay: (_delay: number, v: unknown) => v,
    withSequence: (...vs: unknown[]) => vs[vs.length - 1],
    withRepeat: identity,
    cancelAnimation: () => {},
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
    interpolate: (_v: number, input: number[], output: number[]) => output[output.length - 1],
    Easing: new Proxy({}, { get: () => (x: unknown) => (typeof x === 'function' ? x : (v: unknown) => v) }),
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
  };
});