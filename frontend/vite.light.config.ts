import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const projectRoot = path.resolve(__dirname)

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    host: true,
    open: '/light.html',
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
      input: {
        main: path.resolve(projectRoot, 'light-index.html'),
        light: path.resolve(projectRoot, 'light.html')
      }
    }
  }
})
