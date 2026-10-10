import { create } from 'zustand'
import { Alert, Event, HostInfo, DockerInfo, AgentMetrics } from '../types/metrics'
import { api } from '../services/api'
import { applyTheme, watchSystemTheme } from '../theme/applyTheme'
import { playAlertSound } from '../utils/sound'

interface AppState {
  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Theme
  theme: 'dark' | 'light' | 'system'
  setTheme: (theme: 'dark' | 'light' | 'system') => void
  
  // Navigation
  currentPage: string
  navigate: (page: string) => void
  selectedAlertId: string | null
  setSelectedAlertId: (id: string | null) => void
  selectedMetricType: string | null
  setSelectedMetricType: (metric: string | null) => void
  selectedHostId: string | null
  setSelectedHostId: (id: string | null) => void
  selectedContainerId: string | null
  setSelectedContainerId: (id: string | null) => void

  // Data
  agents: Record<string, AgentMetrics>
  setAgents: (agents: Record<string, AgentMetrics>) => void
  alerts: Alert[]
  setAlerts: (alerts: Alert[]) => void
  addAlert: (alert: Omit<Alert, 'id' | 'timestamp'>) => void
  removeAlert: (id: string) => void
  clearAlerts: () => void
  events: Event[]
  setEvents: (events: Event[]) => void
  addEvent: (message: string) => void

  // Notifications
  notificationSettings: {
    desktopEnabled: boolean
    soundEnabled: boolean
    severities: { critical: boolean; warning: boolean; info: boolean }
  }
  setNotificationSettings: (partial: Partial<AppState['notificationSettings']>) => void
  hosts: HostInfo[]
  setHosts: (hosts: HostInfo[]) => void
  dockerInfo: DockerInfo | null
  setDockerInfo: (info: DockerInfo | null) => void

  cisResult: { score: number; passed: number; failed: number; warnings: number; checks: any[] } | null
  cisLoading: boolean
  setCisResult: (result: AppState['cisResult']) => void
  setCisLoading: (loading: boolean) => void
  runCisScan: () => Promise<void>

  // User auth
  currentUser: { id: number; username: string; email: string } | null
  authLoading: boolean
  authError: string | null
  register: (username: string, email: string, password: string) => Promise<boolean>
  login: (usernameOrEmail: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  restoreSession: () => Promise<void>
  clearAuthError: () => void

  // Loading states
  loading: {
    agents: boolean
    alerts: boolean
    docker: boolean
    security: boolean
  }
  setLoading: (key: keyof AppState['loading'], value: boolean) => void

  // Command palette
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // Theme
  theme: (localStorage.getItem('ahova_theme') as 'dark' | 'light' | 'system') || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('ahova_theme', theme)
    applyTheme(theme)
    watchSystemTheme(theme)
    set({ theme })
  },

  // Navigation
  currentPage: 'overview',
  navigate: (page) => set({ currentPage: page }),
  selectedAlertId: null,
  setSelectedAlertId: (id) => set({ selectedAlertId: id }),
  selectedMetricType: null,
  setSelectedMetricType: (metric) => set({ selectedMetricType: metric }),
  selectedHostId: null,
  setSelectedHostId: (id) => set({ selectedHostId: id }),
  selectedContainerId: null,
  setSelectedContainerId: (id) => set({ selectedContainerId: id }),

  // Data
  agents: {},
  setAgents: (agents) => set({ agents }),
  alerts: [],
  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) => set((s) => {
    const newAlert = { ...alert, id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Math.floor(Date.now() / 1000) }

    // Уведомляем пользователя, только если этот тип алерта включён в настройках
    const settings = s.notificationSettings
    const severityEnabled = settings.severities[newAlert.type as 'critical' | 'warning' | 'info']
    if (severityEnabled) {
      if (settings.desktopEnabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(newAlert.title, { body: newAlert.message, tag: newAlert.id })
        } catch (e) {
          console.error('Failed to show desktop notification:', e)
        }
      }
      if (settings.soundEnabled) {
        playAlertSound()
      }
    }

    return { alerts: [newAlert, ...s.alerts] }
  }),
  removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  clearAlerts: () => set({ alerts: [] }),
  events: [],
  setEvents: (events) => set({ events }),
  addEvent: (message) => set((s) => ({
    events: [...s.events, { id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'action', message, source: 'user', timestamp: Math.floor(Date.now() / 1000) }].slice(-50),
  })),

  notificationSettings: (() => {
    const defaults = {
      desktopEnabled: false,
      soundEnabled: false,
      severities: { critical: true, warning: false, info: false },
    }
    try {
      const saved = localStorage.getItem('ahova_notification_settings')
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults
    } catch {
      return defaults
    }
  })(),
  setNotificationSettings: (partial) => set((s) => {
    const merged = { ...s.notificationSettings, ...partial }
    localStorage.setItem('ahova_notification_settings', JSON.stringify(merged))
    return { notificationSettings: merged }
  }),
  hosts: [],
  setHosts: (hosts) => set({ hosts }),
  dockerInfo: null,
  setDockerInfo: (info) => set({ dockerInfo: info }),

  cisResult: null,
  cisLoading: false,
  setCisResult: (result) => set({ cisResult: result }),
  setCisLoading: (loading) => set({ cisLoading: loading }),
  runCisScan: async () => {
    set({ cisLoading: true })
    get().addEvent('CIS Docker Benchmark scan started')
    try {
      const result = await api.getCISBenchmark({ timeout: 60000 })
      if (result) {
        set({
          cisResult: {
            score: result.score ?? 0,
            passed: result.passed ?? 0,
            failed: result.failed ?? 0,
            warnings: result.warnings ?? 0,
            checks: result.checks ?? [],
          },
        })
        get().addEvent(`CIS scan completed — score ${(result.score ?? 0).toFixed(0)}/100`)
      }
    } catch (e) {
      console.error('Failed to run CIS scan:', e)
      get().addEvent('CIS scan failed to complete')
    } finally {
      set({ cisLoading: false })
    }
  },

  // User auth
  currentUser: null,
  authLoading: false,
  authError: null,
  clearAuthError: () => set({ authError: null }),

  register: async (username, email, password) => {
    set({ authLoading: true, authError: null })
    try {
      const { token, user } = await api.register(username, email, password)
      localStorage.setItem('ahova_user_token', token)
      set({ currentUser: user })
      get().addEvent(`Account created: ${user.username}`)
      return true
    } catch (e: any) {
      set({ authError: e?.response?.data?.detail || 'Registration failed' })
      return false
    } finally {
      set({ authLoading: false })
    }
  },

  login: async (usernameOrEmail, password) => {
    set({ authLoading: true, authError: null })
    try {
      const { token, user } = await api.login(usernameOrEmail, password)
      localStorage.setItem('ahova_user_token', token)
      set({ currentUser: user })
      get().addEvent(`Signed in: ${user.username}`)
      return true
    } catch (e: any) {
      set({ authError: e?.response?.data?.detail || 'Invalid username/email or password' })
      return false
    } finally {
      set({ authLoading: false })
    }
  },

  logout: async () => {
    const username = get().currentUser?.username
    try {
      await api.logout()
    } catch (e) {
      console.error('Logout request failed:', e)
    }
    localStorage.removeItem('ahova_user_token')
    set({ currentUser: null })
    if (username) get().addEvent(`Signed out: ${username}`)
  },

  restoreSession: async () => {
    const token = localStorage.getItem('ahova_user_token')
    if (!token) return
    try {
      const user = await api.getCurrentUser()
      set({ currentUser: user })
    } catch (e) {
      // Токен истёк или недействителен — тихо очищаем, без ошибки на экране
      localStorage.removeItem('ahova_user_token')
    }
  },
  loading: {
    agents: false,
    alerts: false,
    docker: false,
    security: false,
  },
  setLoading: (key, value) => set((s) => ({ loading: { ...s.loading, [key]: value } })),

  // Command palette
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}))

export const useSidebar = () => useAppStore((s) => ({
  collapsed: s.sidebarCollapsed,
  toggle: s.toggleSidebar,
  currentPage: s.currentPage,
  navigate: s.navigate,
}))

export const useNavigation = () => useAppStore((s) => ({
  currentPage: s.currentPage,
  navigate: s.navigate,
}))