import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Keep in sync with the insecure development default in backend/src/core/config.py.
const DEV_PLACEHOLDER_TOKEN = 'dev-dashboard-token-change-me'

export default defineConfig(({ mode }) => {
  // A production bundle with a missing or placeholder dashboard token would either
  // fail every request with 401 or, worse, ship a publicly known credential that the
  // backend also accepts by default. Fail the build instead of finding out at runtime.
  if (mode === 'production') {
    const token = loadEnv(mode, process.cwd(), 'VITE_').VITE_DASHBOARD_TOKEN
    if (!token || token === DEV_PLACEHOLDER_TOKEN) {
      throw new Error(
        'VITE_DASHBOARD_TOKEN must be set to a real secret for production builds ' +
          '(it is missing or still the development placeholder). Set it in the build ' +
          'environment and set the same value as DASHBOARD_API_TOKEN on the backend.',
      )
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      open: true,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
