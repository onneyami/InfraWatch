import React, { useEffect, useState, useRef } from 'react'
import { Search, Command, Container, Activity, Shield, Bell, Settings, Server, LayoutDashboard, Cpu, AlertTriangle, CheckSquare } from 'lucide-react'
import { theme } from '../../theme/tokens'
import { useAppStore } from '../../store/appStore'

interface CommandItem {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  action: () => void
}

export const CommandPalette: React.FC = () => {
  const { commandPaletteOpen, setCommandPaletteOpen, navigate } = useAppStore()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands: CommandItem[] = [
    { id: 'nav-overview', label: 'Open Overview', description: 'Go to dashboard', icon: <LayoutDashboard size={16} />, action: () => navigate('overview') },
    { id: 'nav-docker', label: 'Open Docker Containers', description: 'View running containers', icon: <Container size={16} />, action: () => navigate('docker') },
    { id: 'nav-metrics', label: 'View CPU metrics', description: 'Metrics Explorer', icon: <Activity size={16} />, action: () => navigate('metrics') },
    { id: 'nav-hosts', label: 'View Hosts', description: 'Infrastructure hosts', icon: <Server size={16} />, action: () => navigate('hosts') },
    { id: 'nav-security', label: 'Run Security Scan', description: 'Security Center', icon: <Shield size={16} />, action: () => navigate('vulnerabilities') },
    { id: 'nav-alerts', label: 'View Alerts', description: 'Alerts Center', icon: <Bell size={16} />, action: () => navigate('alerts') },
    { id: 'nav-processes', label: 'View Processes', description: 'Runtime Explorer', icon: <Cpu size={16} />, action: () => navigate('processes') },
    { id: 'nav-compliance', label: 'View Compliance', description: 'CIS Benchmark', icon: <CheckSquare size={16} />, action: () => navigate('compliance') },
    { id: 'nav-settings', label: 'Open Settings', description: 'Configuration', icon: <Settings size={16} />, action: () => navigate('settings') },
    { id: 'nav-logs', label: 'View Logs', description: 'Logs Explorer', icon: <AlertTriangle size={16} />, action: () => navigate('logs') },
  ]

  const filtered = query
    ? commands.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase())
      )
    : commands

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(!commandPaletteOpen)
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].action()
      setCommandPaletteOpen(false)
    }
  }

  if (!commandPaletteOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setCommandPaletteOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 200,
          backdropFilter: 'blur(4px)',
        }}
      />
      {/* Palette */}
      <div
        className="animate-slideUp"
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 560,
          maxWidth: '90vw',
          background: theme.colors.bg.elevated,
          border: `1px solid ${theme.colors.border.default}`,
          borderRadius: theme.radius.lg,
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          zIndex: 201,
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing[3],
            padding: theme.spacing[4],
            borderBottom: `1px solid ${theme.colors.border.default}`,
          }}
        >
          <Search size={18} style={{ color: theme.colors.text.muted, flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Find anything..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: theme.colors.text.primary,
              fontSize: 16,
              fontFamily: 'Inter, sans-serif',
            }}
          />
          <kbd
            style={{
              padding: '2px 6px',
              background: 'var(--ahova-fg-a06)',
              borderRadius: 4,
              fontSize: 10,
              color: theme.colors.text.muted,
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 300, overflow: 'auto', padding: theme.spacing[2] }}>
          {filtered.length === 0 && (
            <div
              style={{
                padding: theme.spacing[6],
                textAlign: 'center',
                color: theme.colors.text.muted,
                fontSize: 14,
              }}
            >
              No results found
            </div>
          )}
          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              onClick={() => { cmd.action(); setCommandPaletteOpen(false) }}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing[3],
                padding: `${theme.spacing[2]} ${theme.spacing[3]}`,
                borderRadius: theme.radius.sm,
                cursor: 'pointer',
                background: idx === selectedIndex ? 'rgba(139,92,246,0.15)' : 'transparent',
                transition: theme.transition.fast,
              }}
            >
              <span style={{ color: theme.colors.text.muted, display: 'flex', flexShrink: 0 }}>
                {cmd.icon}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: theme.colors.text.primary, fontWeight: 500 }}>
                  {cmd.label}
                </div>
                <div style={{ fontSize: 12, color: theme.colors.text.muted }}>
                  {cmd.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}