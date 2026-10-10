import React, { useState } from 'react'
import { Search, Bell, Moon, Sun, Monitor, User, Command } from 'lucide-react'
import toast from 'react-hot-toast'
import { theme } from '../../theme/tokens'
import { useAppStore } from '../../store/appStore'
import { AuthDrawer } from '../ui/AuthDrawer'

const pageTitles: Record<string, string> = {
  overview: 'Overview',
  hosts: 'Hosts',
  processes: 'Processes',
  resources: 'Resources',
  docker: 'Docker',
  images: 'Images',
  networks: 'Networks',
  volumes: 'Volumes',
  metrics: 'Metrics Explorer',
  logs: 'Logs Explorer',
  events: 'Events',
  vulnerabilities: 'Vulnerabilities',
  compliance: 'Compliance',
  alerts: 'Alerts',
  settings: 'Settings',
}

export const TopBar: React.FC = () => {
  const { currentPage, setCommandPaletteOpen, theme: currentTheme, setTheme, navigate, alerts, currentUser, logout } = useAppStore()
  const title = pageTitles[currentPage] || 'Overview'
  const unreadCritical = alerts.filter(a => a.type === 'critical').length
  const [showAuthDrawer, setShowAuthDrawer] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const cycleTheme = () => {
    const order: Array<'dark' | 'light' | 'system'> = ['dark', 'light', 'system']
    const next = order[(order.indexOf(currentTheme) + 1) % order.length]
    setTheme(next)
    toast.success(`Theme: ${next}`)
  }

  const ThemeIcon = currentTheme === 'dark' ? Moon : currentTheme === 'light' ? Sun : Monitor

  return (
    <div
      style={{
        height: theme.layout.topBarHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${theme.layout.contentPadding}px`,
        borderBottom: `1px solid ${theme.colors.border.default}`,
        background: theme.colors.bg.primary,
        flexShrink: 0,
      }}
    >
      {/* Left: Page title */}
      <div>
        <h1
          style={{
            fontSize: theme.fontSize['2xl'],
            fontWeight: theme.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}
        >
          {title}
        </h1>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2] }}>
        {/* Search */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing[2],
            height: 36,
            padding: `0 ${theme.spacing[3]}`,
            background: theme.colors.bg.card,
            border: `1px solid ${theme.colors.border.default}`,
            borderRadius: theme.radius.sm,
            color: theme.colors.text.muted,
            cursor: 'pointer',
            fontSize: 13,
            transition: theme.transition.fast,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.colors.border.hover }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.colors.border.default }}
        >
          <Search size={14} />
          <span>Search</span>
          <kbd
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: '2px 6px',
              background: 'var(--ahova-fg-a06)',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 500,
              color: theme.colors.text.muted,
            }}
          >
            <Command size={10} />K
          </kbd>
        </button>

        {/* Notifications */}
        <button
          onClick={() => navigate('alerts')}
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: `1px solid ${theme.colors.border.default}`,
            borderRadius: theme.radius.sm,
            color: theme.colors.text.muted,
            cursor: 'pointer',
            position: 'relative',
            transition: theme.transition.fast,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = theme.colors.text.primary; e.currentTarget.style.borderColor = theme.colors.border.hover }}
          onMouseLeave={(e) => { e.currentTarget.style.color = theme.colors.text.muted; e.currentTarget.style.borderColor = theme.colors.border.default }}
        >
          <Bell size={16} />
          {unreadCritical > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: theme.colors.status.critical,
              }}
            />
          )}
        </button>

        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          title={`Theme: ${currentTheme} (click to change)`}
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: `1px solid ${theme.colors.border.default}`,
            borderRadius: theme.radius.sm,
            color: theme.colors.text.muted,
            cursor: 'pointer',
            transition: theme.transition.fast,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = theme.colors.text.primary; e.currentTarget.style.borderColor = theme.colors.border.hover }}
          onMouseLeave={(e) => { e.currentTarget.style.color = theme.colors.text.muted; e.currentTarget.style.borderColor = theme.colors.border.default }}
        >
          <ThemeIcon size={16} />
        </button>

        {/* User */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              if (currentUser) setShowUserMenu((v) => !v)
              else setShowAuthDrawer(true)
            }}
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: theme.colors.brand.gradient,
              border: 'none',
              borderRadius: '50%',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {currentUser ? currentUser.username.charAt(0).toUpperCase() : <User size={16} />}
          </button>

          {showUserMenu && currentUser && (
            <div
              style={{
                position: 'absolute',
                top: 44,
                right: 0,
                minWidth: 200,
                background: theme.colors.bg.card,
                border: `1px solid ${theme.colors.border.default}`,
                borderRadius: theme.radius.sm,
                boxShadow: theme.shadows.card,
                zIndex: 50,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: theme.spacing[3], borderBottom: `1px solid ${theme.colors.border.default}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text.primary }}>{currentUser.username}</div>
                <div style={{ fontSize: 12, color: theme.colors.text.muted }}>{currentUser.email}</div>
              </div>
              <button
                onClick={async () => {
                  setShowUserMenu(false)
                  await logout()
                  toast.success('Signed out')
                }}
                style={{
                  width: '100%',
                  padding: `${theme.spacing[2]} ${theme.spacing[3]}`,
                  background: 'transparent',
                  border: 'none',
                  color: theme.colors.status.critical,
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <AuthDrawer open={showAuthDrawer} onClose={() => setShowAuthDrawer(false)} />
    </div>
  )
}