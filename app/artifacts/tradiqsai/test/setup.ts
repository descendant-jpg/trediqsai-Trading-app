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

vi.mock('expo', () => ({
  reloadAppAsync: vi.fn(),
}));