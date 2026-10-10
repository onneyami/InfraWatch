import React, { useState, useEffect } from 'react'
import { Shield, ExternalLink, RefreshCw } from 'lucide-react'
import { theme } from '../../theme/tokens'
import { AhovaCard } from '../../components/ui/AhovaCard'
import { AhovaBadge } from '../../components/ui/AhovaBadge'
import { AhovaButton } from '../../components/ui/AhovaButton'
import { AhovaTable, Column } from '../../components/ui/AhovaTable'
import { AhovaDrawer } from '../../components/ui/AhovaDrawer'
import { Vulnerability } from '../../types/metrics'
import { useAppStore } from '../../store/appStore'

// Реального сканера уязвимостей "по всем образам сразу" на бэкенде нет —
// есть только Trivy-скан ОДНОГО образа по запросу (Image Vulnerability
// Scanner в старом фронтенде). Этот список остаётся демонстрационным,
// пока не появится агрегированный эндпоинт. В отличие от Security Score
// и вкладки Compliance (ниже), это явно не то же самое, что настоящий CIS-скан.
const mockVulnerabilities: Vulnerability[] = [
  { id: 'CVE-2024-1234', severity: 'CRITICAL', title: 'Remote code execution in libssl', package_name: 'libssl3', installed_version: '3.0.8', fixed_version: '3.0.9' },
  { id: 'CVE-2024-5678', severity: 'HIGH', title: 'SQL injection in node-docker', package_name: 'node-docker', installed_version: '2.1.0', fixed_version: '2.1.1' },
  { id: 'CVE-2024-9012', severity: 'MEDIUM', title: 'XSS vulnerability in web-ui', package_name: 'web-ui', installed_version: '1.5.0', fixed_version: '1.5.1' },
  { id: 'CVE-2024-3456', severity: 'HIGH', title: 'Privilege escalation in kernel', package_name: 'linux-kernel', installed_version: '6.1.0', fixed_version: '6.1.1' },
  { id: 'CVE-2024-7890', severity: 'LOW', title: 'Information disclosure in logger', package_name: 'logger', installed_version: '1.0.0', fixed_version: '1.0.1' },
]

const severityColors: Record<string, string> = {
  CRITICAL: '#EF4444',
  HIGH: '#EA580C',
  MEDIUM: '#EAB308',
  LOW: '#3B82F6',
}

interface CISCheckItem {
  id: string
  title: string
  description: string
  level: string
  category: string
  status: string
  remediation: string
  details?: string
}

const statusColors: Record<string, string> = {
  PASS: theme.colors.status.healthy,
  FAIL: theme.colors.status.critical,
  WARNING: theme.colors.status.warning,
  INFO: theme.colors.status.info,
}

export const SecurityPage: React.FC = () => {
  const { cisResult, cisLoading, runCisScan, currentPage } = useAppStore()
  const [activeTab, setActiveTab] = useState<'vulnerabilities' | 'compliance' | 'audit'>('vulnerabilities')
  const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null)
  const [checksFilter, setChecksFilter] = useState<'PASS' | 'FAIL' | 'WARNING' | null>(null)

  // Cmd+K различает "Run Security Scan" (vulnerabilities) и "View Compliance"
  // (compliance) — раньше оба вели на одну и ту же вкладку без различия,
  // потому что App.tsx маршрутизирует их на один и тот же компонент.
  useEffect(() => {
    if (currentPage === 'compliance') setActiveTab('compliance')
    else if (currentPage === 'vulnerabilities') setActiveTab('vulnerabilities')
  }, [currentPage])

  const columns: Column<Vulnerability>[] = [
    { key: 'id', header: 'Package', render: (v) => <span style={{ fontWeight: 500 }}>{v.package_name}</span> },
    { key: 'severity', header: 'Severity', render: (v) => (
      <span style={{
        padding: '2px 8px',
        borderRadius: 4,
        background: severityColors[v.severity] + '20',
        color: severityColors[v.severity],
        fontSize: 11,
        fontWeight: 600,
      }}>
        {v.severity}
      </span>
    )},
    { key: 'cve', header: 'CVE', render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v.id}</span> },
    { key: 'installed_version', header: 'Version' },
    { key: 'fixed_version', header: 'Fix', render: (v) => v.fixed_version ? <span style={{ color: theme.colors.status.healthy }}>{v.fixed_version}</span> : '—' },
  ]

  const summary = {
    critical: mockVulnerabilities.filter(v => v.severity === 'CRITICAL').length,
    high: mockVulnerabilities.filter(v => v.severity === 'HIGH').length,
    medium: mockVulnerabilities.filter(v => v.severity === 'MEDIUM').length,
    low: mockVulnerabilities.filter(v => v.severity === 'LOW').length,
  }

  const checks: CISCheckItem[] = cisResult?.checks ?? []
  const filteredChecks = checksFilter ? checks.filter((c) => c.status === checksFilter) : []

  return (
    <div className="animate-fadeIn">
      {/* Security Score Hero */}
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
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, fontWeight: 700, background: theme.colors.brand.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>
            {cisResult ? cisResult.score.toFixed(0) : cisLoading ? '···' : '—'}
          </div>
          <div style={{ fontSize: 14, color: theme.colors.text.secondary }}>
            {cisLoading ? 'Running CIS scan...' : cisResult ? '/ 100 · CIS Docker Benchmark' : 'Not scanned yet'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: theme.spacing[6], flex: 1 }}>
          {Object.entries(summary).map(([key, count]) => (
            <div key={key}>
              <div style={{ fontSize: 20, fontWeight: 600, color: severityColors[key.toUpperCase()] || theme.colors.text.primary }}>{count}</div>
              <div style={{ fontSize: 12, color: theme.colors.text.muted, textTransform: 'capitalize' }}>{key}</div>
            </div>
          ))}
        </div>
        <AhovaButton variant="secondary" size="md" icon={<RefreshCw size={14} className={cisLoading ? 'animate-spin' : ''} />} onClick={() => runCisScan()} disabled={cisLoading}>
          {cisLoading ? 'Scanning...' : cisResult ? 'Re-run CIS Scan' : 'Run CIS Scan'}
        </AhovaButton>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: theme.spacing[1], marginBottom: theme.spacing[4] }}>
        {[
          { id: 'vulnerabilities', label: 'Vulnerabilities' },
          { id: 'compliance', label: 'Compliance' },
          { id: 'audit', label: 'Audit' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: `${theme.spacing[2]} ${theme.spacing[4]}`,
              background: activeTab === tab.id ? 'rgba(139,92,246,0.15)' : 'transparent',
              border: 'none',
              borderRadius: theme.radius.sm,
              color: activeTab === tab.id ? theme.colors.text.primary : theme.colors.text.muted,
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 500 : 400,
              cursor: 'pointer',
              transition: theme.transition.fast,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'vulnerabilities' && (
        <>
          <div style={{ display: 'flex', gap: theme.spacing[2], marginBottom: theme.spacing[4] }}>
            {Object.entries(summary).map(([key, count]) => (
              <span key={key} style={{
                padding: '4px 12px',
                borderRadius: theme.radius.sm,
                background: severityColors[key.toUpperCase()] + '15',
                border: `1px solid ${severityColors[key.toUpperCase()]}30`,
                fontSize: 12,
                fontWeight: 500,
                color: severityColors[key.toUpperCase()],
                textTransform: 'capitalize',
              }}>
                {key}: {count}
              </span>
            ))}
          </div>

          <AhovaCard>
            <AhovaTable
              columns={columns}
              data={mockVulnerabilities}
              onRowClick={(v) => setSelectedVuln(v)}
              emptyMessage="No vulnerabilities found"
            />
          </AhovaCard>
        </>
      )}

      {activeTab === 'compliance' && (
        <AhovaCard title="CIS Benchmark">
          <div style={{ marginBottom: theme.spacing[6] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing[2] }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Compliance Score</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: theme.colors.status.healthy }}>
                {cisResult ? `${cisResult.score.toFixed(0)}%` : cisLoading ? '···' : '—'}
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--ahova-fg-a06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: cisResult ? `${cisResult.score}%` : '0%', height: '100%', background: theme.colors.brand.gradient, borderRadius: 4, transition: theme.transition.normal }} />
            </div>
          </div>

          {!cisResult && !cisLoading && (
            <div style={{ textAlign: 'center', padding: theme.spacing[6], color: theme.colors.text.muted }}>
              <Shield size={32} style={{ opacity: 0.3, marginBottom: theme.spacing[3] }} />
              <p style={{ fontSize: 13, marginBottom: theme.spacing[3] }}>No scan has been run yet.</p>
              <AhovaButton variant="primary" size="sm" onClick={() => runCisScan()}>Run CIS Scan</AhovaButton>
            </div>
          )}

          {cisResult && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: theme.spacing[4], marginBottom: theme.spacing[4] }}>
                <div
                  onClick={() => setChecksFilter(checksFilter === 'PASS' ? null : 'PASS')}
                  style={{ padding: theme.spacing[4], background: 'rgba(34,197,94,0.08)', borderRadius: theme.radius.sm, border: `1px solid ${checksFilter === 'PASS' ? theme.colors.status.healthy : 'rgba(34,197,94,0.2)'}`, cursor: 'pointer', transition: theme.transition.fast }}
                >
                  <div style={{ fontSize: 28, fontWeight: 700, color: theme.colors.status.healthy }}>{cisResult.passed}</div>
                  <div style={{ fontSize: 12, color: theme.colors.text.muted }}>Passed checks · click to view</div>
                </div>
                <div
                  onClick={() => setChecksFilter(checksFilter === 'FAIL' ? null : 'FAIL')}
                  style={{ padding: theme.spacing[4], background: 'rgba(239,68,68,0.08)', borderRadius: theme.radius.sm, border: `1px solid ${checksFilter === 'FAIL' ? theme.colors.status.critical : 'rgba(239,68,68,0.2)'}`, cursor: 'pointer', transition: theme.transition.fast }}
                >
                  <div style={{ fontSize: 28, fontWeight: 700, color: theme.colors.status.critical }}>{cisResult.failed}</div>
                  <div style={{ fontSize: 12, color: theme.colors.text.muted }}>Failed checks · click to view</div>
                </div>
                <div
                  onClick={() => setChecksFilter(checksFilter === 'WARNING' ? null : 'WARNING')}
                  style={{ padding: theme.spacing[4], background: 'rgba(234,179,8,0.08)', borderRadius: theme.radius.sm, border: `1px solid ${checksFilter === 'WARNING' ? theme.colors.status.warning : 'rgba(234,179,8,0.2)'}`, cursor: 'pointer', transition: theme.transition.fast }}
                >
                  <div style={{ fontSize: 28, fontWeight: 700, color: theme.colors.status.warning }}>{cisResult.warnings}</div>
                  <div style={{ fontSize: 12, color: theme.colors.text.muted }}>Warnings · click to view</div>
                </div>
              </div>

              {checksFilter && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[2] }}>
                  {filteredChecks.length === 0 ? (
                    <p style={{ fontSize: 13, color: theme.colors.text.muted }}>No checks with this status.</p>
                  ) : (
                    filteredChecks.map((c) => (
                      <div key={c.id} style={{ padding: theme.spacing[3], background: theme.colors.bg.secondary, borderRadius: theme.radius.sm, border: `1px solid ${theme.colors.border.default}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{c.title}</span>
                          <span style={{ fontSize: 11, color: statusColors[c.status] || theme.colors.text.muted, fontWeight: 600 }}>{c.status}</span>
                        </div>
                        <div style={{ fontSize: 12, color: theme.colors.text.secondary, marginBottom: 4 }}>{c.description}</div>
                        <div style={{ display: 'flex', gap: theme.spacing[3], fontSize: 11, color: theme.colors.text.muted }}>
                          <span>Category: {c.category}</span>
                          <span>Level: {c.level}</span>
                        </div>
                        {c.status === 'FAIL' && c.remediation && (
                          <div style={{ fontSize: 12, color: theme.colors.status.info, marginTop: 6 }}>
                            Remediation: {c.remediation}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </AhovaCard>
      )}

      {activeTab === 'audit' && (
        <AhovaCard title="Audit Log">
          <p style={{ color: theme.colors.text.muted, fontSize: 13 }}>Audit log functionality coming soon</p>
        </AhovaCard>
      )}

      {/* Vulnerability detail drawer */}
      <AhovaDrawer open={!!selectedVuln} onClose={() => setSelectedVuln(null)} title={selectedVuln?.package_name || 'Vulnerability'}>
        {selectedVuln && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing[4] }}>
            <div>
              <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Severity</div>
              <span style={{
                padding: '2px 10px', borderRadius: 4,
                background: severityColors[selectedVuln.severity] + '20',
                color: severityColors[selectedVuln.severity], fontSize: 12, fontWeight: 600,
              }}>
                {selectedVuln.severity}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>CVE</div>
              <div style={{ fontSize: 14, fontFamily: 'monospace' }}>{selectedVuln.id}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Title</div>
              <div style={{ fontSize: 14 }}>{selectedVuln.title}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing[4] }}>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Installed version</div>
                <div style={{ fontSize: 14 }}>{selectedVuln.installed_version}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: theme.colors.text.muted, marginBottom: 4 }}>Fixed in</div>
                <div style={{ fontSize: 14, color: selectedVuln.fixed_version ? theme.colors.status.healthy : theme.colors.text.muted }}>
                  {selectedVuln.fixed_version || 'No fix available'}
                </div>
              </div>
            </div>
            <a
              href={`https://nvd.nist.gov/vuln/detail/${selectedVuln.id}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: theme.colors.brand.blue }}
            >
              <ExternalLink size={13} /> View on NVD
            </a>
          </div>
        )}
      </AhovaDrawer>
    </div>
  )
}
