import React, { useState, useEffect } from 'react'
import { Bell, AlertTriangle, CheckCircle, Info, X, Clock } from 'lucide-react'
import { theme } from '../../theme/tokens'
import { AhovaCard } from '../../components/ui/AhovaCard'
import { AhovaBadge } from '../../components/ui/AhovaBadge'
import { AhovaDrawer } from '../../components/ui/AhovaDrawer'
import { useAppStore } from '../../store/appStore'
import { Alert } from '../../types/metrics'

const alertColors: Record<string, { bg: string; border: string; icon: React.ReactNode }> = {
  critical: { bg: 'rgba(239,68,68,0.08)', border: '#EF4444', icon: <AlertTriangle size={16} /> },
  warning: { bg: 'rgba(234,179,8,0.08)', border: '#EAB308', icon: <AlertTriangle size={16} /> },
  info: { bg: 'rgba(56,189,248,0.08)', border: '#38BDF8', icon: <Info size={16} /> },
}

export const AlertsPage: React.FC = () => {
  const { alerts, selectedAlertId, setSelectedAlertId, removeAlert, clearAlerts } = useAppStore()
  const [filter, setFilter] = useState<string>('all')
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)

  // Если сюда перешли кликом по алерту на Overview — сразу открываем его
  // drawer, а не просто показываем общий список.
  useEffect(() => {
    if (selectedAlertId) {
      const alert = alerts.find((a) => a.id === selectedAlertId)
      if (alert) setSelectedAlert(alert)
      setSelectedAlertId(null)
    }
  }, [selectedAlertId, alerts, setSelectedAlertId])

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.type === filter)

  return (
    <div className="animate-fadeIn">
      {/* Filter tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing[6] }}>
        <div style={{ display: 'flex', gap: theme.spacing[1] }}>
        {[
          { id: 'all', label: 'All', count: alerts.length },
          { id: 'critical', label: 'Critical', count: alerts.filter(a => a.type === 'critical').length },
          { id: 'warning', label: 'Warning', count: alerts.filter(a => a.type === 'warning').length },
          { id: 'info', label: 'Info', count: alerts.filter(a => a.type === 'info').length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing[2],
              padding: `${theme.spacing[2]} ${theme.spacing[4]}`,
              background: filter === tab.id ? 'rgba(139,92,246,0.15)' : 'transparent',
              border: 'none',
              borderRadius: theme.radius.sm,
              color: filter === tab.id ? theme.colors.text.primary : theme.colors.text.muted,
              fontSize: 13,
              fontWeight: filter === tab.id ? 500 : 400,
              cursor: 'pointer',
              transition: theme.transition.fast,
            }}
          >
            {tab.label}
            <span style={{
              padding: '1px 6px',
              borderRadius: 10,
              background: filter === tab.id ? 'rgba(139,92,246,0.3)' : 'var(--ahova-fg-a06)',
              fontSize: 11,
              fontWeight: 500,
            }}>
              {tab.count}
            </span>
          </button>
        ))}
        </div>
        {alerts.length > 0 && (
          <button
            onClick={() => { if (confirm('Clear all alerts?')) clearAlerts() }}
            style={{
              padding: `${theme.spacing[2]} ${theme.spacing[3]}`,
              background: 'transparent',
              border: `1px solid ${theme.colors.border.default}`,
              borderRadius: theme.radius.sm,
              color: theme.colors.text.muted,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Alerts list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[3] }}>
        {filtered.map((alert) => {
          const colors = alertColors[alert.type]
          const timeAgo = Math.floor((Date.now() / 1000 - alert.timestamp) / 60)

          return (
            <div
              key={alert.id}
              onClick={() => setSelectedAlert(alert)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: theme.spacing[4],
                padding: theme.spacing[4],
                background: colors.bg,
                border: `1px solid ${colors.border}30`,
                borderLeft: `3px solid ${colors.border}`,
                borderRadius: theme.radius.lg,
                cursor: 'pointer',
                transition: theme.transition.fast,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg.replace('0.08', '0.12') }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.bg }}
            >
              <span style={{ color: colors.border, flexShrink: 0, marginTop: 2 }}>
                {colors.icon}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text.primary, marginBottom: theme.spacing[1] }}>
                  {alert.title}
                </div>
                <div style={{ fontSize: 13, color: theme.colors.text.secondary, marginBottom: theme.spacing[1] }}>
                  {alert.message}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], fontSize: 11, color: theme.colors.text.muted }}>
                  <span>{alert.source}</span>
                  <span>·</span>
                  <Clock size={10} />
                  <span>{timeAgo} minutes ago</span>
                </div>
              </div>
              <button
                title="Dismiss"
                onClick={(e) => { e.stopPropagation(); removeAlert(alert.id) }}
                style={{
                  flexShrink: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', borderRadius: theme.radius.sm, background: 'transparent',
                  color: theme.colors.text.muted, cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <AhovaCard>
            <div style={{ textAlign: 'center', padding: theme.spacing[8], color: theme.colors.text.muted }}>
              <CheckCircle size={48} style={{ margin: '0 auto', opacity: 0.3, marginBottom: theme.spacing[4], color: theme.colors.status.healthy }} />
              <p style={{ fontSize: 16, fontWeight: 500 }}>No alerts</p>
              <p style={{ fontSize: 13 }}>All systems operational</p>
            </div>
          </AhovaCard>
        )}
      </div>

      {/* Alert Drawer */}
      <AhovaDrawer
        open={!!selectedAlert}
        onClose={() => setSelectedAlert(null)}
        title="Alert Details"
      >
        {selectedAlert && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], marginBottom: theme.spacing[4] }}>
              <AhovaBadge
                variant={selectedAlert.type === 'critical' ? 'critical' : selectedAlert.type === 'warning' ? 'warning' : 'info'}
                size="md"
              >
                {selectedAlert.type}
              </AhovaBadge>
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: theme.spacing[3] }}>{selectedAlert.title}</h3>
            <p style={{ fontSize: 14, color: theme.colors.text.secondary, marginBottom: theme.spacing[4] }}>{selectedAlert.message}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing[4], marginBottom: theme.spacing[4] }}>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Source</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{selectedAlert.source}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Time</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{new Date(selectedAlert.timestamp * 1000).toLocaleString()}</div>
              </div>
            </div>
            <button
              onClick={() => { removeAlert(selectedAlert.id); setSelectedAlert(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', background: 'rgba(239,68,68,0.15)',
                border: 'none', borderRadius: theme.radius.md,
                color: theme.colors.status.critical, fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <X size={14} /> Dismiss
            </button>
          </div>
        )}
      </AhovaDrawer>
    </div>
  )
}