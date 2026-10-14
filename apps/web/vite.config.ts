import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': {
      target: 'http://127.0.0.1:3000', changeOrigin: true,
      configure(proxy) {
        proxy.on('proxyReq', (outgoing, incoming) => {
          // Rewrite only the known local dev origin; foreign origins stay rejected.
          if (incoming.headers.origin === 'http://127.0.0.1:5173') outgoing.setHeader('origin', 'http://127.0.0.1:3000');
        });
      },
    } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
