import React from 'react'
import { LayoutDashboard, Server, Container, Activity, Shield, Bell, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { theme } from '../../theme/tokens'
import { useAppStore } from '../../store/appStore'

const navItems = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
  { id: 'hosts', label: 'Hosts', icon: <Server size={18} /> },
  { id: 'docker', label: 'Docker', icon: <Container size={18} /> },
  { id: 'metrics', label: 'Metrics', icon: <Activity size={18} /> },
  { id: 'security', label: 'Security', icon: <Shield size={18} /> },
  { id: 'alerts', label: 'Alerts', icon: <Bell size={18} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
]

export const Sidebar: React.FC = () => {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggle = useAppStore((s) => s.toggleSidebar)
  const currentPage = useAppStore((s) => s.currentPage)
  const navigate = useAppStore((s) => s.navigate)

  return (
    <div style={{
      width: collapsed ? 72 : 260,
      height: '100vh',
      background: theme.colors.sidebar.bg,
      borderRight: `1px solid ${theme.colors.border.default}`,
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 200ms ease',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        height: 80,
        display: 'flex',
        alignItems: 'center',
        padding: collapsed ? '0 16px' : '0 20px',
        borderBottom: `1px solid ${theme.colors.border.default}`,
        gap: 12,
      }}>
        <img src="/assets/logo.png" alt="Ahova" style={{ width: 36, height: 36, flexShrink: 0, objectFit: 'contain' }} />
        {!collapsed && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: theme.colors.text.primary, lineHeight: 1.2 }}>Ahova</div>
            <div style={{ fontSize: 10, color: theme.colors.text.muted, letterSpacing: '0.05em' }}>Know your server. Instantly.</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {navItems.map((item) => {
          const active = currentPage === item.id
          return (
            <div
              key={item.id}
              onClick={() => navigate(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 40,
                padding: collapsed ? '0 12px' : '0 12px',
                borderRadius: 8,
                cursor: 'pointer',
                background: active ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: active ? theme.colors.text.primary : 'var(--ahova-fg-a60)',
                gap: 12,
                transition: '150ms ease',
                justifyContent: collapsed ? 'center' : undefined,
                position: 'relative',
              }}
            >
              {active && !collapsed && (
                <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 2, borderRadius: 1, background: 'linear-gradient(180deg, #3B82F6, #8B5CF6)' }} />
              )}
              <span style={{ display: 'flex', flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span style={{ fontSize: 13, fontWeight: active ? 500 : 400 }}>{item.label}</span>}
            </div>
          )
        })}
      </nav>

      {/* Collapse */}
      <div style={{ padding: 12, borderTop: `1px solid ${theme.colors.border.default}` }}>
        <div
          onClick={toggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-end',
            height: 36,
            cursor: 'pointer',
            color: theme.colors.text.muted,
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </div>
      </div>
    </div>
  )
}