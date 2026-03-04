import React, { useState } from 'react';
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
                              onClick={() => handleContainerAction(container.id, 'pause')}
                              className="btn btn-action"
                              disabled={isRefreshing}
                            >
                              Pause
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
    </div>
  );
};

export default DockerDashboardLight;
