export interface AgentMetrics {
  agent_id: string
  timestamp: number
  cpu?: {
    usage: number
    count?: number
    percent?: number
  }
  memory?: {
    used_percent: number
    total?: number
    used?: number
    available?: number
  }
  system?: {
    hostname: string
    os: string
    platform: string
    kernel_version: string
    uptime: number
    boot_time: number
    num_goroutine: number
    num_cpu: number
  }
  disks?: Array<{
    mountpoint: string
    total: number
    used: number
    used_percent: number
  }>
  network?: {
    bytes_sent: number
    bytes_recv: number
    upload_speed?: number
    download_speed?: number
  }
  docker?: {
    containers_running: number
    containers_stopped: number
    containers_total: number
    images_total?: number
    volumes_total?: number
    networks_total?: number
  }
  processes?: Array<{
    pid: number
    name: string
    cpu_percent: number
    memory_percent: number
    status: string
    username?: string
  }>
  battery?: {
    percent: number | null
    seconds_left: number | null
    power_plugged: boolean | null
  }
}

export interface SystemMetrics {
  cpu: {
    percent: number
    count: number
  }
  memory: {
    percent: number
    total: number
    used: number
  }
  disks: Array<{
    mountpoint: string
    total: number
    used: number
    used_percent: number
  }>
  network: {
    bytes_sent: number
    bytes_recv: number
  }
  battery: {
    percent: number | null
    seconds_left: number | null
    power_plugged: boolean | null
  } | null
  system: {
    hostname: string
    uptime: number
    boot_time: number
  }
  timestamp: string
}

export interface DockerContainer {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports?: string
  created: string
  cpu_percent?: number
  memory_percent?: number
  memory_usage?: number
  memory_limit?: number
}

export interface DockerImage {
  id: string
  repo_tags: string[]
  size: number
  created: string
}

export interface DockerInfo {
  containers: number
  containers_running: number
  containers_stopped: number
  images: number
  volumes: number
  networks: number
  engine_version: string
}

export interface Vulnerability {
  id: string
  severity: string
  title: string
  description?: string
  fix?: string
  references?: string[]
  package_name?: string
  installed_version?: string
  fixed_version?: string
}

export interface ScanResult {
  status: string
  image: string
  summary: {
    critical: number
    high: number
    medium: number
    low: number
  }
  vulnerabilities: Vulnerability[]
}

export interface Alert {
  id: string
  type: 'critical' | 'warning' | 'info'
  title: string
  message?: string
  source: string
  timestamp: number
  acknowledged?: boolean
}

export interface ProcessInfo {
  pid: number
  name: string
  cpu_percent: number
  memory_percent: number
  status: string
  username?: string
}

export interface Event {
  id: string
  type: string
  message: string
  source: string
  timestamp: number
}

export interface HostInfo {
  id: string
  hostname: string
  status: 'online' | 'offline' | 'warning'
  cpu_percent: number
  memory_percent: number
  disk_percent: number
  last_seen: number
  version?: string
}