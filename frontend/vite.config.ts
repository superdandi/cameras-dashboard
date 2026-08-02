import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev: http://localhost:5173, API proxy -> backend :8000
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
