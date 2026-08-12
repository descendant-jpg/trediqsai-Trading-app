import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.vite-cache',
  define: {
    __DEV__: true,
    'process.env.EXPO_OS': '"web"',
  },
  test: {
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'react-native': 'react-native-web',
    },
  },
});
