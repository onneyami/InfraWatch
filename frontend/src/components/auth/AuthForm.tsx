import React, { useEffect, useState } from 'react'
import { AhovaButton } from '../ui/AhovaButton'
import { theme } from '../../theme/tokens'
import { useAppStore } from '../../store/appStore'
import { api } from '../../services/api'

interface AuthFormProps {
  /** Called after a successful sign-in or account creation. */
  onSuccess?: () => void
}

type AuthStatus = { setup_required: boolean; registration_open: boolean }

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

const tabStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: `${theme.spacing[2]} 0`,
  background: active ? 'rgba(139,92,246,0.15)' : 'transparent',
  border: 'none',
  borderRadius: theme.radius.sm,
  color: active ? theme.colors.text.primary : theme.colors.text.muted,
  fontSize: 13,
  fontWeight: active ? 500 : 400,
  cursor: 'pointer',
})

export const AuthForm: React.FC<AuthFormProps> = ({ onSuccess }) => {
  const { login, register, authLoading, authError, clearAuthError } = useAppStore()

  // Ask the server whether sign-up is available. Until it answers (or if it cannot be
  // reached) behave as "sign-in only": the safe default.
  const [status, setStatus] = useState<AuthStatus | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .getAuthStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus({ setup_required: false, registration_open: false }))
    return () => {
      cancelled = true
    }
  }, [])

  const setupRequired = status?.setup_required === true
  const canRegister = status?.registration_open === true

  const [chosenMode, setChosenMode] = useState<'login' | 'register'>('login')
  const mode: 'login' | 'register' = setupRequired ? 'register' : canRegister ? chosenMode : 'login'

  const [loginId, setLoginId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const switchMode = (next: 'login' | 'register') => {
    setChosenMode(next)
    setLocalError(null)
    clearAuthError()
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (await login(loginId, loginPassword)) onSuccess?.()
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (regPassword !== regPasswordConfirm) {
      setLocalError('Passwords do not match')
      return
    }
    if (await register(regUsername, regEmail, regPassword)) onSuccess?.()
  }

  const displayedError = localError || authError

  return (
    <div>
      {setupRequired && (
        <p style={{ fontSize: 13, color: theme.colors.text.secondary, lineHeight: 1.6, marginBottom: theme.spacing[4] }}>
          Welcome! No account exists yet. Create the first one — it will be used to sign in to this dashboard.
        </p>
      )}

      {canRegister && !setupRequired && (
        <div style={{ display: 'flex', gap: theme.spacing[1], marginBottom: theme.spacing[6], background: theme.colors.bg.card, padding: theme.spacing[1], borderRadius: theme.radius.sm }}>
          <button type="button" onClick={() => switchMode('login')} style={tabStyle(mode === 'login')}>
            Sign In
          </button>
          <button type="button" onClick={() => switchMode('register')} style={tabStyle(mode === 'register')}>
            Create Account
          </button>
        </div>
      )}

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
            <input style={inputStyle} value={loginId} onChange={(e) => setLoginId(e.target.value)} required autoFocus autoComplete="username" maxLength={254} />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input style={inputStyle} type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required autoComplete="current-password" maxLength={128} />
          </div>
          <AhovaButton variant="primary" size="md" disabled={authLoading} style={{ width: '100%', justifyContent: 'center' }}>
            {authLoading ? 'Signing in...' : 'Sign In'}
          </AhovaButton>
        </form>
      ) : (
        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
          <div>
            <label style={labelStyle}>Username</label>
            <input style={inputStyle} value={regUsername} onChange={(e) => setRegUsername(e.target.value)} required minLength={3} maxLength={32} autoFocus autoComplete="username" />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required maxLength={254} autoComplete="email" />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input style={inputStyle} type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" />
          </div>
          <div>
            <label style={labelStyle}>Confirm password</label>
            <input style={inputStyle} type="password" value={regPasswordConfirm} onChange={(e) => setRegPasswordConfirm(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" />
          </div>
          <p style={{ fontSize: 12, color: theme.colors.text.muted }}>At least 8 characters.</p>
          <AhovaButton variant="primary" size="md" disabled={authLoading} style={{ width: '100%', justifyContent: 'center' }}>
            {authLoading ? 'Creating account...' : setupRequired ? 'Create First Account' : 'Create Account'}
          </AhovaButton>
        </form>
      )}
    </div>
  )
}
