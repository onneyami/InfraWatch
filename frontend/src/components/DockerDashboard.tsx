import React, { useState } from 'react';
import { 
  Package, 
  Server, 
  HardDrive, 
  Network, 
  Layers, 
  Play,
  Pause,
  StopCircle,
  AlertTriangle,
  Cpu,
  MemoryStick,
  Upload,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Search,
  SortAsc,
  SortDesc,
  X,
  Zap
} from 'lucide-react';
import axios from 'axios';

interface DockerDashboardProps {
  dockerMetrics: any;
}

const DockerDashboard: React.FC<DockerDashboardProps> = ({ dockerMetrics }) => {
  const [activeTab, setActiveTab] = useState('containers');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [expandedContainers, setExpandedContainers] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedVolume, setSelectedVolume] = useState<any | null>(null);
  const [containerActionLoading, setContainerActionLoading] = useState<{[key: string]: boolean}>({});
  const [actionMessage, setActionMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);

  if (!dockerMetrics || !dockerMetrics.engine) {
    return (
      <div className="p-8 text-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl">
        <Server className="w-16 h-16 mx-auto text-gray-400 mb-4 transition-transform duration-300 hover:scale-110" />
        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Docker не доступен
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Убедитесь, что Docker демон запущен и доступен
        </p>
      </div>
    );
  }

  // Если Docker доступен, но нет данных (версия указывает на недоступность)
  if (dockerMetrics.engine.version === "Docker not available" || dockerMetrics.engine.version.includes("not available")) {
    return (
      <div className="p-8 text-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:border-yellow-500/30 cursor-pointer">
        <Server className="w-16 h-16 mx-auto text-yellow-500 mb-4 transition-transform duration-300 hover:scale-110" />
        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Docker не доступен
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          {dockerMetrics.engine.version}
        </p>
      </div>
    );
  }

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

  const getContainerStatusColor = (status: string) => {
    if (status.includes('Up') || status === 'running') return 'text-green-500 bg-green-500/10';
    if (status.includes('Paused') || status === 'paused') return 'text-yellow-500 bg-yellow-500/10';
    if (status.includes('Exited') || status === 'exited') return 'text-gray-500 bg-gray-500/10';
    return 'text-red-500 bg-red-500/10';
  };

  const getContainerStatusIcon = (status: string) => {
    if (status.includes('Up') || status === 'running') return <Play className="w-4 h-4" />;
    if (status.includes('Paused') || status === 'paused') return <Pause className="w-4 h-4" />;
    if (status.includes('Exited') || status === 'exited') return <StopCircle className="w-4 h-4" />;
    return <AlertTriangle className="w-4 h-4" />;
  };

  const toggleContainerExpand = (containerId: string) => {
    setExpandedContainers(prev =>
      prev.includes(containerId)
        ? prev.filter(id => id !== containerId)
        : [...prev, containerId]
    );
  };

  const handleContainerAction = async (
    containerId: string,
    action: 'start' | 'stop' | 'restart'
  ) => {
    setContainerActionLoading(prev => ({ ...prev, [containerId]: true }));
    try {
      console.log(`Отправляю ${action} для контейнера:`, containerId);
      const response = await axios.post(
        `http://localhost:8000/api/v1/docker/container/${containerId}/${action}`
      );
      
      console.log(`Ответ на ${action}:`, response.data);
      
      if (response.data.status === 'success') {
        setActionMessage({
          text: `Container ${action} успешно!`,
          type: 'success'
        });
        setTimeout(() => setActionMessage(null), 3000);
      } else {
        setActionMessage({
          text: `Ошибка при ${action}: ${response.data.error || response.data.message}`,
          type: 'error'
        });
      }
    } catch (error: any) {
      console.error(`Ошибка при ${action}:`, error);
      setActionMessage({
        text: `Ошибка: ${error.response?.data?.detail || error.message}`,
        type: 'error'
      });
    } finally {
      setContainerActionLoading(prev => ({ ...prev, [containerId]: false }));
    }
  };

  // Удалить образ
  const handleDeleteImage = async (imageId: string, tag?: string) => {
    const target = tag || imageId;
    const confirmDelete = window.confirm(`Delete image ${target}? This will remove the image from the host.`);
    if (!confirmDelete) return;
    try {
      setIsRefreshing(true);
      const resp = await axios.delete(`http://localhost:8000/api/v1/docker/image/${encodeURIComponent(imageId)}`);
      if (resp.data && resp.data.status === 'success') {
        setActionMessage({ text: `Image deleted: ${target}`, type: 'success' });
        setTimeout(() => setActionMessage(null), 3000);
        // refresh page data simply
        window.location.reload();
      } else {
        setActionMessage({ text: `Failed to delete image: ${resp.data?.message || 'unknown'}`, type: 'error' });
      }
    } catch (err: any) {
      console.error('Error deleting image', err);
      setActionMessage({ text: `Error deleting image: ${err?.response?.data?.detail || err.message}`, type: 'error' });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Удалить volume
  const handleDeleteVolume = async (volumeName: string) => {
    const confirmDelete = window.confirm(`Delete volume ${volumeName}? This will remove data stored in the volume.`);
    if (!confirmDelete) return;
    try {
      setIsRefreshing(true);
      const resp = await axios.delete(`http://localhost:8000/api/v1/docker/volume/${encodeURIComponent(volumeName)}`);
      if (resp.data && resp.data.status === 'success') {
        setActionMessage({ text: `Volume deleted: ${volumeName}`, type: 'success' });
        setTimeout(() => setActionMessage(null), 3000);
        setSelectedVolume(null);
        window.location.reload();
      } else {
        setActionMessage({ text: `Failed to delete volume: ${resp.data?.message || 'unknown'}`, type: 'error' });
      }
    } catch (err: any) {
      console.error('Error deleting volume', err);
      setActionMessage({ text: `Error deleting volume: ${err?.response?.data?.detail || err.message}`, type: 'error' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Здесь будет логика обновления данных
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const sortedContainers = [...(dockerMetrics.containers || [])].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];
    
    if (sortConfig.key === 'state') {
      const order = ['running', 'paused', 'exited', 'dead'];
      const aIndex = order.findIndex(state => a.state.includes(state) || a.state === state);
      const bIndex = order.findIndex(state => b.state.includes(state) || b.state === state);
      return sortConfig.direction === 'asc' 
        ? aIndex - bIndex
        : bIndex - aIndex;
    }
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortConfig.direction === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    
    return 0;
  });

  const filteredContainers = sortedContainers.filter(container =>
    container.names?.some((name: string) =>
      name.toLowerCase().includes(searchTerm.toLowerCase())
    ) ||
    container.image?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    container.status?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    container.state?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Docker Engine Overview */}
      <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-2xl p-6 mb-6 border border-blue-500/20 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg transition-transform duration-300 hover:scale-110">
              <Server className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-300">
                Docker Engine
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Version: {dockerMetrics.engine.version}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 transition-all duration-300 group-hover:scale-110">
              {dockerMetrics.engine.containers_running}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Running Containers
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white/50 dark:bg-gray-800/50 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-pointer">
            <div className="flex items-center space-x-2 mb-2">
              <Package className="w-4 h-4 text-blue-500 transition-transform duration-300 group-hover:scale-125" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Containers</span>
            </div>
            <div className="flex items-end justify-between">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {dockerMetrics.engine.containers}
              </div>
              <div className="text-sm text-gray-500">
                Total
              </div>
            </div>
            <div className="flex items-center space-x-2 mt-2 text-xs">
              <span className="text-green-500 transition-colors duration-300 hover:text-green-600">● {dockerMetrics.engine.containers_running} running</span>
              <span className="text-gray-500 transition-colors duration-300 hover:text-gray-600">● {dockerMetrics.engine.containers_stopped} stopped</span>
            </div>
          </div>

          <div className="p-4 bg-white/50 dark:bg-gray-800/50 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-pointer">
            <div className="flex items-center space-x-2 mb-2">
              <Layers className="w-4 h-4 text-purple-500 transition-transform duration-300 group-hover:scale-125" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Images</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dockerMetrics.engine.images}
            </div>
            <div className="text-xs text-gray-500 mt-2 transition-colors duration-300 hover:text-gray-600">
              Storage: {dockerMetrics.engine.driver}
            </div>
          </div>

          <div className="p-4 bg-white/50 dark:bg-gray-800/50 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-pointer">
            <div className="flex items-center space-x-2 mb-2">
              <Cpu className="w-4 h-4 text-green-500 transition-transform duration-300 group-hover:scale-125" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CPU</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dockerMetrics.engine.n_cpu}
            </div>
            <div className="text-xs text-gray-500 mt-2 transition-colors duration-300 hover:text-gray-600">
              {dockerMetrics.engine.arch}
            </div>
          </div>

          <div className="p-4 bg-white/50 dark:bg-gray-800/50 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg cursor-pointer">
            <div className="flex items-center space-x-2 mb-2">
              <MemoryStick className="w-4 h-4 text-red-500 transition-transform duration-300 group-hover:scale-125" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Memory</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatBytes(dockerMetrics.engine.mem_total)}
            </div>
            <div className="text-xs text-gray-500 mt-2 transition-colors duration-300 hover:text-gray-600">
              Total available
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-700 mt-4">
        {[
          { id: 'containers', label: 'Containers', icon: Package, count: dockerMetrics.containers?.length || 0, color: 'blue' },
          { id: 'images', label: 'Images', icon: Layers, count: dockerMetrics.images?.length || 0, color: 'purple' },
          { id: 'networks', label: 'Networks', icon: Network, count: dockerMetrics.networks?.length || 0, color: 'green' },
          { id: 'volumes', label: 'Volumes', icon: HardDrive, count: dockerMetrics.volumes?.length || 0, color: 'yellow' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-medium rounded-t-lg transition-all duration-300 flex items-center space-x-2 ${
              activeTab === tab.id
                ? `bg-${tab.color}-500 text-white shadow-lg transform translate-y-px`
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label} ({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Containers Tab */}
      {activeTab === 'containers' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center space-x-4">
              <div className="relative transition-all duration-300 hover:scale-105">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search containers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                />
              </div>
              <select
                value={sortConfig.key}
                onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value })}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
              >
                <option value="name">Sort by Name</option>
                <option value="state">Sort by Status</option>
                <option value="image">Sort by Image</option>
              </select>
              <button
                onClick={() => setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-300"
              >
                {sortConfig.direction === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={handleRefresh}
              className={`p-2 rounded-lg transition-all duration-300 ${isRefreshing ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredContainers.map((container) => {
              const containerStats = dockerMetrics.container_stats?.find(
                (stats: any) => stats.id === container.id
              );

              return (
                <div
                  key={container.id}
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-blue-500/30 cursor-pointer"
                >
                  <div
                    className="p-4"
                    onClick={() => toggleContainerExpand(container.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className={`p-2 rounded-lg ${getContainerStatusColor(container.status || container.state)} transition-transform duration-300 hover:scale-110`}>
                            {getContainerStatusIcon(container.status || container.state)}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 hover:text-blue-600 dark:hover:text-blue-400">
                              {container.names?.[0] || 'Unnamed'}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {container.image}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 text-sm">
                          <span className="text-gray-600 dark:text-gray-400">
                            ID: {container.id}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getContainerStatusColor(container.status || container.state)} transition-all duration-300 hover:scale-105`}>
                            {container.state}
                          </span>
                        </div>
                      </div>
                      <div className="transition-transform duration-300 hover:scale-125">
                        {expandedContainers.includes(container.id) ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {expandedContainers.includes(container.id) && (
                    <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-4 animate-in slide-in-from-top duration-300">
                      {/* Container Details */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Command</p>
                          <p className="font-mono text-sm truncate transition-all duration-300 hover:text-gray-900 dark:hover:text-gray-100" title={container.command}>
                            {container.command || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Created</p>
                          <p className="text-sm transition-colors duration-300 hover:text-gray-900 dark:hover:text-gray-100">
                            {new Date(container.created * 1000).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Container Stats */}
                      {containerStats && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm text-gray-600 dark:text-gray-400">CPU</span>
                                <span className="font-bold transition-all duration-300 hover:scale-110">{containerStats.cpu_percent.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden transition-all duration-300 hover:scale-y-110">
                                <div
                                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(containerStats.cpu_percent, 100)}%` }}
                                />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm text-gray-600 dark:text-gray-400">Memory</span>
                                <span className="font-bold transition-all duration-300 hover:scale-110">{containerStats.memory_percent.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden transition-all duration-300 hover:scale-y-110">
                                <div
                                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(containerStats.memory_percent, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600 dark:text-gray-400">Network</p>
                              <div className="flex items-center space-x-2">
                                <Download className="w-4 h-4 text-blue-500 transition-transform duration-300 hover:scale-110" />
                                <span className="transition-colors duration-300 hover:text-gray-900 dark:hover:text-gray-100">{formatBytes(containerStats.network_rx)}</span>
                                <Upload className="w-4 h-4 text-green-500 ml-2 transition-transform duration-300 hover:scale-110" />
                                <span className="transition-colors duration-300 hover:text-gray-900 dark:hover:text-gray-100">{formatBytes(containerStats.network_tx)}</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-gray-600 dark:text-gray-400">Block I/O</p>
                              <div className="flex items-center space-x-2">
                                <Download className="w-4 h-4 text-yellow-500 transition-transform duration-300 hover:scale-110" />
                                <span className="transition-colors duration-300 hover:text-gray-900 dark:hover:text-gray-100">{formatBytes(containerStats.block_read)}</span>
                                <Upload className="w-4 h-4 text-red-500 ml-2 transition-transform duration-300 hover:scale-110" />
                                <span className="transition-colors duration-300 hover:text-gray-900 dark:hover:text-gray-100">{formatBytes(containerStats.block_write)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600 dark:text-gray-400">Restarts</p>
                              <p className="font-bold transition-all duration-300 hover:scale-110">{containerStats.restart_count}</p>
                            </div>
                            <div>
                              <p className="text-gray-600 dark:text-gray-400">Uptime</p>
                              <p className="font-bold transition-all duration-300 hover:scale-110">{formatTime(containerStats.uptime)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 flex-wrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContainerAction(container.id, 'start');
                          }}
                          disabled={containerActionLoading[container.id] || (container.state === 'running' || container.state?.includes('Up'))}
                          className="flex items-center gap-2 px-3 py-2 bg-green-500/20 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
                        >
                          <Play className="w-4 h-4" />
                          <span className="text-sm font-medium">Start</span>
                        </button>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContainerAction(container.id, 'stop');
                          }}
                          disabled={containerActionLoading[container.id] || (container.state !== 'running' && !container.state?.includes('Up'))}
                          className="flex items-center gap-2 px-3 py-2 bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
                        >
                          <StopCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">Stop</span>
                        </button>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContainerAction(container.id, 'restart');
                          }}
                          disabled={containerActionLoading[container.id]}
                          className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
                        >
                          <Zap className="w-4 h-4" />
                          <span className="text-sm font-medium">Restart</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Images Tab */}
      {activeTab === 'images' && dockerMetrics.images && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-300">
          {dockerMetrics.images.map((image: any) => {
            const sizeVal = image.size || image.virtual_size || image.virtualSize || image.virtual || 0;
            return (
              <div
                key={image.id}
                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-purple-500/30 cursor-pointer overflow-hidden"
              >
                <div className="flex items-start space-x-3 mb-3">
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg transition-transform duration-300 hover:scale-110">
                    <Layers className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 dark:text-gray-100 truncate transition-colors duration-300 hover:text-purple-600 dark:hover:text-purple-400 max-w-[220px]">
                      {image.repo_tags?.[0] || 'untagged'}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">ID: {image.id}</p>
                  </div>
                </div>
                  <div className="space-y-2 text-sm">
                  <div className="flex justify-between transition-all duration-300 hover:translate-x-1">
                    <span className="text-gray-600 dark:text-gray-400">Content Size</span>
                    <span className="font-bold transition-all duration-300 hover:scale-110">{sizeVal > 0 ? formatBytes(sizeVal) : 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between transition-all duration-300 hover:translate-x-1">
                    <span className="text-gray-600 dark:text-gray-400">Disk Usage</span>
                    <span className="font-bold transition-all duration-300 hover:scale-110">{image.disk_usage ? formatBytes(image.disk_usage) : 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between transition-all duration-300 hover:translate-x-1">
                    <span className="text-gray-600 dark:text-gray-400">Created</span>
                    <span className="transition-colors duration-300 hover:text-gray-900 dark:hover:text-gray-100">{image.created ? new Date(image.created * 1000).toLocaleDateString() : '—'}</span>
                  </div>
                  <div className="flex justify-between transition-all duration-300 hover:translate-x-1">
                    <span className="text-gray-600 dark:text-gray-400">Containers</span>
                    <span className="font-bold transition-all duration-300 hover:scale-110">{image.containers}</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end space-x-2">
                  <button
                    onClick={() => handleDeleteImage(image.id, image.repo_tags?.[0])}
                    className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-all duration-200"
                  >
                    Delete Image
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Networks Tab */}
      {activeTab === 'networks' && dockerMetrics.networks && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-300">
          {dockerMetrics.networks.map((network: any) => (
            <div
              key={network.id}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-green-500/30 cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${
                    network.driver === 'bridge' 
                      ? 'bg-blue-500/10 text-blue-500' 
                      : network.driver === 'overlay'
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-gray-500/10 text-gray-500'
                  } transition-transform duration-300 hover:scale-110`}>
                    <Network className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 hover:text-green-600 dark:hover:text-green-400">
                      {network.name}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {network.driver} • {network.scope}
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  network.enable_ipv6
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-gray-500/10 text-gray-500'
                } transition-all duration-300 hover:scale-105`}>
                  IPv6: {network.enable_ipv6 ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between transition-all duration-300 hover:translate-x-1">
                  <span className="text-gray-600 dark:text-gray-400">Containers</span>
                  <span className="font-bold transition-all duration-300 hover:scale-110">
                    {Object.keys(network.containers || {}).length}
                  </span>
                </div>
                <div className="flex justify-between transition-all duration-300 hover:translate-x-1">
                  <span className="text-gray-600 dark:text-gray-400">Internal</span>
                  <span className="transition-colors duration-300 hover:text-gray-900 dark:hover:text-gray-100">{network.internal ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between transition-all duration-300 hover:translate-x-1">
                  <span className="text-gray-600 dark:text-gray-400">Created</span>
                  <span className="transition-colors duration-300 hover:text-gray-900 dark:hover:text-gray-100">{new Date(network.created).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Volumes Tab */}
      {activeTab === 'volumes' && dockerMetrics.volumes && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-300">
          {dockerMetrics.volumes.map((volume: any) => (
            <div
              key={volume.name}
              onClick={() => setSelectedVolume(volume)}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-yellow-500/30 cursor-pointer overflow-hidden"
            >
              <div className="flex items-start space-x-3 mb-3">
                <div className="p-2 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg transition-transform duration-300 hover:scale-110">
                  <HardDrive className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 hover:text-yellow-600 dark:hover:text-yellow-400 truncate max-w-[260px] break-words">
                    {volume.name}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate break-all max-w-[260px]">
                    {volume.mountpoint}
                  </p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between transition-all duration-300 hover:translate-x-1">
                  <span className="text-gray-600 dark:text-gray-400">Driver</span>
                  <span className="font-mono transition-colors duration-300 hover:text-gray-900 dark:hover:text-gray-100">{volume.driver}</span>
                </div>
                <div className="flex justify-between transition-all duration-300 hover:translate-x-1">
                  <span className="text-gray-600 dark:text-gray-400">Scope</span>
                  <span className="transition-colors duration-300 hover:text-gray-900 dark:hover:text-gray-100">{volume.scope}</span>
                </div>
                {volume.usage_data && (
                  <div className="flex justify-between transition-all duration-300 hover:translate-x-1">
                    <span className="text-gray-600 dark:text-gray-400">Size</span>
                    <span className="font-bold transition-all duration-300 hover:scale-110">{volume.usage_data && volume.usage_data.size ? formatBytes(volume.usage_data.size) : 'Unknown'}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Volume Details Modal */}
      {selectedVolume && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 animate-in zoom-in duration-300">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl">
                  <HardDrive className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 max-w-[260px] break-words whitespace-normal">
                    {selectedVolume.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Volume Details</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedVolume(null)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-300 hover:scale-110"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Full Name</p>
                <p className="font-mono text-sm text-gray-900 dark:text-gray-100 break-words break-all whitespace-normal">
                  {selectedVolume.name}
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Mount Path</p>
                <p className="font-mono text-sm text-gray-900 dark:text-gray-100 break-all">
                  {selectedVolume.mountpoint || 'N/A'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Driver</p>
                  <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                    {selectedVolume.driver || 'N/A'}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Scope</p>
                  <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                    {selectedVolume.scope || 'N/A'}
                  </p>
                </div>
              </div>

              {selectedVolume.usage_data && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Size</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {formatBytes(selectedVolume.usage_data.size || 0)}
                  </p>
                </div>
              )}

              {selectedVolume.labels && Object.keys(selectedVolume.labels).length > 0 && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Labels</p>
                  <div className="space-y-1">
                    {Object.entries(selectedVolume.labels).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">{key}:</span>
                        <span className="text-gray-900 dark:text-gray-100 font-mono">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedVolume(null)}
              className="w-full mt-4 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-600 text-white rounded-lg hover:from-yellow-600 hover:to-orange-700 transition-all duration-300 hover:scale-105 font-medium"
            >
              Close
            </button>
            <button
              onClick={() => handleDeleteVolume(selectedVolume.name)}
              className="w-full mt-3 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200 font-medium"
            >
              Delete Volume
            </button>
          </div>
        </div>
      )}

      {/* Action Message Toast */}
      {actionMessage && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-40 animate-in slide-in-from-bottom duration-300 ${
          actionMessage.type === 'success'
            ? 'bg-green-500/90 text-white'
            : 'bg-red-500/90 text-white'
        }`}>
          <p className="font-medium">{actionMessage.text}</p>
        </div>
      )}
    </div>
  );
};

export default DockerDashboard;