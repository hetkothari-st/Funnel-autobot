import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    base: '/autobot/',
  },
  server: {
    port: 5174,
    allowedHosts: true,
    host: true,
    proxy: {
      '/ws': {
        target: 'ws://115.242.15.134:19101',
        ws: true,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ws/, ''),
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/megatrader-api': {
        target: 'http://192.168.6.164:16006',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/megatrader-api/, ''),
        secure: false
      }
    }
  }
})
