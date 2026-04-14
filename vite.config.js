import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    root: '.',
    server: {
        port: 5197,
        host: true,
        allowedHosts: true,
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
                secure: false,
            },
        },
    }
})
