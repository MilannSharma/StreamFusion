import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './', // Required for Electron — assets must use relative paths
    server: {
      port: 5173, // Fixed port so electron:dev wait-on works reliably
      host: 'localhost',
      strictPort: true,
    },
    build: {
      outDir: 'dist',     // Explicit output directory for electron-builder
      emptyOutDir: true,  // Clean dist/ before each build
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
