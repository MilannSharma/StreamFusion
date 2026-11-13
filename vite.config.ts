import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // stable vendor chunks cache well across updates and keep the entry small
        manualChunks: (id: string) => (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/scheduler') ? 'react' : id.includes('lottie-web') ? 'lottie' : id.includes('@bible-strong') ? 'avatar' : undefined)
      }
    }
  },
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
