import React from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { applyTheme, watchSystemTheme, ThemePreference } from './theme/applyTheme'
import './theme/global.css'

// Тема применяется здесь, синхронно, до первого рендера — иначе страница
// на долю секунды показывалась бы в тёмной теме по умолчанию, даже если
// пользователь выбрал светлую или системную.
const savedTheme = (localStorage.getItem('ahova_theme') as ThemePreference) || 'dark'
applyTheme(savedTheme)
watchSystemTheme(savedTheme)

const App = React.lazy(() => import('./App'))

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <React.Suspense fallback={
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'var(--ahova-bg-primary)',
            color: '#8B5CF6',
            fontSize: 24,
            flexDirection: 'column',
            gap: 16,
          }}>
            <img src="/assets/logo.png" alt="Ahova" style={{ width: 48, height: 48, objectFit: 'contain' }} />
            <span style={{ fontSize: 14, color: 'var(--ahova-text-muted)' }}>Loading Ahova...</span>
          </div>
        }>
          <App />
        </React.Suspense>
      </ErrorBoundary>
    </React.StrictMode>
  )
}