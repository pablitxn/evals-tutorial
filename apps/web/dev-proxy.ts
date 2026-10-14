import type { ProxyOptions } from 'vite';

/** Adapt only the explicitly allowed local dev origins; foreign origins stay rejected. */
export function createLoopbackApiProxy(target: string, frontendOrigins: readonly string[]): ProxyOptions {
  const backendOrigin = new URL(target).origin;
  return {
    target,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (outgoing, incoming) => {
        const origin = incoming.headers.origin;
        if (origin && frontendOrigins.includes(origin)) outgoing.setHeader('origin', backendOrigin);
      });
    },
  };
}
