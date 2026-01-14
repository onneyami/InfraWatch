export interface AgentMetrics {
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
    cpu_times?: Array<{
      cpu: string;
      user: number;
      system: number;
      idle: number;
      nice: number;
      iowait: number;
      irq: number;
      softirq: number;
      steal: number;
      guest: number;
      guest_nice: number;
    }>;
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