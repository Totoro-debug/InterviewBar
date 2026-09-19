import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const STARTUP_ENTRY_BUDGET_BYTES = 275 * 1024;

function startupEntryBudget() {
  return {
    name: 'interviewbar-startup-entry-budget',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || !output.isEntry) continue;
        const bytes = Buffer.byteLength(output.code);
        if (bytes > STARTUP_ENTRY_BUDGET_BYTES) {
          this.error(
            `Startup entry ${output.fileName} is ${(bytes / 1024).toFixed(1)} KiB; `
            + `the budget is ${STARTUP_ENTRY_BUDGET_BYTES / 1024} KiB. `
            + 'Move non-home features behind dynamic imports.',
          );
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), startupEntryBudget()],
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
