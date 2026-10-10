import React from 'react'
import { theme } from '../theme/tokens'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Ahova Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: theme.colors.bg.primary,
            color: theme.colors.text.primary,
            gap: theme.spacing[4],
            padding: theme.spacing[8],
          }}
        >
          <img src="/assets/logo.png" alt="Ahova" style={{ width: 48, height: 48, objectFit: 'contain' }} />
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: theme.colors.text.muted, fontSize: 14, textAlign: 'center', maxWidth: 400 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              background: theme.colors.brand.gradient,
              border: 'none',
              borderRadius: theme.radius.md,
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              marginTop: theme.spacing[4],
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}