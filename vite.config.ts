import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    target: 'es2022',
    // Three.js ocupa ~600 KB minificado; se separa en su propio archivo.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
  server: { host: '127.0.0.1', port: 5190 },
  preview: { host: '127.0.0.1', port: 5191 },
});
