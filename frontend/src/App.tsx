import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { 
  Cpu, 
  MemoryStick, 
  Activity, 
  RefreshCw, 
  Server, 
  Wifi,
  HardDrive,
  Network,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  BarChart3,
  Sparkles,
  Zap,
  Sun,
  Moon,
  ToggleLeft,
  ToggleRight,
  ChevronUp,
  ChevronDown,
  User,
  Layers,
  SortAsc,
  SortDesc,
  Square,
} from 'lucide-react'

import DockerDashboard from './components/DockerDashboard'
import { VulnerabilityScanner } from './components/VulnerabilityScanner'
import { GradientCard } from './components/GradientCard'
import { trivyApi } from './services/trivyApi'
import './styles/gradient-background.css'

// Типы для метрик агента
interface AgentMetrics {
  agent_id: string;
  timestamp: number;
  system: {
    hostname: string;
    os: string;
    platform: string;
    kernel_version: string;
    uptime: number;
    boot_time: number;
    num_goroutine: number;
    num_cpu: number;
  };
  cpu: {
    usage: number;
    per_core: number[];
    load_avg: {
      load1: number;
      load5: number;
      load15: number;
    };
  };
  memory: {
    total: number;
    available: number;
    used: number;
    used_percent: number;
    free: number;
    active?: number;
    inactive?: number;
    buffers?: number;
    cached?: number;
    shared?: number;
  };
  disks?: Array<{
    device: string;
    mountpoint: string;
    fstype: string;
    total: number;
    free: number;
    used: number;
    used_percent: number;
    io_stats?: {
      read_count: number;
      write_count: number;
      read_bytes: number;
      write_bytes: number;
      read_time: number;
      write_time: number;
    };
  }>;
  network?: {
    interfaces: Array<{
      name: string;
      bytes_sent: number;
      bytes_recv: number;
      packets_sent: number;
      packets_recv: number;
      err_in: number;
      err_out: number;
      drop_in: number;
      drop_out: number;
      fifo_in: number;
      fifo_out: number;
    }>;
  };
  processes?: Array<{
    pid: number;
    name: string;
    cpu_percent: number;
    memory_percent: number;
    memory_rss: number;
    memory_vms: number;
    status: string;
    create_time: number;
    num_threads: number;
    username?: string;
  }>;
  docker?: {
    containers_running: number;
    containers_stopped: number;
    containers_paused: number;
    containers_total: number;
    images: number;
  };
  temperatures?: Array<{
    sensor_key: string;
    temperature: number;
    high?: number;
    critical?: number;
  }>;
}

interface HealthData {
  status: string
  service: string
  system?: {
    cpu_percent?: number
    memory_percent?: number
    memory_total?: number
    memory_used?: number
    disk_total?: number
    disk_used?: number
    disk_percent?: number
    network_sent?: number
    network_recv?: number
  }
  hostname?: string
  timestamp?: string
  agents?: Array<{
    id: string
    status: string
    last_seen: string
  }>
}

const REFRESH_INTERVAL = 1000
const API_BASE = 'http://localhost:8000/api/v1'

// API сервис для работы с метриками агента
const api = {
  async getAgentMetrics(): Promise<Record<string, AgentMetrics>> {
    try {
      const response = await axios.get(`${API_BASE}/metrics/latest`);
      
      if (response.data && response.data.message === 'No metrics available') {
        return {};
      }
      
      if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
        return response.data as Record<string, AgentMetrics>;
      }
      
      return {};
    } catch (error) {
      console.error('Error fetching agent metrics:', error);
      return {};
    }
  },

  async getAgentHistory(agentId: string, limit: number = 50): Promise<AgentMetrics[]> {
    try {
      const response = await axios.get(`${API_BASE}/metrics/history`, {
        params: { agent_id: agentId, limit }
      });
      return response.data || [];
    } catch (error) {
      console.error('Error fetching agent history:', error);
      return [];
    }
  },

  connectAgentWebSocket(onUpdate: (agentId: string, metrics: AgentMetrics) => void) {
    const ws = new WebSocket('ws://localhost:8000/ws/metrics');
    
    ws.onopen = () => {
      console.log('WebSocket connected for agent metrics');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'metrics_update' && data.data) {
          Object.entries(data.data).forEach(([agentId, metrics]) => {
            onUpdate(agentId, metrics as AgentMetrics);
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    return ws;
  }
};

// Компонент для отображения метрик одного агента
type ProcessSortKey = 'cpu' | 'memory' | 'name';
type SortDirection = 'asc' | 'desc';

interface ProcessSortConfig {
  key: ProcessSortKey;
  direction: SortDirection;
}

const AgentMetricsComponent: React.FC<{ agentId: string; metrics: AgentMetrics }> = ({ agentId, metrics }) => {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<AgentMetrics[]>([]);
  const [processSortConfig, setProcessSortConfig] = useState<ProcessSortConfig>({ key: 'cpu', direction: 'desc' });
  const [showAllProcesses, setShowAllProcesses] = useState(false);
  const [stoppingProcess, setStoppingProcess] = useState<number | null>(null);

  const handleStopProcess = async (pid: number, processName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to stop process "${processName}" (PID: ${pid})? This action cannot be undone and may cause system instability.`
    );
    
    if (!confirmed) return;
    
    setStoppingProcess(pid);
    try {
      const result = await trivyApi.stopProcess(pid, false);
      if (result.status === 'success') {
        alert(`Process stopped: ${result.message}`);
      } else {
        alert(`Error: ${result.message || 'Failed to stop process'}`);
      }
    } catch (error) {
      alert('Error stopping process');
    } finally {
      setStoppingProcess(null);
    }
  };

  useEffect(() => {
    api.getAgentHistory(agentId, 20).then(setHistory);
  }, [agentId]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleTimeString();
  };

  const sortProcesses = (processes: any[]): any[] => {
    const sorted = [...processes];
    
    switch (processSortConfig.key) {
      case 'cpu':
        sorted.sort((a, b) => b.cpu_percent - a.cpu_percent);
        break;
      case 'memory':
        sorted.sort((a, b) => b.memory_percent - a.memory_percent);
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        sorted.sort((a, b) => b.cpu_percent - a.cpu_percent);
    }
    
    if (processSortConfig.direction === 'asc') {
      return sorted.reverse();
    }
    return sorted;
  };

  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl transition-all duration-300 hover:shadow-2xl">
      <div 
        className="p-6 cursor-pointer transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-700/30 rounded-t-2xl"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg">
              <Server className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                {metrics.system.hostname}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {agentId} • {metrics.system.os} ({metrics.system.platform})
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-gray-600 dark:text-gray-400">Last update</p>
              <p className="font-mono text-sm">{formatDate(metrics.timestamp)}</p>
            </div>
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      <div className="p-6 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div className="p-4 bg-gray-100/50 dark:bg-gray-700/30 rounded-xl">
            <div className="flex items-center space-x-2 mb-2">
              <Cpu className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CPU</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {metrics.cpu.usage.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Load: {metrics.cpu.load_avg.load1.toFixed(2)} / {metrics.cpu.load_avg.load5.toFixed(2)} / {metrics.cpu.load_avg.load15.toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600 dark:text-gray-400">Cores</p>
                <p className="font-bold">{metrics.system.num_cpu}</p>
              </div>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${metrics.cpu.usage > 80 ? 'bg-gradient-to-r from-red-500 to-pink-500' : metrics.cpu.usage > 60 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' : 'bg-gradient-to-r from-blue-500 to-cyan-400'}`}
                style={{ width: `${metrics.cpu.usage}%` }}
              />
            </div>
          </div>

          <div className="p-4 bg-gray-100/50 dark:bg-gray-700/30 rounded-xl">
            <div className="flex items-center space-x-2 mb-2">
              <MemoryStick className="w-4 h-4 text-purple-500 dark:text-purple-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Memory</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {metrics.memory.used_percent.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600 dark:text-gray-400">Free</p>
                <p className="font-bold">{formatBytes(metrics.memory.free)}</p>
              </div>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${metrics.memory.used_percent > 80 ? 'bg-gradient-to-r from-red-500 to-pink-500' : metrics.memory.used_percent > 60 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'}`}
                style={{ width: `${metrics.memory.used_percent}%` }}
              />
            </div>
          </div>

          <div className="p-4 bg-gray-100/50 dark:bg-gray-700/30 rounded-xl">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="w-4 h-4 text-green-500 dark:text-green-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Uptime</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatTime(metrics.system.uptime)}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Since {new Date(metrics.system.boot_time * 1000).toLocaleDateString()}
            </p>
          </div>

          <div className="p-4 bg-gray-100/50 dark:bg-gray-700/30 rounded-xl">
            <div className="flex items-center space-x-2 mb-2">
              <Activity className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Goroutines</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {metrics.system.num_goroutine}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Active threads
            </p>
          </div>
        </div>

        {expanded && (
          <div className="mt-6 space-y-6 animate-in fade-in duration-300">
            {metrics.disks && metrics.disks.length > 0 && (
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <HardDrive className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                  <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Disks</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {metrics.disks.slice(0, 4).map((disk, index) => (
                    <div key={index} className="p-4 bg-gray-100/50 dark:bg-gray-700/30 rounded-xl">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {disk.mountpoint}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {disk.device} ({disk.fstype})
                          </p>
                        </div>
                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${disk.used_percent > 90 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : disk.used_percent > 80 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                          {disk.used_percent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                        <div 
                          className={`h-full rounded-full ${disk.used_percent > 90 ? 'bg-gradient-to-r from-red-500 to-pink-500' : disk.used_percent > 80 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`}
                          style={{ width: `${disk.used_percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          Used: {formatBytes(disk.used)}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          Free: {formatBytes(disk.free)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {metrics.docker && (
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Layers className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Docker</h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-xl">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Running</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {metrics.docker.containers_running}
                    </p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-xl">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Stopped</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {metrics.docker.containers_stopped}
                    </p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-xl">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Paused</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {metrics.docker.containers_paused}
                    </p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-gray-500/10 to-gray-600/10 rounded-xl">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                      {metrics.docker.containers_total}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {metrics.processes && metrics.processes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-5 h-5 text-pink-500 dark:text-pink-400" />
                    <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                      Top Processes 
                      <span className="text-sm font-normal text-gray-600 dark:text-gray-400 ml-2">
                        (showing {Math.min(5, metrics.processes.length)} of {metrics.processes.length})
                      </span>
                    </h4>
                  </div>
                  <div className="flex items-center space-x-2">
                    <select
                      value={processSortConfig.key}
                      onChange={(e) => setProcessSortConfig({ ...processSortConfig, key: e.target.value as ProcessSortKey })}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                    >
                      <option value="cpu">Sort by CPU</option>
                      <option value="memory">Sort by Memory</option>
                      <option value="name">Sort by Name</option>
                    </select>
                    <button
                      onClick={() => setProcessSortConfig({ ...processSortConfig, direction: processSortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                      className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-300"
                      title={`Sort ${processSortConfig.direction === 'asc' ? 'descending' : 'ascending'}`}
                    >
                      {processSortConfig.direction === 'asc' ? <SortAsc className="w-4 h-4 text-gray-600 dark:text-gray-400" /> : <SortDesc className="w-4 h-4 text-gray-600 dark:text-gray-400" />}
                    </button>
                    <button
                      onClick={() => setShowAllProcesses(true)}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors duration-300"
                    >
                      View All
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="pb-2">Process</th>
                        <th className="pb-2">CPU</th>
                        <th className="pb-2">Memory</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">User</th>
                        <th className="pb-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortProcesses(metrics.processes).slice(0, 5).map((process) => (
                        <tr key={process.pid} className="border-b border-gray-200/50 dark:border-gray-700/50">
                          <td className="py-3">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[150px]">
                                {process.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500">PID: {process.pid}</p>
                            </div>
                          </td>
                          <td className="py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${process.cpu_percent > 50 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : process.cpu_percent > 20 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                              {process.cpu_percent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                              {process.memory_percent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${process.status === 'running' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'}`}>
                              {process.status}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center">
                              <User className="w-3 h-3 mr-1 text-gray-400" />
                              <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[80px]">
                                {process.username || 'N/A'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            <button
                              onClick={() => handleStopProcess(process.pid, process.name)}
                              disabled={stoppingProcess === process.pid}
                              className="px-3 py-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-lg text-xs font-medium transition-colors duration-300 flex items-center gap-1 mx-auto"
                              title="Stop this process"
                            >
                              <Square className="w-3 h-3" />
                              {stoppingProcess === process.pid ? 'Stopping...' : 'Stop'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {history.length > 0 && (
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                  <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">CPU History</h4>
                </div>
                <div className="h-32 bg-gray-100/50 dark:bg-gray-700/30 rounded-xl p-4">
                  <div className="flex items-end h-full space-x-1">
                    {history.slice(-20).map((item, index) => (
                      <div
                        key={index}
                        className="flex-1 bg-gradient-to-t from-blue-500 to-cyan-400 rounded-t hover:opacity-80 transition-opacity"
                        style={{
                          height: `${Math.min(item.cpu.usage, 100)}%`,
                          opacity: 0.5 + (index / history.slice(-20).length) * 0.5
                        }}
                        title={`${item.cpu.usage.toFixed(1)}% at ${formatDate(item.timestamp)}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модальное окно со всеми процессами */}
      {showAllProcesses && metrics.processes && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            {/* Заголовок модали */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <Activity className="w-5 h-5 text-pink-500 dark:text-pink-400" />
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                  All Processes ({metrics.processes.length})
                </h3>
              </div>
              <button
                onClick={() => setShowAllProcesses(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Контролы сортировки */}
            <div className="flex items-center space-x-2 p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Sort:</span>
              <select
                value={processSortConfig.key}
                onChange={(e) => setProcessSortConfig({ ...processSortConfig, key: e.target.value as ProcessSortKey })}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="cpu">CPU</option>
                <option value="memory">Memory</option>
                <option value="name">Name</option>
              </select>
              <button
                onClick={() => setProcessSortConfig({ ...processSortConfig, direction: processSortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                className="p-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {processSortConfig.direction === 'asc' ? <SortAsc className="w-4 h-4 text-gray-600 dark:text-gray-400" /> : <SortDesc className="w-4 h-4 text-gray-600 dark:text-gray-400" />}
              </button>
            </div>

            {/* Таблица процессов */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Process</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">PID</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">CPU %</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Memory %</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Status</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sortProcesses(metrics.processes).map((process) => (
                    <tr key={process.pid} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-3 text-gray-900 dark:text-gray-100 truncate max-w-xs">
                        <div>
                          <p className="font-medium truncate">{process.name}</p>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-gray-600 dark:text-gray-400">{process.pid}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${process.cpu_percent > 50 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : process.cpu_percent > 20 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                          {process.cpu_percent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          {process.memory_percent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${process.status === 'running' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'}`}>
                          {process.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-600 dark:text-gray-400 truncate">
                        {process.username || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Кнопка закрытия */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setShowAllProcesses(false)}
                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [isOnline, setIsOnline] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [logoGlow, setLogoGlow] = useState(true)
  const [darkMode, setDarkMode] = useState(true)
  const [agentMetrics, setAgentMetrics] = useState<Record<string, AgentMetrics>>({})
  const [agentsList, setAgentsList] = useState<string[]>([])
  const [showAgents, setShowAgents] = useState(true)
  const [dockerMetrics, setDockerMetrics] = useState<any>(null)

  // При загрузке проверяем сохранённую тему
  useEffect(() => {
    const savedTheme = localStorage.getItem('infrawatch-theme')
    if (savedTheme) {
      setDarkMode(savedTheme === 'dark')
    }
  }, [])

  // Применяем тему при изменении
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('infrawatch-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('infrawatch-theme', 'light')
    }
  }, [darkMode])

  const toggleTheme = () => {
    setDarkMode(!darkMode)
  }

  const fetchHealth = useCallback(async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/v1/health')
      const data = response.data
      console.log('Health data received:', data) // Отладка
      setHealth(data)
      setIsOnline(true)
      setError(null)
      setLastUpdate(new Date().toLocaleTimeString())
      
      // Логируем информацию об агентах
      if (data.agents) {
        console.log('Agents from health endpoint:', data.agents)
      }
    } catch (error) {
      console.error('Error fetching health:', error)
      setError('Failed to connect to backend')
      setIsOnline(false)
    }
  }, [])

  const fetchAgentMetrics = useCallback(async () => {
    try {
      const metrics = await api.getAgentMetrics()
      console.log('Agent metrics received:', metrics) // Отладка
      setAgentMetrics(metrics)
      
      const agentIds = Object.keys(metrics)
      console.log('Agent IDs extracted:', agentIds) // Отладка
      
      if (agentIds.length > 0) {
        setAgentsList(agentIds)
      }
    } catch (error) {
      console.error('Error fetching agent metrics:', error)
    }
  }, [])

  const fetchDockerMetrics = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/docker/metrics`)
      console.log('Docker metrics received:', response.data) // Отладка
      setDockerMetrics(response.data)
    } catch (error) {
      console.error('Error fetching docker metrics:', error)
      setDockerMetrics(null)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    fetchAgentMetrics()
    fetchDockerMetrics()
    setLoading(false)
    
    let interval: number | undefined = undefined
    if (autoRefresh) {
      interval = window.setInterval(() => {
        fetchHealth()
        fetchAgentMetrics()
        fetchDockerMetrics()
      }, REFRESH_INTERVAL)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [fetchHealth, fetchAgentMetrics, fetchDockerMetrics, autoRefresh])

  const formatBytes = (bytes: number | undefined): string => {
    if (!bytes || bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'healthy': return <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-green-400" />
      case 'warning': return <AlertCircle className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />
      case 'critical': return <XCircle className="w-5 h-5 text-red-500 dark:text-red-400" />
      default: return <AlertCircle className="w-5 h-5 text-gray-500 dark:text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'healthy': return 'bg-green-500 dark:bg-green-400'
      case 'warning': return 'bg-yellow-500 dark:bg-yellow-400'
      case 'critical': return 'bg-red-500 dark:bg-red-400'
      default: return 'bg-gray-500 dark:bg-gray-400'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 dark:border-blue-500 mx-auto"></div>
          <h1 className="text-2xl font-bold mt-6 text-gray-900 dark:text-white">InfraWatch Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Loading system metrics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent text-gray-900 dark:text-white transition-colors duration-300 relative">
      {/* Градиентный фон с анимированными пятнами */}
      <div className="gradient-background" />
      <div className="gradient-blob-1" />
      <div className="gradient-blob-2" />
      <div className="gradient-blob-3" />
      
      <div className="relative-content">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="relative group">
                {logoGlow && (
                  <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/40 via-purple-500/40 to-cyan-500/40 rounded-2xl blur-xl animate-pulse-glow"></div>
                )}
                
                <div className="relative h-16 w-16 rounded-2xl overflow-hidden bg-white/50 dark:bg-gray-800/50">
                  <div className="absolute inset-0">
                    {[...Array(3)].map((_, i) => (
                      <div 
                        key={i}
                        className="absolute w-1 h-1 bg-blue-400 rounded-full animate-float"
                        style={{
                          left: `${20 + i * 20}%`,
                          top: `${15 + i * 20}%`,
                          animationDelay: `${i * 0.5}s`
                        }}
                      ></div>
                    ))}
                  </div>
                  
                  <img 
                    src="/assets/logo.png" 
                    alt="InfraWatch Logo" 
                    className="h-full w-full object-contain relative z-10 transition-all duration-300 group-hover:scale-105 drop-shadow-lg"
                  />
                  
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/0 via-blue-500/5 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                </div>
                
                <div className="absolute -top-1 -left-1">
                  <Sparkles className="w-3 h-3 text-cyan-500 dark:text-cyan-400 animate-sparkle" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <Sparkles className="w-3 h-3 text-blue-500 dark:text-blue-400 animate-sparkle" style={{ animationDelay: '0.2s' }} />
                </div>
                <div className="absolute -bottom-1 -left-1">
                  <Sparkles className="w-3 h-3 text-purple-500 dark:text-purple-400 animate-sparkle" style={{ animationDelay: '0.4s' }} />
                </div>
                <div className="absolute -bottom-1 -right-1">
                  <Sparkles className="w-3 h-3 text-cyan-500 dark:text-cyan-400 animate-sparkle" style={{ animationDelay: '0.6s' }} />
                </div>
                
                <div className="absolute -bottom-1 -right-1 z-20">
                  <div className={`w-3 h-3 ${isOnline ? 'bg-green-500 dark:bg-green-400' : 'bg-red-500 dark:bg-red-400'} rounded-full animate-ping`}></div>
                  <div className={`absolute inset-0 w-3 h-3 ${isOnline ? 'bg-green-500 dark:bg-green-400' : 'bg-red-500 dark:bg-red-400'} rounded-full animate-pulse`}></div>
                </div>
              </div>
              
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent animate-gradient-text">
                  InfraWatch
                </h1>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Infrastructure Monitoring Platform</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={toggleTheme}
                className="relative px-4 py-2 rounded-lg flex items-center space-x-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title={`Switch to ${darkMode ? 'light' : 'dark'} theme`}
              >
                {darkMode ? (
                  <>
                    <Sun className="w-4 h-4 text-yellow-500" />
                    <span className="hidden sm:inline">Light Mode</span>
                    <ToggleRight className="w-5 h-5 text-blue-500 ml-1" />
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 text-blue-500" />
                    <span className="hidden sm:inline">Dark Mode</span>
                    <ToggleLeft className="w-5 h-5 text-gray-500 ml-1" />
                  </>
                )}
              </button>
              
              <button
                onClick={() => setLogoGlow(!logoGlow)}
                className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${logoGlow ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'} hover:opacity-90 transition-all`}
                title={logoGlow ? 'Disable glow effect' : 'Enable glow effect'}
              >
                <Zap className="w-4 h-4" />
                <span>Glow: {logoGlow ? 'ON' : 'OFF'}</span>
              </button>
              
              <div className={`px-4 py-2 rounded-lg flex items-center space-x-2 ${isOnline ? 'bg-green-100 dark:bg-green-500/20' : 'bg-red-100 dark:bg-red-500/20'}`}>
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 dark:bg-green-400 animate-pulse' : 'bg-red-500 dark:bg-red-400'}`} />
                <span className="font-medium text-gray-700 dark:text-gray-300">{isOnline ? 'System Online' : 'System Offline'}</span>
              </div>
              
              <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{lastUpdate}</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`p-2 rounded-lg ${autoRefresh ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'} hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors`}
                  title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
                >
                  <RefreshCw className={`w-5 h-5 ${autoRefresh ? 'animate-spin' : ''}`} />
                </button>
                
                <button
                  onClick={() => {
                    fetchHealth()
                    fetchAgentMetrics()
                    fetchDockerMetrics()
                  }}
                  className="p-2 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-lg hover:opacity-90 transition-opacity flex items-center space-x-2"
                >
                  <RefreshCw className="w-5 h-5" />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <GradientCard colorScheme="green" className="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-green-500/50 cursor-pointer">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl transition-transform duration-300 group-hover:scale-110">
                  <Server className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-300">System Status</h2>
              </div>
              <div className="transition-transform duration-300 group-hover:scale-125">
                {getStatusIcon(health?.status || 'unknown')}
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Hostname</p>
                <p className="text-lg font-semibold truncate text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{health?.hostname || 'N/A'}</p>
              </div>
              
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Service</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{health?.service || 'InfraWatch API'}</p>
              </div>
              
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Overall Status</p>
                <div className="flex items-center space-x-2 mt-1">
                  <div className={`w-3 h-3 rounded-full transition-transform duration-300 group-hover:scale-125 ${getStatusColor(health?.status || 'unknown')}`} />
                  <span className="text-lg font-semibold capitalize text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{health?.status || 'Unknown'}</span>
                </div>
              </div>
            </div>
          </GradientCard>

          <GradientCard colorScheme="blue" className="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-blue-500/50 cursor-pointer">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl transition-transform duration-300 group-hover:scale-110">
                  <Cpu className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-300">CPU Usage</h2>
              </div>
              <span className={`text-3xl font-bold transition-all duration-300 group-hover:scale-110 ${(health?.system?.cpu_percent || 0) > 80 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {health?.system?.cpu_percent?.toFixed(1) || 0}%
              </span>
            </div>
            
            <div className="mb-6">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${(health?.system?.cpu_percent || 0) > 80 ? 'bg-gradient-to-r from-red-500 to-pink-500' : 'bg-gradient-to-r from-blue-500 to-cyan-400'}`}
                  style={{ width: `${health?.system?.cpu_percent || 0}%` }}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="text-center p-3 bg-gray-100/50 dark:bg-gray-700/30 rounded-lg transition-transform duration-300 group-hover:scale-105">
                <p className="text-gray-600 dark:text-gray-400 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Load</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{health?.system?.cpu_percent?.toFixed(1) || 0}%</p>
              </div>
              <div className="text-center p-3 bg-gray-100/50 dark:bg-gray-700/30 rounded-lg transition-transform duration-300 group-hover:scale-105">
                <p className="text-gray-600 dark:text-gray-400 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Status</p>
                <p className={`text-xl font-bold transition-colors duration-300 ${(health?.system?.cpu_percent || 0) > 80 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {(health?.system?.cpu_percent || 0) > 80 ? 'High' : 'Normal'}
                </p>
              </div>
            </div>
          </GradientCard>

          <GradientCard colorScheme="purple" className="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-purple-500/50 cursor-pointer">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl transition-transform duration-300 group-hover:scale-110">
                  <MemoryStick className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-300">Memory</h2>
              </div>
              <span className={`text-3xl font-bold transition-all duration-300 group-hover:scale-110 ${(health?.system?.memory_percent || 0) > 80 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {health?.system?.memory_percent?.toFixed(1) || 0}%
              </span>
            </div>
            
            <div className="mb-6">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${(health?.system?.memory_percent || 0) > 80 ? 'bg-gradient-to-r from-red-500 to-pink-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'}`}
                  style={{ width: `${health?.system?.memory_percent || 0}%` }}
                />
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between transition-all duration-300 group-hover:translate-x-1">
                <span className="text-gray-600 dark:text-gray-400 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Used</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{formatBytes(health?.system?.memory_used)}</span>
              </div>
              <div className="flex justify-between transition-all duration-300 group-hover:translate-x-1">
                <span className="text-gray-600 dark:text-gray-400 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Total</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{formatBytes(health?.system?.memory_total)}</span>
              </div>
              <div className="flex justify-between transition-all duration-300 group-hover:translate-x-1">
                <span className="text-gray-600 dark:text-gray-400 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Available</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">
                  {formatBytes((health?.system?.memory_total || 0) - (health?.system?.memory_used || 0))}
                </span>
              </div>
            </div>
          </GradientCard>

          <GradientCard colorScheme="yellow" className="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-yellow-500/50 cursor-pointer">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl transition-transform duration-300 group-hover:scale-110">
                  <Wifi className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-300">Connection</h2>
              </div>
              <div className={`w-3 h-3 rounded-full transition-transform duration-300 group-hover:scale-125 ${isOnline ? 'bg-green-500 dark:bg-green-400 animate-pulse' : 'bg-red-500 dark:bg-red-400'}`} />
            </div>
            
            <div className="space-y-4">
              <div className="p-4 bg-gray-100/50 dark:bg-gray-700/30 rounded-xl transition-transform duration-300 group-hover:scale-105">
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Backend Status</p>
                <div className="flex items-center justify-between">
                  <span className={`text-lg font-bold transition-colors duration-300 ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {isOnline ? 'Connected' : 'Disconnected'}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400 text-sm transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Port 8000</span>
                </div>
              </div>
              
              <div className="p-4 bg-gray-100/50 dark:bg-gray-700/30 rounded-xl transition-transform duration-300 group-hover:scale-105">
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Auto-refresh</p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{autoRefresh ? 'Enabled' : 'Disabled'}</span>
                  <span className="text-gray-600 dark:text-gray-400 text-sm transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">{REFRESH_INTERVAL / 1000}s</span>
                </div>
              </div>
              
              <div className="flex items-center justify-center space-x-2 pt-2">
                <div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse transition-transform duration-300 group-hover:scale-125" />
                <span className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Live data streaming</span>
              </div>
            </div>
          </GradientCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <GradientCard colorScheme="green" className="group lg:col-span-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:border-emerald-500/50 cursor-pointer">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl transition-transform duration-300 group-hover:scale-110">
                <HardDrive className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-300">Disk Usage</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600 dark:text-gray-400 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Root Partition</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{health?.system?.disk_percent?.toFixed(1) || 0}%</span>
                </div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden transition-transform duration-300 group-hover:scale-y-110">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-1000"
                    style={{ width: `${health?.system?.disk_percent || 0}%` }}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-100/50 dark:bg-gray-700/30 rounded-lg transition-transform duration-300 group-hover:scale-105">
                  <p className="text-gray-600 dark:text-gray-400 text-sm transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Used</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{formatBytes(health?.system?.disk_used)}</p>
                </div>
                <div className="text-center p-3 bg-gray-100/50 dark:bg-gray-700/30 rounded-lg transition-transform duration-300 group-hover:scale-105">
                  <p className="text-gray-600 dark:text-gray-400 text-sm transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Total</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{formatBytes(health?.system?.disk_total)}</p>
                </div>
                <div className="text-center p-3 bg-gray-100/50 dark:bg-gray-700/30 rounded-lg transition-transform duration-300 group-hover:scale-105">
                  <p className="text-gray-600 dark:text-gray-400 text-sm transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Free</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">
                    {formatBytes((health?.system?.disk_total || 0) - (health?.system?.disk_used || 0))}
                  </p>
                </div>
              </div>
            </div>
          </GradientCard>

          <GradientCard colorScheme="violet" className="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-indigo-500/50 cursor-pointer">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl transition-transform duration-300 group-hover:scale-110">
                <Network className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-300">Network</h2>
            </div>
            
            <div className="space-y-6">
              <div className="transition-all duration-300 group-hover:translate-x-2">
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Upload</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{formatBytes(health?.system?.network_sent)}</span>
                  <span className="text-gray-600 dark:text-gray-400 text-sm transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">total</span>
                </div>
              </div>
              
              <div className="transition-all duration-300 group-hover:translate-x-2">
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Download</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 group-hover:text-gray-950 dark:group-hover:text-white">{formatBytes(health?.system?.network_recv)}</span>
                  <span className="text-gray-600 dark:text-gray-400 text-sm transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">total</span>
                </div>
              </div>
              
              <div className="pt-4 border-t border-gray-300 dark:border-gray-700">
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-pulse transition-transform duration-300 group-hover:scale-125" />
                  <span className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">Cumulative data</span>
                </div>
              </div>
            </div>
          </GradientCard>
        </div>

        {/* Секция с агентами - теперь рендерится всегда; при отсутствии агентов показывает заглушку */}
        <GradientCard colorScheme="violet" className="no-gradient-effect group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:border-violet-500/50 cursor-pointer mb-12">
            <div 
              className="flex items-center justify-between mb-6 cursor-pointer"
              onClick={() => setShowAgents(!showAgents)}
            >
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl transition-transform duration-300 group-hover:scale-110">
                  <Server className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-300">
                    Monitoring Agents
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {agentsList.length > 0 ? agentsList.length : (health?.agents?.length || 0)} agent{((agentsList.length > 0 ? agentsList.length : (health?.agents?.length || 0)) !== 1) ? 's' : ''} connected
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${(agentsList.length > 0 || (health?.agents && health.agents.length > 0)) ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'}`}>
                  {agentsList.length > 0 ? agentsList.length : (health?.agents?.length || 0)} active
                </div>
                {showAgents ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </div>
            
            {showAgents && (
              <div className="space-y-6">
                {/* Показываем агенты из метрик */}
                {agentsList.length > 0 ? (
                  agentsList.map((agentId) => (
                    <AgentMetricsComponent 
                      key={agentId} 
                      agentId={agentId}
                      metrics={agentMetrics[agentId]}
                    />
                  ))
                ) : health?.agents && health.agents.length > 0 ? (
                  // Если нет метрик, показываем простой список из health
                  health.agents.map((agent) => (
                    <div key={agent.id} className="p-6 bg-gray-100/50 dark:bg-gray-700/30 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                            {agent.id}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Status: {agent.status} • Last seen: {new Date(agent.last_seen).toLocaleTimeString()}
                          </p>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${agent.status === 'active' ? 'bg-green-500 dark:bg-green-400' : 'bg-red-500 dark:bg-red-400'}`} />
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                        Detailed metrics not available for this agent
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No agents connected
                  </div>
                )}
              </div>
            )}
        </GradientCard>

        {dockerMetrics && (
          <div className="mt-12">
            <DockerDashboard dockerMetrics={dockerMetrics} />
          </div>
        )}

        <div className="mt-12">
          <VulnerabilityScanner />
        </div>

        {error && (
          <div className="mb-8 p-6 bg-gradient-to-r from-red-100/80 to-red-200/60 dark:from-red-900/30 dark:to-red-800/20 border border-red-300 dark:border-red-700/50 rounded-2xl transition-all duration-300 hover:scale-[1.01] hover:shadow-xl cursor-pointer">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 transition-transform duration-300 hover:scale-125" />
              <div>
                <h3 className="text-lg font-bold text-red-700 dark:text-red-300 transition-colors duration-300 hover:text-red-800 dark:hover:text-red-200">Connection Error</h3>
                <p className="text-red-600/80 dark:text-red-400/80 transition-colors duration-300 hover:text-red-700/90 dark:hover:text-red-300/90">{error}</p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-300 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-lg overflow-hidden bg-white/50 dark:bg-gray-800/50">
                <img 
                  src="/assets/logo.png" 
                  alt="InfraWatch Logo" 
                  className="h-full w-full object-contain drop-shadow"
                />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <p className="font-bold text-lg bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-300 bg-clip-text text-transparent">
                    InfraWatch
                  </p>
                  <span className="text-xs bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded">v2.5</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Infrastructure Monitoring System</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-6 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse" />
                <span className="text-gray-600 dark:text-gray-400">Live</span>
              </div>
              <div className="text-gray-600 dark:text-gray-400">
                Last update: <span className="font-mono">{lastUpdate}</span>
              </div>
              <div className="text-gray-600 dark:text-gray-400">
                Auto-refresh: <span className="font-semibold">{autoRefresh ? 'ON' : 'OFF'}</span>
              </div>
              {(agentsList.length > 0 || (health?.agents && health.agents.length > 0)) && (
                <div className="text-gray-600 dark:text-gray-400">
                  Agents: <span className="font-semibold">{agentsList.length > 0 ? agentsList.length : (health?.agents?.length || 0)}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-800 text-center text-xs text-gray-500 dark:text-gray-400">
            © {new Date().getFullYear()} InfraWatch Monitoring Platform. All system metrics are collected in real-time.
          </div>
        </div>
      </footer>
      </div>
    </div>
  )
}

export default App