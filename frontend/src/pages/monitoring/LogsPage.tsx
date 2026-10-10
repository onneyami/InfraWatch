import React, { useState } from 'react'
import { Search, Info, AlertTriangle, AlertOctagon } from 'lucide-react'
import { theme } from '../../theme/tokens'
import { AhovaCard } from '../../components/ui/AhovaCard'
import { AhovaBadge } from '../../components/ui/AhovaBadge'
import { AhovaButton } from '../../components/ui/AhovaButton'

interface LogEntry {
  id: string
  timestamp: string
  level: 'INFO' | 'WARNING' | 'ERROR'
  message: string
  source: string
}

const mockLogs: LogEntry[] = [
  { id: '1', timestamp: '14:42:12', level: 'INFO', message: 'Container started', source: 'docker-api' },
  { id: '2', timestamp: '14:41:55', level: 'WARNING', message: 'High memory usage detected', source: 'monitor' },
  { id: '3', timestamp: '14:41:30', level: 'ERROR', message: 'Container health check failed', source: 'docker-api' },
  { id: '4', timestamp: '14:40:00', level: 'INFO', message: 'Security scan finished', source: 'trivy' },
  { id: '5', timestamp: '14:39:15', level: 'INFO', message: 'Agent connected', source: 'agent-01' },
  { id: '6', timestamp: '14:38:00', level: 'WARNING', message: 'CPU threshold exceeded', source: 'monitor' },
  { id: '7', timestamp: '14:35:00', level: 'INFO', message: 'Docker image pulled', source: 'docker-api' },
  { id: '8', timestamp: '14:30:00', level: 'ERROR', message: 'Disk space low', source: 'agent-01' },
]

const levelColors: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  INFO: { bg: 'rgba(148,163,184,0.1)', text: '#94A3B8', icon: <Info size={12} /> },
  WARNING: { bg: 'rgba(234,179,8,0.1)', text: '#EAB308', icon: <AlertTriangle size={12} /> },
  ERROR: { bg: 'rgba(239,68,68,0.1)', text: '#EF4444', icon: <AlertOctagon size={12} /> },
}

export const LogsPage: React.FC = () => {
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('all')

  const filtered = mockLogs.filter((log) => {
    if (levelFilter !== 'all' && log.level !== levelFilter) return false
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="animate-fadeIn">
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[3], marginBottom: theme.spacing[6], flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], height: 40, padding: `0 ${theme.spacing[3]}`, background: theme.colors.bg.card, border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm, flex: 1, maxWidth: 400 }}>
          <Search size={14} style={{ color: theme.colors.text.muted }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: theme.colors.text.primary, fontSize: 13, fontFamily: 'Inter, sans-serif' }}
          />
        </div>
        <div style={{ display: 'flex', gap: theme.spacing[1] }}>
          {['all', 'INFO', 'WARNING', 'ERROR'].map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              style={{
                padding: '6px 12px',
                background: levelFilter === l ? 'rgba(139,92,246,0.15)' : 'transparent',
                border: `1px solid ${levelFilter === l ? theme.colors.brand.purple + '40' : theme.colors.border.default}`,
                borderRadius: theme.radius.sm,
                color: levelFilter === l ? theme.colors.text.primary : theme.colors.text.muted,
                fontSize: 12,
                cursor: 'pointer',
                transition: theme.transition.fast,
                textTransform: 'capitalize',
              }}
            >
              {l === 'all' ? 'All' : l}
            </button>
          ))}
        </div>
      </div>

      {/* Logs */}
      <AhovaCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {filtered.map((log) => {
            const colors = levelColors[log.level]
            return (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing[3],
                  padding: `${theme.spacing[2]} ${theme.spacing[2]}`,
                  borderBottom: `1px solid ${theme.colors.border.default}`,
                  fontSize: 13,
                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                  transition: theme.transition.fast,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ahova-fg-a02)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ color: theme.colors.text.muted, width: 56, flexShrink: 0 }}>{log.timestamp}</span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing[1],
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: colors.bg,
                    color: colors.text,
                    fontSize: 11,
                    fontWeight: 600,
                    width: 70,
                    flexShrink: 0,
                  }}
                >
                  {colors.icon}
                  {log.level}
                </span>
                <span style={{ color: theme.colors.text.primary, flex: 1 }}>{log.message}</span>
                <span style={{ color: theme.colors.text.muted, fontSize: 11 }}>{log.source}</span>
              </div>
            )
          })}
        </div>
      </AhovaCard>

      <div style={{ textAlign: 'center', marginTop: theme.spacing[4] }}>
        <span style={{ fontSize: 12, color: theme.colors.text.muted }}>
          Showing {filtered.length} of {mockLogs.length} logs
        </span>
      </div>
    </div>
  )
}