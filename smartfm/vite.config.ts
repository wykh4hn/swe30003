import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Presentation-tier build configuration.
 *
 * The browser client is a separate deployable artefact from the application
 * server; during development Vite proxies `/api` to the Node application server
 * so both tiers run from a single `npm run dev` command.
 */
export default defineConfig({
  plugins: [react()],
  root: '.',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
