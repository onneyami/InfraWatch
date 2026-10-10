import React, { useState } from 'react'
import { AhovaDrawer } from './AhovaDrawer'
import { AhovaButton } from './AhovaButton'
import { theme } from '../../theme/tokens'
import { useAppStore } from '../../store/appStore'

interface AuthDrawerProps {
  open: boolean
  onClose: () => void
}

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: `0 ${theme.spacing[3]}`,
  background: theme.colors.bg.card,
  border: `1px solid ${theme.colors.border.default}`,
  borderRadius: theme.radius.sm,
  color: theme.colors.text.primary,
  fontSize: 14,
  width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: theme.colors.text.secondary,
  marginBottom: theme.spacing[2],
  display: 'block',
}

export const AuthDrawer: React.FC<AuthDrawerProps> = ({ open, onClose }) => {
  const { login, register, authLoading, authError, clearAuthError } = useAppStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')

  const [loginId, setLoginId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const switchMode = (next: 'login' | 'register') => {
    setMode(next)
    setLocalError(null)
    clearAuthError()
  }

  const handleClose = () => {
    setLoginId('')
    setLoginPassword('')
    setRegUsername('')
    setRegEmail('')
    setRegPassword('')
    setRegPasswordConfirm('')
    setLocalError(null)
    clearAuthError()
    onClose()
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    const ok = await login(loginId, loginPassword)
    if (ok) handleClose()
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (regPassword !== regPasswordConfirm) {
      setLocalError('Passwords do not match')
      return
    }
    const ok = await register(regUsername, regEmail, regPassword)
    if (ok) handleClose()
  }

  const displayedError = localError || authError

  return (
    <AhovaDrawer open={open} onClose={handleClose} title={mode === 'login' ? 'Sign In' : 'Create Account'}>
      <div style={{ display: 'flex', gap: theme.spacing[1], marginBottom: theme.spacing[6], background: theme.colors.bg.card, padding: theme.spacing[1], borderRadius: theme.radius.sm }}>
        <button
          onClick={() => switchMode('login')}
          style={{
            flex: 1,
            padding: `${theme.spacing[2]} 0`,
            background: mode === 'login' ? 'rgba(139,92,246,0.15)' : 'transparent',
            border: 'none',
            borderRadius: theme.radius.sm,
            color: mode === 'login' ? theme.colors.text.primary : theme.colors.text.muted,
            fontSize: 13,
            fontWeight: mode === 'login' ? 500 : 400,
            cursor: 'pointer',
          }}
        >
          Sign In
        </button>
        <button
          onClick={() => switchMode('register')}
          style={{
            flex: 1,
            padding: `${theme.spacing[2]} 0`,
            background: mode === 'register' ? 'rgba(139,92,246,0.15)' : 'transparent',
            border: 'none',
            borderRadius: theme.radius.sm,
            color: mode === 'register' ? theme.colors.text.primary : theme.colors.text.muted,
            fontSize: 13,
            fontWeight: mode === 'register' ? 500 : 400,
            cursor: 'pointer',
          }}
        >
          Create Account
        </button>
      </div>

      {displayedError && (
        <div style={{
          padding: theme.spacing[3],
          marginBottom: theme.spacing[4],
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: theme.radius.sm,
          color: theme.colors.status.critical,
          fontSize: 13,
        }}>
          {displayedError}
        </div>
      )}

      {mode === 'login' ? (
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
          <div>
            <label style={labelStyle}>Username or email</label>
            <input style={inputStyle} value={loginId} onChange={(e) => setLoginId(e.target.value)} required autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input style={inputStyle} type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
          </div>
          <AhovaButton variant="primary" size="md" disabled={authLoading} style={{ width: '100%', justifyContent: 'center' }}>
            {authLoading ? 'Signing in...' : 'Sign In'}
          </AhovaButton>
        </form>
      ) : (
        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
          <div>
            <label style={labelStyle}>Username</label>
            <input style={inputStyle} value={regUsername} onChange={(e) => setRegUsername(e.target.value)} required minLength={3} maxLength={32} autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input style={inputStyle} type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label style={labelStyle}>Confirm password</label>
            <input style={inputStyle} type="password" value={regPasswordConfirm} onChange={(e) => setRegPasswordConfirm(e.target.value)} required minLength={8} />
          </div>
          <p style={{ fontSize: 12, color: theme.colors.text.muted }}>At least 8 characters.</p>
          <AhovaButton variant="primary" size="md" disabled={authLoading} style={{ width: '100%', justifyContent: 'center' }}>
            {authLoading ? 'Creating account...' : 'Create Account'}
          </AhovaButton>
        </form>
      )}
    </AhovaDrawer>
  )
}
