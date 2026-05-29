import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxy KTC requests through the dev server to bypass browser CORS restrictions.
    // /ktc-proxy/... → https://keeptradecut.com/...
    proxy: {
      '/ktc-proxy': {
        target: 'https://keeptradecut.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ktc-proxy/, ''),
      },
      '/cfbd-proxy': {
        target: 'https://api.collegefootballdata.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cfbd-proxy/, ''),
      },
    },
  },
})
