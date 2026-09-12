import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    exclude: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      'release/**',
      '.electron-builder-cache/**',
      'artifacts/**',
    ],
  },
  server: {
    strictPort: true,
  },
});
