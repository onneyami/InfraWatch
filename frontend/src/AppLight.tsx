import React, { useEffect, useState, useRef } from 'react'
import { Server, Shield, Activity, Cpu, MemoryStick, HardDrive, Clock, ChevronDown, ChevronUp, ArrowUpDown, Eye, Square, X, ExternalLink, BarChart3, Battery, Sun, Moon, Settings, Key, CheckCircle, AlertCircle } from 'lucide-react'
import axios from 'axios'
import DockerDashboardLight from './components/DockerDashboardLight'
import ProcessManager from './components/ProcessManager'
import { api } from './services/api'
import { AgentMetrics as AgentMetricsType } from './types/metrics'

const API_BASE = 'http://localhost:8000/api/v1'

// Типы для истории метрик
interface MetricHistory {
  cpu: number
  memory: number
  timestamp: number
}

// Типы для истории Network
interface NetworkHistory {
  upload: number
  download: number
  timestamp: number
}

// Типы для истории Battery
interface BatteryHistory {
  percent: number
  timestamp: number
}

// Типы для процессов
interface ProcessInfo {
  pid: number
  name: string
  cpu_percent: number
  memory_percent: number
  status: string
  username?: string
}

// Типы для истории процесса
interface ProcessHistoryEntry {
  cpu_percent: number
  memory_percent: number
  timestamp: number
  name: string
}

// ========== AGENT METRICS LIGHT - С детальной информацией ==========
const AgentMetricsLight: React.FC<{ agentId: string; initialMetrics?: AgentMetricsType }> = ({ agentId, initialMetrics }) => {
  const [metrics, setMetrics] = useState<AgentMetricsType | null>(initialMetrics || null)
  const [history, setHistory] = useState<AgentMetricsType[]>([])
  const [loading, setLoading] = useState(!initialMetrics)
  const [expanded, setExpanded] = useState(false)
  const [processSortKey, setProcessSortKey] = useState<'cpu' | 'memory' | 'name'>('cpu')
  const [processSortDir, setProcessSortDir] = useState<'asc' | 'desc'>('desc')
  const [showAllProcesses, setShowAllProcesses] = useState(false)
  const [stoppingProcess, setStoppingProcess] = useState<number | null>(null)
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null)
  const [processHistory, setProcessHistory] = useState<ProcessHistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!initialMetrics) {
      fetchMetrics()
    }
    fetchHistory()

    intervalRef.current = setInterval(() => {
      fetchMetrics()
      fetchHistory()
    }, 5000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [agentId])

  const fetchMetrics = async () => {
    try {
      const all = await api.getAgentMetrics()
      if (all[agentId]) setMetrics(all[agentId])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const fetchHistory = async () => {
    const data = await api.getAgentHistory(agentId, 20)
    setHistory(data)
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  const formatTime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const formatDate = (ts: number) => new Date(ts * 1000).toLocaleTimeString()

  const handleStopProcess = async (pid: number, name: string) => {
    if (!confirm(`Stop process "${name}" (PID: ${pid})?`)) return
    setStoppingProcess(pid)
    try {
      const res = await axios.post(`${API_BASE}/process/${pid}/stop`, { force: false })
      alert(res.data.status === 'success' ? 'Process stopped' : res.data.message)
      fetchMetrics()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setStoppingProcess(null)
    }
  }

  const fetchProcessHistory = async (pid: number) => {
    setLoadingHistory(true)
    try {
      const res = await axios.get(`${API_BASE}/process/${pid}/history?limit=30`)
      if (res.data.history) {
        setProcessHistory(res.data.history)
      }
    } catch (e) {
      console.error('Error fetching process history:', e)
      setProcessHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  // Загружаем историю процесса при его выборе
  useEffect(() => {
    if (selectedProcess) {
      fetchProcessHistory(selectedProcess.pid)
    } else {
      setProcessHistory([])
    }
  }, [selectedProcess?.pid])

  const sortedProcesses = React.useMemo(() => {
    if (!metrics?.processes) return []
    const sorted = [...metrics.processes].sort((a, b) => {
      if (processSortKey === 'name') return a.name.localeCompare(b.name)
      if (processSortKey === 'cpu') return b.cpu_percent - a.cpu_percent
      return b.memory_percent - a.memory_percent
    })
    return processSortDir === 'asc' ? sorted.reverse() : sorted
  }, [metrics?.processes, processSortKey, processSortDir])

  const displayedProcesses = showAllProcesses ? sortedProcesses : sortedProcesses.slice(0, 5)

  if (loading) {
    return <div className="agent-card"><div className="skeleton" style={{height: 100}} /></div>
  }

  if (!metrics) {
    return <div className="agent-card"><p className="text-muted">No data</p></div>
  }

  return (
    <div className="agent-card">
      {/* Header - всегда виден */}
      <div className="agent-header-clickable" onClick={() => setExpanded(!expanded)}>
        <div className="agent-header">
          <Server className="w-4 h-4" />
          <div className="agent-info">
            <span className="agent-hostname">{metrics.system.hostname}</span>
            <span className="agent-id">{agentId}</span>
          </div>
        </div>
        <div className="agent-header-right">
          <span className="agent-uptime">{formatTime(metrics.system.uptime)}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Quick Stats - всегда видны */}
      <div className="agent-quick-stats">
        <div className="quick-stat">
          <Cpu className="w-3 h-3" />
          <span>{metrics.cpu.usage.toFixed(1)}%</span>
        </div>
        <div className="quick-stat">
          <MemoryStick className="w-3 h-3" />
          <span>{metrics.memory.used_percent.toFixed(1)}%</span>
        </div>
        <div className="quick-stat">
          <HardDrive className="w-3 h-3" />
          <span>{metrics.disks?.length || 0} disks</span>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="agent-details">
          {/* System Info */}
          <div className="detail-section">
            <h4>System Info</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">OS</span>
                <span className="detail-value">{metrics.system.os}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Platform</span>
                <span className="detail-value">{metrics.system.platform}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">CPU Cores</span>
                <span className="detail-value">{metrics.system.num_cpu}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Memory Total</span>
                <span className="detail-value">{formatBytes(metrics.memory.total)}</span>
              </div>
            </div>
          </div>

          {/* Disks */}
          {metrics.disks && metrics.disks.length > 0 && (
            <div className="detail-section">
              <h4>Disks</h4>
              <div className="disks-list">
                {metrics.disks.slice(0, 3).map((disk, i) => (
                  <div key={i} className="disk-item">
                    <span className="disk-mount">{disk.mountpoint}</span>
                    <div className="disk-bar-wrap">
                      <div className="disk-bar" style={{width: `${disk.used_percent}%`}} />
                    </div>
                    <span className="disk-percent">{disk.used_percent.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Docker Stats */}
          {metrics.docker && (
            <div className="detail-section">
              <h4>Docker</h4>
              <div className="docker-stats-mini">
                <span className="docker-stat-mini">{metrics.docker.containers_running} running</span>
                <span className="docker-stat-mini">{metrics.docker.containers_stopped} stopped</span>
                <span className="docker-stat-mini">{metrics.docker.containers_total} total</span>
              </div>
            </div>
          )}

          {/* CPU History Chart */}
          {history.length > 0 && (
            <div className="detail-section">
              <h4>CPU History</h4>
              <div className="cpu-history-chart">
                {history.slice(-15).map((h, i) => (
                  <div
                    key={i}
                    className="history-bar"
                    style={{height: `${Math.min(h.cpu.usage, 100)}%`}}
                    title={`${h.cpu.usage.toFixed(1)}% at ${formatDate(h.timestamp)}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Top Processes */}
          {metrics.processes && metrics.processes.length > 0 && (
            <div className="detail-section">
              <div className="processes-header">
                <h4>Top Processes ({metrics.processes.length})</h4>
                <div className="process-controls">
                  <select
                    value={processSortKey}
                    onChange={(e) => setProcessSortKey(e.target.value as any)}
                    className="sort-select"
                  >
                    <option value="cpu">CPU</option>
                    <option value="memory">Memory</option>
                    <option value="name">Name</option>
                  </select>
                  <button
                    onClick={() => setProcessSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                    className="btn-sort"
                    title={processSortDir === 'asc' ? 'Ascending' : 'Descending'}
                  >
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="processes-list">
                {displayedProcesses.map((proc) => (
                  <div key={proc.pid} className="process-item" onClick={() => setSelectedProcess(proc)}>
                    <div className="process-info">
                      <span className="process-name">{proc.name}</span>
                      <span className="process-pid">PID: {proc.pid}</span>
                    </div>
                    <div className="process-stats">
                      <span className={`process-cpu ${proc.cpu_percent > 50 ? 'high' : ''}`}>
                        {proc.cpu_percent.toFixed(1)}% CPU
                      </span>
                      <span className="process-mem">
                        {proc.memory_percent.toFixed(1)}% MEM
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStopProcess(proc.pid, proc.name) }}
                        disabled={stoppingProcess === proc.pid}
                        className="btn-stop-process"
                        title="Stop process"
                      >
                        {stoppingProcess === proc.pid ? '...' : <Square className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {metrics.processes.length > 5 && (
                <button
                  onClick={() => setShowAllProcesses(!showAllProcesses)}
                  className="btn-view-all"
                >
                  {showAllProcesses ? (
                    <>Show Less</>
                  ) : (
                    <>View All ({metrics.processes.length}) <Eye className="w-3 h-3" /></>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Process Detail Modal */}
      {selectedProcess && (
        <div className="modal-overlay" onClick={() => setSelectedProcess(null)}>
          <div className="modal-content" style={{ maxWidth: '600px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedProcess.name}</h3>
              <button onClick={() => setSelectedProcess(null)} className="btn-close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">PID</span>
                  <span className="detail-value">{selectedProcess.pid}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">CPU</span>
                  <span className="detail-value">{selectedProcess.cpu_percent.toFixed(1)}%</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Memory</span>
                  <span className="detail-value">{selectedProcess.memory_percent.toFixed(1)}%</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Status</span>
                  <span className="detail-value">{selectedProcess.status}</span>
                </div>
                {selectedProcess.username && (
                  <div className="detail-item">
                    <span className="detail-label">User</span>
                    <span className="detail-value">{selectedProcess.username}</span>
                  </div>
                )}
              </div>

              {/* Process History Chart */}
              {processHistory.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ fontSize: '14px', marginBottom: '12px', color: '#94a3b8' }}>Resource History</h4>
                  
                  {/* Legend */}
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '16px', height: '2px', background: '#a78bfa' }} />
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>CPU</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '16px', height: '2px', background: '#22c55e' }} />
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Memory</span>
                    </div>
                  </div>

                  {/* Chart */}
                  <div style={{ display: 'flex', marginBottom: '4px' }}>
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'space-between',
                      paddingRight: '6px',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      color: '#64748b'
                    }}>
                      <span>100%</span>
                      <span>50%</span>
                      <span>0%</span>
                    </div>
                    <div style={{ flex: 1, height: '120px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', padding: '6px' }}>
                      <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                        {/* Grid lines */}
                        {[0, 25, 50, 75, 100].map(y => (
                          <line key={`g-${y}`} x1="0" y1={y * 0.6} x2="100" y2={y * 0.6} stroke="rgba(51,65,85,0.4)" strokeWidth="0.3" />
                        ))}

                        {/* CPU polyline */}
                        {processHistory.length > 1 && (
                          <path 
                            d={`M ${processHistory.map((h, i) => {
                              const x = (i / (processHistory.length - 1)) * 100
                              const y = 60 - (Math.min(h.cpu_percent, 100) / 100) * 60
                              return `${x},${y}`
                            }).join(' L ')}`}
                            fill="none" 
                            stroke="#a78bfa" 
                            strokeWidth="0.8"
                          />
                        )}
                        
                        {/* Memory polyline */}
                        {processHistory.length > 1 && (
                          <path 
                            d={`M ${processHistory.map((h, i) => {
                              const x = (i / (processHistory.length - 1)) * 100
                              const y = 60 - (Math.min(h.memory_percent, 100) / 100) * 60
                              return `${x},${y}`
                            }).join(' L ')}`}
                            fill="none" 
                            stroke="#22c55e" 
                            strokeWidth="0.8"
                          />
                        )}
                      </svg>
                    </div>
                  </div>

                  {/* Stats */}
                  {processHistory.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                      <div style={{ background: 'rgba(167, 139, 250, 0.1)', padding: '8px', borderRadius: '6px' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>CPU Avg</div>
                        <div style={{ fontSize: '14px', color: '#a78bfa', fontWeight: '600' }}>
                          {(processHistory.reduce((a, b) => a + b.cpu_percent, 0) / processHistory.length).toFixed(1)}%
                        </div>
                      </div>
                      <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '8px', borderRadius: '6px' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>Memory Avg</div>
                        <div style={{ fontSize: '14px', color: '#22c55e', fontWeight: '600' }}>
                          {(processHistory.reduce((a, b) => a + b.memory_percent, 0) / processHistory.length).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {loadingHistory && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                  Loading history...
                </div>
              )}

              <div className="modal-actions">
                <button
                  onClick={() => handleStopProcess(selectedProcess.pid, selectedProcess.name)}
                  disabled={stoppingProcess === selectedProcess.pid}
                  className="btn-stop-process-large"
                >
                  <Square className="w-4 h-4" />
                  {stoppingProcess === selectedProcess.pid ? 'Stopping...' : 'Stop Process'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ========== VULNERABILITY SCANNER LIGHT - С детальной информацией ==========
const VulnerabilityScannerLight: React.FC = () => {
  const [images, setImages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<any>(null)
  const [expandedVuln, setExpandedVuln] = useState<string | null>(null)
  const [showAllVulns, setShowAllVulns] = useState(false)
  const [selectedVuln, setSelectedVuln] = useState<any>(null)

  // Secrets scanning state
  const [scanningSecrets, setScanningSecrets] = useState<string | null>(null)
  const [secretsResult, setSecretsResult] = useState<any>(null)
  const [showSecretsModal, setShowSecretsModal] = useState(false)

  const fetchImages = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/docker/images`)
      if (res.data.images) setImages(res.data.images)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchImages() }, [])

  const handleScan = async (name: string) => {
    setScanning(name)
    setScanResult(null)
    try {
      const res = await axios.post(`${API_BASE}/docker/image/scan`, { image_name: name })
      setScanResult(res.data)
    } catch (e: any) {
      setScanResult({ status: 'error', message: e.message })
    } finally {
      setScanning(null)
    }
  }

  const handleScanSecrets = async (name: string) => {
    setScanningSecrets(name)
    setSecretsResult(null)
    try {
      const res = await axios.post(`${API_BASE}/docker/image/secrets-scan`, { image_name: name })
      setSecretsResult(res.data)
      setShowSecretsModal(true)
    } catch (e: any) {
      setSecretsResult({ status: 'error', message: e.message })
      setShowSecretsModal(true)
    } finally {
      setScanningSecrets(null)
    }
  }

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  const getSeverityColor = (sev: string) => {
    const colors: Record<string, string> = { CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#eab308', LOW: '#3b82f6' }
    return colors[sev?.toUpperCase()] || '#6b7280'
  }

  const getSeverityLabel = (sev: string) => {
    const labels: Record<string, string> = {
      CRITICAL: 'Critical - Immediate action required',
      HIGH: 'High - Urgent attention needed',
      MEDIUM: 'Medium - Should be addressed',
      LOW: 'Low - Consider addressing'
    }
    return labels[sev?.toUpperCase()] || 'Unknown severity'
  }

  const vulnerabilities = scanResult?.vulnerabilities || []
  const displayedVulns = showAllVulns ? vulnerabilities : vulnerabilities.slice(0, 10)

  return (
    <div className="vuln-scanner-light">
      <div className="vuln-header">
        <Shield className="w-5 h-5" />
        <span>Vulnerability Scanner</span>
        <button onClick={fetchImages} disabled={loading} className="btn-refresh">
          {loading ? '...' : '↻'}
        </button>
      </div>

      <div className="vuln-images">
        {images.length === 0 ? (
          <p className="text-muted">No images found</p>
        ) : (
          images.slice(0, 6).map((img) => (
            <div key={img.id} className="vuln-image-card">
              <div className="vuln-image-info">
                <span className="vuln-image-name">{img.name || img.id?.slice(0, 12)}</span>
                <span className="vuln-image-size">{formatSize(img.size)}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleScanSecrets(img.name)}
                  disabled={scanningSecrets !== null || scanning !== null}
                  className="btn-scan-secrets"
                  title="Scan for secrets (API keys, passwords, tokens)"
                >
                  {scanningSecrets === img.name ? 'Scanning...' : <><Key className="w-4 h-4" /> Secrets</>}
                </button>
                <button
                  onClick={() => handleScan(img.name)}
                  disabled={scanning !== null || scanningSecrets !== null}
                  className="btn-scan"
                >
                  {scanning === img.name ? 'Scanning...' : 'Scan'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Scan Results */}
      {scanResult && (
        <div className="vuln-result">
          {scanResult.status === 'error' ? (
            <div className="vuln-error">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span>{scanResult.message || 'Scan failed'}</span>
            </div>
          ) : scanResult.summary ? (
            <>
              {/* Summary */}
              <div className="vuln-summary">
                <span className="summary-badge critical" style={{background: getSeverityColor('CRITICAL')}}>
                  {scanResult.summary.critical || 0} Critical
                </span>
                <span className="summary-badge high" style={{background: getSeverityColor('HIGH')}}>
                  {scanResult.summary.high || 0} High
                </span>
                <span className="summary-badge medium" style={{background: getSeverityColor('MEDIUM')}}>
                  {scanResult.summary.medium || 0} Medium
                </span>
                <span className="summary-badge low" style={{background: getSeverityColor('LOW')}}>
                  {scanResult.summary.low || 0} Low
                </span>
              </div>

              {/* Vulnerabilities List */}
              {vulnerabilities.length > 0 && (
                <div className="vuln-list">
                  <div className="vuln-list-header">
                    <h4>Found {vulnerabilities.length} Vulnerabilities</h4>
                    {vulnerabilities.length > 10 && (
                      <button
                        onClick={() => setShowAllVulns(!showAllVulns)}
                        className="btn-show-more"
                      >
                        {showAllVulns ? 'Show Less' : `Show More (${vulnerabilities.length - 10} more)`}
                      </button>
                    )}
                  </div>

                  {displayedVulns.map((vuln: any) => (
                    <div key={vuln.id} className="vuln-item">
                      <div
                        className="vuln-item-header"
                        onClick={() => setExpandedVuln(expandedVuln === vuln.id ? null : vuln.id)}
                      >
                        <div className="vuln-item-left">
                          <span
                            className="vuln-severity"
                            style={{background: getSeverityColor(vuln.severity)}}
                          >
                            {vuln.severity}
                          </span>
                          <span className="vuln-id">{vuln.id}</span>
                        </div>
                        <div className="vuln-item-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedVuln(vuln) }}
                            className="btn-details"
                          >
                            Details <ExternalLink className="w-3 h-3" />
                          </button>
                          <span className="vuln-arrow">
                            {expandedVuln === vuln.id ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>

                      {expandedVuln === vuln.id && (
                        <div className="vuln-item-details">
                          <p className="vuln-title">{vuln.title}</p>
                          {vuln.description && (
                            <div className="vuln-desc-section">
                              <strong>Description:</strong>
                              <p>{vuln.description}</p>
                            </div>
                          )}
                          {vuln.fix && (
                            <div className="vuln-fix-section">
                              <strong>Fix:</strong>
                              <p>{vuln.fix}</p>
                            </div>
                          )}
                          {vuln.references && vuln.references.length > 0 && (
                            <div className="vuln-refs">
                              <strong>References:</strong>
                              <ul>
                                {vuln.references.slice(0, 3).map((ref: string, i: number) => (
                                  <li key={i}><a href={ref} target="_blank" rel="noopener noreferrer">{ref}</a></li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* No vulnerabilities */}
              {vulnerabilities.length === 0 && (
                <div className="vuln-success">
                  <span>✅</span>
                  <span>No vulnerabilities found!</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted">Scan completed. No detailed results available.</p>
          )}
        </div>
      )}

      {/* Vulnerability Detail Modal */}
      {selectedVuln && (
        <div className="modal-overlay" onClick={() => setSelectedVuln(null)}>
          <div className="modal-content vuln-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="vuln-modal-title">
                <span
                  className="vuln-severity-large"
                  style={{background: getSeverityColor(selectedVuln.severity)}}
                >
                  {selectedVuln.severity}
                </span>
                <h3>{selectedVuln.id}</h3>
              </div>
              <button onClick={() => setSelectedVuln(null)} className="btn-close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body">
              <div className="vuln-severity-desc">
                {getSeverityLabel(selectedVuln.severity)}
              </div>
              
              <div className="vuln-detail-section">
                <h4>Title</h4>
                <p>{selectedVuln.title}</p>
              </div>

              {selectedVuln.description && (
                <div className="vuln-detail-section">
                  <h4>Description</h4>
                  <p>{selectedVuln.description}</p>
                </div>
              )}

              {selectedVuln.fix && (
                <div className="vuln-detail-section">
                  <h4>Recommended Fix</h4>
                  <p>{selectedVuln.fix}</p>
                </div>
              )}

              {selectedVuln.references && selectedVuln.references.length > 0 && (
                <div className="vuln-detail-section">
                  <h4>References</h4>
                  <ul className="vuln-refs-list">
                    {selectedVuln.references.map((ref: string, i: number) => (
                      <li key={i}>
                        <a href={ref} target="_blank" rel="noopener noreferrer">
                          {ref} <ExternalLink className="w-3 h-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Secrets Scan Modal */}
      {showSecretsModal && secretsResult && (
        <div className="modal-overlay" onClick={() => setShowSecretsModal(false)}>
          <div className="modal-content" style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Shield className="w-5 h-5 text-yellow-400" />
                <h3>Secrets Scan: {secretsResult.image}</h3>
              </div>
              <button onClick={() => setShowSecretsModal(false)} className="btn-close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body">
              {secretsResult.status === 'error' ? (
                <div className="vuln-error">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <span>{secretsResult.error || secretsResult.message || 'Scan failed'}</span>
                </div>
              ) : secretsResult.status === 'warning' ? (
                <div className="vuln-error" style={{ background: 'rgba(234, 179, 8, 0.1)' }}>
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                  <span>{secretsResult.message}</span>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="vuln-summary" style={{ marginBottom: '16px' }}>
                    <span className="summary-badge" style={{ background: '#dc2626' }}>
                      {secretsResult.summary?.critical || 0} Critical
                    </span>
                    <span className="summary-badge" style={{ background: '#ea580c' }}>
                      {secretsResult.summary?.high || 0} High
                    </span>
                    <span className="summary-badge" style={{ background: '#eab308' }}>
                      {secretsResult.summary?.medium || 0} Medium
                    </span>
                    <span className="summary-badge" style={{ background: '#3b82f6' }}>
                      {secretsResult.summary?.low || 0} Low
                    </span>
                  </div>

                  {/* Secret Types */}
                  {secretsResult.secret_types && Object.keys(secretsResult.secret_types).length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ fontSize: '14px', marginBottom: '8px', color: '#94a3b8' }}>Secret Types Found:</h4>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {Object.entries(secretsResult.secret_types).map(([type, count]) => (
                          <span key={type} style={{
                            padding: '4px 10px',
                            background: 'rgba(234, 179, 8, 0.1)',
                            border: '1px solid rgba(234, 179, 8, 0.3)',
                            borderRadius: '4px',
                            fontSize: '12px',
                            color: '#fbbf24'
                          }}>
                            {type}: {count as number}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Secrets List */}
                  {secretsResult.secrets && secretsResult.secrets.length > 0 ? (
                    <div className="secrets-list">
                      <h4 style={{ fontSize: '14px', marginBottom: '12px', color: '#94a3b8' }}>
                        Found {secretsResult.secrets.length} Secrets
                      </h4>
                      {secretsResult.secrets.map((secret: any, idx: number) => (
                        <div key={idx} style={{
                          padding: '12px',
                          background: 'rgba(30, 41, 59, 0.5)',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          marginBottom: '8px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: '600',
                                background: secret.severity === 'CRITICAL' ? '#dc2626' : 
                                           secret.severity === 'HIGH' ? '#ea580c' :
                                           secret.severity === 'MEDIUM' ? '#eab308' : '#3b82f6',
                                color: 'white'
                              }}>
                                {secret.severity}
                              </span>
                              <span style={{ fontWeight: '600', color: '#f1f5f9' }}>{secret.title}</span>
                            </div>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>{secret.category}</span>
                          </div>
                          
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            <div style={{ marginBottom: '4px' }}>
                              <strong>File:</strong> {secret.file}:{secret.line}
                            </div>
                            {secret.description && (
                              <div style={{ marginBottom: '4px' }}>
                                <strong>Description:</strong> {secret.description}
                              </div>
                            )}
                            <div style={{ 
                              padding: '6px 10px', 
                              background: 'rgba(0,0,0,0.3)', 
                              borderRadius: '4px', 
                              fontFamily: 'monospace',
                              fontSize: '11px',
                              color: '#fbbf24',
                              marginTop: '8px'
                            }}>
                              {secret.masked_value}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="vuln-success">
                      <CheckCircle className="w-5 h-5 text-green-400" />
                      <span>No secrets found!</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface SystemInfo {
  system: { hostname: string; uptime: number; boot_time: number }
  cpu: { percent: number; count: number }
  memory: { percent: number; total: number; used: number }
  disks: { count: number; partitions: any[] }
  network: { bytes_sent: number; bytes_recv: number }
  battery: { percent: number | null; seconds_left: number | null; power_plugged: boolean | null } | null
  timestamp: string
}

interface ProgressBarMetricProps {
  title: string
  value: number
  unit: string
  color: string
  onClick?: () => void
  icon?: React.ReactNode
}

function ProgressBarMetric({ title, value, unit, color, onClick, icon }: ProgressBarMetricProps) {
  const percentage = Math.min(100, Math.max(0, value))
  return (
    <div className={`metric-card ${onClick ? 'metric-card-clickable' : ''}`} onClick={onClick}>
      <div className="metric-header">
        <span className="metric-title">{icon} {title}</span>
        <span className="metric-value">{value.toFixed(1)}{unit}</span>
      </div>
      <div className="metric-bar-container">
        <div
          className="metric-bar"
          style={{
            width: `${percentage}%`,
            backgroundColor: color
          }}
        />
      </div>
      {onClick && <div className="metric-click-hint">Click for details</div>}
    </div>
  )
}

// Компонент для отображения графика метрик (ломаная линия с градиентом)
const MetricChartModal: React.FC<{
  title: string
  data: MetricHistory[]
  type: 'cpu' | 'memory'
  onClose: () => void
}> = ({ title, data, type, onClose }) => {
  const maxValue = 100
  const values = type === 'cpu' 
    ? data.map(d => d.cpu) 
    : data.map(d => d.memory)
  
  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const max = values.length > 0 ? Math.max(...values) : 0
  const min = values.length > 0 ? Math.min(...values) : 0

  // Generate polyline path (sharp vertices, no smoothing)
  const generatePolylinePath = (): string => {
    if (values.length < 2) return ''
    
    const width = 100
    const height = 80
    const padding = 8
    const effectiveWidth = width - padding * 2
    const effectiveHeight = height - padding * 2
    
    const points = values.map((v, i) => {
      const x = padding + (i / (values.length - 1)) * effectiveWidth
      const y = padding + effectiveHeight - (v / maxValue * effectiveHeight)
      return { x, y }
    })
    
    // Create polyline with sharp corners (L = line to)
    let path = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x},${points[i].y}`
    }
    
    return path
  }

  // Generate area fill path
  const generateAreaPath = (): string => {
    if (values.length < 2) return ''
    
    const width = 100
    const height = 80
    const padding = 8
    const effectiveWidth = width - padding * 2
    const effectiveHeight = height - padding * 2
    
    const points = values.map((v, i) => {
      const x = padding + (i / (values.length - 1)) * effectiveWidth
      const y = padding + effectiveHeight - (v / maxValue * effectiveHeight)
      return { x, y }
    })
    
    let path = `M ${padding},${height - padding}`
    path += ` L ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x},${points[i].y}`
    }
    path += ` L ${width - padding},${height - padding} Z`
    
    return path
  }

  // Get color based on value
  const getColor = (val: number) => {
    if (val < 40) return '#22c55e'
    if (val < 70) return '#eab308'
    return '#ef4444'
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content metric-modal metric-modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="metric-modal-title">
            <Battery className="w-5 h-5" />
            <h3>{title}</h3>
          </div>
          <button onClick={onClose} className="btn-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="modal-body">
          {/* Stats Summary */}
          <div className="metric-stats-summary">
            <div className="metric-stat-box">
              <span className="metric-stat-label">Current</span>
              <span className="metric-stat-value">{values[values.length - 1]?.toFixed(1) || 0}%</span>
            </div>
            <div className="metric-stat-box">
              <span className="metric-stat-label">Average</span>
              <span className="metric-stat-value">{avg.toFixed(1)}%</span>
            </div>
            <div className="metric-stat-box">
              <span className="metric-stat-label">Max</span>
              <span className="metric-stat-value">{max.toFixed(1)}%</span>
            </div>
            <div className="metric-stat-box">
              <span className="metric-stat-label">Min</span>
              <span className="metric-stat-value">{min.toFixed(1)}%</span>
            </div>
          </div>

          {/* XY Line Chart - Polyline with fine grid */}
          <div style={{ display: 'flex', marginBottom: '8px' }}>
            {/* Y-axis labels (left side, vertical) */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'space-between',
              paddingRight: '8px',
              fontSize: '11px',
              fontFamily: 'monospace'
            }}>
              <span style={{color: getColor(100)}}>100%</span>
              <span style={{color: getColor(75)}}>75%</span>
              <span style={{color: getColor(50)}}>50%</span>
              <span style={{color: getColor(25)}}>25%</span>
              <span style={{color: getColor(0)}}>0%</span>
            </div>
            
            {/* Chart area */}
            <div style={{ flex: 1, height: '200px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', padding: '8px' }}>
              <svg viewBox="0 0 100 80" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                <defs>
                  <linearGradient id="polyGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="50%" stopColor="#eab308" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
                
                {/* Fine grid - horizontal lines every 10 units */}
                {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(y => (
                  <line 
                    key={`h-${y}`} 
                    x1="0" y1={y} x2="100" y2={y} 
                    stroke="rgba(51,65,85,0.3)" 
                    strokeWidth="0.2" 
                  />
                ))}
                
                {/* Fine grid - vertical lines every 10 units */}
                {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(x => (
                  <line 
                    key={`v-${x}`} 
                    x1={x} y1="0" x2={x} y2="80" 
                    stroke="rgba(51,65,85,0.2)" 
                    strokeWidth="0.1"
                  />
                ))}
                
                {/* Main horizontal grid lines */}
                {[0, 25, 50, 75, 100].map(y => (
                  <line 
                    key={`hm-${y}`} 
                    x1="0" y1={y} x2="100" y2={y} 
                    stroke="rgba(51,65,85,0.5)" 
                    strokeWidth="0.3"
                  />
                ))}
                
                {/* Main vertical grid lines */}
                {[0, 25, 50, 75, 100].map(x => (
                  <line 
                    key={`vm-${x}`} 
                    x1={x} y1="0" x2={x} y2="80" 
                    stroke="rgba(51,65,85,0.3)" 
                    strokeWidth="0.2"
                  />
                ))}
                
                {/* Polyline - thin line */}
                {values.length > 1 && (
                  <path 
                    d={generatePolylinePath()} 
                    fill="none" 
                    stroke="url(#polyGradient)" 
                    strokeWidth="1"
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                  />
                )}
              </svg>
            </div>
          </div>
          
          {/* X-axis labels (time) */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginLeft: '32px',
            fontSize: '11px', 
            color: '#94a3b8',
            padding: '0 4px'
          }}>
            <span>{data[0] ? formatTime(data[0].timestamp) : '--:--'}</span>
            <span>{data.length > 1 ? formatTime(data[Math.floor(data.length / 2)].timestamp) : '--:--'}</span>
            <span>{data[data.length - 1] ? formatTime(data[data.length - 1].timestamp) : '--:--'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Компонент для отображения графика Battery
const BatteryChartModal: React.FC<{
  title: string
  data: BatteryHistory[]
  onClose: () => void
}> = ({ title, data, onClose }) => {
  const values = data.map(d => d.percent)
  const maxValue = 100
  
  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const max = values.length > 0 ? Math.max(...values) : 0
  const min = values.length > 0 ? Math.min(...values) : 0

  // Generate polyline path
  const generatePolylinePath = (): string => {
    if (values.length < 2) return ''
    
    const width = 100
    const height = 80
    const padding = 8
    const effectiveWidth = width - padding * 2
    const effectiveHeight = height - padding * 2
    
    const points = values.map((v, i) => {
      const x = padding + (i / (values.length - 1)) * effectiveWidth
      const y = padding + effectiveHeight - (v / maxValue * effectiveHeight)
      return { x, y }
    })
    
    let path = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x},${points[i].y}`
    }
    
    return path
  }

  // Get color based on value
  const getColor = (val: number) => {
    if (val > 50) return '#22c55e'
    if (val > 20) return '#eab308'
    return '#ef4444'
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content metric-modal metric-modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="metric-modal-title">
            <Activity className="w-5 h-5" />
            <h3>{title}</h3>
          </div>
          <button onClick={onClose} className="btn-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="modal-body">
          {/* Stats Summary */}
          <div className="metric-stats-summary">
            <div className="metric-stat-box">
              <span className="metric-stat-label">Current</span>
              <span className="metric-stat-value" style={{ color: getColor(values[values.length - 1] || 0) }}>
                {(values[values.length - 1] || 0).toFixed(0)}%
              </span>
            </div>
            <div className="metric-stat-box">
              <span className="metric-stat-label">Average</span>
              <span className="metric-stat-value" style={{ color: getColor(avg) }}>
                {avg.toFixed(1)}%
              </span>
            </div>
            <div className="metric-stat-box">
              <span className="metric-stat-label">Max</span>
              <span className="metric-stat-value" style={{ color: getColor(max) }}>
                {max.toFixed(1)}%
              </span>
            </div>
            <div className="metric-stat-box">
              <span className="metric-stat-label">Min</span>
              <span className="metric-stat-value" style={{ color: getColor(min) }}>
                {min.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* XY Line Chart - Polyline */}
          <div style={{ display: 'flex', marginBottom: '8px' }}>
            {/* Y-axis labels */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'space-between',
              paddingRight: '8px',
              fontSize: '11px',
              fontFamily: 'monospace'
            }}>
              <span style={{color: getColor(100)}}>100%</span>
              <span style={{color: getColor(75)}}>75%</span>
              <span style={{color: getColor(50)}}>50%</span>
              <span style={{color: getColor(25)}}>25%</span>
              <span style={{color: getColor(0)}}>0%</span>
            </div>
            
            {/* Chart area */}
            <div style={{ flex: 1, height: '200px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', padding: '8px' }}>
              <svg viewBox="0 0 100 80" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                <defs>
                  <linearGradient id="batteryGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="50%" stopColor="#eab308" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
                
                {/* Fine grid - horizontal lines */}
                {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(y => (
                  <line 
                    key={`h-${y}`} 
                    x1="0" y1={y} x2="100" y2={y} 
                    stroke="rgba(51,65,85,0.3)" 
                    strokeWidth="0.2" 
                  />
                ))}
                
                {/* Fine grid - vertical lines */}
                {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(x => (
                  <line 
                    key={`v-${x}`} 
                    x1={x} y1="0" x2={x} y2="80" 
                    stroke="rgba(51,65,85,0.2)" 
                    strokeWidth="0.1"
                  />
                ))}
                
                {/* Main horizontal grid lines */}
                {[0, 25, 50, 75, 100].map(y => (
                  <line 
                    key={`hm-${y}`} 
                    x1="0" y1={y} x2="100" y2={y} 
                    stroke="rgba(51,65,85,0.5)" 
                    strokeWidth="0.3"
                  />
                ))}
                
                {/* Main vertical grid lines */}
                {[0, 25, 50, 75, 100].map(x => (
                  <line 
                    key={`vm-${x}`} 
                    x1={x} y1="0" x2={x} y2="80" 
                    stroke="rgba(51,65,85,0.3)" 
                    strokeWidth="0.2"
                  />
                ))}
                
                {/* Polyline - gradient */}
                {values.length > 1 && (
                  <path 
                    d={generatePolylinePath()} 
                    fill="none" 
                    stroke="url(#batteryGradient)" 
                    strokeWidth="1"
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                  />
                )}
              </svg>
            </div>
          </div>
          
          {/* X-axis labels */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginLeft: '32px',
            fontSize: '11px', 
            color: '#94a3b8',
            padding: '0 4px'
          }}>
            <span>{data[0] ? formatTime(data[0].timestamp) : '--:--'}</span>
            <span>{data.length > 1 ? formatTime(data[Math.floor(data.length / 2)].timestamp) : '--:--'}</span>
            <span>{data[data.length - 1] ? formatTime(data[data.length - 1].timestamp) : '--:--'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Компонент для отображения графика Network (две линии - upload/download)
const NetworkChartModal: React.FC<{
  title: string
  data: NetworkHistory[]
  onClose: () => void
}> = ({ title, data, onClose }) => {
  const uploadValues = data.map(d => d.upload)
  const downloadValues = data.map(d => d.download)
  
  const maxValue = Math.max(
    ...uploadValues, 
    ...downloadValues, 
    1
  )
  
  const formatTime = (ts: number) => {
    const date = new Date(ts * 1000)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  const avgUpload = uploadValues.length > 0 ? uploadValues.reduce((a, b) => a + b, 0) / uploadValues.length : 0
  const avgDownload = downloadValues.length > 0 ? downloadValues.reduce((a, b) => a + b, 0) / downloadValues.length : 0
  const maxUpload = uploadValues.length > 0 ? Math.max(...uploadValues) : 0
  const maxDownload = downloadValues.length > 0 ? Math.max(...downloadValues) : 0

  // Generate polyline path for upload
  const generateUploadPath = (): string => {
    if (uploadValues.length < 2) return ''
    
    const width = 100
    const height = 80
    const padding = 8
    const effectiveWidth = width - padding * 2
    const effectiveHeight = height - padding * 2
    
    const points = uploadValues.map((v, i) => {
      const x = padding + (i / (uploadValues.length - 1)) * effectiveWidth
      const y = padding + effectiveHeight - (v / maxValue * effectiveHeight)
      return { x, y }
    })
    
    let path = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x},${points[i].y}`
    }
    
    return path
  }

  // Generate polyline path for download
  const generateDownloadPath = (): string => {
    if (downloadValues.length < 2) return ''
    
    const width = 100
    const height = 80
    const padding = 8
    const effectiveWidth = width - padding * 2
    const effectiveHeight = height - padding * 2
    
    const points = downloadValues.map((v, i) => {
      const x = padding + (i / (downloadValues.length - 1)) * effectiveWidth
      const y = padding + effectiveHeight - (v / maxValue * effectiveHeight)
      return { x, y }
    })
    
    let path = `M ${points[0].x},${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x},${points[i].y}`
    }
    
    return path
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content metric-modal metric-modal-large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="metric-modal-title">
            <Activity className="w-5 h-5" />
            <h3>{title}</h3>
          </div>
          <button onClick={onClose} className="btn-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="modal-body">
          {/* Legend */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '20px', height: '3px', background: '#a78bfa' }} />
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Upload (↑)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '20px', height: '3px', background: '#3b82f6' }} />
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Download (↓)</span>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="metric-stats-summary">
            <div className="metric-stat-box">
              <span className="metric-stat-label">Current Upload</span>
              <span className="metric-stat-value metric-value-upload">
                {(uploadValues[uploadValues.length - 1] || 0).toFixed(1)}%
              </span>
            </div>
            <div className="metric-stat-box">
              <span className="metric-stat-label">Avg Upload</span>
              <span className="metric-stat-value metric-value-upload">
                {(avgUpload || 0).toFixed(1)}%
              </span>
            </div>
            <div className="metric-stat-box">
              <span className="metric-stat-label">Current Download</span>
              <span className="metric-stat-value metric-value-download">
                {(downloadValues[downloadValues.length - 1] || 0).toFixed(1)}%
              </span>
            </div>
            <div className="metric-stat-box">
              <span className="metric-stat-label">Avg Download</span>
              <span className="metric-stat-value metric-value-download">
                {(avgDownload || 0).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* XY Line Chart - Two Polylines */}
          <div style={{ display: 'flex', marginBottom: '8px' }}>
            {/* Y-axis labels */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'space-between',
              paddingRight: '8px',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#94a3b8'
            }}>
              <span>{formatBytes(maxValue)}</span>
              <span>{formatBytes(maxValue * 0.75)}</span>
              <span>{formatBytes(maxValue * 0.5)}</span>
              <span>{formatBytes(maxValue * 0.25)}</span>
              <span>0</span>
            </div>
            
            {/* Chart area */}
            <div style={{ flex: 1, height: '200px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', padding: '8px' }}>
              <svg viewBox="0 0 100 80" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                {/* Fine grid - horizontal lines every 10 units */}
                {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(y => (
                  <line 
                    key={`h-${y}`} 
                    x1="0" y1={y} x2="100" y2={y} 
                    stroke="rgba(51,65,85,0.3)" 
                    strokeWidth="0.2" 
                  />
                ))}
                
                {/* Fine grid - vertical lines every 10 units */}
                {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(x => (
                  <line 
                    key={`v-${x}`} 
                    x1={x} y1="0" x2={x} y2="80" 
                    stroke="rgba(51,65,85,0.2)" 
                    strokeWidth="0.1"
                  />
                ))}
                
                {/* Main horizontal grid lines */}
                {[0, 25, 50, 75, 100].map(y => (
                  <line 
                    key={`hm-${y}`} 
                    x1="0" y1={y} x2="100" y2={y} 
                    stroke="rgba(51,65,85,0.5)" 
                    strokeWidth="0.3"
                  />
                ))}
                
                {/* Main vertical grid lines */}
                {[0, 25, 50, 75, 100].map(x => (
                  <line 
                    key={`vm-${x}`} 
                    x1={x} y1="0" x2={x} y2="80" 
                    stroke="rgba(51,65,85,0.3)" 
                    strokeWidth="0.2"
                  />
                ))}
                
                {/* Upload polyline - purple */}
                {uploadValues.length > 1 && (
                  <path 
                    d={generateUploadPath()} 
                    fill="none" 
                    stroke="#a78bfa" 
                    strokeWidth="1"
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                  />
                )}
                
                {/* Download polyline - blue */}
                {downloadValues.length > 1 && (
                  <path 
                    d={generateDownloadPath()} 
                    fill="none" 
                    stroke="#3b82f6"
                    strokeWidth="1"
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                  />
                )}
              </svg>
            </div>
          </div>
          
          {/* X-axis labels (time) */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginLeft: '32px',
            fontSize: '11px', 
            color: '#94a3b8',
            padding: '0 4px'
          }}>
            <span>{data[0] ? formatTime(data[0].timestamp) : '--:--'}</span>
            <span>{data.length > 1 ? formatTime(data[Math.floor(data.length / 2)].timestamp) : '--:--'}</span>
            <span>{data[data.length - 1] ? formatTime(data[data.length - 1].timestamp) : '--:--'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const AppLight: React.FC = () => {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('infrawatch-theme')
      if (saved === 'light' || saved === 'dark') return saved
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    }
    return 'dark'
  })

  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [dockerStats, setDockerStats] = useState<any>(null)
  const [agentMetrics, setAgentMetrics] = useState<Record<string, any>>({})
  const [agentsList, setAgentsList] = useState<string[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [showAgents, setShowAgents] = useState(true)
  const [showProcessManager, setShowProcessManager] = useState(false)
  const [loading, setLoading] = useState(true)

  // History for CPU and Memory charts
  const [metricHistory, setMetricHistory] = useState<MetricHistory[]>([])
  const [networkHistory, setNetworkHistory] = useState<NetworkHistory[]>([])
  const [batteryHistory, setBatteryHistory] = useState<BatteryHistory[]>([])
  const [showCpuChart, setShowCpuChart] = useState(false)
  const [showMemoryChart, setShowMemoryChart] = useState(false)
  const [showNetworkChart, setShowNetworkChart] = useState(false)
  const [showBatteryChart, setShowBatteryChart] = useState(false)

  // Для расчета скорости network
  const prevNetworkRef = useRef<{ bytes_sent: number; bytes_recv: number } | null>(null)

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('infrawatch-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  useEffect(() => {
    let mounted = true

    async function fetchAll() {
      try {
        const [sysResp, dockerResp] = await Promise.all([
          axios.get(`${API_BASE}/system`),
          axios.get(`${API_BASE}/docker/metrics`)
        ])
        // fetch agent metrics separately (via helper)
        try {
          const agents = await api.getAgentMetrics()
          setAgentMetrics(agents || {})
          const ids = Object.keys(agents || {})
          setAgentsList(ids)
          setAgentsLoading(false)
        } catch (e) {
          console.error('Error fetching agent metrics:', e)
          setAgentsLoading(false)
        }
        if (!mounted) return
        
        const sysData = sysResp.data
        setSysInfo(sysData || null)
        setDockerStats(dockerResp.data || null)
        
        // Add to history
        if (sysData?.cpu?.percent !== undefined && sysData?.memory?.percent !== undefined) {
          setMetricHistory(prev => {
            const newEntry: MetricHistory = {
              cpu: sysData.cpu.percent,
              memory: sysData.memory.percent,
              timestamp: Date.now() / 1000
            }
            const updated = [...prev, newEntry]
            // Keep last 30 entries (about 2.5 minutes of data)
            return updated.slice(-30)
          })
        }
        
        // Add network to history (normalized values for chart)
        if (sysData?.network?.bytes_sent !== undefined && sysData?.network?.bytes_recv !== undefined) {
          const currentSent = sysData.network.bytes_sent
          const currentRecv = sysData.network.bytes_recv
          
          // Calculate delta if we have previous values
          let upload = 0
          let download = 0
          
          if (prevNetworkRef.current) {
            const deltaSent = Math.max(0, currentSent - prevNetworkRef.current.bytes_sent)
            const deltaRecv = Math.max(0, currentRecv - prevNetworkRef.current.bytes_recv)
            // Normalize to 0-100 scale based on typical values (1GB = 100%)
            upload = Math.min(100, (deltaSent / (1024 * 1024 * 100)) * 100)
            download = Math.min(100, (deltaRecv / (1024 * 1024 * 100)) * 100)
          }
          
          prevNetworkRef.current = { bytes_sent: currentSent, bytes_recv: currentRecv }
          
          setNetworkHistory(prev => {
            const newEntry: NetworkHistory = {
              upload,
              download,
              timestamp: Date.now() / 1000
            }
            const updated = [...prev, newEntry]
            // Keep last 30 entries
            return updated.slice(-30)
          })
        }
        
        // Add battery to history
        if (sysData?.battery?.percent !== undefined && sysData.battery.percent !== null) {
          setBatteryHistory(prev => {
            const newEntry: BatteryHistory = {
              percent: sysData.battery.percent,
              timestamp: Date.now() / 1000
            }
            const updated = [...prev, newEntry]
            // Keep last 30 entries
            return updated.slice(-30)
          })
        }
      } catch (err) {
        console.error('Light app fetch error', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchAll()
    const t = setInterval(fetchAll, 5000)
    return () => {
      mounted = false
      clearInterval(t)
    }
  }, [])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-content">
          <div>
            <h1 className="app-title">InfraWatch</h1>
            <p className="app-subtitle">Infrastructure Monitoring</p>
          </div>
          <button 
            onClick={toggleTheme} 
            className="theme-toggle"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="app-main">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading metrics...</p>
          </div>
        ) : (
          <>
            {/* System Metrics Section */}
            <section className="metrics-section">
              <div className="section-header">
                <h2 className="section-title">System Status</h2>
              </div>
              
              <div className="metrics-grid">
                {sysInfo && (
                  <>
                    <div className="metric-card">
                      <div className="metric-header">
                        <span className="metric-title">Hostname</span>
                      </div>
                      <div className="metric-value-large">{sysInfo.system?.hostname || '—'}</div>
                    </div>

                    <ProgressBarMetric
                      title="CPU"
                      value={sysInfo.cpu?.percent || 0}
                      unit="%"
                      color="#a78bfa"
                      onClick={() => setShowCpuChart(true)}
                      icon={<Cpu className="w-4 h-4" />}
                    />

                    <ProgressBarMetric
                      title="Memory"
                      value={sysInfo.memory?.percent || 0}
                      unit="%"
                      color="#8b5cf6"
                      onClick={() => setShowMemoryChart(true)}
                      icon={<MemoryStick className="w-4 h-4" />}
                    />

                    <div className="metric-card metric-card-clickable" onClick={() => setShowBatteryChart(true)}>
                      <div className="metric-header">
                        <span className="metric-title">Uptime</span>
                      </div>
                      <div className="metric-value-large">{formatUptime(sysInfo.system?.uptime || 0)}</div>
                      {sysInfo.battery?.percent !== null && sysInfo.battery?.percent !== undefined && (
                        <>
                          <div className="metric-subvalue" style={{ color: sysInfo.battery.percent > 50 ? '#22c55e' : sysInfo.battery.percent > 20 ? '#eab308' : '#ef4444' }}>
                            <Battery className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                            {sysInfo.battery.percent}%
                          </div>
                          <div className="metric-click-hint">Click for battery history</div>
                        </>
                      )}
                    </div>

                    <div className="metric-card">
                      <div className="metric-header">
                        <span className="metric-title">Disk Usage</span>
                      </div>
                      <div className="metric-subvalue">{formatBytes(sysInfo.disks?.partitions?.[0]?.used || 0)}</div>
                      <div className="metric-detail">Used of {formatBytes(sysInfo.disks?.partitions?.[0]?.total || 0)}</div>
                    </div>

                    <div className="metric-card metric-card-clickable" onClick={() => setShowNetworkChart(true)}>
                      <div className="metric-header">
                        <span className="metric-title"><Activity className="w-4 h-4" /> Network</span>
                      </div>
                      <div className="metric-subvalue">↓ {formatBytes(sysInfo.network?.bytes_recv || 0)}</div>
                      <div className="metric-detail">↑ {formatBytes(sysInfo.network?.bytes_sent || 0)}</div>
                      <div className="metric-click-hint">Click for details</div>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Docker Section */}
            <section className="docker-section">
              <div className="section-header">
                <h2 className="section-title">Docker</h2>
              </div>
              <DockerDashboardLight data={dockerStats} />
            </section>

            {/* Vulnerability Scanner - Light */}
            <section className="docker-section">
              <div className="section-header">
                <h2 className="section-title">Image Vulnerability Scanner</h2>
              </div>
              <VulnerabilityScannerLight />
            </section>

            {/* Monitoring Agents Section - Light */}
            <section className="metrics-section">
              <div className="section-header">
                <h2 className="section-title">Monitoring Agents</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setShowProcessManager(true)} className="btn btn-sm btn-primary">
                    <Settings className="w-4 h-4" /> Process Manager
                  </button>
                  <button onClick={() => setShowAgents(!showAgents)} className="btn btn-sm">
                    {showAgents ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {showAgents && (
                <div className="agents-grid">
                  {agentsLoading ? (
                    <div className="metric-card"><div className="skeleton" style={{height: 80}} /></div>
                  ) : agentsList.length > 0 ? (
                    agentsList.map((agentId) => (
                      <AgentMetricsLight key={agentId} agentId={agentId} initialMetrics={agentMetrics[agentId]} />
                    ))
                  ) : (
                    <div className="empty-state">
                      <Activity className="w-6 h-6" />
                      <p>No agents connected</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>InfraWatch — System & Container Monitoring</p>
      </footer>

      {/* CPU Chart Modal */}
      {showCpuChart && (
        <MetricChartModal
          title="CPU Usage"
          data={metricHistory}
          type="cpu"
          onClose={() => setShowCpuChart(false)}
        />
      )}

      {/* Memory Chart Modal */}
      {showMemoryChart && (
        <MetricChartModal
          title="Memory Usage"
          data={metricHistory}
          type="memory"
          onClose={() => setShowMemoryChart(false)}
        />
      )}

      {/* Network Chart Modal */}
      {showNetworkChart && (
        <NetworkChartModal
          title="Network Traffic"
          data={networkHistory}
          onClose={() => setShowNetworkChart(false)}
        />
      )}

      {/* Battery Chart Modal */}
      {showBatteryChart && (
        <BatteryChartModal
          title="Battery Level"
          data={batteryHistory}
          onClose={() => setShowBatteryChart(false)}
        />
      )}

      {/* Process Manager Modal */}
      {showProcessManager && (
        <div className="modal-overlay" onClick={() => setShowProcessManager(false)}>
          <div className="modal-content" style={{ maxWidth: '1200px', width: '95%', maxHeight: '90vh', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Process Manager</h3>
              <button onClick={() => setShowProcessManager(false)} className="btn-close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '16px', maxHeight: 'calc(90vh - 60px)', overflow: 'auto' }}>
              <ProcessManager 
                processes={sysInfo?.processes?.top_cpu?.concat(sysInfo?.processes?.top_memory || []) || []}
                onRefresh={() => {
                  // Trigger refresh by updating state
                  const fetchAll = async () => {
                    try {
                      const sysResp = await axios.get(`${API_BASE}/system`)
                      setSysInfo(sysResp.data || null)
                    } catch (e) {
                      console.error('Error refreshing:', e)
                    }
                  }
                  fetchAll()
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AppLight
