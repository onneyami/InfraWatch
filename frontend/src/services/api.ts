import axios from 'axios'
import {
  AgentMetrics,
  DockerContainer,
  DockerImage,
  DockerInfo,
  ScanResult,
  SystemMetrics,
  Alert,
  Event,
  HostInfo,
  ProcessInfo,
} from '../types/metrics'

// Используем относительный путь — Vite dev server проксирует /api на бэкенд
const DASHBOARD_TOKEN = import.meta.env.VITE_DASHBOARD_TOKEN || 'dev-dashboard-token-change-me'

export const httpClient = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-Dashboard-Token': DASHBOARD_TOKEN,
  },
})

// Прикладываем токен пользовательской сессии, если пользователь вошёл в
// аккаунт — отдельный уровень от X-Dashboard-Token (тот защищает API от
// анонимного доступа в принципе, этот определяет, кто именно сейчас работает).
httpClient.interceptors.request.use((config) => {
  const userToken = localStorage.getItem('ahova_user_token')
  if (userToken) {
    config.headers['X-User-Token'] = userToken
  }
  return config
})

/**
 * ВАЖНО: пути и формы ответов ниже сверены построчно с реальными эндпоинтами
 * бэкенда (backend/src/routers/*.py), а не предполагаются "по аналогии".
 * Раньше почти каждый путь в этом файле был неверным (например /system/info
 * вместо /system, /docker/info вместо /docker/metrics), из-за чего Overview,
 * Docker, Hosts и Processes показывали нули/прочерки при рабочем бэкенде.
 */

// Docker-контейнер, как его отдаёт docker_simple.py: `names` (массив),
// `status`/`state` как текст ("Up 5 minutes"), без плоских cpu_percent на
// верхнем уровне до недавнего фикса бэкенда (теперь есть, см. docker_router).
interface RawDockerContainer {
  id: string
  names: string[]
  image: string
  status: string
  state: string
  created: number
  cpu_percent?: number
  memory_percent?: number
}

function adaptContainer(raw: RawDockerContainer): DockerContainer {
  const name = (raw.names && raw.names[0] ? raw.names[0] : raw.id).replace(/^\//, '')
  const statusLower = (raw.status || '').toLowerCase()
  const state = statusLower.startsWith('up')
    ? 'running'
    : statusLower.startsWith('exited')
    ? 'exited'
    : statusLower.startsWith('paused')
    ? 'paused'
    : 'other'

  return {
    id: raw.id,
    name,
    image: raw.image,
    status: raw.status,
    state,
    created: String(raw.created ?? ''),
    cpu_percent: raw.cpu_percent ?? 0,
    memory_percent: raw.memory_percent ?? 0,
  }
}

interface RawDockerMetrics {
  docker_available: boolean
  engine: {
    version: string
    containers?: number
    containers_running?: number
    containers_stopped?: number
    images?: number
  }
  containers: RawDockerContainer[]
  images: DockerImage[]
  networks: Array<{ id: string; name: string; driver: string }>
  volumes: Array<{ name: string; driver: string; mountpoint: string }>
}

export const api = {
  // Health
  getHealth: async () => {
    const res = await httpClient.get('/health')
    return res.data
  },

  // Agent metrics — GET /api/v1/metrics/latest отдаёт Record<agentId, AgentMetrics>
  // НАПРЯМУЮ, без обёртки {agents: ...}.
  getAgentMetrics: async (): Promise<Record<string, AgentMetrics>> => {
    const res = await httpClient.get('/metrics/latest')
    if (!res.data || res.data.message === 'No metrics available' || res.data.error) {
      return {}
    }
    return res.data as Record<string, AgentMetrics>
  },

  // GET /api/v1/metrics/history?agent_id=...&metric_type=...&limit=...&timeframe=...
  // Возвращает {data_points: [{timestamp, value, time}], statistics, ...}
  getAgentHistory: async (
    agentId: string,
    metricType = 'cpu.usage',
    limit = 100,
    timeframeSeconds = 3600
  ): Promise<Array<{ timestamp: number; value: number; time: string }>> => {
    const res = await httpClient.get('/metrics/history', {
      params: { agent_id: agentId, metric_type: metricType, limit, timeframe: timeframeSeconds },
    })
    return res.data?.data_points || []
  },

  // Docker — GET /api/v1/docker/metrics (не /docker/info — такого пути нет)
  getDockerRaw: async (): Promise<RawDockerMetrics> => {
    const res = await httpClient.get('/docker/metrics')
    return res.data
  },

  getDockerInfo: async (): Promise<DockerInfo> => {
    const raw = await api.getDockerRaw()
    return {
      containers: raw.engine?.containers ?? raw.containers?.length ?? 0,
      containers_running: raw.engine?.containers_running ?? 0,
      containers_stopped: raw.engine?.containers_stopped ?? 0,
      images: raw.engine?.images ?? raw.images?.length ?? 0,
      volumes: raw.volumes?.length ?? 0,
      networks: raw.networks?.length ?? 0,
      engine_version: raw.engine?.version ?? 'N/A',
    }
  },

  // Контейнеры не отдаются отдельным эндпоинтом — они часть /docker/metrics.
  getDockerContainers: async (): Promise<DockerContainer[]> => {
    const raw = await api.getDockerRaw()
    return (raw.containers || []).map(adaptContainer)
  },

  getDockerImages: async (): Promise<DockerImage[]> => {
    const res = await httpClient.get('/docker/images')
    return res.data.images || []
  },

  getDockerNetworks: async (): Promise<Array<{ id: string; name: string; driver: string }>> => {
    const raw = await api.getDockerRaw()
    return raw.networks || []
  },

  getDockerVolumes: async (): Promise<Array<{ name: string; driver: string; mountpoint: string }>> => {
    const raw = await api.getDockerRaw()
    return raw.volumes || []
  },

  scanImage: async (imageName: string): Promise<ScanResult> => {
    const res = await httpClient.post('/docker/image/scan', { image_name: imageName })
    return res.data
  },

  startContainer: async (containerId: string) => {
    const res = await httpClient.post(`/docker/container/${containerId}/start`, null, { timeout: 20000 })
    return res.data
  },

  // stop/restart на бэкенде ждут docker stop -t 10 (до 10с graceful shutdown)
  // + запас времени на сам subprocess (итого до 15с) — таймаут запроса
  // должен быть больше этого, иначе httpClient оборвёт соединение раньше,
  // чем бэкенд успеет ответить, хотя контейнер всё равно остановится.
  stopContainer: async (containerId: string) => {
    const res = await httpClient.post(`/docker/container/${containerId}/stop`, null, { timeout: 20000 })
    return res.data
  },

  restartContainer: async (containerId: string) => {
    const res = await httpClient.post(`/docker/container/${containerId}/restart`, null, { timeout: 20000 })
    return res.data
  },

  deleteContainer: async (containerId: string, force = false) => {
    const res = await httpClient.delete(`/docker/container/${containerId}`, { params: { force } })
    return res.data
  },

  getContainerLogs: async (containerId: string, lines = 200): Promise<string[]> => {
    const res = await httpClient.get(`/docker/container/${containerId}/logs`, { params: { lines } })
    const raw: string = res.data.logs || ''
    return raw.length > 0 ? raw.split('\n') : []
  },

  deleteImage: async (imageId: string) => {
    const res = await httpClient.delete(`/docker/image/${imageId}`)
    return res.data
  },

  deleteNetwork: async (networkId: string) => {
    const res = await httpClient.delete(`/docker/network/${networkId}`)
    return res.data
  },

  deleteVolume: async (volumeName: string) => {
    const res = await httpClient.delete(`/docker/volume/${volumeName}`)
    return res.data
  },

  // System — GET /api/v1/system (НЕ /system/info)
  getSystemInfo: async (): Promise<SystemMetrics> => {
    const res = await httpClient.get('/system')
    return res.data
  },

  // Processes — GET /api/v1/processes (НЕ /system/processes)
  getProcesses: async (): Promise<ProcessInfo[]> => {
    const res = await httpClient.get('/processes', { params: { limit: 100 } })
    return res.data.processes || []
  },

  stopProcess: async (pid: number, force = false) => {
    const res = await httpClient.post(`/process/${pid}/stop`, null, { params: { force } })
    return res.data
  },

  getProcessHistory: async (pid: number, limit = 30) => {
    const res = await httpClient.get(`/process/${pid}/history`, { params: { limit } })
    return res.data?.history || []
  },

  // Security — GET /api/v1/docker/cis/scan (НЕ /cis/benchmark), результат
  // обёрнут в {status, scan_type, result: {...}} — раньше это уже один раз
  // ломало другой экран (CISScanner в старом фронтенде), наступать снова не стоит.
  getCISBenchmark: async (config?: { timeout?: number }): Promise<any> => {
    const res = await httpClient.get('/docker/cis/scan', config)
    return res.data?.result ?? null
  },

  // Alerts / Events — у бэкенда НЕТ этих эндпоинтов вообще (нет движка алертов).
  // Не дергаем несуществующие пути — вместо этого страницы используют общий
  // demo-модуль (see mockData.ts), пока не появится реальный backend для алертов.
  getAlerts: async (): Promise<Alert[]> => {
    return []
  },

  getEvents: async (): Promise<Event[]> => {
    return []
  },

  // User auth — реальные аккаунты (регистрация/вход/сессии) поверх
  // существующего dashboard-токена. См. backend/src/user_auth.py.
  register: async (username: string, email: string, password: string) => {
    const res = await httpClient.post('/auth/register', { username, email, password })
    return res.data as { token: string; user: { id: number; username: string; email: string } }
  },

  login: async (usernameOrEmail: string, password: string) => {
    const res = await httpClient.post('/auth/login', { username_or_email: usernameOrEmail, password })
    return res.data as { token: string; user: { id: number; username: string; email: string } }
  },

  logout: async () => {
    await httpClient.post('/auth/logout')
  },

  getCurrentUser: async () => {
    const res = await httpClient.get('/auth/me')
    return res.data.user as { id: number; username: string; email: string }
  },
}
