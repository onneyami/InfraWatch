"""
Pydantic models for Ahova API.

Extracted from main.py for better organization and reusability.
"""

from pydantic import BaseModel
from typing import Dict, List, Optional, Any
from datetime import datetime


class SystemInfo(BaseModel):
    hostname: str
    os: str
    platform: str
    kernel_version: str
    uptime: int
    boot_time: int
    num_goroutine: int
    num_cpu: int


class CPUMetrics(BaseModel):
    usage: float
    per_core: Optional[List[float]] = None
    frequency: Optional[float] = None
    load_avg: Optional[Dict[str, float]] = None
    cpu_times: Optional[List[Dict[str, Any]]] = None


class MemoryMetrics(BaseModel):
    total: int
    available: int
    used: int
    used_percent: float
    free: int
    active: Optional[int] = None
    inactive: Optional[int] = None
    buffers: Optional[int] = None
    cached: Optional[int] = None
    shared: Optional[int] = None


class DiskMetrics(BaseModel):
    device: str
    mountpoint: str
    fstype: str
    total: int
    free: int
    used: int
    used_percent: float
    inodes_total: Optional[int] = None
    inodes_used: Optional[int] = None
    inodes_free: Optional[int] = None
    io_stats: Optional[Dict[str, int]] = None


class NetworkInterface(BaseModel):
    name: str
    bytes_sent: int
    bytes_recv: int
    packets_sent: int
    packets_recv: int
    err_in: int
    err_out: int
    drop_in: int
    drop_out: int
    fifo_in: int
    fifo_out: int
    mtu: Optional[int] = None
    flags: Optional[List[str]] = None


class NetworkMetrics(BaseModel):
    interfaces: List[NetworkInterface]
    connections: Optional[List[Dict[str, Any]]] = None
    proto_counters: Optional[List[Dict[str, Any]]] = None


class TemperatureSensor(BaseModel):
    sensor_key: str
    temperature: float
    high: Optional[float] = None
    critical: Optional[float] = None


class ProcessMetrics(BaseModel):
    pid: int
    name: str
    cpu_percent: float
    memory_percent: float
    memory_rss: int
    memory_vms: int
    status: str
    create_time: int
    num_threads: int
    num_fds: Optional[int] = None
    username: Optional[str] = None
    command_line: Optional[str] = None


class DockerMetrics(BaseModel):
    containers_running: int
    containers_stopped: int
    containers_paused: int
    containers_total: int
    images: int


class AgentMetrics(BaseModel):
    agent_id: str
    timestamp: int
    system: SystemInfo
    cpu: CPUMetrics
    memory: MemoryMetrics
    disks: Optional[List[DiskMetrics]] = None
    network: Optional[NetworkMetrics] = None
    temperatures: Optional[List[TemperatureSensor]] = None
    processes: Optional[List[ProcessMetrics]] = None
    docker: Optional[DockerMetrics] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    hostname: str
    timestamp: datetime
    system: Dict[str, Any]
    agents: Optional[List[Dict[str, Any]]] = None
    metrics_summary: Optional[Dict[str, Any]] = None


# Docker extended models
class ContainerDetail(BaseModel):
    id: str
    names: List[str]
    image: str
    image_id: str
    command: str
    created: int
    state: str
    status: str
    ports: Optional[List[Dict[str, Any]]] = None
    labels: Optional[Dict[str, str]] = None
    network_settings: Optional[Dict[str, Any]] = None


class ContainerStats(BaseModel):
    id: str
    name: str
    cpu_percent: float
    memory_usage: int
    memory_limit: int
    memory_percent: float
    network_rx: int
    network_tx: int
    block_read: int
    block_write: int
    pids: int
    restart_count: int
    uptime: int


class DockerEngineInfo(BaseModel):
    version: str
    api_version: str
    arch: str
    os_type: str
    kernel_version: str
    containers: int
    containers_running: int
    containers_paused: int
    containers_stopped: int
    images: int
    driver: str
    storage_driver: str
    logging_driver: str
    cgroup_driver: str
    n_events_listener: int
    n_fd: int
    n_goroutines: int
    mem_total: int
    n_cpu: int
    operating_system: str
    labels: Optional[List[str]] = None
    server_version: str
    cluster_store: Optional[str] = None
    cluster_advertise: Optional[str] = None
    default_runtime: str
    live_restore_enabled: bool
    isolation: Optional[str] = None
    init_binary: str
    product_license: Optional[str] = None
    warnings: Optional[List[str]] = None


class ImageInfo(BaseModel):
    id: str
    repo_tags: List[str]
    repo_digests: List[str]
    parent_id: Optional[str] = None
    created: int
    size: int
    content_size: Optional[int] = None
    disk_usage: Optional[int] = None
    shared_size: int
    virtual_size: int
    labels: Optional[Dict[str, str]] = None
    containers: int


class NetworkInfo(BaseModel):
    id: str
    name: str
    created: str
    scope: str
    driver: str
    enable_ipv6: bool
    ipam: Dict[str, Any]
    internal: bool
    attachable: bool
    ingress: bool
    config_from: Optional[Dict[str, str]] = None
    config_only: bool
    containers: Dict[str, Any]
    options: Optional[Dict[str, str]] = None
    labels: Optional[Dict[str, str]] = None


class VolumeInfo(BaseModel):
    name: str
    driver: str
    mountpoint: str
    created_at: str
    status: Optional[Dict[str, str]] = None
    labels: Optional[Dict[str, str]] = None
    scope: str
    options: Optional[Dict[str, str]] = None
    usage_data: Optional[Dict[str, Any]] = None


class DockerEvent(BaseModel):
    type: str
    action: str
    actor: Dict[str, Any]
    time: int
    time_nano: int


class ExtendedDockerMetrics(BaseModel):
    engine: DockerEngineInfo
    containers: List[ContainerDetail]
    container_stats: List[ContainerStats]
    images: List[ImageInfo]
    networks: List[NetworkInfo]
    volumes: List[VolumeInfo]
    events: Optional[List[DockerEvent]] = None
