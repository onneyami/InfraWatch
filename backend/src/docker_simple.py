# backend/src/docker_simple.py
import subprocess
import json
import os
from typing import List, Dict, Any, Optional
from datetime import datetime
import time

class DockerCLI:
    """Простой класс для работы с Docker через CLI"""
    
    @staticmethod
    def run_command(cmd: List[str], timeout: int = 5) -> Dict[str, Any]:
        """Выполняет команду Docker и возвращает JSON"""
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            if result.returncode != 0:
                return {"error": result.stderr, "success": False}
            
            # Пытаемся распарсить JSON
            try:
                data = json.loads(result.stdout)
                return {"data": data, "success": True}
            except json.JSONDecodeError:
                # Если это не JSON, возвращаем текст
                return {"data": result.stdout.strip(), "success": True}
                
        except subprocess.TimeoutExpired:
            return {"error": "Command timed out", "success": False}
        except Exception as e:
            return {"error": str(e), "success": False}
    
    @staticmethod
    def get_info() -> Dict[str, Any]:
        """Получает информацию о Docker"""
        cmd = ["docker", "info", "--format", "{{json .}}"]
        return DockerCLI.run_command(cmd)
    
    @staticmethod
    def get_containers(all: bool = True) -> Dict[str, Any]:
        """Получает список контейнеров"""
        cmd = ["docker", "ps", "-a" if all else "", "--format", "{{json .}}"]
        # Убираем пустые строки
        cmd = [c for c in cmd if c]
        result = DockerCLI.run_command(cmd)
        
        if result.get("success"):
            data = result.get("data")
            containers = []

            # run_command может уже вернуть распарсенный JSON (dict или list)
            if isinstance(data, dict):
                containers = [data]
            elif isinstance(data, list):
                containers = data
            elif isinstance(data, str):
                # Строка — пробуем распарсить
                raw_data = data.strip()
                try:
                    parsed = json.loads(raw_data)
                    if isinstance(parsed, list):
                        containers = parsed
                    elif isinstance(parsed, dict):
                        containers = [parsed]
                except:
                    # Попытка: разбить по объектам по скобкам
                    depth = 0
                    current_obj = ""
                    for char in raw_data:
                        if char == '{':
                            depth += 1
                        elif char == '}':
                            depth -= 1
                        current_obj += char
                        if depth == 0 and current_obj.strip():
                            try:
                                containers.append(json.loads(current_obj))
                            except:
                                pass
                            current_obj = ""

            result["data"] = containers
        
        return result
    
    @staticmethod
    def get_images() -> Dict[str, Any]:
        """Получает список образов"""
        cmd = ["docker", "images", "--format", "{{json .}}"]
        result = DockerCLI.run_command(cmd)
        
        if result.get("success"):
            data = result.get("data")
            images = []
            if isinstance(data, dict):
                images = [data]
            elif isinstance(data, list):
                images = data
            elif isinstance(data, str):
                lines = [line for line in data.split('\n') if line]
                for line in lines:
                    try:
                        images.append(json.loads(line))
                    except:
                        pass
            result["data"] = images
        
        return result
    
    @staticmethod
    def get_networks() -> Dict[str, Any]:
        """Получает список сетей"""
        cmd = ["docker", "network", "ls", "--format", "{{json .}}"]
        result = DockerCLI.run_command(cmd)
        
        if result.get("success"):
            data = result.get("data")
            networks = []
            if isinstance(data, dict):
                networks = [data]
            elif isinstance(data, list):
                networks = data
            elif isinstance(data, str):
                lines = [line for line in data.split('\n') if line]
                for line in lines:
                    try:
                        networks.append(json.loads(line))
                    except:
                        pass
            result["data"] = networks
        
        return result
    
    @staticmethod
    def get_volumes() -> Dict[str, Any]:
        """Получает список томов"""
        cmd = ["docker", "volume", "ls", "--format", "{{json .}}"]
        result = DockerCLI.run_command(cmd)
        
        if result.get("success"):
            data = result.get("data")
            volumes = []
            if isinstance(data, dict):
                volumes = [data]
            elif isinstance(data, list):
                volumes = data
            elif isinstance(data, str):
                lines = [line for line in data.split('\n') if line]
                for line in lines:
                    try:
                        volumes.append(json.loads(line))
                    except:
                        pass
            result["data"] = volumes
        
        return result

class SimpleDockerMetrics:
    """Генерирует метрики Docker в правильном формате"""
    
    @staticmethod
    def parse_date_to_timestamp(date_str: str) -> int:
        """Преобразует строку с датой в timestamp"""
        if not date_str:
            return 0
        
        try:
            # Убираем лишние части даты (часовые пояса могут повторяться на Mac)
            parts = date_str.split(' ')
            if len(parts) > 3:
                # Берем только первые 3 части: дата, время, часовой пояс
                date_str = ' '.join(parts[:3])
            
            # Пробуем разные форматы даты
            date_formats = [
                "%Y-%m-%d %H:%M:%S %z",  # С часовым поясом
                "%Y-%m-%d %H:%M:%S",     # Без часового пояса
                "%Y-%m-%dT%H:%M:%S.%fZ", # ISO формат
                "%Y-%m-%dT%H:%M:%SZ",    # ISO без миллисекунд
            ]
            
            for fmt in date_formats:
                try:
                    dt = datetime.strptime(date_str, fmt)
                    return int(dt.timestamp())
                except:
                    continue
            
            # Если не удалось распарсить, возвращаем 0 (неизвестная дата)
            return 0
        except Exception as e:
            print(f"Warning: could not parse date '{date_str}': {e}")
            return 0
    
    @staticmethod
    def parse_ports(ports_str: str) -> List[Dict[str, Any]]:
        """Парсит строку портов из docker ps"""
        if not ports_str or ports_str == "":
            return []
        
        ports = []
        try:
            # Пример: "0.0.0.0:8081->80/tcp, :::8081->80/tcp"
            for port_mapping in ports_str.split(', '):
                if '->' in port_mapping:
                    host_part, container_part = port_mapping.split('->')
                    
                    # Обрабатываем host часть
                    if ':' in host_part:
                        host_ip, host_port = host_part.split(':')
                        # Нормализуем IP
                        if host_ip == '':
                            host_ip = '0.0.0.0'
                    else:
                        host_ip = '0.0.0.0'
                        host_port = host_part
                    
                    # Обрабатываем container часть
                    if '/' in container_part:
                        container_port, protocol = container_part.split('/')
                    else:
                        container_port = container_part
                        protocol = 'tcp'
                    
                    # Конвертируем порты в числа
                    try:
                        private_port = int(container_port)
                        public_port = int(host_port) if host_port else 0
                    except ValueError:
                        continue
                    
                    ports.append({
                        "IP": host_ip,
                        "PrivatePort": private_port,
                        "PublicPort": public_port,
                        "Type": protocol
                    })
        except Exception as e:
            print(f"Warning: could not parse ports '{ports_str}': {e}")
        
        return ports

    @staticmethod
    def parse_human_size(size_str: str) -> int:
        """Парсит человекочитаемую строку размера (e.g. '221MB') в байты."""
        if not size_str:
            return 0

        # Если уже число
        if isinstance(size_str, (int, float)):
            return int(size_str)

        s = str(size_str).strip()
        try:
            # Прямое число в байтах
            if s.isdigit():
                return int(s)

            units = {
                'B': 1,
                'KB': 1024,
                'K': 1024,
                'MB': 1024 ** 2,
                'M': 1024 ** 2,
                'GB': 1024 ** 3,
                'G': 1024 ** 3,
                'TB': 1024 ** 4,
                'T': 1024 ** 4,
            }

            # Примерные форматы: '221MB', '232.1MB', '12kB', '0B'
            s = s.replace(',', '').upper()
            # Найдём число и суффикс
            num = ''
            unit = ''
            for ch in s:
                if (ch.isdigit() or ch == '.') and unit == '':
                    num += ch
                else:
                    unit += ch

            num = num or '0'
            unit = unit.strip()
            # Нормализуем единицу
            unit = unit.replace('IB', '')  # KB/ KiB variants
            if unit == '':
                multiplier = 1
            else:
                multiplier = units.get(unit, 1)

            return int(float(num) * multiplier)
        except Exception:
            return 0
    
    @staticmethod
    def generate_engine_info(docker_info: Dict[str, Any]) -> Dict[str, Any]:
        """Генерирует информацию о Docker Engine"""
        # Приводим типы к ожидаемым моделью
        mem_total = docker_info.get("MemTotal", 0)
        if isinstance(mem_total, str):
            # Если это строка, пытаемся преобразовать в число
            try:
                mem_total = int(mem_total)
            except:
                mem_total = 0
        
        # Обрабатываем warnings
        warnings = docker_info.get("Warnings", [])
        if warnings is None:
            warnings = []
        elif isinstance(warnings, str):
            warnings = [warnings]
        
        # Обрабатываем labels
        labels = docker_info.get("Labels", [])
        if labels is None:
            labels = []
        elif isinstance(labels, str):
            labels = [labels]
        elif isinstance(labels, dict):
            labels = list(labels.values())
        
        return {
            "version": str(docker_info.get("ServerVersion", "Unknown")),
            "api_version": str(docker_info.get("ApiVersion", "1.52")),
            "arch": str(docker_info.get("Architecture", "")),
            "os_type": str(docker_info.get("OSType", "")),
            "kernel_version": str(docker_info.get("KernelVersion", "")),
            "containers": int(docker_info.get("Containers", 0)),
            "containers_running": int(docker_info.get("ContainersRunning", 0)),
            "containers_paused": int(docker_info.get("ContainersPaused", 0)),
            "containers_stopped": int(docker_info.get("ContainersStopped", 0)),
            "images": int(docker_info.get("Images", 0)),
            "driver": str(docker_info.get("Driver", "")),
            "storage_driver": str(docker_info.get("StorageDriver", "")),
            "logging_driver": str(docker_info.get("LoggingDriver", "")),
            "cgroup_driver": str(docker_info.get("CgroupDriver", "")),
            "n_events_listener": int(docker_info.get("NEventsListener", 0)),
            "n_fd": int(docker_info.get("NFd", 0)),
            "n_goroutines": int(docker_info.get("NGoroutines", 0)),
            "mem_total": mem_total,
            "n_cpu": int(docker_info.get("NCPU", 0)),
            "operating_system": str(docker_info.get("OperatingSystem", "")),
            "labels": labels,
            "server_version": str(docker_info.get("ServerVersion", "")),
            "cluster_store": str(docker_info.get("ClusterStore", "") or ""),
            "cluster_advertise": str(docker_info.get("ClusterAdvertise", "") or ""),
            "default_runtime": str(docker_info.get("DefaultRuntime", "")),
            "live_restore_enabled": bool(docker_info.get("LiveRestoreEnabled", False)),
            "isolation": str(docker_info.get("Isolation", "") or ""),
            "init_binary": str(docker_info.get("InitBinary", "") or ""),
            "product_license": str(docker_info.get("ProductLicense", "") or ""),
            "warnings": warnings
        }
    
    @staticmethod
    def format_container(container: Dict[str, Any]) -> Dict[str, Any]:
        """Форматирует информацию о контейнере"""
        # Получаем ID
        container_id = container.get("ID", container.get("Id", ""))
        if container_id.startswith('sha256:'):
            container_id = container_id[7:]
        
        # Получаем имена
        names_str = container.get("Names", container.get("Name", ""))
        if names_str:
            names = [names_str.strip()]
        else:
            names = []
        
        # Получаем image_id
        image_id = container.get("ImageID", "")
        if image_id.startswith('sha256:'):
            image_id = image_id[7:]
        
        # Получаем команду
        command_str = container.get("Command", "")
        if isinstance(command_str, str):
            # Если команда в кавычках, убираем их
            if command_str.startswith('"') and command_str.endswith('"'):
                command_str = command_str[1:-1]
            # Обрезаем если слишком длинная
            if len(command_str) > 200:
                command_str = command_str[:197] + "..."
            # Backend ожидает строку, поэтому возвращаем строку
            command = command_str
        else:
            command = ""
        
        # Парсим дату создания
        created_str = container.get("CreatedAt", "")
        created_timestamp = SimpleDockerMetrics.parse_date_to_timestamp(created_str)
        
        # Парсим порты
        ports_str = container.get("Ports", "")
        ports = SimpleDockerMetrics.parse_ports(ports_str)
        
        # Определяем состояние
        status = container.get("Status", "")
        status_lower = status.lower()
        
        # Для простоты backend ожидает строку в поле `state`
        state = status
        
        # Пытаемся извлечить PID из статуса
        import re
        pid_match = re.search(r'\(PID (\d+)\)', status)
        if pid_match:
            try:
                state["pid"] = int(pid_match.group(1))
            except:
                pass
        
        return {
            "id": container_id[:12],
            "names": names,
            "image": str(container.get("Image", "")),
            "image_id": image_id[:12] if image_id else "",
            "command": command,
            "created": created_timestamp,  # Важно: это число (timestamp)
            "status": status,
            "state": state,
            "ports": ports,
            "labels": {},
            "size_rw": 0,
            "size_root_fs": 0,
            "host_config": {},
            "network_settings": {},
            "mounts": []
        }
    
    @staticmethod
    def format_image(image: Dict[str, Any]) -> Dict[str, Any]:
        """Форматирует информацию об образе"""
        image_id = image.get("ID", image.get("ImageID", ""))
        if image_id.startswith('sha256:'):
            image_id = image_id[7:19]
        elif len(image_id) > 12:
            image_id = image_id[:12]
        
        # Получаем теги
        repository = image.get("Repository", "")
        tag = image.get("Tag", "")
        
        tags = []
        if repository and tag:
            if tag != "<none>":
                full_tag = f"{repository}:{tag}"
                tags.append(full_tag)
        elif repository:
            tags.append(repository)
        
        # Попытка взять реальные значения, если они вставлены при inspect
        created_ts = 0
        if image.get("_created_ts"):
            created_ts = int(image.get("_created_ts") or 0)
        else:
            # Попробуем взять поле Created/CreatedAt из вывода `docker images`
            created_str = image.get("CreatedAt") or image.get("Created") or image.get("CreatedSince") or ""
            created_ts = SimpleDockerMetrics.parse_date_to_timestamp(created_str) if created_str else 0

        # Content size (основной размер контента образа)
        content_size = int(image.get("_content_size_bytes") or image.get("_size_bytes") or 0)
        virtual_val = int(image.get("_virtual_size") or image.get("VirtualSize") or 0)
        # Disk usage (реальный размер на диске) — предпочитаем значение из inspect, иначе парсим
        # человекочитаемое поле `Size` от `docker images` (например "221MB").
        disk_usage = int(image.get("_disk_usage_bytes") or 0)
        if disk_usage == 0:
            # Попытка извлечь из поля, которое может прийти из `docker images --format '{{json .}}'`
            size_field = image.get("Size") or image.get("SizeHuman") or image.get("SIZE") or image.get("size")
            if size_field:
                parsed = SimpleDockerMetrics.parse_human_size(size_field)
                if parsed > 0:
                    disk_usage = parsed

        # Приводим к форме, ожидаемой Pydantic-моделью ImageInfo
        # Оставляем поле `size` для обратной совместимости, но тоже заполняем значением content_size
        return {
            "id": image_id,
            "repo_tags": tags,
            "repo_digests": [],
            "parent_id": None,
            "created": created_ts,
            "size": content_size,
            "content_size": content_size,
            "disk_usage": disk_usage,
            "shared_size": 0,
            "virtual_size": virtual_val,
            "labels": {},
            "containers": int(image.get("Containers", 0) or 0)
        }
    
    @staticmethod
    def get_metrics() -> Dict[str, Any]:
        """Получает все метрики Docker"""
        print("🔍 Collecting Docker metrics via CLI...")
        
        # Получаем информацию о Docker
        info_result = DockerCLI.get_info()
        if not info_result.get("success"):
            return {
                "error": info_result.get("error", "Failed to get Docker info"),
                "success": False
            }
        
        docker_info = info_result["data"]
        print(f"✅ Docker info received: {docker_info.get('ServerVersion', 'Unknown')}")
        
        # Получаем контейнеры
        containers_result = DockerCLI.get_containers(all=True)
        containers = []
        if containers_result.get("success"):
            containers_data = containers_result.get("data", [])
            print(f"📦 Found {len(containers_data)} containers")
            
            import json as _json
            for container_data in containers_data:
                try:
                    # Some `docker ps --format {{json .}}` implementations return
                    # JSON per line (strings) or already-parsed dicts. Handle both.
                    parsed = container_data
                    if isinstance(container_data, str):
                        try:
                            parsed = _json.loads(container_data)
                        except Exception:
                            # fallback: treat the whole string as a name field
                            parsed = {"Names": container_data}

                    if not isinstance(parsed, dict):
                        raise ValueError("Unsupported container data format")

                    formatted = SimpleDockerMetrics.format_container(parsed)
                    containers.append(formatted)
                except Exception as e:
                    # Avoid calling `.get` on non-dict objects when logging
                    try:
                        repr_container = parsed if isinstance(parsed, dict) else str(container_data)
                    except Exception:
                        repr_container = str(container_data)
                    print(f"⚠️ Error formatting container {repr_container}: {e}")
                    continue
        else:
            print(f"⚠️ Failed to get containers: {containers_result.get('error')}")
        
        # Получаем образы
        images_result = DockerCLI.get_images()
        images = []
        if images_result.get("success"):
            images_data = images_result.get("data", [])
            for image_data in images_data:
                try:
                    # Попытаемся получить точный размер и дату через `docker image inspect`
                    image_id = image_data.get("ID") or image_data.get("ImageID") or image_data.get("Id")
                    if image_id:
                        inspect_cmd = ["docker", "image", "inspect", str(image_id), "--format", "{{json .}}"]
                        inspect_result = DockerCLI.run_command(inspect_cmd, timeout=10)
                        if inspect_result.get("success") and isinstance(inspect_result.get("data"), dict):
                            insp = inspect_result["data"]
                            # Size fields в байтах
                            # Content size (raw image content) — используем как основной размер контента
                            image_data["_content_size_bytes"] = int(insp.get("Size", 0) or 0)
                            image_data["_virtual_size"] = int(insp.get("VirtualSize", 0) or 0)
                            # Попытка получить информацию о реальном использовании диска
                            disk_usage = 0
                            graph = insp.get("GraphDriver") or {}
                            graph_data = graph.get("Data") if isinstance(graph, dict) else None
                            if isinstance(graph_data, dict):
                                # Ищем подходящие ключи, которые могут содержать размер
                                for key in ("Size", "DiskSize", "UpperDirSize", "LowerDirSize", "SizeRoot", "Usage"):
                                    try:
                                        val = graph_data.get(key)
                                        if isinstance(val, (int, float)) and val > 0:
                                            disk_usage = int(val)
                                            break
                                        # Некоторые реализации возвращают строки
                                        if isinstance(val, str) and val.isdigit():
                                            disk_usage = int(val)
                                            break
                                    except:
                                        continue

                            # Created как ISO -> timestamp
                            created_iso = insp.get("Created", "")
                            image_data["_created_ts"] = SimpleDockerMetrics.parse_date_to_timestamp(created_iso) if created_iso else 0
                            image_data["_disk_usage_bytes"] = int(disk_usage or 0)
                    formatted = SimpleDockerMetrics.format_image(image_data)
                    images.append(formatted)
                except Exception as e:
                    print(f"⚠️ Error formatting image: {e}")
                    continue
        # После того как мы обработали inspect, если есть человекочитаемое поле Size в исходных данных
        # оно может содержать значение, отображаемое в колонке `docker images` (например "221MB").
        # Форматирование уже сделано в format_image(), но убедимся, что если disk_usage не заполнен,
        # возьмём значение из исходного поля.
        
        # Получаем сети (опционально)
        networks = []
        try:
            networks_result = DockerCLI.get_networks()
            if networks_result.get("success"):
                networks_data = networks_result.get("data", [])
                # Приводим к структуре, ожидаемой NetworkInfo
                networks = []
                for n in networks_data[:10]:
                    networks.append({
                        "id": n.get("ID", "")[:12],
                        "name": n.get("Name", ""),
                        "created": "",
                        "scope": "",
                        "driver": n.get("Driver", ""),
                        "enable_ipv6": False,
                        "ipam": {},
                        "internal": False,
                        "attachable": False,
                        "ingress": False,
                        "config_from": None,
                        "config_only": False,
                        "containers": {},
                        "options": {},
                        "labels": {}
                    })
        except:
            pass
        
        # Получаем тома (опционально)
        volumes = []
        try:
            volumes_result = DockerCLI.get_volumes()
            if volumes_result.get("success"):
                volumes_data = volumes_result.get("data", [])
                volumes = []
                for v in volumes_data[:10]:
                    volumes.append({
                        "name": v.get("Name", ""),
                        "driver": v.get("Driver", ""),
                        "mountpoint": v.get("Mountpoint", ""),
                        "created_at": "",
                        "status": {},
                        "labels": {},
                        "scope": "",
                        "options": {},
                        "usage_data": None
                    })
        except:
            pass
        
        return {
            "success": True,
            "engine": SimpleDockerMetrics.generate_engine_info(docker_info),
            "containers": containers,
            "container_stats": [],
            "images": images[:20],  # Ограничиваем количество
            "networks": networks,
            "volumes": volumes,
            "events": []
        }

# Простой тест
if __name__ == "__main__":
    print("🧪 Testing Docker Simple Module")
    print("=" * 50)
    
    metrics = SimpleDockerMetrics.get_metrics()
    
    if metrics.get("success"):
        print(f"✅ Success! Docker version: {metrics['engine']['version']}")
        print(f"📦 Containers: {len(metrics['containers'])}")
        for container in metrics['containers']:
            print(f"  - {container['names'][0] if container['names'] else 'no-name'}: {container['status']}")
        
        # Сохраняем пример для отладки
        with open("docker_metrics_example.json", "w") as f:
            import json
            json.dump(metrics, f, indent=2, default=str)
        print("📄 Saved example to docker_metrics_example.json")
    else:
        print(f"❌ Failed: {metrics.get('error')}")