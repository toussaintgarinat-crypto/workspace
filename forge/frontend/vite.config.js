import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  server: {
    port: 3000,
    hmr: { port: 3000 },
    proxy: {
      '/api/ws': {
        target: 'ws://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
      '/api/voice/realtime': {
        target: 'ws://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
