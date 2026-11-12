import React from 'react'
import { AuthForm } from './AuthForm'
import { theme } from '../../theme/tokens'

/** Full-screen sign-in shown to anyone without a valid session. */
export const AuthGate: React.FC = () => (
  <div style={{
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.colors.bg.primary,
    padding: theme.spacing[6],
  }}>
    <div style={{
      width: '100%',
      maxWidth: 400,
      background: theme.colors.bg.secondary,
      border: `1px solid ${theme.colors.border.default}`,
      borderRadius: theme.radius.md,
      padding: theme.spacing[8],
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: theme.spacing[3], marginBottom: theme.spacing[6] }}>
        <img src="/assets/logo.png" alt="Ahova" style={{ width: 56, height: 56, objectFit: 'contain' }} />
        <h1 style={{ fontSize: 20, fontWeight: 600, color: theme.colors.text.primary, margin: 0 }}>Sign in to Ahova</h1>
      </div>
      <AuthForm />
    </div>
  </div>
)
