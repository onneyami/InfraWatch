import React, { useEffect, useState } from 'react'
import axios from 'axios'
import DockerDashboardLight from './components/DockerDashboardLight'

const API_BASE = 'http://localhost:8000/api/v1'

interface SystemInfo {
  system: { hostname: string; uptime: number; boot_time: number }
  cpu: { percent: number; count: number }
  memory: { percent: number; total: number; used: number }
  disks: { count: number; partitions: any[] }
  network: { bytes_sent: number; bytes_recv: number }
  timestamp: string
}

interface ProgressBarMetricProps {
  title: string
  value: number
  unit: string
  color: string
}

function ProgressBarMetric({ title, value, unit, color }: ProgressBarMetricProps) {
  const percentage = Math.min(100, Math.max(0, value))
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-title">{title}</span>
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
    </div>
  )
}

const AppLight: React.FC = () => {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [dockerStats, setDockerStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function fetchAll() {
      try {
        const [sysResp, dockerResp] = await Promise.all([
          axios.get(`${API_BASE}/system`),
          axios.get(`${API_BASE}/docker/metrics`)
        ])
        if (!mounted) return
        setSysInfo(sysResp.data || null)
        setDockerStats(dockerResp.data || null)
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
        <h1 className="app-title">InfraWatch</h1>
        <p className="app-subtitle">Infrastructure Monitoring</p>
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
                    />

                    <ProgressBarMetric
                      title="Memory"
                      value={sysInfo.memory?.percent || 0}
                      unit="%"
                      color="#a78bfa"
                    />

                    <div className="metric-card">
                      <div className="metric-header">
                        <span className="metric-title">Uptime</span>
                      </div>
                      <div className="metric-value-large">{formatUptime(sysInfo.system?.uptime || 0)}</div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-header">
                        <span className="metric-title">Disks</span>
                      </div>
                      <div className="metric-value-large">{sysInfo.disks?.count || 0}</div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-header">
                        <span className="metric-title">CPU Cores</span>
                      </div>
                      <div className="metric-value-large">{sysInfo.cpu?.count || 0}</div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-header">
                        <span className="metric-title">Disk Usage</span>
                      </div>
                      <div className="metric-subvalue">{formatBytes(sysInfo.disks?.partitions?.[0]?.used || 0)}</div>
                      <div className="metric-detail">Used of {formatBytes(sysInfo.disks?.partitions?.[0]?.total || 0)}</div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-header">
                        <span className="metric-title">Network</span>
                      </div>
                      <div className="metric-subvalue">↓ {formatBytes(sysInfo.network?.bytes_recv || 0)}</div>
                      <div className="metric-detail">↑ {formatBytes(sysInfo.network?.bytes_sent || 0)}</div>
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
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>InfraWatch — System & Container Monitoring</p>
      </footer>
    </div>
  )
}

export default AppLight
