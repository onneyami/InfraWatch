import React, { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { CommandPalette } from './components/layout/CommandPalette'
import { OverviewPage } from './pages/overview/OverviewPage'
import { HostsPage } from './pages/infrastructure/HostsPage'
import { ProcessesPage } from './pages/infrastructure/ProcessesPage'
import { DockerPage } from './pages/containers/DockerPage'
import { MetricsPage } from './pages/monitoring/MetricsPage'
import { LogsPage } from './pages/monitoring/LogsPage'
import { SecurityPage } from './pages/security/SecurityPage'
import { AlertsPage } from './pages/alerts/AlertsPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { theme } from './theme/tokens'
import { useAppStore } from './store/appStore'
import { api } from './services/api'
import { DEMO_ALERTS } from './services/mockData'
import { WelcomeScreen } from './components/WelcomeScreen'

const PageRouter: React.FC = () => {
  const currentPage = useAppStore((s) => s.currentPage)

  switch (currentPage) {
    case 'overview': return <OverviewPage />
    case 'hosts': return <HostsPage />
    case 'processes': return <ProcessesPage />
    case 'docker': case 'images': case 'networks': case 'volumes': return <DockerPage />
    case 'metrics': return <MetricsPage />
    case 'logs': return <LogsPage />
    case 'security': case 'vulnerabilities': case 'compliance': return <SecurityPage />
    case 'alerts': return <AlertsPage />
    case 'settings': return <SettingsPage />
    default: return <OverviewPage />
  }
}

const App: React.FC = () => {
  const { setAgents, setAlerts, setEvents, setDockerInfo, setLoading, restoreSession } = useAppStore()

  // Пока активно дорабатываем дизайн Welcome Screen — показываем его при
  // каждой загрузке страницы (без persistence), чтобы не путать тестирование
  // с кэшированным "уже видели". Когда дизайн устаканится, можно вернуть
  // sessionStorage/localStorage-гейт одной строкой.
  const [showWelcome, setShowWelcome] = useState(true)

  const handleGetStarted = () => {
    setShowWelcome(false)
  }

  useEffect(() => {
    // Восстанавливаем сессию пользователя, если токен сохранён с прошлого раза
    restoreSession()
  }, [])

  useEffect(() => {
    // Алертов на бэкенде пока нет — сидируем demo-данными один раз,
    // чтобы Overview и страница Alerts показывали одно и то же.
    setAlerts(DEMO_ALERTS)
  }, [])

  useEffect(() => {
    let cancelled = false

    const fetchData = async () => {
      try {
        setLoading('agents', true)
        const agents = await api.getAgentMetrics()
        if (!cancelled) setAgents(agents)
      } catch (e) {
        console.error('Failed to fetch agents:', e)
      } finally {
        if (!cancelled) setLoading('agents', false)
      }

      try {
        const dockerInfo = await api.getDockerInfo()
        if (!cancelled) setDockerInfo(dockerInfo)
      } catch (e) {
        console.error('Failed to fetch docker info:', e)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 10000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (showWelcome) {
    return <WelcomeScreen onGetStarted={handleGetStarted} />
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: theme.colors.bg.primary }}>
      <Toaster position="top-right" toastOptions={{
        style: { background: theme.colors.bg.card, color: theme.colors.text.primary, border: `1px solid ${theme.colors.border.default}` },
      }} />
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar />
        <main style={{ flex: 1, overflow: 'auto', padding: theme.layout.contentPadding, maxWidth: theme.layout.maxContentWidth }}>
          <PageRouter />
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}

export default App