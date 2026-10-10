import React, { useState, useEffect, useMemo } from 'react'
import { Cpu, MemoryStick, Network } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } from 'recharts'
import { theme } from '../../theme/tokens'
import { AhovaCard } from '../../components/ui/AhovaCard'
import { useAppStore } from '../../store/appStore'
import { api } from '../../services/api'

// Disk I/O убран из Metrics Explorer по запросу — агент не собирает
// показатели диска как временной ряд (только моментальный used_percent),
// осмысленного графика для него здесь нет.
const METRIC_TYPES: Record<string, string> = {
  cpu: 'cpu.usage',
  memory: 'memory.used_percent',
  network: 'network.bytes_recv',
}

// timeframe теперь реально передаётся на бэкенд (в секундах) — раньше
// кнопки диапазона влияли только на количество точек (limit), а не на
// реальное временное окно, поэтому "15m" показывал совсем не 15 минут.
const RANGE_TO_TIMEFRAME: Record<string, number> = {
  '15m': 15 * 60,
  '1h': 60 * 60,
  '6h': 6 * 60 * 60,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
}

function formatTimeLabel(isoString: string, range: string): string {
  const d = new Date(isoString)
  if (range === '24h' || range === '7d') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' })
  }
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: range === '15m' ? '2-digit' : undefined })
}

export const MetricsPage: React.FC = () => {
  const { agents, selectedMetricType, setSelectedMetricType } = useAppStore()
  const [selectedMetric, setSelectedMetric] = useState(() => selectedMetricType || 'cpu')

  useEffect(() => {
    if (selectedMetricType) {
      setSelectedMetric(selectedMetricType)
      setSelectedMetricType(null)
    }
  }, [selectedMetricType, setSelectedMetricType])
  const [timeRange, setTimeRange] = useState('1h')
  const [selectedHost, setSelectedHost] = useState<string>('all')
  const [dataPoints, setDataPoints] = useState<Array<{ time: string; value: number }>>([])
  const [loading, setLoading] = useState(true)

  const isPercentMetric = selectedMetric === 'cpu' || selectedMetric === 'memory'
  const unitLabel = isPercentMetric ? '%' : 'bytes (cumulative)'

  const formatAxisTick = (v: number): string => {
    if (isPercentMetric) return `${v.toFixed(0)}%`
    const abs = Math.abs(v)
    if (abs >= 1024 * 1024 * 1024) return `${(v / (1024 * 1024 * 1024)).toFixed(1)}GB`
    if (abs >= 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)}MB`
    if (abs >= 1024) return `${(v / 1024).toFixed(1)}KB`
    return `${v.toFixed(0)}B`
  }

  const metrics = [
    { id: 'cpu', label: 'CPU Usage', icon: <Cpu size={16} />, color: theme.colors.brand.blue },
    { id: 'memory', label: 'Memory', icon: <MemoryStick size={16} />, color: theme.colors.status.info },
    { id: 'network', label: 'Network', icon: <Network size={16} />, color: theme.colors.brand.purple },
  ]
  const activeColor = metrics.find(m => m.id === selectedMetric)?.color || theme.colors.brand.blue

  const agentIds = Object.keys(agents)
  const targetAgentId = selectedHost !== 'all' ? selectedHost : agentIds[0]

  useEffect(() => {
    if (!targetAgentId) {
      setDataPoints([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const timeframe = RANGE_TO_TIMEFRAME[timeRange]
    api.getAgentHistory(targetAgentId, METRIC_TYPES[selectedMetric], 300, timeframe)
      .then((points) => {
        if (cancelled) return
        setDataPoints(points.map((p) => ({ time: formatTimeLabel(p.time, timeRange), value: p.value })))
      })
      .catch((e) => console.error('Failed to load metric history:', e))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedMetric, timeRange, targetAgentId])

  const stats = useMemo(() => {
    if (dataPoints.length === 0) return null
    const values = dataPoints.map(d => d.value)
    const max = Math.max(...values)
    const min = Math.min(...values)
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    return { max, min, avg, current: values[values.length - 1] }
  }, [dataPoints])

  const formatStat = (v: number) => isPercentMetric ? `${v.toFixed(1)}%` : v >= 1024 * 1024 ? `${(v / (1024 * 1024)).toFixed(1)} MB` : `${v.toFixed(0)} B`

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[4], marginBottom: theme.spacing[6], flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: theme.spacing[1], background: theme.colors.bg.card, padding: theme.spacing[1], borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.border.default}` }}>
          {metrics.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMetric(m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                background: selectedMetric === m.id ? m.color + '20' : 'transparent',
                border: 'none', borderRadius: theme.radius.sm,
                color: selectedMetric === m.id ? m.color : theme.colors.text.muted,
                fontSize: 12, fontWeight: selectedMetric === m.id ? 500 : 400,
                cursor: 'pointer', transition: theme.transition.fast,
              }}
            >
              {m.icon}{m.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: theme.spacing[1], background: theme.colors.bg.card, padding: theme.spacing[1], borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.border.default}` }}>
          {Object.keys(RANGE_TO_TIMEFRAME).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              style={{
                padding: `${theme.spacing[1]} ${theme.spacing[2]}`,
                background: timeRange === range ? 'var(--ahova-fg-a10)' : 'transparent',
                border: 'none', borderRadius: theme.radius.sm,
                color: timeRange === range ? theme.colors.text.primary : theme.colors.text.muted,
                fontSize: 11, cursor: 'pointer', transition: theme.transition.fast,
              }}
            >
              {range}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing[2], height: 32, padding: `0 ${theme.spacing[3]}`, background: theme.colors.bg.card, border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm }}>
          <span style={{ fontSize: 11, color: theme.colors.text.muted }}>Host:</span>
          <select
            value={selectedHost}
            onChange={(e) => setSelectedHost(e.target.value)}
            style={{ background: 'none', border: 'none', color: theme.colors.text.primary, fontSize: 12, outline: 'none', fontFamily: 'Inter, sans-serif' }}
          >
            <option value="all">{agentIds[0] ? (agents[agentIds[0]].system?.hostname || agentIds[0]) : 'No agents'}</option>
            {agentIds.map((id) => (
              <option key={id} value={id}>{agents[id].system?.hostname || id}</option>
            ))}
          </select>
        </div>
      </div>

      <AhovaCard variant="chart" style={{ marginBottom: theme.spacing[6] }}>
        <div style={{ height: 380 }}>
          {!targetAgentId ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.text.muted, fontSize: 13 }}>
              No agents connected — metrics will appear once an agent reports data.
            </div>
          ) : loading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.text.muted, fontSize: 13 }}>
              Loading...
            </div>
          ) : dataPoints.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.text.muted, fontSize: 13, textAlign: 'center', padding: theme.spacing[6] }}>
              No data points in this range yet.{selectedMetric === 'network' && ' Убедись, что агент пересобран с последним фиксом (bytes_sent/bytes_recv теперь считаются по интерфейсам).'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dataPoints} margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
                <defs>
                  <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={activeColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={activeColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--ahova-fg-a04)" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: theme.colors.text.muted }} axisLine={false} tickLine={false} interval="preserveStartEnd">
                  <Label value={timeRange === '24h' || timeRange === '7d' ? 'Date / time' : 'Time'} position="insideBottom" offset={-10} style={{ fontSize: 11, fill: theme.colors.text.muted }} />
                </XAxis>
                <YAxis tick={{ fontSize: 10, fill: theme.colors.text.muted }} axisLine={false} tickLine={false} width={60} tickFormatter={formatAxisTick}>
                  <Label value={unitLabel} angle={-90} position="insideLeft" offset={-5} style={{ fontSize: 11, fill: theme.colors.text.muted, textAnchor: 'middle' }} />
                </YAxis>
                <Tooltip
                  contentStyle={{ background: theme.colors.bg.card, border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm, fontSize: 12 }}
                  labelStyle={{ color: theme.colors.text.secondary }}
                  formatter={(value: number) => [formatStat(value), metrics.find(m => m.id === selectedMetric)?.label]}
                />
                <Area type="monotone" dataKey="value" stroke={activeColor} strokeWidth={1.75} fill="url(#metricGradient)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </AhovaCard>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: theme.spacing[4] }}>
        {[
          { label: 'Average', value: stats ? formatStat(stats.avg) : '—', color: theme.colors.brand.blue },
          { label: 'Peak', value: stats ? formatStat(stats.max) : '—', color: theme.colors.status.critical },
          { label: 'Current', value: stats ? formatStat(stats.current) : '—', color: theme.colors.status.info },
          { label: 'Min', value: stats ? formatStat(stats.min) : '—', color: theme.colors.status.healthy },
        ].map((stat) => (
          <AhovaCard key={stat.label}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: theme.spacing[1] }}>{stat.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            </div>
          </AhovaCard>
        ))}
      </div>
    </div>
  )
}
