package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	containertypes "github.com/docker/docker/api/types/container"
	eventstypes "github.com/docker/docker/api/types/events"
	filterstypes "github.com/docker/docker/api/types/filters"
	imagetypes "github.com/docker/docker/api/types/image"
	networktypes "github.com/docker/docker/api/types/network"
	volumetypes "github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
)

type DockerMonitor struct {
	client *client.Client
	ctx    context.Context
}

func NewDockerMonitor() (*DockerMonitor, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv)
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %v", err)
	}

	return &DockerMonitor{
		client: cli,
		ctx:    context.Background(),
	}, nil
}

func NewDockerMonitorWithClient(cli *client.Client) (*DockerMonitor, error) {
	return &DockerMonitor{
		client: cli,
		ctx:    context.Background(),
	}, nil
}

func (dm *DockerMonitor) GetEngineInfo() (DockerEngineInfo, error) {
	info, err := dm.client.Info(dm.ctx)
	if err != nil {
		return DockerEngineInfo{}, err
	}

	version, err := dm.client.ServerVersion(dm.ctx)
	if err != nil {
		return DockerEngineInfo{}, err
	}

	return DockerEngineInfo{
		Version:            info.ServerVersion,
		APIVersion:         version.APIVersion,
		Arch:               info.Architecture,
		OSType:             info.OSType,
		KernelVersion:      info.KernelVersion,
		Containers:         info.Containers,
		ContainersRunning:  info.ContainersRunning,
		ContainersPaused:   info.ContainersPaused,
		ContainersStopped:  info.ContainersStopped,
		Images:             info.Images,
		Driver:             info.Driver,
		StorageDriver:      info.DriverStatus[0][1],
		LoggingDriver:      info.LoggingDriver,
		CgroupDriver:       info.CgroupDriver,
		NEventsListener:    info.NEventsListener,
		NFd:                info.NFd,
		NGoroutines:        info.NGoroutines,
		MemTotal:           uint64(info.MemTotal),
		NCPU:               info.NCPU,
		OperatingSystem:    info.OperatingSystem,
		Labels:             info.Labels,
		ServerVersion:      info.ServerVersion,
		ClusterStore:       "",
		ClusterAdvertise:   "",
		DefaultRuntime:     info.DefaultRuntime,
		LiveRestoreEnabled: info.LiveRestoreEnabled,
		Isolation:          string(info.Isolation),
		InitBinary:         info.InitBinary,
		ProductLicense:     info.ProductLicense,
		Warnings:           info.Warnings,
	}, nil
}

func (dm *DockerMonitor) GetContainers() ([]ContainerDetail, error) {
	containers, err := dm.client.ContainerList(dm.ctx, containertypes.ListOptions{
		All: true,
	})
	if err != nil {
		return nil, err
	}

	var result []ContainerDetail
	for _, ctr := range containers {
		detail := ContainerDetail{
			ID:      ctr.ID[:12],
			Names:   ctr.Names,
			Image:   ctr.Image,
			ImageID: ctr.ImageID,
			Command: ctr.Command,
			Created: ctr.Created,
			State:   string(ctr.State),
			Status:  ctr.Status,
		}

		// Получаем порты
		for _, port := range ctr.Ports {
			detail.Ports = append(detail.Ports, Port{
				PrivatePort: int(port.PrivatePort),
				PublicPort:  int(port.PublicPort),
				Type:        port.Type,
				IP:          port.IP,
			})
		}

		// Получаем метки
		if ctr.Labels != nil {
			detail.Labels = ctr.Labels
		}

		// Получаем информацию о сети
		if ctr.NetworkSettings != nil {
			networks := make(map[string]Network)
			for name, endpoint := range ctr.NetworkSettings.Networks {
				if endpoint == nil {
					continue
				}
				networks[name] = Network{
					IPAddress:  endpoint.IPAddress,
					Gateway:    endpoint.Gateway,
					MacAddress: endpoint.MacAddress,
				}
			}
			detail.NetworkSettings = NetworkSettings{
				Networks: networks,
			}
		}

		result = append(result, detail)
	}

	return result, nil
}

func (dm *DockerMonitor) GetContainerStats() ([]ContainerStats, error) {
	containers, err := dm.client.ContainerList(dm.ctx, containertypes.ListOptions{})
	if err != nil {
		return nil, err
	}

	var statsList []ContainerStats
	for _, container := range containers {
		// Получаем статистику
		stats, err := dm.client.ContainerStats(dm.ctx, container.ID, false)
		if err != nil {
			continue
		}
		defer stats.Body.Close()

		// Парсим статистику
		var v containertypes.StatsResponse
		if err := json.NewDecoder(stats.Body).Decode(&v); err != nil {
			continue
		}

		// Рассчитываем проценты
		cpuPercent := calculateCPUPercent(v)
		memUsage := v.MemoryStats.Usage - v.MemoryStats.Stats["cache"]
		memLimit := v.MemoryStats.Limit
		memPercent := 0.0
		if memLimit > 0 {
			memPercent = float64(memUsage) / float64(memLimit) * 100.0
		}

		// Считаем сеть
		var netRx, netTx uint64
		for _, network := range v.Networks {
			netRx += network.RxBytes
			netTx += network.TxBytes
		}

		// Считаем дисковые операции
		var blkRead, blkWrite uint64
		for _, blk := range v.BlkioStats.IoServiceBytesRecursive {
			switch blk.Op {
			case "Read":
				blkRead += blk.Value
			case "Write":
				blkWrite += blk.Value
			}
		}

		// Получаем информацию о контейнере для restart count
		inspect, err := dm.client.ContainerInspect(dm.ctx, container.ID)
		if err != nil {
			continue
		}

		// inspect.Created is a string timestamp, parse it
		var createdAt time.Time
		if ct, err := time.Parse(time.RFC3339Nano, inspect.Created); err == nil {
			createdAt = ct
		} else if ct, err := time.Parse(time.RFC3339, inspect.Created); err == nil {
			createdAt = ct
		} else {
			createdAt = time.Now()
		}

		containerStat := ContainerStats{
			ID: container.ID[:12],
			Name: func() string {
				if len(container.Names) > 0 {
					return container.Names[0]
				}
				return container.ID
			}(),
			CPUPercent:    cpuPercent,
			MemoryUsage:   memUsage,
			MemoryLimit:   memLimit,
			MemoryPercent: memPercent,
			NetworkRx:     netRx,
			NetworkTx:     netTx,
			BlockRead:     blkRead,
			BlockWrite:    blkWrite,
			PIDs:          v.PidsStats.Current,
			RestartCount:  inspect.RestartCount,
			Uptime:        time.Now().Unix() - createdAt.Unix(),
		}

		statsList = append(statsList, containerStat)
	}

	return statsList, nil
}

func calculateCPUPercent(v containertypes.StatsResponse) float64 {
	cpuPercent := 0.0
	var preTotal uint64
	if v.PreCPUStats.CPUUsage.PercpuUsage != nil {
		preTotal = v.PreCPUStats.CPUUsage.TotalUsage
	} else {
		preTotal = 0
	}
	cpuDelta := float64(v.CPUStats.CPUUsage.TotalUsage - preTotal)
	systemDelta := float64(v.CPUStats.SystemUsage - v.PreCPUStats.SystemUsage)

	if systemDelta > 0.0 && cpuDelta > 0.0 {
		cpuPercent = (cpuDelta / systemDelta) * float64(len(v.CPUStats.CPUUsage.PercpuUsage)) * 100.0
	}
	return cpuPercent
}

func (dm *DockerMonitor) GetImages() ([]ImageInfo, error) {
	images, err := dm.client.ImageList(dm.ctx, imagetypes.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ImageInfo
	for _, img := range images {
		imgInfo := ImageInfo{
			ID:          img.ID[7:19], // Берем короткий ID
			RepoTags:    img.RepoTags,
			RepoDigests: img.RepoDigests,
			Created:     img.Created,
			Size:        img.Size,
			SharedSize:  img.SharedSize,
			VirtualSize: img.VirtualSize,
			Labels:      img.Labels,
			Containers:  int(img.Containers),
		}

		if len(img.ParentID) > 0 {
			imgInfo.ParentID = img.ParentID[7:19]
		}

		result = append(result, imgInfo)
	}

	return result, nil
}

func (dm *DockerMonitor) GetNetworks() ([]NetworkInfo, error) {
	networks, err := dm.client.NetworkList(dm.ctx, networktypes.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []NetworkInfo
	for _, network := range networks {
		networkInfo := NetworkInfo{
			ID:         network.ID[:12],
			Name:       network.Name,
			Created:    network.Created.String(),
			Scope:      network.Scope,
			Driver:     network.Driver,
			EnableIPv6: network.EnableIPv6,
			Internal:   network.Internal,
			Attachable: network.Attachable,
			Ingress:    network.Ingress,
			ConfigOnly: network.ConfigOnly,
			Options:    network.Options,
			Labels:     network.Labels,
		}

		// IPAM
		networkInfo.IPAM = IPAM{
			Driver:  network.IPAM.Driver,
			Options: network.IPAM.Options,
		}

		for _, config := range network.IPAM.Config {
			networkInfo.IPAM.Config = append(networkInfo.IPAM.Config, IPAMConfig{
				Subnet:  config.Subnet,
				Gateway: config.Gateway,
			})
		}

		// Containers
		containers := make(map[string]NetworkContainer)
		for name, endpoint := range network.Containers {
			containers[name] = NetworkContainer{
				Name:        name,
				EndpointID:  endpoint.EndpointID,
				MacAddress:  endpoint.MacAddress,
				IPv4Address: endpoint.IPv4Address,
				IPv6Address: endpoint.IPv6Address,
			}
		}
		networkInfo.Containers = containers

		result = append(result, networkInfo)
	}

	return result, nil
}

func (dm *DockerMonitor) GetVolumes() ([]VolumeInfo, error) {
	volumes, err := dm.client.VolumeList(dm.ctx, volumetypes.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []VolumeInfo
	for _, volume := range volumes.Volumes {
		volumeInfo := VolumeInfo{
			Name:       volume.Name,
			Driver:     volume.Driver,
			Mountpoint: volume.Mountpoint,
			CreatedAt:  volume.CreatedAt,
			// convert status (map[string]interface{}) to map[string]string if possible
			Status: func() map[string]string {
				res := make(map[string]string)
				for k, v := range volume.Status {
					res[k] = fmt.Sprintf("%v", v)
				}
				return res
			}(),
			Labels:  volume.Labels,
			Scope:   volume.Scope,
			Options: volume.Options,
		}

		// Получаем использование (если доступно)
		if volume.UsageData != nil {
			volumeInfo.UsageData = VolumeUsage{
				Size:     volume.UsageData.Size,
				RefCount: int(volume.UsageData.RefCount),
			}
		}

		result = append(result, volumeInfo)
	}

	return result, nil
}

func (dm *DockerMonitor) GetEvents(since time.Time) ([]DockerEvent, error) {
	eventFilter := filterstypes.NewArgs()

	messages, errs := dm.client.Events(dm.ctx, eventstypes.ListOptions{
		Since:   since.Format(time.RFC3339),
		Until:   time.Now().Format(time.RFC3339),
		Filters: eventFilter,
	})

	var result []DockerEvent
	timeout := time.After(2 * time.Second)

	for {
		select {
		case event := <-messages:
			// convert map[string]string -> map[string]interface{}
			actor := make(map[string]interface{})
			for k, v := range event.Actor.Attributes {
				actor[k] = v
			}

			dockerEvent := DockerEvent{
				Type:     string(event.Type),
				Action:   string(event.Action),
				Actor:    actor,
				Time:     event.Time,
				TimeNano: event.TimeNano,
			}
			result = append(result, dockerEvent)
		case err := <-errs:
			if err != nil {
				return result, nil // Возвращаем то, что успели собрать
			}
		case <-timeout:
			return result, nil
		}
	}
}

func (dm *DockerMonitor) CollectAllMetrics() (*DockerMetrics, error) {
	var metrics DockerMetrics
	var err error

	// Собираем метрики двигателя
	metrics.Engine, err = dm.GetEngineInfo()
	if err != nil {
		return nil, fmt.Errorf("failed to get engine info: %v", err)
	}

	// Собираем информацию о контейнерах
	metrics.Containers, err = dm.GetContainers()
	if err != nil {
		return nil, fmt.Errorf("failed to get containers: %v", err)
	}

	// Собираем статистику контейнеров
	metrics.ContainerStats, err = dm.GetContainerStats()
	if err != nil {
		return nil, fmt.Errorf("failed to get container stats: %v", err)
	}

	// Собираем информацию об образах
	metrics.Images, err = dm.GetImages()
	if err != nil {
		return nil, fmt.Errorf("failed to get images: %v", err)
	}

	// Собираем информацию о сетях
	metrics.Networks, err = dm.GetNetworks()
	if err != nil {
		return nil, fmt.Errorf("failed to get networks: %v", err)
	}

	// Собираем информацию о томах
	metrics.Volumes, err = dm.GetVolumes()
	if err != nil {
		return nil, fmt.Errorf("failed to get volumes: %v", err)
	}

	// Собираем события (за последние 5 минут)
	since := time.Now().Add(-5 * time.Minute)
	metrics.Events, _ = dm.GetEvents(since) // Игнорируем ошибки событий

	return &metrics, nil
}

func (dm *DockerMonitor) Close() error {
	return dm.client.Close()
}
