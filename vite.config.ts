import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@client': path.resolve(__dirname, 'src/client'),
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  // No `server` block here on purpose: Express owns the actual HTTP port
  // and configures HMR itself (see src/server/index.ts) when it creates
  // Vite in middleware mode.
});
