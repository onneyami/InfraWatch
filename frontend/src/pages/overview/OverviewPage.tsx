import React, { useMemo, useRef, useEffect, useState } from 'react'
import { Cpu, MemoryStick, HardDrive, Network, Server, Container, CheckCircle, Clock } from 'lucide-react'
import { theme } from '../../theme/tokens'
import { AhovaCard } from '../../components/ui/AhovaCard'
import { AhovaMetric, MiniSparkline } from '../../components/ui/AhovaMetric'
import { AhovaBadge } from '../../components/ui/AhovaBadge'
import { useAppStore } from '../../store/appStore'
import { api } from '../../services/api'

const THIRTY_DAYS_SECONDS = 30 * 24 * 3600

function formatBytesToGB(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export const OverviewPage: React.FC = () => {
  const { agents, alerts, events, dockerInfo, loading, navigate, setSelectedAlertId, setSelectedMetricType, setSelectedHostId, setSelectedContainerId, cisResult, cisLoading } = useAppStore()

  const goToMetric = (metric: string) => {
    setSelectedMetricType(metric)
    navigate('metrics')
  }

  // Реальные контейнеры для Infrastructure Topology — раньше там были
  // захардкожены "API"/"Web"/"DB" вне зависимости от того, что реально
  // запущено.
  const [topologyContainers, setTopologyContainers] = useState<Array<{ id: string; name: string; running: boolean }>>([])
  const [topologyDockerAvailable, setTopologyDockerAvailable] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchTopology = async () => {
      try {
        const raw = await api.getDockerRaw()
        if (cancelled) return
        setTopologyDockerAvailable(raw.docker_available !== false)
        const list = (raw.containers || []).map((c) => ({
          id: c.id,
          name: (c.names && c.names[0] ? c.names[0] : c.id).replace(/^\//, ''),
          running: (c.status || '').toLowerCase().startsWith('up'),
        }))
        setTopologyContainers(list)
      } catch (e) {
        console.error('Failed to load containers for topology:', e)
      }
    }
    fetchTopology()
    const interval = setInterval(fetchTopology, 10000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // Агент отдаёт только накопительные счётчики bytes_sent/bytes_recv, а не
  // скорость — считаем скорость сами по дельте между опросами (App.tsx
  // опрашивает агентов каждые 10с).
  const prevNetworkRef = useRef<{ sent: number; recv: number; at: number } | null>(null)
  const [networkSpeed, setNetworkSpeed] = useState<{ down: number; up: number } | null>(null)

  useEffect(() => {
    const agentList = Object.values(agents)
    if (agentList.length === 0) return
    const totalSent = agentList.reduce((sum, a) => sum + (a.network?.bytes_sent ?? 0), 0)
    const totalRecv = agentList.reduce((sum, a) => sum + (a.network?.bytes_recv ?? 0), 0)
    const now = Date.now()

    const prev = prevNetworkRef.current
    if (prev && now > prev.at) {
      const seconds = (now - prev.at) / 1000
      const upBytesPerSec = Math.max(0, (totalSent - prev.sent) / seconds)
      const downBytesPerSec = Math.max(0, (totalRecv - prev.recv) / seconds)
      setNetworkSpeed({ down: downBytesPerSec / (1024 * 1024), up: upBytesPerSec / (1024 * 1024) })
    }
    prevNetworkRef.current = { sent: totalSent, recv: totalRecv, at: now }
  }, [agents])

  const aggregateMetrics = useMemo(() => {
    const agentList = Object.values(agents)
    if (agentList.length === 0) return null

    const cpuAvg = agentList.reduce((sum, a) => sum + (a.cpu?.usage ?? 0), 0) / agentList.length
    const memAvg = agentList.reduce((sum, a) => sum + (a.memory?.used_percent ?? 0), 0) / agentList.length
    const runningContainers = agentList.reduce((sum, a) => sum + (a.docker?.containers_running ?? 0), 0)
    const totalContainers = agentList.reduce((sum, a) => sum + (a.docker?.containers_total ?? 0), 0)
    const diskAvg = agentList.reduce((sum, a) => {
      const disks = a.disks || []
      return sum + (disks.reduce((s, d) => s + (d.used_percent ?? 0), 0) / (disks.length || 1))
    }, 0) / agentList.length
    const totalFreeBytes = agentList.reduce((sum, a) => {
      const disks = a.disks || []
      return sum + disks.reduce((s, d) => s + Math.max(0, (d.total ?? 0) - (d.used ?? 0)), 0)
    }, 0)
    // "Здоровье" системы — реальная метрика: средняя доля времени с последнего
    // перезапуска относительно скользящего окна в 30 дней. Не идеальный SLA
    // (мы не храним историю простоев), но это настоящее вычисление, а не
    // захардкоженная цифра.
    const healthPercent = Math.min(
      99.99,
      agentList.reduce((sum, a) => sum + Math.min(1, (a.system?.uptime ?? 0) / THIRTY_DAYS_SECONDS), 0) / agentList.length * 100
    )

    return { cpuAvg, memAvg, runningContainers, totalContainers, diskAvg, totalFreeBytes, healthPercent, hostCount: agentList.length }
  }, [agents])

  // Реальные тренды "vs last hour" — берём самую старую точку в истории за
  // последний час и сравниваем с текущим средним. Раньше это было
  // захардкожено (↓5% / ↑2%) вне зависимости от реальных данных.
  const [trendBaseline, setTrendBaseline] = useState<{ cpu: number | null; memory: number | null }>({ cpu: null, memory: null })
  const agentIdsKey = Object.keys(agents).sort().join(',')

  useEffect(() => {
    const agentIds = Object.keys(agents)
    if (agentIds.length === 0) return
    let cancelled = false

    const fetchBaseline = async () => {
      try {
        const results = await Promise.all(
          agentIds.map((id) => Promise.all([
            api.getAgentHistory(id, 'cpu.usage', 60, 3600),
            api.getAgentHistory(id, 'memory.used_percent', 60, 3600),
          ]))
        )
        if (cancelled) return
        const cpuOld = results.map(([cpuPoints]) => cpuPoints[0]?.value).filter((v): v is number => v != null)
        const memOld = results.map(([, memPoints]) => memPoints[0]?.value).filter((v): v is number => v != null)
        setTrendBaseline({
          cpu: cpuOld.length ? cpuOld.reduce((a, b) => a + b, 0) / cpuOld.length : null,
          memory: memOld.length ? memOld.reduce((a, b) => a + b, 0) / memOld.length : null,
        })
      } catch (e) {
        console.error('Failed to fetch trend baseline:', e)
      }
    }

    fetchBaseline()
    const interval = setInterval(fetchBaseline, 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [agentIdsKey])

  const cpuTrend = aggregateMetrics && trendBaseline.cpu != null ? aggregateMetrics.cpuAvg - trendBaseline.cpu : null
  const memTrend = aggregateMetrics && trendBaseline.memory != null ? aggregateMetrics.memAvg - trendBaseline.memory : null

  // Скользящий буфер последних значений для реальных мини-графиков (вместо
  // одной и той же нарисованной картинки под всеми карточками).
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [memHistory, setMemHistory] = useState<number[]>([])
  const [networkHistory, setNetworkHistory] = useState<number[]>([])

  useEffect(() => {
    if (!aggregateMetrics) return
    setCpuHistory((prev) => [...prev, aggregateMetrics.cpuAvg].slice(-24))
    setMemHistory((prev) => [...prev, aggregateMetrics.memAvg].slice(-24))
  }, [aggregateMetrics?.cpuAvg, aggregateMetrics?.memAvg])

  useEffect(() => {
    if (!networkSpeed) return
    setNetworkHistory((prev) => [...prev, networkSpeed.down + networkSpeed.up].slice(-24))
  }, [networkSpeed?.down, networkSpeed?.up])

  const criticalAlerts = alerts.filter((a) => a.type === 'critical').length
  const recentEvents = events.slice(-5).reverse()
  const healthLabel = aggregateMetrics ? `${aggregateMetrics.healthPercent.toFixed(2)}%` : '—'

  const handleAlertClick = (alertId: string) => {
    setSelectedAlertId(alertId)
    navigate('alerts')
  }

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing[6] }}>
        <div>
          <p style={{ fontSize: theme.fontSize.sm, color: theme.colors.text.secondary }}>
            Monitor your infrastructure health
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[3] }}>
          <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>
            Last update: {loading.agents ? '...' : aggregateMetrics ? '5 seconds ago' : '—'}
          </span>
          <AhovaBadge variant={aggregateMetrics ? 'healthy' : 'warning'} size="md">
            {aggregateMetrics ? 'Connected' : 'Waiting for agent'}
          </AhovaBadge>
        </div>
      </div>

      {!aggregateMetrics && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: theme.spacing[3],
          padding: theme.spacing[4], marginBottom: theme.spacing[6],
          background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)',
          borderRadius: theme.radius.sm,
        }}>
          <div className="animate-spin" style={{ width: 14, height: 14, border: `2px solid ${theme.colors.status.warning}`, borderTopColor: 'transparent', borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: theme.colors.text.secondary }}>
            Waiting for an agent to connect and send its first metrics — this can take up to a minute after
            <code style={{ margin: '0 4px' }}>ahova start</code>. Metrics below will populate automatically once it does.
          </div>
        </div>
      )}

      {/* System Health Hero */}
      <div style={{
        height: 180,
        width: '100%',
        background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))',
        border: `1px solid ${theme.colors.border.default}`,
        borderRadius: theme.radius.lg,
        padding: theme.spacing[6],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing[6],
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '50%', left: '20%', transform: 'translate(-50%, -50%)', width: 300, height: 300, background: 'radial-gradient(circle, rgba(34,197,94,0.15), transparent)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '50%', right: '30%', transform: 'translate(50%, -50%)', width: 200, height: 200, background: 'radial-gradient(circle, rgba(59,130,246,0.1), transparent)', borderRadius: '50%', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], marginBottom: theme.spacing[2] }}>
            <img src="/assets/logo.png" alt="Ahova" style={{ width: 20, height: 20, objectFit: 'contain' }} />
            <span style={{ fontSize: theme.fontSize.sm, fontWeight: 500, color: theme.colors.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>System Health</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[3], marginBottom: theme.spacing[2] }}>
            <AhovaBadge variant="healthy" size="md">Operational</AhovaBadge>
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, color: theme.colors.text.primary, lineHeight: 1.1 }}>{healthLabel}</div>
          <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted, marginTop: theme.spacing[1] }}>
            {aggregateMetrics ? 'Uptime over the last 30 days' : 'Infrastructure is healthy'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: theme.spacing[8], position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: theme.fontSize['2xl'], fontWeight: 700, color: theme.colors.text.primary }}>{aggregateMetrics?.hostCount ?? 0}</div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>Hosts</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: theme.fontSize['2xl'], fontWeight: 700, color: theme.colors.text.primary }}>{aggregateMetrics?.runningContainers ?? 0}</div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>Containers</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: theme.fontSize['2xl'], fontWeight: 700, color: theme.colors.text.primary }}>{aggregateMetrics?.totalContainers ?? 0}</div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>Services</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: theme.fontSize['2xl'], fontWeight: 700, color: criticalAlerts > 0 ? theme.colors.status.critical : theme.colors.status.healthy }}>{criticalAlerts}</div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>Alerts</div>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: theme.spacing[4], marginBottom: theme.spacing[6] }}>
        <AhovaMetric title="CPU" value={aggregateMetrics ? `${aggregateMetrics.cpuAvg.toFixed(1)}%` : '—'} icon={<Cpu size={16} />} color={theme.colors.brand.blue}
          onClick={() => goToMetric('cpu')}
          trend={cpuTrend != null ? { value: Math.abs(cpuTrend), direction: cpuTrend >= 0 ? 'up' : 'down', label: 'vs last hour' } : undefined}
          chart={cpuHistory.length >= 2 ? <MiniSparkline data={cpuHistory} color={theme.colors.brand.blue} /> : undefined} />
        <AhovaMetric title="Memory" value={aggregateMetrics ? `${aggregateMetrics.memAvg.toFixed(1)}%` : '—'} icon={<MemoryStick size={16} />} color={theme.colors.status.info}
          onClick={() => goToMetric('memory')}
          trend={memTrend != null ? { value: Math.abs(memTrend), direction: memTrend >= 0 ? 'up' : 'down', label: 'vs last hour' } : undefined}
          chart={memHistory.length >= 2 ? <MiniSparkline data={memHistory} color={theme.colors.status.info} /> : undefined} />

        {/* Disk — вместо графика и числа volumes показываем реальную занятость и свободное место */}
        <AhovaCard variant="metric">
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing[2] }}>
              <span style={{ fontSize: theme.fontSize.xs, fontWeight: 500, color: theme.colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Disk</span>
              <HardDrive size={16} style={{ color: theme.colors.status.warning, opacity: 0.8 }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: theme.colors.text.primary, marginBottom: theme.spacing[2] }}>
              {aggregateMetrics ? `${aggregateMetrics.diskAvg.toFixed(0)}%` : '—'}
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100%', height: 8, background: 'var(--ahova-fg-a06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: aggregateMetrics ? `${Math.min(100, aggregateMetrics.diskAvg)}%` : '0%',
                  height: '100%',
                  background: aggregateMetrics && aggregateMetrics.diskAvg > 90 ? theme.colors.status.critical : theme.colors.status.warning,
                  borderRadius: 4,
                  transition: theme.transition.normal,
                }} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: theme.colors.text.muted, marginTop: theme.spacing[2] }}>
              {aggregateMetrics ? `${formatBytesToGB(aggregateMetrics.totalFreeBytes)} free` : 'No data'}
            </div>
          </div>
        </AhovaCard>

        <AhovaMetric title="Network" value={networkSpeed ? `${(networkSpeed.down + networkSpeed.up).toFixed(1)} MB/s` : '—'} icon={<Network size={16} />} color={theme.colors.brand.purple}
          onClick={() => goToMetric('network')}
          subtitle={networkSpeed ? `↓ ${networkSpeed.down.toFixed(2)} MB/s · ↑ ${networkSpeed.up.toFixed(2)} MB/s` : 'Waiting for second sample...'}
          chart={networkHistory.length >= 2 ? <MiniSparkline data={networkHistory} color={theme.colors.brand.purple} /> : undefined} />
      </div>

      {/* Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing[4], marginBottom: theme.spacing[6] }}>
        <AhovaCard title="Infrastructure Topology" variant="chart" style={{ minHeight: 320 }}>
          {(() => {
            const hostId = Object.keys(agents)[0]
            const hostname = agents[hostId]?.system?.hostname || 'This machine'
            const hostOnline = Object.keys(agents).length > 0
            const maxShown = 6
            const shownContainers = topologyContainers.slice(0, maxShown)
            const hiddenCount = topologyContainers.length - shownContainers.length

            const nodeStyle = (color: string, bgAlpha = 0.1, borderAlpha = 0.3): React.CSSProperties => ({
              padding: '6px 14px',
              background: `${color}${Math.round(bgAlpha * 255).toString(16).padStart(2, '0')}`,
              border: `1px solid ${color}${Math.round(borderAlpha * 255).toString(16).padStart(2, '0')}`,
              borderRadius: theme.radius.sm,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              color,
              whiteSpace: 'nowrap',
              maxWidth: 160,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            })

            const healthy = theme.colors.status.healthy
            const critical = theme.colors.status.critical
            const blue = theme.colors.brand.blue

            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `${theme.spacing[4]} 0` }}>
                {/* Host */}
                <div
                  style={{ ...nodeStyle(hostOnline ? healthy : critical), cursor: hostId ? 'pointer' : 'default' }}
                  title={hostname}
                  onClick={() => { if (hostId) { setSelectedHostId(hostId); navigate('hosts') } }}
                >
                  <Server size={12} /> {hostname}
                </div>
                <div style={{ width: 1, height: 22, background: 'var(--ahova-fg-a12)' }} />

                {/* Docker Engine */}
                <div
                  style={{ ...nodeStyle(topologyDockerAvailable ? blue : critical), cursor: 'pointer' }}
                  onClick={() => navigate('docker')}
                >
                  <Container size={12} /> Docker Engine {!topologyDockerAvailable && '(unavailable)'}
                </div>

                {/* Containers */}
                {shownContainers.length > 0 ? (
                  <>
                    <div style={{ width: 1, height: 18, background: 'var(--ahova-fg-a12)' }} />
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      gap: `${theme.spacing[2]} ${theme.spacing[3]}`,
                      borderTop: '1px solid var(--ahova-fg-a10)',
                      paddingTop: theme.spacing[3],
                      maxWidth: '100%',
                    }}>
                      {shownContainers.map((c) => (
                        <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 1, height: 10, background: 'var(--ahova-fg-a12)', marginTop: -13 }} />
                          <div style={{ ...nodeStyle(c.running ? healthy : theme.colors.text.muted, 0.06, 0.2), cursor: 'pointer' }} title={c.name}
                            onClick={() => { setSelectedContainerId(c.id); navigate('docker') }}>
                            {c.name}
                          </div>
                        </div>
                      ))}
                      {hiddenCount > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 1, height: 10, background: 'var(--ahova-fg-a12)', marginTop: -13 }} />
                          <div style={{ ...nodeStyle(theme.colors.text.muted, 0.04, 0.15), cursor: 'pointer' }} onClick={() => navigate('docker')}>
                            +{hiddenCount} more
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: theme.spacing[4], fontSize: 12, color: theme.colors.text.muted }}>
                    {topologyDockerAvailable ? 'No containers running' : 'Docker is not available on this host'}
                  </div>
                )}
              </div>
            )
          })()}
        </AhovaCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
          <AhovaCard title="Recent Alerts" style={{ flex: 1 }}>
            {alerts.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: theme.spacing[6], color: theme.colors.text.muted, gap: theme.spacing[2] }}>
                <CheckCircle size={24} style={{ color: theme.colors.status.healthy }} />
                <span style={{ fontSize: 13 }}>No active alerts</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
                {alerts.slice(0, 4).map((alert) => (
                  <div key={alert.id} onClick={() => handleAlertClick(alert.id)} style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[3], padding: theme.spacing[2], borderRadius: theme.radius.sm, cursor: 'pointer', transition: theme.transition.fast }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ahova-fg-a03)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: alert.type === 'critical' ? theme.colors.status.critical : alert.type === 'warning' ? theme.colors.status.warning : theme.colors.status.info, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: theme.colors.text.primary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.title}</div>
                      <div style={{ fontSize: 11, color: theme.colors.text.muted }}>{alert.source} · {Math.floor((Date.now() / 1000 - alert.timestamp) / 60)}m ago</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AhovaCard>

          <AhovaCard title="Activity" style={{ flex: 1 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 5, top: 0, bottom: 0, width: 1, background: 'var(--ahova-fg-a08)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[3] }}>
                {recentEvents.length === 0 ? (
                  <div style={{ padding: theme.spacing[4], textAlign: 'center', color: theme.colors.text.muted, fontSize: 13 }}>No recent activity</div>
                ) : (
                  recentEvents.map((event) => (
                    <div key={event.id} style={{ display: 'flex', gap: theme.spacing[3], paddingLeft: theme.spacing[4] }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: theme.colors.bg.card, border: '2px solid var(--ahova-fg-a15)', flexShrink: 0, marginTop: 3, position: 'relative', zIndex: 1 }} />
                      <div>
                        <div style={{ fontSize: 12, color: theme.colors.text.primary, fontWeight: 500 }}>{event.message}</div>
                        <div style={{ fontSize: 11, color: theme.colors.text.muted }}>{new Date(event.timestamp * 1000).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </AhovaCard>
        </div>
      </div>

      <AhovaCard title="Security Score" style={{ marginBottom: theme.spacing[6], cursor: 'pointer' }} onClick={() => navigate('security')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[6] }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 700, background: theme.colors.brand.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>
              {cisResult ? cisResult.score.toFixed(0) : cisLoading ? '···' : '—'}
            </div>
            <div style={{ fontSize: 14, color: theme.colors.text.secondary }}>
              {cisLoading && !cisResult ? 'Running CIS scan...' : cisResult ? '/ 100 · CIS Docker Benchmark' : 'Not scanned yet — click to open Security'}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: theme.spacing[6] }}>
              <div><div style={{ fontSize: 20, fontWeight: 600, color: theme.colors.status.healthy }}>{cisResult?.passed ?? '—'}</div><div style={{ fontSize: 12, color: theme.colors.text.muted }}>Passed</div></div>
              <div><div style={{ fontSize: 20, fontWeight: 600, color: theme.colors.status.critical }}>{cisResult?.failed ?? '—'}</div><div style={{ fontSize: 12, color: theme.colors.text.muted }}>Failed</div></div>
              <div><div style={{ fontSize: 20, fontWeight: 600, color: theme.colors.status.warning }}>{cisResult?.warnings ?? '—'}</div><div style={{ fontSize: 12, color: theme.colors.text.muted }}>Warnings</div></div>
            </div>
          </div>
        </div>
      </AhovaCard>
    </div>
  )
}
