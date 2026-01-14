import React, { useState, useEffect, useRef } from 'react';
import { AgentMetrics as AgentMetricsType } from '../../types/metrics';
import { api } from '../../services/api';
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  Server,
  
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  Layers,
  SortAsc,
  SortDesc
} from 'lucide-react';

interface AgentMetricsProps {
  agentId: string;
  initialMetrics?: AgentMetricsType;
}

type ProcessSortKey = 'cpu' | 'memory' | 'name';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: ProcessSortKey;
  direction: SortDirection;
}

const REFRESH_INTERVAL = 1000; // 1 second, matching main app

const AgentMetrics: React.FC<AgentMetricsProps> = ({ agentId, initialMetrics }) => {
  const [metrics, setMetrics] = useState<AgentMetricsType | null>(initialMetrics || null);
  const [history, setHistory] = useState<AgentMetricsType[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(!initialMetrics);
  const [processSortConfig, setProcessSortConfig] = useState<SortConfig>({ key: 'cpu', direction: 'desc' });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!initialMetrics) {
      fetchMetrics();
    }
    fetchHistory();

    // Set up periodic refresh
    intervalRef.current = setInterval(() => {
      fetchMetrics();
      fetchHistory();
    }, REFRESH_INTERVAL);

    // Clean up interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [agentId]);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const allMetrics = await api.getAgentMetrics();
      if (allMetrics[agentId]) {
        setMetrics(allMetrics[agentId]);
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    const historyData = await api.getAgentHistory(agentId, 20);
    setHistory(historyData);
  };

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

  if (loading) {
    return (
      <div className="animate-pulse bg-gray-100 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="bg-gray-100/50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 text-center">
        <p className="text-gray-500 dark:text-gray-400">No metrics available for agent</p>
      </div>
    );
  }

  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl transition-all duration-300 hover:shadow-2xl">
      {/* Заголовок агента */}
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

      {/* Основные метрики (всегда видны) */}
      <div className="p-6 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {/* CPU */}
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

          {/* Memory */}
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

          {/* Uptime */}
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

          {/* Goroutines */}
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

        {/* Расширенные метрики (раскрываются) */}
        {expanded && (
          <div className="mt-6 space-y-6 animate-in fade-in duration-300">
            {/* Диски */}
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

            {/* Docker */}
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

            {/* Процессы */}
            {metrics.processes && metrics.processes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-5 h-5 text-pink-500 dark:text-pink-400" />
                    <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Top Processes</h4>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* История */}
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
    </div>
  );
};

export default AgentMetrics;