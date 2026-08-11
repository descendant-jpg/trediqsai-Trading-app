import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dir, '.'),
      // This package sits inside a monorepo that also has React at the root.
      // Without pinning, the renderer and the component can load different
      // React copies and every hook throws.
      react: path.resolve(dir, 'node_modules/react'),
      'react-dom': path.resolve(dir, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
