import React, { useState, useEffect, useRef } from 'react'
import { Server, Plus, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { theme } from '../../theme/tokens'
import { AhovaCard } from '../../components/ui/AhovaCard'
import { AhovaBadge } from '../../components/ui/AhovaBadge'
import { AhovaButton } from '../../components/ui/AhovaButton'
import { AhovaDrawer } from '../../components/ui/AhovaDrawer'
import { useAppStore } from '../../store/appStore'

export const HostsPage: React.FC = () => {
  const { agents, selectedHostId, setSelectedHostId } = useAppStore()
  const hostList = Object.entries(agents)
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Пришли сюда кликом по хосту на Overview — подсвечиваем и скроллим к нему.
  useEffect(() => {
    if (!selectedHostId) return
    setHighlightedId(selectedHostId)
    cardRefs.current[selectedHostId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setSelectedHostId(null)
    const timer = setTimeout(() => setHighlightedId(null), 2500)
    return () => clearTimeout(timer)
  }, [selectedHostId, setSelectedHostId])

  // Backend URL берём из того же места, что и остальной фронтенд — окружение
  // определяет, куда агенту слать метрики.
  const backendUrl = window.location.protocol + '//' + window.location.hostname + ':8000'
  const installCommand = `BACKEND_URL=${backendUrl} AGENT_ID=my-server ./agent`

  const handleCopy = () => {
    navigator.clipboard.writeText(installCommand)
    setCopied(true)
    toast.success('Command copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing[6] }}>
        <p style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary }}>
          {hostList.length} connected machine{hostList.length !== 1 ? 's' : ''}
        </p>
        <AhovaButton variant="primary" size="md" icon={<Plus size={16} />} onClick={() => setShowAddAgent(true)}>
          Add Agent
        </AhovaButton>
      </div>

      {hostList.length === 0 ? (
        <AhovaCard>
          <div style={{ textAlign: 'center', padding: theme.spacing[8], color: theme.colors.text.muted }}>
            <Server size={48} style={{ margin: '0 auto', opacity: 0.3, marginBottom: theme.spacing[4] }} />
            <p style={{ fontSize: 16, fontWeight: 500, marginBottom: theme.spacing[2] }}>No hosts connected</p>
            <p style={{ fontSize: 13 }}>Install an agent to start monitoring</p>
          </div>
        </AhovaCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: theme.spacing[4] }}>
          {hostList.map(([id, agent]) => (
            <AhovaCard
              key={id}
              variant="default"
              style={{
                cursor: 'default',
                transition: theme.transition.normal,
                boxShadow: highlightedId === id ? `0 0 0 2px ${theme.colors.brand.purple}` : undefined,
              }}
            >
              <div ref={(el) => { cardRefs.current[id] = el }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing[4] }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[3] }}>
                  <Server size={18} style={{ color: theme.colors.brand.blue }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text.primary }}>
                      {agent.system?.hostname || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 11, color: theme.colors.text.muted }}>{id.slice(0, 12)}...</div>
                  </div>
                </div>
                <AhovaBadge variant="healthy">Online</AhovaBadge>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing[3] }}>
                <div>
                  <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>CPU</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: theme.colors.text.primary }}>
                    {(agent.cpu?.usage ?? 0).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Memory</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: theme.colors.text.primary }}>
                    {(agent.memory?.used_percent ?? 0).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Disk</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: theme.colors.text.primary }}>
                    {agent.disks?.[0]?.used_percent != null ? agent.disks[0].used_percent.toFixed(0) : '—'}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Uptime</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: theme.colors.text.primary }}>
                    {agent.system?.uptime ? `${Math.floor(agent.system.uptime / 3600)}h` : '—'}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: theme.colors.text.muted, marginTop: theme.spacing[3] }}>
                Last seen {Math.floor((Date.now() / 1000 - agent.timestamp) / 60)}m ago
              </div>
            </AhovaCard>
          ))}
        </div>
      )}

      <AhovaDrawer open={showAddAgent} onClose={() => setShowAddAgent(false)} title="Add Agent">
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
          <p style={{ fontSize: 13, color: theme.colors.text.secondary, lineHeight: 1.6 }}>
            Скопируйте команду на сервере, который хотите мониторить, и запустите
            скомпилированный бинарник агента (<code>make build-agent</code> в корне проекта).
            Агент зарегистрируется и начнёт присылать метрики автоматически.
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing[2],
              padding: theme.spacing[3],
              background: theme.colors.bg.secondary,
              border: `1px solid ${theme.colors.border.default}`,
              borderRadius: theme.radius.sm,
              fontFamily: 'monospace',
              fontSize: 12,
            }}
          >
            <code style={{ flex: 1, wordBreak: 'break-all' }}>{installCommand}</code>
            <button
              onClick={handleCopy}
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                borderRadius: theme.radius.sm,
                background: 'transparent',
                color: theme.colors.text.secondary,
                cursor: 'pointer',
              }}
            >
              {copied ? <Check size={14} color={theme.colors.status.healthy} /> : <Copy size={14} />}
            </button>
          </div>
          <p style={{ fontSize: 12, color: theme.colors.text.muted }}>
            Важно: агент должен иметь сетевой доступ к <code>{backendUrl}</code>.
            Если бэкенд не доступен снаружи localhost, потребуется настроить сеть/firewall отдельно.
          </p>
        </div>
      </AhovaDrawer>
    </div>
  )
}
