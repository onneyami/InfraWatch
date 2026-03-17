import React, { useState, useEffect } from 'react'
import { X, Search, RefreshCw, Square, Skull, Info, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import axios from 'axios'

const API_BASE = 'http://localhost:8000/api/v1'

interface ProcessDetails {
  pid: number
  name: string
  status: string
  username: string
  cpu_percent: number
  memory_percent: number
  memory_info: { rss: number; vms: number } | null
  cmdline: string
  exe: string
  cwd: string
  num_threads: number
  create_time: number
  uptime: number
  uptime_human: string
  ppid: number
  parent_name: string
  children_count: number
  children: { pid: number; name: string }[]
  connections_count: number
  open_files: number
  cpu_times: { user: number; system: number } | null
  io_counters: { read_bytes: number; write_bytes: number } | null
  priority: number
}

interface ProcessManagerProps {
  processes: any[]
  onRefresh?: () => void
}

export const ProcessManager: React.FC<ProcessManagerProps> = ({ processes: initialProcesses, onRefresh }) => {
  const [processes, setProcesses] = useState(initialProcesses)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'cpu' | 'memory' | 'name' | 'pid'>('cpu')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedProcess, setSelectedProcess] = useState<number | null>(null)
  const [processDetails, setProcessDetails] = useState<ProcessDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [stoppingPid, setStoppingPid] = useState<number | null>(null)
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    setProcesses(initialProcesses)
  }, [initialProcesses])

  // Filter and sort processes
  const filteredProcesses = React.useMemo(() => {
    let filtered = [...processes]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(p => 
        p.name?.toLowerCase().includes(query) || 
        p.pid?.toString().includes(query) ||
        p.username?.toLowerCase().includes(query)
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter)
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: number | string = 0
      let bVal: number | string = 0

      switch (sortBy) {
        case 'cpu':
          aVal = a.cpu_percent || 0
          bVal = b.cpu_percent || 0
          break
        case 'memory':
          aVal = a.memory_percent || 0
          bVal = b.memory_percent || 0
          break
        case 'name':
          aVal = a.name || ''
          bVal = b.name || ''
          break
        case 'pid':
          aVal = a.pid || 0
          bVal = b.pid || 0
          break
      }

      if (typeof aVal === 'string') {
        return sortDir === 'asc' 
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal)
      }
      return sortDir === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal
    })

    return filtered
  }, [processes, searchQuery, statusFilter, sortBy, sortDir])

  // Fetch process details
  const fetchProcessDetails = async (pid: number) => {
    setLoadingDetails(true)
    try {
      const res = await axios.get(`${API_BASE}/process/${pid}`)
      setProcessDetails(res.data)
    } catch (e) {
      console.error('Failed to fetch process details:', e)
    } finally {
      setLoadingDetails(false)
    }
  }

  // Stop process (SIGTERM)
  const handleStopProcess = async (pid: number, name: string) => {
    if (!confirm(`Terminate process "${name}" (PID: ${pid})?\n\nThis will send SIGTERM signal.`)) return
    
    setStoppingPid(pid)
    try {
      const res = await axios.post(`${API_BASE}/process/${pid}/stop`, { force: false })
      setActionResult({ type: 'success', message: res.data.message })
      if (onRefresh) onRefresh()
    } catch (e: any) {
      setActionResult({ type: 'error', message: e.response?.data?.detail || e.message })
    } finally {
      setStoppingPid(null)
      setTimeout(() => setActionResult(null), 3000)
    }
  }

  // Kill process (SIGKILL)
  const handleKillProcess = async (pid: number, name: string) => {
    if (!confirm(`KILL process "${name}" (PID: ${pid})?\n\n⚠️ This will force-kill the process immediately!\nData may be lost.`)) return
    
    setStoppingPid(pid)
    try {
      const res = await axios.post(`${API_BASE}/process/${pid}/stop`, { force: true })
      setActionResult({ type: 'success', message: res.data.message })
      if (onRefresh) onRefresh()
    } catch (e: any) {
      setActionResult({ type: 'error', message: e.response?.data?.detail || e.message })
    } finally {
      setStoppingPid(null)
      setTimeout(() => setActionResult(null), 3000)
    }
  }

  // Change priority
  const handleChangePriority = async (pid: number, currentPriority: number) => {
    const newPriority = prompt(`Enter new priority (-20 to 20, lower = higher priority):`, currentPriority.toString())
    if (!newPriority) return

    const priority = parseInt(newPriority)
    if (isNaN(priority) || priority < -20 || priority > 20) {
      setActionResult({ type: 'error', message: 'Invalid priority. Must be between -20 and 20.' })
      setTimeout(() => setActionResult(null), 3000)
      return
    }

    try {
      const res = await axios.post(`${API_BASE}/process/${pid}/priority?priority=${priority}`)
      setActionResult({ type: 'success', message: res.data.message })
      fetchProcessDetails(pid)
    } catch (e: any) {
      setActionResult({ type: 'error', message: e.response?.data?.detail || e.message })
    } finally {
      setTimeout(() => setActionResult(null), 3000)
    }
  }

  // Format bytes
  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  // Format time
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (days > 0) return `${days}d ${hours}h ${mins}m`
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`
    if (mins > 0) return `${mins}m ${secs}s`
    return `${secs}s`
  }

  return (
    <div className="process-manager">
      {/* Controls */}
      <div className="process-controls-bar">
        <div className="search-box">
          <Search className="w-4 h-4" />
          <input
            type="text"
            placeholder="Search by name, PID, or user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="process-search-input"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="process-filter-select"
        >
          <option value="all">All Status</option>
          <option value="running">Running</option>
          <option value="sleeping">Sleeping</option>
          <option value="stopped">Stopped</option>
          <option value="zombie">Zombie</option>
        </select>

        <div className="process-sort-controls">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="process-sort-select"
          >
            <option value="cpu">CPU</option>
            <option value="memory">Memory</option>
            <option value="name">Name</option>
            <option value="pid">PID</option>
          </select>

          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="btn-sort-dir"
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        <button onClick={onRefresh} className="btn-refresh-processes" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Action Result */}
      {actionResult && (
        <div className={`action-result ${actionResult.type}`}>
          {actionResult.type === 'success' ? '✅' : '❌'} {actionResult.message}
        </div>
      )}

      {/* Process Count */}
      <div className="process-count">
        Showing {filteredProcesses.length} of {processes.length} processes
      </div>

      {/* Process List */}
      <div className="process-list-container">
        <table className="process-table">
          <thead>
            <tr>
              <th>PID</th>
              <th>Name</th>
              <th>CPU %</th>
              <th>MEM %</th>
              <th>Status</th>
              <th>User</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProcesses.slice(0, 50).map((proc) => (
              <tr 
                key={proc.pid}
                className={`process-row ${selectedProcess === proc.pid ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedProcess(proc.pid)
                  fetchProcessDetails(proc.pid)
                }}
              >
                <td className="process-pid">{proc.pid}</td>
                <td className="process-name">{proc.name}</td>
                <td className={`process-cpu ${(proc.cpu_percent || 0) > 50 ? 'high' : ''}`}>
                  {(proc.cpu_percent || 0).toFixed(1)}%
                </td>
                <td className="process-mem">
                  {(proc.memory_percent || 0).toFixed(1)}%
                </td>
                <td>
                  <span className={`status-badge status-${proc.status?.toLowerCase() || 'unknown'}`}>
                    {proc.status || 'unknown'}
                  </span>
                </td>
                <td className="process-user">{proc.username || '-'}</td>
                <td className="process-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleStopProcess(proc.pid, proc.name)}
                    disabled={stoppingPid === proc.pid}
                    className="btn-process-action btn-terminate"
                    title="Terminate (SIGTERM)"
                  >
                    <Square className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleKillProcess(proc.pid, proc.name)}
                    disabled={stoppingPid === proc.pid}
                    className="btn-process-action btn-kill"
                    title="Kill (SIGKILL)"
                  >
                    <Skull className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedProcess(proc.pid)
                      fetchProcessDetails(proc.pid)
                    }}
                    className="btn-process-action btn-info"
                    title="Details"
                  >
                    <Info className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Process Details Modal */}
      {selectedProcess && (
        <div className="modal-overlay" onClick={() => {
          setSelectedProcess(null)
          setProcessDetails(null)
        }}>
          <div className="modal-content process-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{processDetails?.name || `Process ${selectedProcess}`}</h3>
              <button onClick={() => {
                setSelectedProcess(null)
                setProcessDetails(null)
              }} className="btn-close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body">
              {loadingDetails ? (
                <div className="loading-spinner">Loading process details...</div>
              ) : processDetails ? (
                <>
                  {/* Quick Stats */}
                  <div className="process-detail-stats">
                    <div className="stat-item">
                      <span className="stat-label">PID</span>
                      <span className="stat-value">{processDetails.pid}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">CPU</span>
                      <span className="stat-value">{processDetails.cpu_percent?.toFixed(1)}%</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Memory</span>
                      <span className="stat-value">{processDetails.memory_percent?.toFixed(1)}%</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Uptime</span>
                      <span className="stat-value">{processDetails.uptime_human}</span>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="process-detail-grid">
                    <div className="detail-section">
                      <h4>Process Info</h4>
                      <div className="detail-row">
                        <span>Status:</span>
                        <span className={`status-badge status-${processDetails.status?.toLowerCase()}`}>
                          {processDetails.status}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span>User:</span>
                        <span>{processDetails.username}</span>
                      </div>
                      <div className="detail-row">
                        <span>Priority:</span>
                        <span>
                          {processDetails.priority}
                          <button
                            onClick={() => handleChangePriority(processDetails.pid, processDetails.priority)}
                            className="btn-change-priority"
                          >
                            Change
                          </button>
                        </span>
                      </div>
                      <div className="detail-row">
                        <span>Threads:</span>
                        <span>{processDetails.num_threads}</span>
                      </div>
                      <div className="detail-row">
                        <span>Parent:</span>
                        <span>{processDetails.parent_name} (PID: {processDetails.ppid})</span>
                      </div>
                      <div className="detail-row">
                        <span>Children:</span>
                        <span>{processDetails.children_count}</span>
                      </div>
                    </div>

                    <div className="detail-section">
                      <h4>Memory & I/O</h4>
                      <div className="detail-row">
                        <span>RSS:</span>
                        <span>{formatBytes(processDetails.memory_info?.rss || 0)}</span>
                      </div>
                      <div className="detail-row">
                        <span>VMS:</span>
                        <span>{formatBytes(processDetails.memory_info?.vms || 0)}</span>
                      </div>
                      {processDetails.io_counters && (
                        <>
                          <div className="detail-row">
                            <span>Read:</span>
                            <span>{formatBytes(processDetails.io_counters.read_bytes)}</span>
                          </div>
                          <div className="detail-row">
                            <span>Write:</span>
                            <span>{formatBytes(processDetails.io_counters.write_bytes)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="detail-section">
                      <h4>Resources</h4>
                      <div className="detail-row">
                        <span>Open Files:</span>
                        <span>{processDetails.open_files}</span>
                      </div>
                      <div className="detail-row">
                        <span>Connections:</span>
                        <span>{processDetails.connections_count}</span>
                      </div>
                    </div>

                    {processDetails.cmdline && (
                      <div className="detail-section full-width">
                        <h4>Command Line</h4>
                        <code className="cmdline">{processDetails.cmdline}</code>
                      </div>
                    )}

                    {processDetails.children && processDetails.children.length > 0 && (
                      <div className="detail-section full-width">
                        <h4>Child Processes</h4>
                        <div className="children-list">
                          {processDetails.children.map(child => (
                            <div key={child.pid} className="child-process">
                              <span>{child.name}</span>
                              <span>PID: {child.pid}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="process-detail-actions">
                    <button
                      onClick={() => handleStopProcess(processDetails.pid, processDetails.name)}
                      disabled={stoppingPid === processDetails.pid}
                      className="btn-action btn-terminate"
                    >
                      <Square className="w-4 h-4" />
                      Terminate
                    </button>
                    <button
                      onClick={() => handleKillProcess(processDetails.pid, processDetails.name)}
                      disabled={stoppingPid === processDetails.pid}
                      className="btn-action btn-kill"
                    >
                      <Skull className="w-4 h-4" />
                      Kill
                    </button>
                  </div>
                </>
              ) : (
                <div className="loading-spinner">Failed to load process details</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProcessManager
