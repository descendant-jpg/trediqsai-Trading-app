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