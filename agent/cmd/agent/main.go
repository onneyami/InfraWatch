package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	netstd "net" // переименуем стандартный пакет
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/client"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	gopsutilnet "github.com/shirou/gopsutil/v3/net" // переименуем gopsutil/net
	"github.com/shirou/gopsutil/v3/process"
)

var AGENT_DEBUG bool = false

// Config структура для конфигурации агента
type Config struct {
	BackendURL    string   `json:"backend_url"`
	Interval      int      `json:"interval"` // в секундах
	AgentID       string   `json:"agent_id"`
	CollectDisks  bool     `json:"collect_disks"`
	CollectNet    bool     `json:"collect_net"`
	CollectDocker bool     `json:"collect_docker"`
	CollectProc   bool     `json:"collect_proc"`
	Tags          []string `json:"tags"`
}

// Metrics структура для всех метрик
type Metrics struct {
	AgentID      string               `json:"agent_id"`
	Timestamp    int64                `json:"timestamp"`
	System       SystemMetrics        `json:"system"`
	CPU          CPUMetrics           `json:"cpu"`
	Memory       MemoryMetrics        `json:"memory"`
	Disks        []DiskMetrics        `json:"disks,omitempty"`
	Network      NetworkMetrics       `json:"network,omitempty"`
	Temperatures []TemperatureMetrics `json:"temperatures,omitempty"`
	Processes    []ProcessMetrics     `json:"processes,omitempty"`
	Docker       *DockerMetrics       `json:"docker,omitempty"`
}

type SystemMetrics struct {
	Hostname      string `json:"hostname"`
	OS            string `json:"os"`
	Platform      string `json:"platform"`
	KernelVersion string `json:"kernel_version"`
	Uptime        uint64 `json:"uptime"`
	BootTime      uint64 `json:"boot_time"`
	NumGoroutine  int    `json:"num_goroutine"`
	NumCPU        int    `json:"num_cpu"`
}

type CPUMetrics struct {
	Usage     float64    `json:"usage"`
	PerCore   []float64  `json:"per_core,omitempty"`
	Frequency float64    `json:"frequency,omitempty"`
	LoadAvg   LoadAvg    `json:"load_avg,omitempty"`
	CPUTimes  []CPUTimes `json:"cpu_times,omitempty"`
}

type LoadAvg struct {
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}

type CPUTimes struct {
	CPU       string  `json:"cpu"`
	User      float64 `json:"user"`
	System    float64 `json:"system"`
	Idle      float64 `json:"idle"`
	Nice      float64 `json:"nice"`
	Iowait    float64 `json:"iowait"`
	Irq       float64 `json:"irq"`
	Softirq   float64 `json:"softirq"`
	Steal     float64 `json:"steal"`
	Guest     float64 `json:"guest"`
	GuestNice float64 `json:"guest_nice"`
}

type MemoryMetrics struct {
	Total       uint64  `json:"total"`
	Available   uint64  `json:"available"`
	Used        uint64  `json:"used"`
	UsedPercent float64 `json:"used_percent"`
	Free        uint64  `json:"free"`
	Active      uint64  `json:"active,omitempty"`
	Inactive    uint64  `json:"inactive,omitempty"`
	Buffers     uint64  `json:"buffers,omitempty"`
	Cached      uint64  `json:"cached,omitempty"`
	Shared      uint64  `json:"shared,omitempty"`
}

type DiskMetrics struct {
	Device      string   `json:"device"`
	Mountpoint  string   `json:"mountpoint"`
	Fstype      string   `json:"fstype"`
	Total       uint64   `json:"total"`
	Free        uint64   `json:"free"`
	Used        uint64   `json:"used"`
	UsedPercent float64  `json:"used_percent"`
	InodesTotal uint64   `json:"inodes_total,omitempty"`
	InodesUsed  uint64   `json:"inodes_used,omitempty"`
	InodesFree  uint64   `json:"inodes_free,omitempty"`
	IOStats     *IOStats `json:"io_stats,omitempty"`
}

type IOStats struct {
	ReadCount      uint64 `json:"read_count"`
	WriteCount     uint64 `json:"write_count"`
	ReadBytes      uint64 `json:"read_bytes"`
	WriteBytes     uint64 `json:"write_bytes"`
	ReadTime       uint64 `json:"read_time"`
	WriteTime      uint64 `json:"write_time"`
	IopsInProgress uint64 `json:"iops_in_progress"`
	WeightedIO     uint64 `json:"weighted_io"`
	AvgQueueSize   uint64 `json:"avg_queue_size"`
	AvgServiceTime uint64 `json:"avg_service_time"`
	AvgWaitTime    uint64 `json:"avg_wait_time"`
}

type NetworkMetrics struct {
	Interfaces    []InterfaceMetrics  `json:"interfaces"`
	Connections   []ConnectionMetrics `json:"connections,omitempty"`
	ProtoCounters []ProtoCounter      `json:"proto_counters,omitempty"`
}

type InterfaceMetrics struct {
	Name        string   `json:"name"`
	BytesSent   uint64   `json:"bytes_sent"`
	BytesRecv   uint64   `json:"bytes_recv"`
	PacketsSent uint64   `json:"packets_sent"`
	PacketsRecv uint64   `json:"packets_recv"`
	ErrIn       uint64   `json:"err_in"`
	ErrOut      uint64   `json:"err_out"`
	DropIn      uint64   `json:"drop_in"`
	DropOut     uint64   `json:"drop_out"`
	FifoIn      uint64   `json:"fifo_in"`
	FifoOut     uint64   `json:"fifo_out"`
	MTU         uint32   `json:"mtu"`
	Flags       []string `json:"flags,omitempty"`
}

type ConnectionMetrics struct {
	FD     uint32 `json:"fd"`
	Family uint32 `json:"family"`
	Type   uint32 `json:"type"`
	Laddr  string `json:"laddr"`
	Raddr  string `json:"raddr"`
	Status string `json:"status"`
	PID    int32  `json:"pid"`
}

type ProtoCounter struct {
	Protocol string           `json:"protocol"`
	Stats    map[string]int64 `json:"stats"`
}

type TemperatureMetrics struct {
	SensorKey   string  `json:"sensor_key"`
	Temperature float64 `json:"temperature"`
	High        float64 `json:"high,omitempty"`
	Critical    float64 `json:"critical,omitempty"`
}

type ProcessMetrics struct {
	PID           int32   `json:"pid"`
	Name          string  `json:"name"`
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryPercent float32 `json:"memory_percent"`
	MemoryRSS     uint64  `json:"memory_rss"`
	MemoryVMS     uint64  `json:"memory_vms"`
	Status        string  `json:"status"`
	CreateTime    int64   `json:"create_time"`
	NumThreads    int32   `json:"num_threads"`
	NumFDs        int32   `json:"num_fds,omitempty"`
	Username      string  `json:"username,omitempty"`
	CommandLine   string  `json:"command_line,omitempty"`
}

// Добавим новые структуры в main.go
type ContainerDetail struct {
	ID              string            `json:"id"`
	Names           []string          `json:"names"`
	Image           string            `json:"image"`
	ImageID         string            `json:"image_id"`
	Command         string            `json:"command"`
	Created         int64             `json:"created"`
	State           string            `json:"state"`
	Status          string            `json:"status"`
	Ports           []Port            `json:"ports,omitempty"`
	Labels          map[string]string `json:"labels,omitempty"`
	Mounts          []Mount           `json:"mounts,omitempty"`
	NetworkSettings NetworkSettings   `json:"network_settings,omitempty"`
}

type Port struct {
	PrivatePort int    `json:"private_port"`
	PublicPort  int    `json:"public_port"`
	Type        string `json:"type"`
	IP          string `json:"ip,omitempty"`
}

type Mount struct {
	Type        string `json:"type"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Mode        string `json:"mode"`
	RW          bool   `json:"rw"`
}

type NetworkSettings struct {
	Networks map[string]Network `json:"networks"`
}

type Network struct {
	IPAddress  string `json:"ip_address"`
	Gateway    string `json:"gateway"`
	MacAddress string `json:"mac_address"`
}

type ContainerStats struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryUsage   uint64  `json:"memory_usage"`
	MemoryLimit   uint64  `json:"memory_limit"`
	MemoryPercent float64 `json:"memory_percent"`
	NetworkRx     uint64  `json:"network_rx"`
	NetworkTx     uint64  `json:"network_tx"`
	BlockRead     uint64  `json:"block_read"`
	BlockWrite    uint64  `json:"block_write"`
	PIDs          uint64  `json:"pids"`
	RestartCount  int     `json:"restart_count"`
	Uptime        int64   `json:"uptime"`
}

type DockerEngineInfo struct {
	Version            string   `json:"version"`
	APIVersion         string   `json:"api_version"`
	Arch               string   `json:"arch"`
	OSType             string   `json:"os_type"`
	KernelVersion      string   `json:"kernel_version"`
	Containers         int      `json:"containers"`
	ContainersRunning  int      `json:"containers_running"`
	ContainersPaused   int      `json:"containers_paused"`
	ContainersStopped  int      `json:"containers_stopped"`
	Images             int      `json:"images"`
	Driver             string   `json:"driver"`
	StorageDriver      string   `json:"storage_driver"`
	LoggingDriver      string   `json:"logging_driver"`
	CgroupDriver       string   `json:"cgroup_driver"`
	NEventsListener    int      `json:"n_events_listener"`
	NFd                int      `json:"n_fd"`
	NGoroutines        int      `json:"n_goroutines"`
	MemTotal           uint64   `json:"mem_total"`
	NCPU               int      `json:"n_cpu"`
	OperatingSystem    string   `json:"operating_system"`
	Labels             []string `json:"labels,omitempty"`
	ServerVersion      string   `json:"server_version"`
	ClusterStore       string   `json:"cluster_store"`
	ClusterAdvertise   string   `json:"cluster_advertise"`
	DefaultRuntime     string   `json:"default_runtime"`
	LiveRestoreEnabled bool     `json:"live_restore_enabled"`
	Isolation          string   `json:"isolation"`
	InitBinary         string   `json:"init_binary"`
	ProductLicense     string   `json:"product_license"`
	Warnings           []string `json:"warnings,omitempty"`
}

type ImageInfo struct {
	ID          string            `json:"id"`
	RepoTags    []string          `json:"repo_tags"`
	RepoDigests []string          `json:"repo_digests"`
	ParentID    string            `json:"parent_id"`
	Created     int64             `json:"created"`
	Size        int64             `json:"size"`
	SharedSize  int64             `json:"shared_size"`
	VirtualSize int64             `json:"virtual_size"`
	Labels      map[string]string `json:"labels"`
	Containers  int               `json:"containers"`
}

type NetworkInfo struct {
	ID         string                      `json:"id"`
	Name       string                      `json:"name"`
	Created    string                      `json:"created"`
	Scope      string                      `json:"scope"`
	Driver     string                      `json:"driver"`
	EnableIPv6 bool                        `json:"enable_ipv6"`
	IPAM       IPAM                        `json:"ipam"`
	Internal   bool                        `json:"internal"`
	Attachable bool                        `json:"attachable"`
	Ingress    bool                        `json:"ingress"`
	ConfigFrom map[string]string           `json:"config_from"`
	ConfigOnly bool                        `json:"config_only"`
	Containers map[string]NetworkContainer `json:"containers"`
	Options    map[string]string           `json:"options"`
	Labels     map[string]string           `json:"labels"`
}

type IPAM struct {
	Driver  string            `json:"driver"`
	Options map[string]string `json:"options"`
	Config  []IPAMConfig      `json:"config"`
}

type IPAMConfig struct {
	Subnet  string `json:"subnet"`
	Gateway string `json:"gateway"`
}

type NetworkContainer struct {
	Name        string `json:"name"`
	EndpointID  string `json:"endpoint_id"`
	MacAddress  string `json:"mac_address"`
	IPv4Address string `json:"ipv4_address"`
	IPv6Address string `json:"ipv6_address"`
}

type VolumeInfo struct {
	Name       string            `json:"name"`
	Driver     string            `json:"driver"`
	Mountpoint string            `json:"mountpoint"`
	CreatedAt  string            `json:"created_at"`
	Status     map[string]string `json:"status"`
	Labels     map[string]string `json:"labels"`
	Scope      string            `json:"scope"`
	Options    map[string]string `json:"options"`
	UsageData  VolumeUsage       `json:"usage_data,omitempty"`
}

type VolumeUsage struct {
	Size     int64 `json:"size"`
	RefCount int   `json:"ref_count"`
}

// Обновленная структура DockerMetrics
type DockerMetrics struct {
	Engine         DockerEngineInfo  `json:"engine"`
	Containers     []ContainerDetail `json:"containers"`
	ContainerStats []ContainerStats  `json:"container_stats"`
	Images         []ImageInfo       `json:"images"`
	Networks       []NetworkInfo     `json:"networks"`
	Volumes        []VolumeInfo      `json:"volumes"`
	Events         []DockerEvent     `json:"events,omitempty"`
}

type DockerEvent struct {
	Type     string                 `json:"type"`
	Action   string                 `json:"action"`
	Actor    map[string]interface{} `json:"actor"`
	Time     int64                  `json:"time"`
	TimeNano int64                  `json:"time_nano"`
}

func getLocalIP() string {
	addrs, err := netstd.InterfaceAddrs()
	if err != nil {
		return "unknown"
	}
	for _, address := range addrs {
		// check the address type and if it is not a loopback the display it
		if ipnet, ok := address.(*netstd.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "unknown"
}

func registerAgent(config Config) {
	registration := map[string]interface{}{
		"agent_id":   config.AgentID,
		"hostname":   getHostname(),
		"ip_address": getLocalIP(),
		"version":    "2.0",
		"tags":       config.Tags,
	}

	jsonData, err := json.Marshal(registration)
	if err != nil {
		log.Printf("Error marshaling registration: %v", err)
		return
	}

	resp, err := http.Post(config.BackendURL+"/api/v1/agents/register", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Warning: Could not register agent: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		log.Printf("✅ Agent registered successfully: %s", config.AgentID)
	} else {
		log.Printf("⚠️  Agent registration failed: %s", resp.Status)
	}
}

func sendHeartbeat(config Config) {
	// Периодически отправляем heartbeat для обновления last_seen
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		// Можно отправить простой запрос на обновление статуса
		// или использовать тот же эндпоинт регистрации
		registerAgent(config)
	}
}

func main() {
	fmt.Println("🚀 Starting InfraWatch Agent v2.0...")
	fmt.Println("📊 Advanced metrics collection enabled")

	// Enable verbose debug from environment
	if os.Getenv("AGENT_DEBUG") == "1" {
		AGENT_DEBUG = true
		log.Printf("🔧 AGENT_DEBUG enabled: verbose fallback output will be logged")
	}

	config := Config{
		BackendURL:    "http://127.0.0.1:8000",
		Interval:      5, // 5 секунд для базовых метрик
		AgentID:       "agent-" + getHostname(),
		CollectDisks:  true,
		CollectNet:    true,
		CollectDocker: true,
		CollectProc:   true,
		Tags:          []string{"production"},
	}

	// Регистрация агента
	registerAgent(config)

	// Запускаем heartbeat в фоне
	go sendHeartbeat(config)

	// Выводим конфигурацию
	fmt.Printf("Agent ID: %s\n", config.AgentID)
	fmt.Printf("Backend URL: %s\n", config.BackendURL)
	fmt.Printf("Collection Interval: %d seconds\n", config.Interval)
	fmt.Printf("Tags: %v\n", config.Tags)
	fmt.Println("=====================================")

	// Запуск сбора метрик
	startMetricsCollection(config)
}

func getHostname() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return hostname
}

func startMetricsCollection(config Config) {
	// Разные интервалы для разных типов метрик
	basicTicker := time.NewTicker(time.Duration(config.Interval) * time.Second)
	advancedTicker := time.NewTicker(30 * time.Second) // Расширенные метрики каждые 30 секунд

	defer basicTicker.Stop()
	defer advancedTicker.Stop()

	// Первый сбор сразу
	sendMetrics(config, true)

	for {
		select {
		case <-basicTicker.C:
			// Базовые метрики (CPU, память, диски)
			// Отправляем расширённые метрики и на базовом тике, чтобы UI всегда получал
			// актуальные данные по процессам и сети (предпочитаем отображать более
			// подробные данные, даже если это чуть дороже по ресурсам).
			sendMetrics(config, true)
		case <-advancedTicker.C:
			// Расширенные метрики (процессы, сеть, Docker)
			sendMetrics(config, true)
		}
	}
}

func collectMetrics(config Config, advanced bool) Metrics {
	// Системная информация
	hostInfo, _ := host.Info()

	system := SystemMetrics{
		Hostname:      getHostname(),
		OS:            hostInfo.OS,
		Platform:      hostInfo.Platform,
		KernelVersion: hostInfo.KernelVersion,
		Uptime:        hostInfo.Uptime,
		BootTime:      hostInfo.BootTime,
		NumGoroutine:  runtime.NumGoroutine(),
		NumCPU:        runtime.NumCPU(),
	}

	// CPU метрики
	cpuPercent, _ := cpu.Percent(1*time.Second, true)
	cpuTotal := 0.0
	if len(cpuPercent) > 0 {
		cpuTotal = cpuPercent[0]
	}

	// Показатели загрузки
	load, _ := loadAvg()

	// Времена CPU
	cpuTimes, _ := collectCPUTimes()

	cpuMetrics := CPUMetrics{
		Usage:    cpuTotal,
		PerCore:  cpuPercent,
		LoadAvg:  load,
		CPUTimes: cpuTimes,
	}

	// Память
	memInfo, _ := mem.VirtualMemory()
	memory := MemoryMetrics{
		Total:       memInfo.Total,
		Available:   memInfo.Available,
		Used:        memInfo.Used,
		UsedPercent: memInfo.UsedPercent,
		Free:        memInfo.Free,
		Active:      memInfo.Active,
		Inactive:    memInfo.Inactive,
		Buffers:     memInfo.Buffers,
		Cached:      memInfo.Cached,
		Shared:      memInfo.Shared,
	}

	metrics := Metrics{
		AgentID:   config.AgentID,
		Timestamp: time.Now().Unix(),
		System:    system,
		CPU:       cpuMetrics,
		Memory:    memory,
	}

	// Дисковые метрики
	if config.CollectDisks {
		disks, _ := collectDiskMetrics()
		metrics.Disks = disks
	}

	// Сетевые метрики
	if config.CollectNet && advanced {
		network, _ := collectNetworkMetrics()
		metrics.Network = network
	}

	// Температура
	if advanced {
		temps, _ := collectTemperatures()
		metrics.Temperatures = temps
	}

	// Процессы
	if config.CollectProc && advanced {
		processes, _ := collectProcessMetrics(10) // Топ 10 процессов
		metrics.Processes = processes
	}

	// Docker метрики
	if config.CollectDocker && advanced {
		dockerMetrics, _ := collectDockerMetrics()
		metrics.Docker = dockerMetrics
	}

	return metrics
}

func loadAvg() (LoadAvg, error) {
	avg, err := load.Avg()
	if err != nil {
		return LoadAvg{}, err
	}
	return LoadAvg{
		Load1:  avg.Load1,
		Load5:  avg.Load5,
		Load15: avg.Load15,
	}, nil
}

func collectCPUTimes() ([]CPUTimes, error) {
	times, err := cpu.Times(true)
	if err != nil {
		return nil, err
	}

	var cpuTimes []CPUTimes
	for _, t := range times {
		cpuTimes = append(cpuTimes, CPUTimes{
			CPU:       t.CPU,
			User:      t.User,
			System:    t.System,
			Idle:      t.Idle,
			Nice:      t.Nice,
			Iowait:    t.Iowait,
			Irq:       t.Irq,
			Softirq:   t.Softirq,
			Steal:     t.Steal,
			Guest:     t.Guest,
			GuestNice: t.GuestNice,
		})
	}
	return cpuTimes, nil
}

func collectDiskMetrics() ([]DiskMetrics, error) {
	partitions, err := disk.Partitions(true)
	if err != nil {
		return nil, err
	}

	var disks []DiskMetrics
	for _, partition := range partitions {
		usage, err := disk.Usage(partition.Mountpoint)
		if err != nil {
			continue
		}

		// IO статистика
		var ioStats *IOStats
		counters, err := disk.IOCounters()
		if err == nil {
			if counter, ok := counters[partition.Device]; ok {
				ioStats = &IOStats{
					ReadCount:  counter.ReadCount,
					WriteCount: counter.WriteCount,
					ReadBytes:  counter.ReadBytes,
					WriteBytes: counter.WriteBytes,
					ReadTime:   counter.ReadTime,
					WriteTime:  counter.WriteTime,
				}
			}
		}

		// Информация об inodes
		inodesTotal := uint64(0)
		inodesUsed := uint64(0)
		inodesFree := uint64(0)

		diskMetrics := DiskMetrics{
			Device:      partition.Device,
			Mountpoint:  partition.Mountpoint,
			Fstype:      partition.Fstype,
			Total:       usage.Total,
			Free:        usage.Free,
			Used:        usage.Used,
			UsedPercent: usage.UsedPercent,
			InodesTotal: inodesTotal,
			InodesUsed:  inodesUsed,
			InodesFree:  inodesFree,
			IOStats:     ioStats,
		}

		disks = append(disks, diskMetrics)
	}

	return disks, nil
}

func collectNetworkMetrics() (NetworkMetrics, error) {
	// Статистика по интерфейсам
	interfaces, err := gopsutilnet.IOCounters(true)
	if err != nil {
		// Попробуем fallback через netstat
		fb, ferr := collectNetworkFallback()
		if ferr == nil {
			return fb, nil
		}
		return NetworkMetrics{}, err
	}
	// Если gopsutil вернул пустой срез (иногда на macOS), используем fallback
	if len(interfaces) == 0 {
		fb, ferr := collectNetworkFallback()
		if ferr == nil {
			return fb, nil
		}
		// если fallback тоже не помог, продолжаем с пустым набором
	}

	var interfaceMetrics []InterfaceMetrics
	for _, iface := range interfaces {
		interfaceMetrics = append(interfaceMetrics, InterfaceMetrics{
			Name:        iface.Name,
			BytesSent:   iface.BytesSent,
			BytesRecv:   iface.BytesRecv,
			PacketsSent: iface.PacketsSent,
			PacketsRecv: iface.PacketsRecv,
			ErrIn:       iface.Errin,
			ErrOut:      iface.Errout,
			DropIn:      iface.Dropin,
			DropOut:     iface.Dropout,
			FifoIn:      iface.Fifoin,
			FifoOut:     iface.Fifoout,
		})
	}

	// Сетевые соединения
	var connections []ConnectionMetrics
	conns, err := gopsutilnet.Connections("all")
	if err == nil {
		for _, conn := range conns {
			connections = append(connections, ConnectionMetrics{
				FD:     conn.Fd,
				Family: conn.Family,
				Type:   conn.Type,
				Laddr:  fmt.Sprintf("%s:%d", conn.Laddr.IP, conn.Laddr.Port),
				Raddr:  fmt.Sprintf("%s:%d", conn.Raddr.IP, conn.Raddr.Port),
				Status: conn.Status,
				PID:    conn.Pid,
			})
		}
	}

	return NetworkMetrics{
		Interfaces:  interfaceMetrics,
		Connections: connections,
	}, nil
}

// Простая реализация fallback для сетевых счётчиков через `netstat -ib`.
// На macOS формат вывода может отличаться, здесь берём последние два столбца как Ibytes и Obytes.
func collectNetworkFallback() (NetworkMetrics, error) {
	log.Printf("🔍 network fallback: running netstat -ib")
	cmd := exec.Command("netstat", "-ib")
	out, err := cmd.Output()
	if err != nil {
		log.Printf("⚠️ network fallback error running netstat: %v", err)
		return NetworkMetrics{}, err
	}
	if AGENT_DEBUG {
		log.Printf("🔧 network fallback raw output:\n%s", string(out))
	}

	scanner := bufio.NewScanner(bytes.NewReader(out))
	var ifs []InterfaceMetrics
	first := true
	for scanner.Scan() {
		line := scanner.Text()
		if first {
			first = false
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		name := fields[0]
		// Попробуем взять последние два столбца как Ibytes и Obytes
		if len(fields) < 2 {
			continue
		}
		// безопасно парсим последние два столбца
		var ibytes, obytes uint64
		if n := len(fields); n >= 2 {
			if v, err := strconv.ParseUint(fields[n-2], 10, 64); err == nil {
				ibytes = v
			}
			if v, err := strconv.ParseUint(fields[n-1], 10, 64); err == nil {
				obytes = v
			}
		}

		ifs = append(ifs, InterfaceMetrics{
			Name:      name,
			BytesRecv: ibytes,
			BytesSent: obytes,
		})
	}

	log.Printf("🔍 network fallback: parsed %d interfaces", len(ifs))
	if len(ifs) == 0 {
		return NetworkMetrics{}, fmt.Errorf("netstat fallback produced no interfaces")
	}

	return NetworkMetrics{Interfaces: ifs}, nil
}

func collectTemperatures() ([]TemperatureMetrics, error) {
	temps, err := host.SensorsTemperatures()
	if err != nil {
		return nil, err
	}

	var temperatures []TemperatureMetrics
	for _, temp := range temps {
		temperatures = append(temperatures, TemperatureMetrics{
			SensorKey:   temp.SensorKey,
			Temperature: temp.Temperature,
			High:        temp.High,
			Critical:    temp.Critical,
		})
	}

	return temperatures, nil
}

func collectProcessMetrics(limit int) ([]ProcessMetrics, error) {
	// On macOS prefer ps fallback because gopsutil often reports 0.0
	if runtime.GOOS == "darwin" {
		log.Printf("🔍 platform is darwin — using ps fallback for processes")
		fb, ferr := collectProcessFallback(limit)
		if ferr == nil {
			return fb, nil
		}
		// if ps fallback failed, continue to use gopsutil as a fallback
		log.Printf("⚠️ ps fallback failed: %v — falling back to gopsutil", ferr)
	}

	processes, err := process.Processes()
	if err != nil {
		// Попробуем fallback через ps (если gopsutil не вернул процессы)
		fb, ferr := collectProcessFallback(limit)
		if ferr == nil {
			return fb, nil
		}
		return nil, err
	}
	// Если gopsutil вернул пустой список, используем fallback
	if len(processes) == 0 {
		fb, ferr := collectProcessFallback(limit)
		if ferr == nil {
			return fb, nil
		}
		// иначе продолжим и вернём пустой список
	}

	var processMetrics []ProcessMetrics

	for _, p := range processes {
		// Получаем информацию о процессе
		name, _ := p.Name()
		cpuPercent, _ := p.CPUPercent()
		memPercent, _ := p.MemoryPercent()
		memInfo, _ := p.MemoryInfo()
		statuses, _ := p.Status() // Теперь это []string
		createTime, _ := p.CreateTime()
		numThreads, _ := p.NumThreads()
		username, _ := p.Username()

		// Преобразуем срез статусов в одну строку
		statusStr := "unknown"
		if len(statuses) > 0 {
			// Берем первый статус, обычно это основной статус процесса
			statusStr = statuses[0]
		}

		var memoryRSS, memoryVMS uint64
		if memInfo != nil {
			memoryRSS = memInfo.RSS
			memoryVMS = memInfo.VMS
		}

		processMetrics = append(processMetrics, ProcessMetrics{
			PID:           p.Pid,
			Name:          name,
			CPUPercent:    cpuPercent,
			MemoryPercent: memPercent,
			MemoryRSS:     memoryRSS,
			MemoryVMS:     memoryVMS,
			Status:        statusStr, // Используем строку, а не срез
			CreateTime:    createTime,
			NumThreads:    numThreads,
			Username:      username,
		})
	}

	// Сортируем по CPU по убыванию и оставляем top-N
	sort.Slice(processMetrics, func(i, j int) bool {
		return processMetrics[i].CPUPercent > processMetrics[j].CPUPercent
	})
	if len(processMetrics) > limit {
		processMetrics = processMetrics[:limit]
	}

	// Если большинство/вся собранная статистика по CPU и памяти нулевая,
	// попробуем использовать fallback через ps — на macOS gopsutil иногда
	// возвращает нулевые значения для CPU/Memory до накопления сэмплов
	// или из-за ограничений прав.
	var sumCPU float64
	var sumMem float32
	for _, pm := range processMetrics {
		sumCPU += pm.CPUPercent
		sumMem += pm.MemoryPercent
	}
	if sumCPU == 0 && sumMem == 0 {
		log.Printf("🔍 process metrics appear zeroed (gopsutil). Trying ps fallback")
		fb, ferr := collectProcessFallback(limit)
		if ferr == nil && len(fb) > 0 {
			return fb, nil
		}
		// если fallback не помог — возвращаем то, что есть (возможно пустой список)
	}

	return processMetrics, nil
}

// Простая fallback-реализация для top процессов через `ps -axo pid,comm,pcpu,pmem,state,user`.
func collectProcessFallback(limit int) ([]ProcessMetrics, error) {
	log.Printf("🔍 process fallback: running ps to collect top processes")
	cmd := exec.Command("ps", "-axo", "pid,comm,pcpu,pmem,state,user")
	out, err := cmd.Output()
	if err != nil {
		log.Printf("⚠️ process fallback error running ps: %v", err)
		return nil, err
	}
	if AGENT_DEBUG {
		log.Printf("🔧 process fallback raw output:\n%s", string(out))
	}

	scanner := bufio.NewScanner(bytes.NewReader(out))
	var procs []ProcessMetrics
	first := true
	for scanner.Scan() {
		line := scanner.Text()
		if first {
			first = false
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}
		pid64, _ := strconv.ParseInt(fields[0], 10, 32)
		// ps on some locales uses comma as decimal separator (e.g. "0,0").
		cpuRaw := strings.ReplaceAll(fields[2], ",", ".")
		memRaw := strings.ReplaceAll(fields[3], ",", ".")
		cpuF, _ := strconv.ParseFloat(cpuRaw, 64)
		memF64, _ := strconv.ParseFloat(memRaw, 64)

		// Map ps state codes to friendly statuses
		stateRaw := fields[4]
		state := "unknown"
		if len(stateRaw) > 0 {
			switch stateRaw[0] {
			case 'R':
				state = "running"
			case 'S':
				state = "sleep"
			case 'D':
				state = "disk_sleep"
			case 'Z':
				state = "zombie"
			case 'T':
				state = "stopped"
			case 'X':
				state = "dead"
			default:
				state = strings.ToLower(stateRaw)
			}
		}

		procs = append(procs, ProcessMetrics{
			PID:           int32(pid64),
			Name:          fields[1],
			CPUPercent:    cpuF,
			MemoryPercent: float32(memF64),
			Status:        state,
			Username:      strings.Join(fields[5:], " "),
		})
	}

	// Сортируем по CPU и берём top-N
	sort.Slice(procs, func(i, j int) bool {
		return procs[i].CPUPercent > procs[j].CPUPercent
	})
	if len(procs) > limit {
		procs = procs[:limit]
	}

	log.Printf("🔍 process fallback: parsed %d processes", len(procs))
	if len(procs) == 0 {
		return nil, fmt.Errorf("ps fallback produced no processes")
	}

	return procs, nil
}

func collectDockerMetrics() (*DockerMetrics, error) {
	// Проверяем, доступен ли Docker
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Printf("⚠️ Docker client init failed: %v — trying CLI fallback", err)
		// Попробуем CLI-fallback
		fb, ferr := collectDockerMetricsCLI()
		if ferr == nil {
			return fb, nil
		}
		return &DockerMetrics{
			Engine: DockerEngineInfo{
				Version: "Docker not available",
			},
		}, nil
	}
	defer cli.Close()

	// Создаем монитор Docker
	monitor, err := NewDockerMonitorWithClient(cli)
	if err != nil {
		return &DockerMetrics{
			Engine: DockerEngineInfo{
				Version: "Failed to create monitor",
			},
		}, nil
	}
	defer monitor.Close()

	// Собираем все метрики
	metrics, err := monitor.CollectAllMetrics()
	if err != nil {
		return nil, err
	}
	if AGENT_DEBUG && metrics != nil {
		log.Printf("🔧 docker client engine summary: containers=%d running=%d images=%d", metrics.Engine.Containers, metrics.Engine.ContainersRunning, metrics.Engine.Images)
	}
	return metrics, nil
}

// CLI fallback: используем `docker info --format '{{json .}}'` и `docker ps --format '{{json .}}'`
func collectDockerMetricsCLI() (*DockerMetrics, error) {
	log.Printf("🔍 docker CLI fallback: running 'docker info --format {{json .}}'")
	cmd := exec.Command("docker", "info", "--format", "{{json .}}")
	out, err := cmd.Output()
	if err != nil {
		log.Printf("⚠️ docker CLI fallback failed: %v", err)
		return nil, err
	}
	if AGENT_DEBUG {
		log.Printf("🔧 docker info raw output:\n%s", string(out))
	}

	// Парсим JSON в map
	var info map[string]interface{}
	if err := json.Unmarshal(out, &info); err != nil {
		log.Printf("⚠️ docker CLI fallback: failed to parse JSON: %v", err)
		return nil, err
	}

	toInt := func(key string) int {
		if v, ok := info[key]; ok {
			switch n := v.(type) {
			case float64:
				return int(n)
			case int:
				return n
			case string:
				if iv, err := strconv.Atoi(n); err == nil {
					return iv
				}
			}
		}
		return 0
	}

	engine := DockerEngineInfo{
		Version:           fmt.Sprintf("%v", info["ServerVersion"]),
		Containers:        toInt("Containers"),
		ContainersRunning: toInt("ContainersRunning"),
		ContainersPaused:  toInt("ContainersPaused"),
		ContainersStopped: toInt("ContainersStopped"),
		Images:            toInt("Images"),
		OperatingSystem:   fmt.Sprintf("%v", info["OperatingSystem"]),
		NCPU:              toInt("NCPU"),
	}

	// Получим список контейнеров через CLI (короткая сводка)
	cmd2 := exec.Command("docker", "ps", "-a", "--format", "{{json .}}")
	out2, err := cmd2.Output()
	var containers []ContainerDetail
	if err == nil {
		// out2 может содержать несколько JSON-объектов по строкам
		scanner := bufio.NewScanner(bytes.NewReader(out2))
		for scanner.Scan() {
			line := scanner.Text()
			var m map[string]interface{}
			if err := json.Unmarshal([]byte(line), &m); err != nil {
				continue
			}
			cd := ContainerDetail{
				ID:      fmt.Sprintf("%v", m["ID"]),
				Image:   fmt.Sprintf("%v", m["Image"]),
				Command: fmt.Sprintf("%v", m["Command"]),
				Status:  fmt.Sprintf("%v", m["Status"]),
				Names:   []string{fmt.Sprintf("%v", m["Names"])},
			}
			containers = append(containers, cd)
		}
	}

	metrics := &DockerMetrics{
		Engine:     engine,
		Containers: containers,
		// остальное оставим пустым
	}
	return metrics, nil
}

func sendMetrics(config Config, advanced bool) {
	metrics := collectMetrics(config, advanced)
	// Преобразуем структуру в map для возможности корректировать поле docker
	// — агент собирает подробные Docker-метрики, а бэкенд ожидает сводку.
	var payload map[string]interface{}
	tmp, err := json.Marshal(metrics)
	if err != nil {
		log.Printf("Error marshaling metrics: %v", err)
		return
	}
	if err := json.Unmarshal(tmp, &payload); err != nil {
		log.Printf("Error unmarshaling metrics to map: %v", err)
		return
	}

	// Если есть детальные Docker-метрики — подставим сводку, которую ожидает бэкенд.
	if dockerVal, ok := payload["docker"]; ok {
		if dockerMap, ok := dockerVal.(map[string]interface{}); ok {
			// Если присутствует 'engine' — попытаемся десериализовать в DockerEngineInfo
			if engineVal, ok := dockerMap["engine"]; ok {
				if engineBytes, err := json.Marshal(engineVal); err == nil {
					var engine DockerEngineInfo
					if err := json.Unmarshal(engineBytes, &engine); err == nil {
						summary := map[string]interface{}{
							"containers_running": engine.ContainersRunning,
							"containers_stopped": engine.ContainersStopped,
							"containers_paused":  engine.ContainersPaused,
							"containers_total":   engine.Containers,
							"images":             engine.Images,
						}
						payload["docker"] = summary
					}
				}
			}
		}
	}

	// Если network присутствует, убедимся, что interfaces это список.
	// Вместо удаления поля — безопаснее послать пустой список интерфейсов (не null),
	// чтобы Pydantic ожидал список (включая пустой).
	if netVal, ok := payload["network"]; ok {
		if netMap, ok := netVal.(map[string]interface{}); ok {
			if ifs, exists := netMap["interfaces"]; !exists || ifs == nil {
				// Заменяем null на пустой список
				netMap["interfaces"] = make([]interface{}, 0)
				payload["network"] = netMap
			}
		} else {
			// Если network не объект — удалим его как некорректный
			delete(payload, "network")
		}
	}

	// Гарантируем, что поля, которые фронтенд ожидает как списки/объекты,
	// не придут как null — заменяем nil на пустые структуры.
	if v, ok := payload["processes"]; !ok || v == nil {
		payload["processes"] = make([]interface{}, 0)
	}

	if v, ok := payload["disks"]; !ok || v == nil {
		payload["disks"] = make([]interface{}, 0)
	}

	if v, ok := payload["temperatures"]; !ok || v == nil {
		payload["temperatures"] = make([]interface{}, 0)
	}

	if v, ok := payload["docker"]; !ok || v == nil {
		// Подставим минимальную сводку с нулевыми значениями, чтобы UI корректно отобразил состояние
		payload["docker"] = map[string]interface{}{
			"containers_running": 0,
			"containers_stopped": 0,
			"containers_paused":  0,
			"containers_total":   0,
			"images":             0,
		}
	} else {
		// Если docker присутствует как объект детальных метрик и содержит 'engine',
		// мы уже сформировали summary выше. Если engine отсутствует, но объект уже
		// содержит сводку (например, поля containers_total/containers_running/images),
		// то не затираем её. Затираем нулями только если нет ни engine, ни ни одной
		// из ожидаемых сводных полей.
		if dockerMap, ok := payload["docker"].(map[string]interface{}); ok {
			if _, hasEngine := dockerMap["engine"]; !hasEngine {
				_, hasTotal := dockerMap["containers_total"]
				_, hasRunning := dockerMap["containers_running"]
				_, hasImages := dockerMap["images"]
				if !hasTotal && !hasRunning && !hasImages {
					payload["docker"] = map[string]interface{}{
						"containers_running": 0,
						"containers_stopped": 0,
						"containers_paused":  0,
						"containers_total":   0,
						"images":             0,
					}
				}
			}
		}
	}

	// Снова маршалим итоговую полезную нагрузку
	jsonData, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshaling final payload: %v", err)
		return
	}

	resp, err := http.Post(config.BackendURL+"/api/v1/metrics", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Error sending metrics: %v", err)
		return
	}
	defer resp.Body.Close()

	if advanced {
		log.Printf("📊 Advanced metrics sent. Status: %d", resp.StatusCode)
	} else {
		log.Printf("📈 Basic metrics sent. CPU: %.1f%%, Memory: %.1f%%", metrics.CPU.Usage, metrics.Memory.UsedPercent)
	}
}
