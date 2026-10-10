import React, { useEffect, useState, useRef } from 'react'
import { Container, Image as ImageIcon, Network as NetworkIcon, Database, Play, Square, RotateCw, FileText, Trash2, Radio, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { theme } from '../../theme/tokens'
import { AhovaCard } from '../../components/ui/AhovaCard'
import { AhovaBadge } from '../../components/ui/AhovaBadge'
import { AhovaDrawer } from '../../components/ui/AhovaDrawer'
import { AhovaTable, Column } from '../../components/ui/AhovaTable'
import { api } from '../../services/api'
import { DockerContainer, DockerImage } from '../../types/metrics'
import { useAppStore } from '../../store/appStore'

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const DASHBOARD_TOKEN = (import.meta as any).env?.VITE_DASHBOARD_TOKEN || 'dev-dashboard-token-change-me'

export const DockerPage: React.FC = () => {
  const { dockerInfo, addEvent, addAlert, selectedContainerId, setSelectedContainerId } = useAppStore()
  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [images, setImages] = useState<DockerImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(true)
  const [networks, setNetworks] = useState<Array<{ id: string; name: string; driver: string }>>([])
  const [volumes, setVolumes] = useState<Array<{ name: string; driver: string; mountpoint: string }>>([])
  const [dockerAvailable, setDockerAvailable] = useState(true)
  const [selectedContainer, setSelectedContainer] = useState<DockerContainer | null>(null)
  const [activeTab, setActiveTab] = useState<'containers' | 'images' | 'networks' | 'volumes'>('containers')
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [search, setSearch] = useState('')

  const searchLower = search.trim().toLowerCase()
  const filteredContainers = searchLower
    ? containers.filter((c) => c.name.toLowerCase().includes(searchLower) || c.image.toLowerCase().includes(searchLower))
    : containers
  const filteredImages = searchLower
    ? images.filter((img) => (img.repo_tags?.join(' ') || '').toLowerCase().includes(searchLower) || img.id.toLowerCase().includes(searchLower))
    : images
  const filteredNetworks = searchLower
    ? networks.filter((n) => n.name.toLowerCase().includes(searchLower) || n.driver.toLowerCase().includes(searchLower))
    : networks
  const filteredVolumes = searchLower
    ? volumes.filter((v) => v.name.toLowerCase().includes(searchLower))
    : volumes

  // Логи в drawer'е контейнера
  const [logs, setLogs] = useState<string[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const fetchAll = async () => {
    try {
      const raw = await api.getDockerRaw()
      setDockerAvailable(raw.docker_available !== false)
      setContainers((raw.containers || []).map((c) => {
        const name = (c.names && c.names[0] ? c.names[0] : c.id).replace(/^\//, '')
        const statusLower = (c.status || '').toLowerCase()
        const state = statusLower.startsWith('up') ? 'running' : statusLower.startsWith('exited') ? 'exited' : 'other'
        return {
          id: c.id, name, image: c.image, status: c.status, state,
          created: String(c.created ?? ''),
          cpu_percent: c.cpu_percent ?? 0,
          memory_percent: c.memory_percent ?? 0,
        }
      }))
      setNetworks(raw.networks || [])
      setVolumes(raw.volumes || [])
    } catch (e) { console.error(e) }
    finally { setInitialLoading(false) }
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 10000)
    return () => clearInterval(interval)
  }, [])

  const fetchImages = () => {
    api.getDockerImages().then(setImages).catch((e) => console.error(e)).finally(() => setImagesLoading(false))
  }

  useEffect(() => {
    if (activeTab === 'images') fetchImages()
  }, [activeTab])

  // Остановить стриминг логов при закрытии drawer'а или смене контейнера —
  // иначе EventSource и фоновый `docker logs -f` на бэкенде продолжат висеть.
  const stopStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setStreaming(false)
  }

  useEffect(() => {
    return () => stopStream()
  }, [selectedContainer?.id])

  // Пришли сюда кликом по контейнеру на Overview (Infrastructure Topology) —
  // открываем его drawer, как только список контейнеров реально загружен.
  useEffect(() => {
    if (!selectedContainerId || containers.length === 0) return
    const target = containers.find((c) => c.id === selectedContainerId)
    if (target) {
      setActiveTab('containers')
      openContainer(target)
    }
    setSelectedContainerId(null)
  }, [selectedContainerId, containers])

  const openContainer = async (c: DockerContainer) => {
    setSelectedContainer(c)
    setLogs([])
    setLogsLoading(true)
    try {
      const lines = await api.getContainerLogs(c.id)
      setLogs(lines)
    } catch (e) {
      console.error(e)
    } finally {
      setLogsLoading(false)
    }
  }

  const toggleStream = () => {
    if (!selectedContainer) return
    if (streaming) {
      stopStream()
      return
    }
    setStreaming(true)
    const url = `/api/v1/docker/container/${selectedContainer.id}/logs/stream?lines=50&dashboard_token=${encodeURIComponent(DASHBOARD_TOKEN)}`
    const es = new EventSource(url)
    eventSourceRef.current = es
    es.onmessage = (event) => {
      setLogs((prev) => [...prev, event.data])
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    es.onerror = () => {
      toast.error('Log stream disconnected')
      stopStream()
    }
  }

  const handleContainerAction = async (containerId: string, action: 'start' | 'stop' | 'restart') => {
    const containerName = containers.find((c) => c.id === containerId)?.name || containerId.slice(0, 12)
    setActionPending(`${containerId}-${action}`)
    // Docker-операции (особенно stop/restart) реально могут занимать до
    // 10+ секунд — Docker ждёт graceful shutdown, прежде чем слать SIGKILL.
    // Показываем немедленный отклик, чтобы пользователь видел, что сигнал
    // принят, а не гадал, сработал ли клик.
    const toastId = toast.loading(
      action === 'start' ? 'Starting container...' : action === 'stop' ? 'Stopping container (up to 10s)...' : 'Restarting container (up to 10s)...'
    )
    try {
      if (action === 'start') await api.startContainer(containerId)
      if (action === 'stop') await api.stopContainer(containerId)
      if (action === 'restart') await api.restartContainer(containerId)
      toast.success(`Container ${action}ed`, { id: toastId })
      const actionPast = action === 'start' ? 'started' : action === 'stop' ? 'stopped' : 'restarted'
      addEvent(`Container ${containerName} ${actionPast}`)
      addAlert({ type: 'info', title: `Container ${actionPast}`, message: `${containerName} was ${actionPast} successfully`, source: containerName })
      await fetchAll()
      // Если действие выполнено из drawer'а — обновим и его состояние
      setSelectedContainer((prev) => {
        if (!prev || prev.id !== containerId) return prev
        const updated = containers.find((c) => c.id === containerId)
        return updated ? { ...updated } : prev
      })
    } catch (e: any) {
      const detail = e?.response?.data?.detail || `Failed to ${action} container`
      toast.error(detail, { id: toastId })
      addEvent(`Failed to ${action} container ${containerName}`)
      addAlert({ type: 'warning', title: `Container ${action} failed`, message: detail, source: containerName })
    } finally {
      setActionPending(null)
    }
  }

  const handleDeleteContainer = async (containerId: string) => {
    const containerName = containers.find((c) => c.id === containerId)?.name || containerId.slice(0, 12)
    if (!confirm(`Delete container "${containerName}"? This cannot be undone.`)) return
    try {
      await api.deleteContainer(containerId, true)
      toast.success('Container deleted')
      addEvent(`Container ${containerName} deleted`)
      addAlert({ type: 'info', title: 'Container deleted', message: `${containerName} was removed`, source: containerName })
      if (selectedContainer?.id === containerId) setSelectedContainer(null)
      fetchAll()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'Failed to delete container'
      toast.error(detail)
      addEvent(`Failed to delete container ${containerName}`)
    }
  }

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm('Delete this image?')) return
    try {
      await api.deleteImage(imageId)
      toast.success('Image deleted')
      addEvent(`Image ${imageId.slice(0, 12)} deleted`)
      fetchImages()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'Failed to delete image (image may be in use)'
      toast.error(detail)
      addEvent(`Failed to delete image ${imageId.slice(0, 12)}`)
    }
  }

  const handleDeleteNetwork = async (networkId: string) => {
    if (!confirm('Delete this network?')) return
    try {
      await api.deleteNetwork(networkId)
      toast.success('Network deleted')
      addEvent(`Network ${networkId.slice(0, 12)} deleted`)
      fetchAll()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'Failed to delete network'
      toast.error(detail)
      addEvent(`Failed to delete network ${networkId.slice(0, 12)}`)
    }
  }

  const handleDeleteVolume = async (volumeName: string) => {
    if (!confirm('Delete this volume?')) return
    try {
      await api.deleteVolume(volumeName)
      toast.success('Volume deleted')
      addEvent(`Volume ${volumeName} deleted`)
      fetchAll()
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'Failed to delete volume (volume may be in use)'
      toast.error(detail)
      addEvent(`Failed to delete volume ${volumeName}`)
    }
  }

  const columns: Column<DockerContainer>[] = [
    { key: 'name', header: 'Name', render: (c) => <span style={{ fontWeight: 500 }}>{c.name}</span> },
    { key: 'status', header: 'Status', render: (c) => (
      <AhovaBadge variant={c.state === 'running' ? 'healthy' : c.state === 'exited' ? 'critical' : 'warning'}>
        {c.state}
      </AhovaBadge>
    )},
    { key: 'cpu_percent', header: 'CPU', align: 'right', render: (c) => `${(c.cpu_percent ?? 0).toFixed(1)}%` },
    { key: 'memory_percent', header: 'Memory', align: 'right', render: (c) => `${(c.memory_percent ?? 0).toFixed(1)}%` },
    { key: 'image', header: 'Image' },
    { key: 'id', header: 'Actions', render: (c) => (
      <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
        {c.state === 'running' ? (
          <button title="Stop" disabled={actionPending === `${c.id}-stop`} onClick={() => handleContainerAction(c.id, 'stop')} style={pendingBtnStyle(actionPending === `${c.id}-stop`)}>
            <Square size={13} />
          </button>
        ) : (
          <button title="Start" disabled={actionPending === `${c.id}-start`} onClick={() => handleContainerAction(c.id, 'start')} style={pendingBtnStyle(actionPending === `${c.id}-start`)}>
            <Play size={13} />
          </button>
        )}
        <button title="Restart" disabled={actionPending === `${c.id}-restart`} onClick={() => handleContainerAction(c.id, 'restart')} style={pendingBtnStyle(actionPending === `${c.id}-restart`)}>
          <RotateCw size={13} className={actionPending === `${c.id}-restart` ? 'animate-spin' : ''} />
        </button>
        <button title="Logs" onClick={() => openContainer(c)} style={actionBtnStyle}>
          <FileText size={13} />
        </button>
        {c.state !== 'running' && (
          <button title="Delete container" onClick={() => handleDeleteContainer(c.id)} style={{ ...actionBtnStyle, color: theme.colors.status.critical }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    )},
  ]

  const imageColumns: Column<DockerImage>[] = [
    { key: 'repo_tags', header: 'Image', render: (img) => <span style={{ fontWeight: 500 }}>{img.repo_tags?.[0] || img.id.slice(0, 12)}</span> },
    { key: 'id', header: 'ID', render: (img) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{img.id.slice(0, 12)}</span> },
    { key: 'size', header: 'Size', align: 'right', render: (img) => formatBytes(img.size) },
    { key: 'actions', header: 'Actions', render: (img) => (
      <button title="Delete image" onClick={() => handleDeleteImage(img.id)} style={{ ...actionBtnStyle, color: theme.colors.status.critical }}>
        <Trash2 size={13} />
      </button>
    )},
  ]

  return (
    <div className="animate-fadeIn">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing[6],
          padding: theme.spacing[6],
          background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))',
          border: `1px solid ${theme.colors.border.default}`,
          borderRadius: theme.radius.lg,
          marginBottom: theme.spacing[6],
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[3] }}>
          <Container size={24} style={{ color: theme.colors.brand.blue }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Docker Engine</div>
            <AhovaBadge variant={dockerAvailable ? 'healthy' : 'critical'} size="sm">
              {dockerAvailable ? 'Running' : 'Unavailable'}
            </AhovaBadge>
          </div>
        </div>
        <div style={{ display: 'flex', gap: theme.spacing[6], marginLeft: 'auto' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{dockerInfo?.containers_running ?? containers.filter(c => c.state === 'running').length}</div>
            <div style={{ fontSize: 11, color: theme.colors.text.muted }}>Running</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{dockerInfo?.containers ?? containers.length}</div>
            <div style={{ fontSize: 11, color: theme.colors.text.muted }}>Containers</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{dockerInfo?.images ?? images.length}</div>
            <div style={{ fontSize: 11, color: theme.colors.text.muted }}>Images</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{dockerInfo?.volumes ?? volumes.length}</div>
            <div style={{ fontSize: 11, color: theme.colors.text.muted }}>Volumes</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[4], marginBottom: theme.spacing[4], flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: theme.spacing[1] }}>
          {(['containers', 'images', 'networks', 'volumes'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: `${theme.spacing[2]} ${theme.spacing[4]}`,
                background: activeTab === tab ? 'rgba(139,92,246,0.15)' : 'transparent',
                border: 'none',
                borderRadius: theme.radius.sm,
                color: activeTab === tab ? theme.colors.text.primary : theme.colors.text.muted,
                fontSize: 13,
                fontWeight: activeTab === tab ? 500 : 400,
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: theme.transition.fast,
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], height: 34, padding: `0 ${theme.spacing[3]}`, background: theme.colors.bg.card, border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm, minWidth: 220 }}>
          <Search size={13} style={{ color: theme.colors.text.muted, flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: theme.colors.text.primary, fontSize: 13 }}
          />
        </div>
      </div>

      {(activeTab === 'images' ? imagesLoading : initialLoading) ? (
        <AhovaCard>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                height: 44,
                borderRadius: theme.radius.sm,
                background: 'linear-gradient(90deg, var(--ahova-fg-a03) 25%, var(--ahova-fg-a06) 37%, var(--ahova-fg-a03) 63%)',
                backgroundSize: '400% 100%',
                animation: 'shimmer 1.4s ease infinite',
              }} />
            ))}
          </div>
        </AhovaCard>
      ) : (
      <>
      {activeTab === 'containers' && (
        <AhovaCard>
          <AhovaTable
            columns={columns}
            data={filteredContainers}
            onRowClick={(c) => openContainer(c)}
            emptyMessage={dockerAvailable ? (searchLower ? 'No containers match your search' : 'No containers found') : 'Docker is not available'}
            emptyIcon={<Container size={32} />}
          />
        </AhovaCard>
      )}

      {activeTab === 'images' && (
        <AhovaCard title="Docker Images">
          <AhovaTable
            columns={imageColumns}
            data={filteredImages}
            emptyMessage={searchLower ? 'No images match your search' : 'No images found'}
            emptyIcon={<ImageIcon size={32} />}
          />
        </AhovaCard>
      )}

      {activeTab === 'networks' && (
        <AhovaCard title="Networks">
          {filteredNetworks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: theme.spacing[8], color: theme.colors.text.muted }}>
              <NetworkIcon size={32} style={{ opacity: 0.3, marginBottom: theme.spacing[3] }} />
              <p style={{ fontSize: 14 }}>{searchLower ? 'No networks match your search' : 'No networks found'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
              {filteredNetworks.map((n) => {
                const isPredefined = ['bridge', 'host', 'none'].includes(n.name)
                return (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing[3], borderBottom: `1px solid ${theme.colors.border.default}` }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{n.name}</span>
                    <span style={{ fontSize: 12, color: theme.colors.text.muted, marginLeft: theme.spacing[3] }}>{n.driver}</span>
                  </div>
                  <button
                    title={isPredefined ? 'Built-in Docker network — cannot be removed' : 'Delete network'}
                    disabled={isPredefined}
                    onClick={() => handleDeleteNetwork(n.id)}
                    style={{ ...actionBtnStyle, color: isPredefined ? theme.colors.text.muted : theme.colors.status.critical, opacity: isPredefined ? 0.4 : 1, cursor: isPredefined ? 'not-allowed' : 'pointer' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )})}
            </div>
          )}
        </AhovaCard>
      )}

      {activeTab === 'volumes' && (
        <AhovaCard title="Volumes">
          {filteredVolumes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: theme.spacing[8], color: theme.colors.text.muted }}>
              <Database size={32} style={{ opacity: 0.3, marginBottom: theme.spacing[3] }} />
              <p style={{ fontSize: 14 }}>{searchLower ? 'No volumes match your search' : 'No volumes found'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
              {filteredVolumes.map((v) => (
                <div key={v.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: theme.spacing[3], borderBottom: `1px solid ${theme.colors.border.default}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{v.name}</div>
                    <div style={{ fontSize: 12, color: theme.colors.text.muted, wordBreak: 'break-all' }}>{v.mountpoint} · {v.driver}</div>
                  </div>
                  <button title="Delete volume" onClick={() => handleDeleteVolume(v.name)} style={{ ...actionBtnStyle, color: theme.colors.status.critical, flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </AhovaCard>
      )}
      </>
      )}

      <AhovaDrawer
        open={!!selectedContainer}
        onClose={() => { stopStream(); setSelectedContainer(null) }}
        title={selectedContainer?.name || 'Container Details'}
      >
        {selectedContainer && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing[4], marginBottom: theme.spacing[4] }}>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Status</div>
                <AhovaBadge variant={selectedContainer.state === 'running' ? 'healthy' : 'critical'}>
                  {selectedContainer.state}
                </AhovaBadge>
              </div>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Image</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{selectedContainer.image}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>CPU</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{(selectedContainer.cpu_percent ?? 0).toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Memory</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{(selectedContainer.memory_percent ?? 0).toFixed(1)}%</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: theme.spacing[2], marginBottom: theme.spacing[4] }}>
              {selectedContainer.state === 'running' ? (
                <DrawerActionButton onClick={() => handleContainerAction(selectedContainer.id, 'stop')} icon={<Square size={14} />} label="Stop" />
              ) : (
                <DrawerActionButton onClick={() => handleContainerAction(selectedContainer.id, 'start')} icon={<Play size={14} />} label="Start" />
              )}
              <DrawerActionButton onClick={() => handleContainerAction(selectedContainer.id, 'restart')} icon={<RotateCw size={14} />} label="Restart" />
              {selectedContainer.state !== 'running' && (
                <DrawerActionButton onClick={() => handleDeleteContainer(selectedContainer.id)} icon={<Trash2 size={14} />} label="Delete" danger />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing[2] }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text.secondary }}>Logs</div>
              <button
                onClick={toggleStream}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px',
                  background: streaming ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                  border: 'none', borderRadius: theme.radius.sm,
                  color: streaming ? theme.colors.status.critical : theme.colors.status.healthy,
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                <Radio size={12} />
                {streaming ? 'Stop live' : 'Live tail'}
              </button>
            </div>
            <div style={{
              background: '#000', borderRadius: theme.radius.sm, padding: theme.spacing[3],
              height: 320, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11.5,
              color: '#c9d1d9', lineHeight: 1.5,
            }}>
              {logsLoading ? (
                <div style={{ color: theme.colors.text.muted }}>Loading logs...</div>
              ) : logs.length === 0 ? (
                <div style={{ color: theme.colors.text.muted }}>No logs available</div>
              ) : (
                logs.map((line, i) => <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</div>)
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </AhovaDrawer>
    </div>
  )
}

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

function pendingBtnStyle(pending: boolean): React.CSSProperties {
  return {
    ...actionBtnStyle,
    opacity: pending ? 0.5 : 1,
    cursor: pending ? 'wait' : 'pointer',
    borderColor: pending ? theme.colors.brand.blue : theme.colors.border.default,
  }
}

const DrawerActionButton: React.FC<{ onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }> = ({ onClick, icon, label, danger }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 14px',
      background: danger ? 'rgba(239,68,68,0.15)' : theme.colors.brand.gradient,
      border: 'none', borderRadius: theme.radius.md,
      color: danger ? theme.colors.status.critical : '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    }}
  >
    {icon}{label}
  </button>
)
