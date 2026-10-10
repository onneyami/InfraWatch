import React, { useEffect, useState } from 'react'
import { Cpu, MemoryStick, Search, Square, XOctagon } from 'lucide-react'
import toast from 'react-hot-toast'
import { theme } from '../../theme/tokens'
import { AhovaCard } from '../../components/ui/AhovaCard'
import { AhovaBadge } from '../../components/ui/AhovaBadge'
import { AhovaDrawer } from '../../components/ui/AhovaDrawer'
import { AhovaTable, Column } from '../../components/ui/AhovaTable'
import { api } from '../../services/api'
import { ProcessInfo } from '../../types/metrics'
import { useAppStore } from '../../store/appStore'

const actionBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid ${theme.colors.border.default}`,
  borderRadius: theme.radius.sm,
  background: 'transparent',
  color: theme.colors.text.secondary,
  cursor: 'pointer',
}

export const ProcessesPage: React.FC = () => {
  const { addEvent, addAlert } = useAppStore()
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null)
  const [actionPending, setActionPending] = useState<number | null>(null)

  const fetchProcesses = async () => {
    try {
      const data = await api.getProcesses()
      setProcesses(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchProcesses()
    const interval = setInterval(fetchProcesses, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleStopProcess = async (pid: number, force: boolean) => {
    const processName = processes.find((p) => p.pid === pid)?.name || `PID ${pid}`
    if (!confirm(force ? `Kill process ${pid}? This sends SIGKILL — unsaved state will be lost.` : `Stop process ${pid} gracefully (SIGTERM)?`)) return
    setActionPending(pid)
    try {
      await api.stopProcess(pid, force)
      toast.success(force ? `Process ${pid} killed` : `Process ${pid} terminated`)
      addEvent(`Process ${processName} (PID ${pid}) ${force ? 'killed' : 'stopped'}`)
      addAlert({ type: force ? 'warning' : 'info', title: `Process ${force ? 'killed' : 'stopped'}`, message: `${processName} (PID ${pid}) was ${force ? 'killed (SIGKILL)' : 'terminated (SIGTERM)'}`, source: processName })
      setSelectedProcess(null)
      await fetchProcesses()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || `Failed to stop process ${pid}`
      toast.error(detail)
      addEvent(`Failed to stop process ${processName} (PID ${pid})`)
    } finally {
      setActionPending(null)
    }
  }

  const filtered = search
    ? processes.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : processes

  const topCPU = [...filtered].sort((a, b) => (b.cpu_percent ?? 0) - (a.cpu_percent ?? 0)).slice(0, 5)
  const topMemory = [...filtered].sort((a, b) => (b.memory_percent ?? 0) - (a.memory_percent ?? 0)).slice(0, 5)

  const columns: Column<ProcessInfo>[] = [
    { key: 'name', header: 'Process', render: (p) => <span style={{ fontWeight: 500 }}>{p.name}</span> },
    { key: 'cpu_percent', header: 'CPU', align: 'right', render: (p) => (
      <span style={{ color: (p.cpu_percent ?? 0) > 50 ? theme.colors.status.critical : theme.colors.text.primary }}>
        {(p.cpu_percent ?? 0).toFixed(1)}%
      </span>
    )},
    { key: 'memory_percent', header: 'Memory', align: 'right', render: (p) => (
      <span>{(p.memory_percent ?? 0).toFixed(1)}%</span>
    )},
    { key: 'username', header: 'User', render: (p) => p.username || '—' },
    { key: 'status', header: 'Status', render: (p) => (
      <AhovaBadge variant={p.status === 'running' ? 'healthy' : 'default'} size="sm">
        {p.status}
      </AhovaBadge>
    )},
    { key: 'actions', header: 'Actions', render: (p) => (
      <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
        <button title="Stop (SIGTERM)" disabled={actionPending === p.pid} onClick={() => handleStopProcess(p.pid, false)} style={actionBtnStyle}>
          <Square size={13} />
        </button>
        <button title="Kill (SIGKILL)" disabled={actionPending === p.pid} onClick={() => handleStopProcess(p.pid, true)} style={{ ...actionBtnStyle, color: theme.colors.status.critical }}>
          <XOctagon size={13} />
        </button>
      </div>
    )},
  ]

  return (
    <div className="animate-fadeIn">
      <p style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary, marginBottom: theme.spacing[6] }}>
        {loading ? 'Loading...' : `${filtered.length} processes running`}
      </p>

      {/* Top CPU & Memory */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing[4], marginBottom: theme.spacing[6] }}>
        <AhovaCard title="Top CPU">
          {topCPU.map((p, i) => (
            <div key={p.pid} onClick={() => setSelectedProcess(p)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderBottom: i < topCPU.length - 1 ? `1px solid ${theme.colors.border.default}` : 'none', cursor: 'pointer', borderRadius: theme.radius.sm, transition: theme.transition.fast }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ahova-fg-a03)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
              <span style={{ fontSize: 13, color: theme.colors.text.primary }}>{p.name}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: (p.cpu_percent ?? 0) > 50 ? theme.colors.status.critical : theme.colors.text.primary }}>
                {(p.cpu_percent ?? 0).toFixed(1)}%
              </span>
            </div>
          ))}
        </AhovaCard>
        <AhovaCard title="Top Memory">
          {topMemory.map((p, i) => (
            <div key={p.pid} onClick={() => setSelectedProcess(p)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderBottom: i < topMemory.length - 1 ? `1px solid ${theme.colors.border.default}` : 'none', cursor: 'pointer', borderRadius: theme.radius.sm, transition: theme.transition.fast }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ahova-fg-a03)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
              <span style={{ fontSize: 13, color: theme.colors.text.primary }}>{p.name}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{(p.memory_percent ?? 0).toFixed(1)}%</span>
            </div>
          ))}
        </AhovaCard>
      </div>

      {/* Search */}
      <div style={{ marginBottom: theme.spacing[4] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], height: 40, padding: `0 ${theme.spacing[3]}`, background: theme.colors.bg.card, border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm, maxWidth: 400 }}>
          <Search size={14} style={{ color: theme.colors.text.muted }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search process..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: theme.colors.text.primary, fontSize: 13, fontFamily: 'Inter, sans-serif' }}
          />
        </div>
      </div>

      {/* Processes table */}
      <AhovaCard>
        <AhovaTable
          columns={columns}
          data={filtered}
          onRowClick={(p) => setSelectedProcess(p)}
          emptyMessage="No processes found"
        />
      </AhovaCard>

      {/* Process Drawer */}
      <AhovaDrawer
        open={!!selectedProcess}
        onClose={() => setSelectedProcess(null)}
        title={selectedProcess?.name || 'Process Details'}
      >
        {selectedProcess && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing[4], marginBottom: theme.spacing[6] }}>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>PID</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedProcess.pid}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Status</div>
                <AhovaBadge variant={selectedProcess.status === 'running' ? 'healthy' : 'default'}>{selectedProcess.status}</AhovaBadge>
              </div>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>CPU</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{(selectedProcess.cpu_percent ?? 0).toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Memory</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{(selectedProcess.memory_percent ?? 0).toFixed(1)}%</div>
              </div>
              {selectedProcess.username && (
                <div>
                  <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>User</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedProcess.username}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: theme.spacing[2], marginBottom: theme.spacing[3] }}>
              <button
                onClick={() => handleStopProcess(selectedProcess.pid, false)}
                disabled={actionPending === selectedProcess.pid}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(234,179,8,0.15)', border: 'none', borderRadius: theme.radius.md, color: theme.colors.status.warning, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                <Square size={14} /> Stop
              </button>
              <button
                onClick={() => handleStopProcess(selectedProcess.pid, true)}
                disabled={actionPending === selectedProcess.pid}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: theme.radius.md, color: theme.colors.status.critical, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                <XOctagon size={14} /> Kill
              </button>
            </div>
            <p style={{ fontSize: 11, color: theme.colors.text.muted }}>
              Stop отправляет SIGTERM (мягкое завершение), Kill — SIGKILL (немедленное, без возможности процессу сохранить состояние).
              Start/Restart для произвольных процессов ОС не поддерживаются — в отличие от Docker-контейнеров,
              у процесса нет сохранённой команды запуска, которую можно было бы повторить.
            </p>
          </div>
        )}
      </AhovaDrawer>
    </div>
  )
}