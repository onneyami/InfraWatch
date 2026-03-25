import React, { useState, useEffect } from 'react'
import { Shield, AlertTriangle, CheckCircle, XCircle, Info, ChevronDown, ChevronUp, Search, RefreshCw } from 'lucide-react'
import axios from 'axios'

const API_BASE = 'http://localhost:8000/api/v1'

interface CISCheck {
  id: string
  title: string
  description: string
  level: string
  category: string
  status: string
  remediation: string
  details: string
}

interface CISScanResult {
  timestamp: string
  total_checks: number
  passed: number
  failed: number
  warnings: number
  info: number
  score: number
  level1_passed: number
  level1_total: number
  level2_passed: number
  level2_total: number
  checks: CISCheck[]
}

const CISScanner: React.FC = () => {
  const [scanResult, setScanResult] = useState<CISScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [collapsed, setCollapsed] = useState(false)

  const runScan = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/docker/cis/scan`)
      setScanResult(res.data)
    } catch (e) {
      console.error('CIS scan error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runScan()
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS':
        return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'FAIL':
        return <XCircle className="w-4 h-4 text-red-400" />
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />
      default:
        return <Info className="w-4 h-4 text-blue-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS':
        return 'text-green-400'
      case 'FAIL':
        return 'text-red-400'
      case 'WARNING':
        return 'text-yellow-400'
      default:
        return 'text-blue-400'
    }
  }

  const filteredChecks = scanResult?.checks.filter(check => {
    const statusMatch = filter === 'all' || check.status.toLowerCase() === filter
    const categoryMatch = categoryFilter === 'all' || check.category === categoryFilter
    return statusMatch && categoryMatch
  }) || []

  const categories = scanResult ? [...new Set(scanResult.checks.map(c => c.category))] : []

  return (
    <div className="cis-scanner">
      {/* Header */}
      <div className="cis-header">
        <div className="cis-header-left">
          <Shield className="w-6 h-6 text-purple-400" />
          <div>
            <h3>CIS Docker Benchmark</h3>
            <p className="text-sm text-slate-400">Security compliance scanning</p>
          </div>
        </div>
        <div className="cis-header-actions">
          <button 
            onClick={runScan} 
            disabled={loading}
            className="btn btn-sm flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Scanning...' : 'Run Scan'}
          </button>
          <button 
            onClick={() => setCollapsed(!collapsed)} 
            className="btn btn-sm"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Collapsed summary */}
      {collapsed && scanResult && (
        <div className="cis-collapsed-summary" onClick={() => setCollapsed(false)}>
          <div className="collapsed-score">
            <span className="collapsed-score-value">{scanResult.score}%</span>
            <span className="collapsed-score-label">Score</span>
          </div>
          <div className="collapsed-stats">
            <span className="text-green-400">{scanResult.passed} passed</span>
            <span className="text-red-400">{scanResult.failed} failed</span>
            <span className="text-yellow-400">{scanResult.warnings} warnings</span>
          </div>
          <span className="collapsed-hint">Click to expand</span>
        </div>
      )}

      {/* Results Summary */}
      {scanResult && !collapsed && (
        <>
          {/* Score Card */}
          <div className="cis-score-card">
            <div className="score-circle" style={{
              background: `conic-gradient(${scanResult.score >= 80 ? '#22c55e' : scanResult.score >= 60 ? '#eab308' : '#ef4444'} ${scanResult.score * 3.6}deg, rgba(30, 41, 59, 0.5) 0deg)`
            }}>
              <div className="score-inner">
                <span className="score-value">{scanResult.score}%</span>
                <span className="score-label">Score</span>
              </div>
            </div>
            
            <div className="score-stats">
              <div className="score-stat">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <div>
                  <span className="stat-value">{scanResult.passed}</span>
                  <span className="stat-label">Passed</span>
                </div>
              </div>
              <div className="score-stat">
                <XCircle className="w-5 h-5 text-red-400" />
                <div>
                  <span className="stat-value">{scanResult.failed}</span>
                  <span className="stat-label">Failed</span>
                </div>
              </div>
              <div className="score-stat">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <div>
                  <span className="stat-value">{scanResult.warnings}</span>
                  <span className="stat-label">Warnings</span>
                </div>
              </div>
            </div>

            <div className="level-stats">
              <div className="level-stat">
                <span className="level-badge level-1">Level 1</span>
                <span className="level-progress">{scanResult.level1_passed}/{scanResult.level1_total}</span>
              </div>
              <div className="level-stat">
                <span className="level-badge level-2">Level 2</span>
                <span className="level-progress">{scanResult.level2_passed}/{scanResult.level2_total}</span>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="cis-filters">
            <div className="filter-group">
              <label>Status:</label>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Category:</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="filter-results">
              {filteredChecks.length} of {scanResult.total_checks} checks
            </div>
          </div>

          {/* Checks List */}
          <div className="cis-checks-list">
            {filteredChecks.map((check) => (
              <div 
                key={check.id} 
                className={`cis-check-item ${check.status.toLowerCase()}`}
              >
                <div 
                  className="cis-check-header"
                  onClick={() => setExpandedCheck(expandedCheck === check.id ? null : check.id)}
                >
                  <div className="check-left">
                    {getStatusIcon(check.status)}
                    <div className="check-info">
                      <span className="check-id">{check.id}</span>
                      <span className="check-title">{check.title}</span>
                    </div>
                  </div>
                  <div className="check-right">
                    <span className={`check-level level-${check.level}`}>
                      Level {check.level}
                    </span>
                    <span className={`check-category ${getStatusColor(check.status)}`}>
                      {check.category}
                    </span>
                    {expandedCheck === check.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {expandedCheck === check.id && (
                  <div className="cis-check-details">
                    <p className="check-description">{check.description}</p>
                    
                    {check.details && (
                      <div className="check-section">
                        <strong>Details:</strong>
                        <pre className="check-details-text">{check.details}</pre>
                      </div>
                    )}
                    
                    <div className="check-section remediation">
                      <strong>Remediation:</strong>
                      <p>{check.remediation}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Loading State */}
      {loading && (
        <div className="cis-loading">
          <RefreshCw className="w-8 h-8 animate-spin text-purple-400" />
          <p>Running CIS Docker Benchmark scans...</p>
        </div>
      )}

      {/* No Results */}
      {!loading && !scanResult && (
        <div className="cis-empty">
          <Shield className="w-12 h-12 text-slate-600" />
          <p>Click "Run Scan" to start CIS Docker Benchmark</p>
        </div>
      )}
    </div>
  )
}

export default CISScanner
