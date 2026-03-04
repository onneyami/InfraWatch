import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const isLight = process.env.LIGHT === 'true'

export default defineConfig({
  plugins: [react()],
  server: {
    // allow overriding port via environment variable for light/demo instances
    port: Number(process.env.PORT) || 5173,
    host: true,
    // when launching light version we can automatically open the light entry page
    open: isLight ? '/light.html' : '/',
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    rollupOptions: {
      // For light version, only build light.html; for main version, build index.html
      input: isLight 
        ? resolve(__dirname, 'light.html')
        : resolve(__dirname, 'index.html')
    }
  }
})