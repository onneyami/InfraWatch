import React, { useState, useEffect, useRef } from 'react';
import {
  Package,
  Layers,
  Network,
  HardDrive,
  Server,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Trash2,
  FileText,
  X,
  Play,
} from 'lucide-react';
import axios from 'axios';

interface DockerDashboardLightProps {
  data: any;
}

const DockerDashboardLight: React.FC<DockerDashboardLightProps> = ({ data: dockerMetrics }) => {
  const [activeTab, setActiveTab] = useState('containers');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Logs state
  const [logsContainer, setLogsContainer] = useState<{ id: string; name: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsStreaming, setLogsStreaming] = useState(false);
  const [logLines, setLogLines] = useState(100);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  if (!dockerMetrics || !dockerMetrics.engine) {
    return (
      <div className="docker-unavailable">
        <AlertCircle className="w-8 h-8" />
        <h3>Docker недоступен</h3>
        <p>Убедитесь, что Docker демон запущен</p>
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

  const getContainerStatus = (state: string | object): { label: string; color: string } => {
    const status = typeof state === 'string' ? state : state?.toString() || '';
    if (status.includes('Up') || status === 'running') return { label: 'Running', color: 'success' };
    if (status.includes('Paused') || status === 'paused') return { label: 'Paused', color: 'warning' };
    if (status.includes('Exited') || status === 'exited') return { label: 'Stopped', color: 'gray' };
    return { label: 'Unknown', color: 'error' };
  };

  const toggleContainerExpand = (id: string) => {
    const newSet = new Set(expandedContainers);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedContainers(newSet);
  };

  const handleContainerAction = async (containerId: string, action: 'start' | 'stop' | 'restart' | 'pause') => {
    setIsRefreshing(true);
    try {
      const response = await axios.post(`http://localhost:8000/api/v1/docker/container/${containerId}/${action}`);
      if (response.data.status === 'success') {
        setActionMessage({
          text: `Container ${action}ed successfully!`,
          type: 'success',
        });
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (error: any) {
      setActionMessage({
        text: `Error: ${error?.response?.data?.detail || error.message}`,
        type: 'error',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!window.confirm(`Delete image ${imageId}?`)) return;
    setIsRefreshing(true);
    try {
      const response = await axios.delete(`http://localhost:8000/api/v1/docker/image/${encodeURIComponent(imageId)}`);
      if (response.data.status === 'success') {
        setActionMessage({
          text: 'Image deleted successfully!',
          type: 'success',
        });
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error: any) {
      setActionMessage({
        text: `Error: ${error?.response?.data?.detail || error.message}`,
        type: 'error',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteVolume = async (volumeName: string) => {
    if (!window.confirm(`Delete volume "${volumeName}"? This action cannot be undone.`)) return;
    setIsRefreshing(true);
    try {
      const response = await axios.delete(`http://localhost:8000/api/v1/docker/volume/${encodeURIComponent(volumeName)}`);
      if (response.data.status === 'success') {
        setActionMessage({
          text: `Volume "${volumeName}" deleted successfully!`,
          type: 'success',
        });
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error: any) {
      setActionMessage({
        text: `Error: ${error?.response?.data?.detail || error.message}`,
        type: 'error',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteNetwork = async (networkIdOrName: string) => {
    if (!window.confirm(`Delete network "${networkIdOrName}"? This action cannot be undone.`)) return;
    setIsRefreshing(true);
    try {
      const response = await axios.delete(`http://localhost:8000/api/v1/docker/network/${encodeURIComponent(networkIdOrName)}`);
      if (response.data.status === 'success') {
        setActionMessage({
          text: `Network "${networkIdOrName}" deleted successfully!`,
          type: 'success',
        });
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error: any) {
      setActionMessage({
        text: `Error: ${error?.response?.data?.detail || error.message}`,
        type: 'error',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter data based on search term
  // Filter out empty containers (where id is empty or names[0] is "Command")
  const validContainers = (dockerMetrics.containers || []).filter(
    (c: any) => c.id && c.id.trim() !== '' && (c.names?.[0] !== 'Command')
  );

  const filteredContainers = validContainers.filter(
    (c: any) =>
      (c.names?.[0] || c.name || c.id)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.image?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredImages = (dockerMetrics.images || []).filter(
    (img: any) =>
      img.repo_tags?.[0]?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      img.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredNetworks = (dockerMetrics.networks || []).filter(
    (net: any) => net && net.name && net.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredVolumes = (dockerMetrics.volumes || []).filter(
    (vol: any) => vol && vol.name && vol.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate disk usage from all containers and images
  const getDiskUsage = () => {
    let totalSize = 0;
    let containerCount = 0;
    let imageSize = 0;

    // Sum image sizes
    (dockerMetrics.images || []).forEach((img: any) => {
      imageSize += img.size || 0;
    });

    // Get container count
    containerCount = validContainers.length;

    totalSize = imageSize;
    return {
      totalSize,
      containerCount,
      imageSize,
      formatted: formatBytes(totalSize),
    };
  };

  const diskUsage = getDiskUsage();

  // Fetch container logs
  const fetchLogs = async (containerId: string) => {
    setLogsLoading(true);
    setLogsError(null);
    setLogs([]);
    
    try {
      const response = await axios.get(
        `http://localhost:8000/api/v1/docker/container/${containerId}/logs`,
        { params: { lines: logLines, timestamps: true } }
      );
      
      setLogs(response.data.logs || []);
    } catch (error: any) {
      setLogsError(error?.response?.data?.detail || error.message || 'Failed to fetch logs');
    } finally {
      setLogsLoading(false);
    }
  };

  // Start streaming logs
  const startLogStream = (containerId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    setLogsStreaming(true);
    setLogs([]);
    
    const eventSource = new EventSource(
      `http://localhost:8000/api/v1/docker/container/${containerId}/logs/stream?lines=${logLines}`
    );
    
    eventSource.onmessage = (event) => {
      setLogs(prev => [...prev, event.data]);
    };
    
    eventSource.onerror = () => {
      setLogsError('Connection lost or container stopped');
      setLogsStreaming(false);
      eventSource.close();
    };
    
    eventSourceRef.current = eventSource;
  };

  // Stop streaming logs
  const stopLogStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setLogsStreaming(false);
  };

  // Open logs modal
  const openLogs = (containerId: string, containerName: string) => {
    setLogsContainer({ id: containerId, name: containerName });
    fetchLogs(containerId);
  };

  // Close logs modal
  const closeLogs = () => {
    stopLogStream();
    setLogsContainer(null);
    setLogs([]);
    setLogsError(null);
  };

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const tabs = [
    { id: 'containers', label: 'Containers', count: validContainers.length, icon: Package },
    { id: 'images', label: 'Images', count: dockerMetrics.images?.length || 0, icon: Layers },
    { id: 'networks', label: 'Networks', count: dockerMetrics.networks?.length || 0, icon: Network },
    { id: 'volumes', label: 'Volumes', count: dockerMetrics.volumes?.length || 0, icon: HardDrive },
    { id: 'disk-usage', label: 'Disk Usage', count: 1, icon: HardDrive },
    { id: 'connection', label: 'Connection', count: 1, icon: Network },
  ];

  return (
    <div className="docker-dashboard-light">
      {/* Action Message */}
      {actionMessage && (
        <div className={`action-message ${actionMessage.type}`}>
          {actionMessage.text}
        </div>
      )}

      {/* Docker Engine Overview Card */}
      <div className="docker-engine-card">
        <div className="engine-header">
          <div className="engine-info">
            <div className="engine-icon">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h3>Docker Engine</h3>
              <p>Version: {dockerMetrics.engine.version}</p>
            </div>
          </div>
          <div className="engine-running">
            <div className="running-number">{dockerMetrics.engine.containers_running}</div>
            <div className="running-label">Running</div>
          </div>
        </div>

        <div className="engine-stats">
          <div className="stat-box">
            <div className="stat-icon containers">
              <Package className="w-5 h-5" />
            </div>
            <div className="stat-content">
              <div className="stat-number">{dockerMetrics.engine.containers}</div>
              <div className="stat-label">Containers</div>
              <div className="stat-detail">
                {dockerMetrics.engine.containers_running} running, {dockerMetrics.engine.containers_stopped} stopped
              </div>
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-icon images">
              <Layers className="w-5 h-5" />
            </div>
            <div className="stat-content">
              <div className="stat-number">{dockerMetrics.engine.images}</div>
              <div className="stat-label">Images</div>
              <div className="stat-detail">Storage: {dockerMetrics.engine.driver || 'overlay2'}</div>
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-icon network">
              <Network className="w-5 h-5" />
            </div>
            <div className="stat-content">
              <div className="stat-number">{dockerMetrics.networks?.length || 0}</div>
              <div className="stat-label">Networks</div>
              <div className="stat-detail">Connected</div>
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-icon volumes">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="stat-content">
              <div className="stat-number">{dockerMetrics.volumes?.length || 0}</div>
              <div className="stat-label">Volumes</div>
              <div className="stat-detail">Storage</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="docker-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`docker-tab ${activeTab === tab.id ? 'active' : ''}`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              <span className="tab-count">({tab.count})</span>
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="search-bar">
        <Search className="search-icon" />
        <input
          type="text"
          placeholder={`Search ${activeTab}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <button
          onClick={() => window.location.reload()}
          className="refresh-btn"
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'spinning' : ''}`} />
        </button>
      </div>

      {/* Content Sections */}
      {activeTab === 'containers' && (
        <div className="docker-content">
          {filteredContainers.length === 0 ? (
            <div className="empty-state">
              <Package className="w-8 h-8" />
              <p>No containers found</p>
            </div>
          ) : (
            <div className="containers-grid">
              {filteredContainers.map((container: any) => {
                const isExpanded = expandedContainers.has(container.id);
                const status = getContainerStatus(container.state || container.status);

                return (
                  <div key={container.id} className="container-card">
                    <div
                      className="container-header"
                      onClick={() => toggleContainerExpand(container.id)}
                    >
                      <div className="container-info">
                        <div className={`status-badge ${status.color}`}>{status.label}</div>
                        <div className="container-name">
                          {(container.names?.[0] || container.name || container.id.substring(0, 12)) || '—'}
                        </div>
                      </div>
                      <div className="expand-btn">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="container-details">
                        <div className="detail-item">
                          <span className="detail-label">Image</span>
                          <span className="detail-value">{container.image || '—'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">ID</span>
                          <span className="detail-value">{container.id?.substring(0, 12) || '—'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Command</span>
                          <span className="detail-value">{container.command || '—'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Created</span>
                          <span className="detail-value">{container.created_at || '—'}</span>
                        </div>

                        {status.label === 'Running' && (
                          <div className="action-buttons">
                            <button
                              onClick={() => openLogs(container.id, container.names?.[0] || container.id.substring(0, 12))}
                              className="btn btn-action"
                              title="View logs"
                            >
                              <FileText className="w-3 h-3" />
                              Logs
                            </button>
                            <button
                              onClick={() => handleContainerAction(container.id, 'restart')}
                              className="btn btn-action"
                              disabled={isRefreshing}
                            >
                              Restart
                            </button>
                            <button
                              onClick={() => handleContainerAction(container.id, 'stop')}
                              className="btn btn-danger"
                              disabled={isRefreshing}
                            >
                              Stop
                            </button>
                          </div>
                        )}

                        {status.label === 'Stopped' && (
                          <div className="action-buttons">
                            <button
                              onClick={() => openLogs(container.id, container.names?.[0] || container.id.substring(0, 12))}
                              className="btn btn-action"
                              title="View logs"
                            >
                              <FileText className="w-3 h-3" />
                              Logs
                            </button>
                            <button
                              onClick={() => handleContainerAction(container.id, 'start')}
                              className="btn btn-action"
                              disabled={isRefreshing}
                            >
                              Start
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'images' && (
        <div className="docker-content">
          {filteredImages.length === 0 ? (
            <div className="empty-state">
              <Layers className="w-8 h-8" />
              <p>No images found</p>
            </div>
          ) : (
            <div className="images-grid">
              {filteredImages.map((image: any) => (
                <div key={image.id} className="image-card">
                  <div className="image-header">
                    <div className="image-name">{image.repo_tags?.[0] || image.id.substring(0, 20)}</div>
                    <button
                      onClick={() => handleDeleteImage(image.id)}
                      className="btn-delete-red"
                      disabled={isRefreshing}
                      title="Delete image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                  <div className="image-details">
                    <div className="detail-item">
                      <span className="detail-label">ID</span>
                      <span className="detail-value">{image.id.substring(0, 12)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Size</span>
                      <span className="detail-value">{formatBytes(image.size || 0)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Created</span>
                      <span className="detail-value">{image.created || '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'networks' && (
        <div className="docker-content">
          {filteredNetworks.length === 0 ? (
            <div className="empty-state">
              <Network className="w-8 h-8" />
              <p>No networks found</p>
            </div>
          ) : (
            <div className="networks-grid">
              {filteredNetworks.map((network: any) => (
                <div key={network.name} className="network-card">
                  <div className="network-header">
                    <h4>{network.name}</h4>
                    <div className="network-header-right">
                      <span className="network-type">{network.driver}</span>
                      <div className="network-header-actions">
                        <button
                          onClick={() => handleDeleteNetwork(network.id || network.name)}
                          className="btn-delete-red"
                          title="Delete network"
                          aria-label={`Delete network ${network.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="network-details">
                    <div className="detail-item">
                      <span className="detail-label">Driver</span>
                      <span className="detail-value">{network.driver}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Containers</span>
                      <span className="detail-value">{Object.keys(network.containers || {}).length}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Scope</span>
                      <span className="detail-value">{network.scope || 'local'}</span>
                    </div>
                  </div>
                  {/* delete button moved to header for visibility */}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'volumes' && (
        <div className="docker-content">
          {filteredVolumes.length === 0 ? (
            <div className="empty-state">
              <HardDrive className="w-8 h-8" />
              <p>No volumes found</p>
            </div>
          ) : (
            <div className="volumes-grid">
              {filteredVolumes.map((volume: any) => (
                <div key={volume.name} className="volume-card">
                  <div className="volume-header">
                    <h4>{volume.name}</h4>
                  </div>
                  <div className="volume-details">
                    <div className="detail-item">
                      <span className="detail-label">Driver</span>
                      <span className="detail-value">{volume.driver}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Mountpoint</span>
                      <span className="detail-value">{volume.mountpoint || 'N/A'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Scope</span>
                      <span className="detail-value">{volume.scope || 'local'}</span>
                    </div>
                  </div>
                  <div className="volume-actions">
                    <button
                      onClick={() => handleDeleteVolume(volume.name)}
                      className="action-btn delete-btn"
                      title="Delete volume"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'disk-usage' && (
        <div className="docker-content">
          <div className="disk-usage-container">
            <div className="disk-usage-card">
              <h4>Storage Usage</h4>
              <div className="usage-metric">
                <div className="metric-label">Total Size</div>
                <div className="metric-value">{diskUsage.formatted}</div>
              </div>
              <div className="usage-metric">
                <div className="metric-label">Images</div>
                <div className="metric-value">{formatBytes(diskUsage.imageSize)}</div>
              </div>
              <div className="usage-metric">
                <div className="metric-label">Containers</div>
                <div className="metric-value">{diskUsage.containerCount}</div>
              </div>
            </div>

            <div className="images-breakdown">
              <h4>Images Breakdown</h4>
              {dockerMetrics.images && dockerMetrics.images.length > 0 ? (
                <div className="breakdown-list">
                  {dockerMetrics.images.map((img: any) => (
                    <div key={img.id} className="breakdown-item">
                      <div className="item-name">
                        {img.tags && img.tags.length > 0 ? img.tags[0] : 'unnamed'}
                      </div>
                      <div className="item-size">{formatBytes(img.size || 0)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <HardDrive className="w-8 h-8" />
                  <p>No images found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'connection' && (
        <div className="docker-content">
          <div className="connection-container">
            <div className="connection-card">
              <div className="connection-header">
                <Network className="w-5 h-5" />
                <h4>Docker Daemon</h4>
              </div>
              <div className="connection-details">
                <div className="detail-item">
                  <span className="detail-label">Status</span>
                  <span className="detail-value status-running">Running</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Version</span>
                  <span className="detail-value">{dockerMetrics.engine.version}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">API Version</span>
                  <span className="detail-value">{dockerMetrics.engine.api_version || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Containers Running</span>
                  <span className="detail-value">{dockerMetrics.engine.containers_running}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Total Containers</span>
                  <span className="detail-value">{dockerMetrics.engine.containers_total}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Total Images</span>
                  <span className="detail-value">{dockerMetrics.engine.images}</span>
                </div>
              </div>
            </div>

            <div className="network-stats-card">
              <h4>Container Networks</h4>
              {filteredNetworks.length > 0 ? (
                <div className="network-stats-list">
                  {filteredNetworks.slice(0, 5).map((net: any) => (
                    <div key={net.id} className="network-stat-item">
                      <div className="network-icon">
                        <Network className="w-4 h-4" />
                      </div>
                      <div className="network-info">
                        <div className="network-name">{net.name}</div>
                        <div className="network-driver">{net.driver || 'bridge'}</div>
                      </div>
                      <div className="container-count">
                        {Object.keys(net.containers || {}).length}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Network className="w-8 h-8" />
                  <p>No networks found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Logs Modal */}
      {logsContainer && (
        <div className="logs-modal-overlay" onClick={closeLogs}>
          <div className="logs-modal" onClick={e => e.stopPropagation()}>
            <div className="logs-modal-header">
              <div className="logs-modal-title">
                <FileText className="w-5 h-5" />
                <h3>Logs: {logsContainer.name}</h3>
              </div>
              <div className="logs-modal-controls">
                <select 
                  value={logLines} 
                  onChange={e => setLogLines(Number(e.target.value))}
                  className="logs-lines-select"
                >
                  <option value={50}>50 lines</option>
                  <option value={100}>100 lines</option>
                  <option value={200}>200 lines</option>
                  <option value={500}>500 lines</option>
                  <option value={1000}>1000 lines</option>
                </select>
                {!logsStreaming ? (
                  <button
                    onClick={() => startLogStream(logsContainer.id)}
                    className="btn-stream"
                    title="Stream logs in real-time"
                  >
                    <Play className="w-4 h-4" />
                    Stream
                  </button>
                ) : (
                  <button
                    onClick={stopLogStream}
                    className="btn-stream active"
                  >
                    <div className="stream-indicator" />
                    Streaming...
                  </button>
                )}
                <button onClick={() => fetchLogs(logsContainer.id)} className="btn-refresh-logs">
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button onClick={closeLogs} className="btn-close-logs">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="logs-modal-body">
              {logsLoading && logs.length === 0 ? (
                <div className="logs-loading">
                  <RefreshCw className="w-6 h-6 spinning" />
                  <span>Loading logs...</span>
                </div>
              ) : logsError ? (
                <div className="logs-error">
                  <AlertCircle className="w-5 h-5" />
                  <span>{logsError}</span>
                </div>
              ) : logs.length === 0 ? (
                <div className="logs-empty">
                  <FileText className="w-8 h-8" />
                  <span>No logs available</span>
                </div>
              ) : (
                <pre className="logs-content">
                  {logs.map((line, i) => (
                    <div key={i} className="log-line">{line}</div>
                  ))}
                  <div ref={logsEndRef} />
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DockerDashboardLight;
