import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Route chunks keep most code out of the initial load; raise the warning
    // ceiling so the few legitimately large vendor chunks don't spam warnings.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Group node_modules into stable, cacheable vendor chunks. Combined
        // with lazy routes, heavy libs only download with the page that needs
        // them (e.g. recharts with Reports, leaflet with Sites).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Name only the heavy / widely-shared libs as stable cache chunks.
          // Everything else is left to Rollup, which co-locates single-use libs
          // (zod, react-hook-form, etc.) with the lazy page that imports them.
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts';
          if (id.includes('leaflet')) return 'maps';
          if (id.includes('@dnd-kit')) return 'dnd';
          if (id.includes('framer-motion')) return 'animation';
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
            return 'react-vendor';
          }
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('socket.io') || id.includes('engine.io')) return 'realtime';
          // One shared, long-cached chunk for the remaining small libs
          // (lucide icons, axios, date-fns, zod, etc.). Avoids a swarm of tiny
          // per-module chunks while still being cached once across the app.
          return 'vendor';
        },
      },
    },
  },
});
