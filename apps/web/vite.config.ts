import { defineConfig } from 'vite';
import { createLoopbackApiProxy } from './dev-proxy.js';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': createLoopbackApiProxy('http://127.0.0.1:3000', [
        'http://127.0.0.1:5173',
        'http://localhost:5173',
      ]),
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
