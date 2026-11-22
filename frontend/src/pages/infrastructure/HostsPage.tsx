import React, { useState, useEffect, useRef } from 'react'
import { Server, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { theme } from '../../theme/tokens'
import { AhovaCard } from '../../components/ui/AhovaCard'
import { AhovaBadge } from '../../components/ui/AhovaBadge'
import { AhovaButton } from '../../components/ui/AhovaButton'
import { AddAgentDrawer } from '../../components/agents/AddAgentDrawer'
import { api } from '../../services/api'
import { useAppStore } from '../../store/appStore'

export const HostsPage: React.FC = () => {
  const { agents, setAgents, selectedHostId, setSelectedHostId } = useAppStore()
  const hostList = Object.entries(agents)
  const [showAddAgent, setShowAddAgent] = useState(false)
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

  const handleRemove = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name}? Its token stops working and its history is dropped. To monitor it again you will need a new enrollment key.`)) return
    try {
      await api.deleteAgent(id)
      const { [id]: _removed, ...rest } = agents
      setAgents(rest)
      toast.success(`${name} removed`)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Could not remove the agent')
    }
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
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2] }}>
                  <AhovaBadge variant="healthy">Online</AhovaBadge>
                  <button
                    onClick={() => handleRemove(id, agent.system?.hostname || id)}
                    aria-label="Remove agent"
                    title="Remove agent"
                    style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: theme.radius.sm, background: 'transparent', color: theme.colors.text.muted, cursor: 'pointer' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
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

      <AddAgentDrawer open={showAddAgent} onClose={() => setShowAddAgent(false)} />
    </div>
  )
}
