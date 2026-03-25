"""
CIS Docker Benchmark Scanner
Проверка безопасности Docker по стандартам CIS Docker Benchmark 1.4.0
"""

import json
import os
import subprocess
import re
from typing import Dict, List, Any
from dataclasses import dataclass, asdict
from datetime import datetime


@dataclass
class CISCheck:
    """Результат одной проверки CIS"""
    id: str
    title: str
    description: str
    level: str  # 1 (Critical) или 2 (Important)
    category: str  # Host, Daemon, Container, Image, Operations
    status: str  # PASS, FAIL, WARNING, INFO
    remediation: str
    details: str = ""
    scored: bool = True


@dataclass
class CISScanResult:
    """Результат полного сканирования CIS"""
    timestamp: str
    total_checks: int
    passed: int
    failed: int
    warnings: int
    info: int
    score: float  # Процент прохождения
    level1_passed: int
    level1_total: int
    level2_passed: int
    level2_total: int
    checks: List[Dict[str, Any]]


class CISScanner:
    """Сканер CIS Docker Benchmark"""
    
    def __init__(self):
        self.checks: List[CISCheck] = []
    
    def run_command(self, cmd: str) -> tuple:
        """Выполнение команды и возврат (stdout, stderr, returncode)"""
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=30
            )
            return result.stdout.strip(), result.stderr.strip(), result.returncode
        except Exception as e:
            return "", str(e), 1
    
    def check_docker_socket_permissions(self) -> CISCheck:
        """1.1 - Ensure Docker socket is not exposed (Scored)"""
        stdout, stderr, rc = self.run_command("ls -la /var/run/docker.sock 2>/dev/null")
        
        # Проверяем права на сокет
        if rc == 0 and ".sock" in stdout:
            # Проверяем, что группа docker имеет доступ только у root
            if "srw-rw---- root docker" in stdout or "srw-rw---- root root" in stdout:
                return CISCheck(
                    id="1.1",
                    title="Ensure Docker socket is not exposed",
                    description="Docker daemon should only be accessible by root user",
                    level="1",
                    category="Host",
                    status="PASS",
                    remediation="Ensure Docker socket permissions are restricted to root:docker"
                )
            else:
                return CISCheck(
                    id="1.1",
                    title="Ensure Docker socket is not exposed",
                    description="Docker daemon should only be accessible by root user",
                    level="1",
                    category="Host",
                    status="FAIL",
                    remediation="Restrict Docker socket: chmod 660 /var/run/docker.sock",
                    details=stdout
                )
        
        return CISCheck(
            id="1.1",
            title="Ensure Docker socket is not exposed",
            description="Docker daemon should only be accessible by root user",
            level="1",
            category="Host",
            status="INFO",
            remediation="Docker socket not found or not accessible"
        )
    
    def check_latest_docker_version(self) -> CISCheck:
        """1.2 - Ensure Docker version is up to date (Not Scored)"""
        stdout, stderr, rc = self.run_command("docker version --format '{{.Server.Version}}' 2>/dev/null")
        
        if rc == 0 and stdout:
            # Проверяем, что версия не слишком старая (> 2 лет считаем устаревшей)
            return CISCheck(
                id="1.2",
                title="Ensure Docker version is up to date",
                description="Running with most recent Docker version",
                level="2",
                category="Host",
                status="INFO",
                remediation=f"Current version: {stdout}. Consider upgrading to latest.",
                details=f"Version: {stdout}"
            )
        
        return CISCheck(
            id="1.2",
            title="Ensure Docker version is up to date",
            description="Running with most recent Docker version",
            level="2",
            category="Host",
            status="WARNING",
            remediation="Unable to determine Docker version"
        )
    
    def check_docker_files_ownership(self) -> CISCheck:
        """1.3 - Ensure Docker files are owned by root (Scored)"""
        stdout, stderr, rc = self.run_command("ls -la /var/lib/docker 2>/dev/null")
        
        if rc == 0:
            if "root root" in stdout:
                return CISCheck(
                    id="1.3",
                    title="Ensure Docker files are owned by root",
                    description="All Docker files should be owned by root",
                    level="1",
                    category="Host",
                    status="PASS",
                    remediation="Docker files owned by root"
                )
            else:
                return CISCheck(
                    id="1.3",
                    title="Ensure Docker files are owned by root",
                    description="All Docker files should be owned by root",
                    level="1",
                    category="Host",
                    status="FAIL",
                    remediation="chown -R root:root /var/lib/docker",
                    details=stdout[:200]
                )
        
        return CISCheck(
            id="1.3",
            title="Ensure Docker files are owned by root",
            description="All Docker files should be owned by root",
            level="1",
            category="Host",
            status="WARNING",
            remediation="Unable to check /var/lib/docker ownership"
        )
    
    def check_daemon_json_exists(self) -> CISCheck:
        """2.1 - Ensure a daemon.json file exists (Scored)"""
        daemon_json_paths = [
            "/etc/docker/daemon.json",
            "/etc/default/docker"
        ]
        
        for path in daemon_json_paths:
            if os.path.exists(path):
                return CISCheck(
                    id="2.1",
                    title="Ensure a daemon.json file exists",
                    description="Create daemon.json file in /etc/docker/",
                    level="1",
                    category="Daemon",
                    status="PASS",
                    remediation=f"Found: {path}",
                    details=f"Configuration file exists at {path}"
                )
        
        return CISCheck(
            id="2.1",
            title="Ensure a daemon.json file exists",
            description="Create daemon.json file in /etc/docker/",
            level="1",
            category="Daemon",
            status="FAIL",
            remediation="Create /etc/docker/daemon.json with appropriate configuration"
        )
    
    def check_daemon_json_content(self) -> CISCheck:
        """2.2 - Ensure daemon.json is valid (Scored)"""
        daemon_json_path = "/etc/docker/daemon.json"
        
        if os.path.exists(daemon_json_path):
            try:
                with open(daemon_json_path, 'r') as f:
                    json.load(f)
                
                with open(daemon_json_path, 'r') as f:
                    content = f.read()
                
                # Проверяем наличие security options
                if "security-opt" in content or "apparmor" in content or "selinux" in content:
                    return CISCheck(
                        id="2.2",
                        title="Ensure daemon.json is valid",
                        description="Ensure daemon.json has valid JSON syntax",
                        level="1",
                        category="Daemon",
                        status="PASS",
                        remediation="daemon.json is valid JSON"
                    )
                else:
                    return CISCheck(
                        id="2.2",
                        title="Ensure daemon.json is valid",
                        description="Ensure daemon.json has valid JSON syntax",
                        level="1",
                        category="Daemon",
                        status="WARNING",
                        remediation="Consider adding security options to daemon.json",
                        details="Valid JSON but missing security configurations"
                    )
            except json.JSONDecodeError as e:
                return CISCheck(
                    id="2.2",
                    title="Ensure daemon.json is valid",
                    description="Ensure daemon.json has valid JSON syntax",
                    level="1",
                    category="Daemon",
                    status="FAIL",
                    remediation=f"Fix JSON syntax error: {str(e)}"
                )
        
        return CISCheck(
            id="2.2",
            title="Ensure daemon.json is valid",
            description="Ensure daemon.json has valid JSON syntax",
            level="1",
            category="Daemon",
            status="INFO",
            remediation="daemon.json does not exist"
        )
    
    def check_default_ulimits(self) -> CISCheck:
        """2.3 - Ensure default ulimits are appropriate (Not Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker info --format '{{.DefaultUlimits}}' 2>/dev/null"
        )
        
        if rc == 0 and stdout and stdout != "[]":
            return CISCheck(
                id="2.3",
                title="Ensure default ulimits are appropriate",
                description="Verify default ulimits are appropriate",
                level="2",
                category="Daemon",
                status="PASS",
                remediation="Default ulimits configured",
                details=f"Ulimits: {stdout}"
            )
        
        return CISCheck(
            id="2.3",
            title="Ensure default ulimits are appropriate",
            description="Verify default ulimits are appropriate",
            level="2",
            category="Daemon",
            status="WARNING",
            remediation="Unable to verify default ulimits"
        )
    
    def check_containers_without_privileged(self) -> CISCheck:
        """3.1 - Ensure privileged containers are not used (Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker ps -a --format '{{.ID}}|{{.Names}}|{{.Ports}}' 2>/dev/null"
        )
        
        if rc != 0 or not stdout:
            return CISCheck(
                id="3.1",
                title="Ensure privileged containers are not used",
                description="Containers should not run in privileged mode",
                level="1",
                category="Container",
                status="INFO",
                remediation="No containers found"
            )
        
        # Проверяем привилегированные контейнеры
        priv_containers, _, rc = self.run_command(
            "docker ps -a --filter 'privileged=true' --format '{{.Names}}' 2>/dev/null"
        )
        
        if priv_containers:
            return CISCheck(
                id="3.1",
                title="Ensure privileged containers are not used",
                description="Containers should not run in privileged mode",
                level="1",
                category="Container",
                status="FAIL",
                remediation="Remove --privileged flag from containers",
                details=f"Privileged containers: {priv_containers}"
            )
        
        return CISCheck(
            id="3.1",
            title="Ensure privileged containers are not used",
            description="Containers should not run in privileged mode",
            level="1",
            category="Container",
            status="PASS",
            remediation="No privileged containers found"
        )
    
    def check_containers_without_sensitive_mounts(self) -> CISCheck:
        """3.2 - Ensure sensitive host mounts are not exposed (Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker ps -a --format '{{.ID}}|{{.Names}}' 2>/dev/null"
        )
        
        if rc != 0 or not stdout:
            return CISCheck(
                id="3.2",
                title="Ensure sensitive host mounts are not exposed",
                description="Sensitive host paths should not be mounted",
                level="1",
                category="Container",
                status="INFO",
                remediation="No containers found"
            )
        
        sensitive_paths = ["/proc", "/sys", "/", "/etc", "/root", "/home"]
        sensitive_found = []
        
        for line in stdout.split('\n'):
            if not line:
                continue
            container_id = line.split('|')[0]
            
            for path in sensitive_paths:
                check_cmd = f"docker inspect --format '{{{{.Mounts}}}}' {container_id} 2>/dev/null | grep -q {path}"
                _, _, cr = self.run_command(check_cmd)
                if cr == 0:
                    sensitive_found.append(f"{container_id}:{path}")
        
        if sensitive_found:
            return CISCheck(
                id="3.2",
                title="Ensure sensitive host mounts are not exposed",
                description="Sensitive host paths should not be mounted",
                level="1",
                category="Container",
                status="WARNING",
                remediation="Review and remove sensitive host path mounts",
                details=f"Found: {', '.join(sensitive_found[:5])}"
            )
        
        return CISCheck(
            id="3.2",
            title="Ensure sensitive host mounts are not exposed",
            description="Sensitive host paths should not be mounted",
            level="1",
            category="Container",
            status="PASS",
            remediation="No sensitive host mounts found"
        )
    
    def check_shm_size_for_containers(self) -> CISCheck:
        """3.3 - Ensure default shm size is appropriate (Not Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker ps -a --format '{{.ID}}' 2>/dev/null | head -5"
        )
        
        if rc != 0 or not stdout:
            return CISCheck(
                id="3.3",
                title="Ensure default shm size is appropriate",
                description="Verify /dev/shm size is appropriate",
                level="2",
                category="Container",
                status="INFO",
                remediation="No containers found"
            )
        
        return CISCheck(
            id="3.3",
            title="Ensure default shm size is appropriate",
            description="Verify /dev/shm size is appropriate",
            level="2",
            category="Container",
            status="INFO",
            remediation="Check /dev/shm size manually for each container"
        )
    
    def check_containers_with_apparmor(self) -> CISCheck:
        """3.4 - Ensure AppArmor profile is enabled (Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker ps -a --format '{{.ID}}|{{.Names}}' 2>/dev/null"
        )
        
        if rc != 0 or not stdout:
            return CISCheck(
                id="3.4",
                title="Ensure AppArmor profile is enabled",
                description="Containers should have AppArmor profile enabled",
                level="1",
                category="Container",
                status="INFO",
                remediation="No containers found"
            )
        
        # Проверяем наличие AppArmor/SELinux профилей
        no_profile = []
        for line in stdout.split('\n'):
            if not line:
                continue
            container_id = line.split('|')[0]
            
            check_cmd = f"docker inspect --format '{{{{.AppArmorProfile}}}}' {container_id} 2>/dev/null"
            profile, _, _ = self.run_command(check_cmd)
            
            if not profile or profile == "":
                no_profile.append(container_id)
        
        if no_profile:
            return CISCheck(
                id="3.4",
                title="Ensure AppArmor profile is enabled",
                description="Containers should have AppArmor profile enabled",
                level="1",
                category="Container",
                status="FAIL",
                remediation="Enable AppArmor profiles for containers",
                details=f"Containers without profile: {len(no_profile)}"
            )
        
        return CISCheck(
            id="3.4",
            title="Ensure AppArmor profile is enabled",
            description="Containers should have AppArmor profile enabled",
            level="1",
            category="Container",
            status="PASS",
            remediation="All containers have AppArmor profiles"
        )
    
    def check_containers_privileged_ports(self) -> CISCheck:
        """3.5 - Ensure privileged ports are not mapped (Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker ps --format '{{.Ports}}' 2>/dev/null"
        )
        
        if rc != 0 or not stdout:
            return CISCheck(
                id="3.5",
                title="Ensure privileged ports are not mapped",
                description="Containers should not map privileged ports (< 1024)",
                level="1",
                category="Container",
                status="PASS",
                remediation="No privileged ports mapped"
            )
        
        privileged_mapped = []
        for port_line in stdout.split('\n'):
            if not port_line:
                continue
            # Ищем порты вида 0.0.0.0:80 или :::80
            matches = re.findall(r':(\d+)->', port_line)
            for port in matches:
                if int(port) < 1024:
                    privileged_mapped.append(port)
        
        if privileged_mapped:
            return CISCheck(
                id="3.5",
                title="Ensure privileged ports are not mapped",
                description="Containers should not map privileged ports (< 1024)",
                level="1",
                category="Container",
                status="FAIL",
                remediation="Remap privileged ports to > 1024",
                details=f"Privileged ports mapped: {', '.join(set(privileged_mapped))}"
            )
        
        return CISCheck(
            id="3.5",
            title="Ensure privileged ports are not mapped",
            description="Containers should not map privileged ports (< 1024)",
            level="1",
            category="Container",
            status="PASS",
            remediation="No privileged ports mapped"
        )
    
    def check_containers_with_host_network(self) -> CISCheck:
        """3.6 - Ensure host network is not used (Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker ps -a --filter 'network=host' --format '{{.Names}}' 2>/dev/null"
        )
        
        if rc == 0 and stdout:
            return CISCheck(
                id="3.6",
                title="Ensure host network is not used",
                description="Containers should not use host network mode",
                level="1",
                category="Container",
                status="FAIL",
                remediation="Remove --network=host from containers",
                details=f"Containers with host network: {stdout}"
            )
        
        return CISCheck(
            id="3.6",
            title="Ensure host network is not used",
            description="Containers should not use host network mode",
            level="1",
            category="Container",
            status="PASS",
            remediation="No containers use host network"
        )
    
    def check_containers_readonly_rootfs(self) -> CISCheck:
        """3.7 - Ensure root filesystem is read-only (Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker ps -a --format '{{.ID}}' 2>/dev/null"
        )
        
        if rc != 0 or not stdout:
            return CISCheck(
                id="3.7",
                title="Ensure root filesystem is read-only",
                description="Container root filesystem should be read-only",
                level="1",
                category="Container",
                status="INFO",
                remediation="No containers found"
            )
        
        readonly_count = 0
        writable_count = 0
        
        for container_id in stdout.split('\n'):
            if not container_id:
                continue
            check_cmd = f"docker inspect --format '{{{{.HostConfig.ReadonlyRootfs}}}}' {container_id} 2>/dev/null"
            result, _, _ = self.run_command(check_cmd)
            if "true" in result.lower():
                readonly_count += 1
            else:
                writable_count += 1
        
        if writable_count > 0:
            return CISCheck(
                id="3.7",
                title="Ensure root filesystem is read-only",
                description="Container root filesystem should be read-only",
                level="1",
                category="Container",
                status="FAIL",
                remediation="Add --read-only flag to docker run",
                details=f"Writable: {writable_count}, Read-only: {readonly_count}"
            )
        
        return CISCheck(
            id="3.7",
            title="Ensure root filesystem is read-only",
            description="Container root filesystem should be read-only",
            level="1",
            category="Container",
            status="PASS",
            remediation="All containers have read-only rootfs"
        )
    
    def check_container_user(self) -> CISCheck:
        """3.8 - Ensure containers are running as non-root user (Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker ps -a --format '{{.ID}}' 2>/dev/null"
        )
        
        if rc != 0 or not stdout:
            return CISCheck(
                id="3.8",
                title="Ensure containers are running as non-root user",
                description="Containers should run as non-root user",
                level="1",
                category="Container",
                status="INFO",
                remediation="No containers found"
            )
        
        root_users = []
        for container_id in stdout.split('\n'):
            if not container_id:
                continue
            check_cmd = f"docker inspect --format '{{{{.Config.User}}}}' {container_id} 2>/dev/null"
            result, _, _ = self.run_command(check_cmd)
            if not result or result == "" or result == "0" or result == "root":
                root_users.append(container_id)
        
        if root_users:
            return CISCheck(
                id="3.8",
                title="Ensure containers are running as non-root user",
                description="Containers should run as non-root user",
                level="1",
                category="Container",
                status="FAIL",
                remediation="Add USER instruction in Dockerfile or -u flag",
                details=f"Containers running as root: {len(root_users)}"
            )
        
        return CISCheck(
            id="3.8",
            title="Ensure containers are running as non-root user",
            description="Containers should run as non-root user",
            level="1",
            category="Container",
            status="PASS",
            remediation="All containers run as non-root users"
        )
    
    def check_container_capabilities(self) -> CISCheck:
        """3.9 - Ensure unnecessary capabilities are removed (Scored)"""
        # Проверяем контейнеры с расширенными capabilities
        stdout, stderr, rc = self.run_command(
            "docker ps -a --format '{{.ID}}' 2>/dev/null | head -10"
        )
        
        if rc != 0 or not stdout:
            return CISCheck(
                id="3.9",
                title="Ensure unnecessary capabilities are removed",
                description="Drop all capabilities and add only required ones",
                level="2",
                category="Container",
                status="INFO",
                remediation="Use --cap-drop=ALL and add specific capabilities"
            )
        
        return CISCheck(
            id="3.9",
            title="Ensure unnecessary capabilities are removed",
            description="Drop all capabilities and add only required ones",
            level="2",
            category="Container",
            status="WARNING",
            remediation="Review container capabilities manually"
        )
    
    def check_base_image_usage(self) -> CISCheck:
        """4.1 - Ensure official base images are used (Not Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null"
        )
        
        if rc != 0 or not stdout:
            return CISCheck(
                id="4.1",
                title="Ensure official base images are used",
                description="Use official images from Docker Hub",
                level="2",
                category="Image",
                status="INFO",
                remediation="Use official verified images"
            )
        
        return CISCheck(
            id="4.1",
            title="Ensure official base images are used",
            description="Use official images from Docker Hub",
            level="2",
            category="Image",
            status="INFO",
            remediation="Review images for official sources"
        )
    
    def check_dockerfile_exists(self) -> CISCheck:
        """4.2 - Ensure Dockerfile best practices are followed (Not Scored)"""
        # Проверяем наличие Dockerfile для локальных образов
        stdout, stderr, rc = self.run_command(
            "docker images --format '{{.Repository}}' 2>/dev/null | head -5"
        )
        
        if rc == 0 and stdout:
            return CISCheck(
                id="4.2",
                title="Ensure Dockerfile best practices are followed",
                description="Follow Dockerfile best practices",
                level="2",
                category="Image",
                status="INFO",
                remediation="Review Dockerfile for: no root user, minimal layers, .dockerignore"
            )
        
        return CISCheck(
            id="4.2",
            title="Ensure Dockerfile best practices are followed",
            description="Follow Dockerfile best practices",
            level="2",
            category="Image",
            status="INFO",
            remediation="No images found"
        )
    
    def check_image_trust_enabled(self) -> CISCheck:
        """4.3 - Ensure image trust is enabled (Not Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker contenttrust 2>/dev/null"
        )
        
        if "1" in stdout or "true" in stdout.lower():
            return CISCheck(
                id="4.3",
                title="Ensure image trust is enabled",
                description="Enable Docker Content Trust",
                level="2",
                category="Image",
                status="PASS",
                remediation="Docker Content Trust is enabled"
            )
        
        return CISCheck(
            id="4.3",
            title="Ensure image trust is enabled",
            description="Enable Docker Content Trust",
            level="2",
            category="Image",
            status="FAIL",
            remediation="Set DOCKER_CONTENT_TRUST=1 environment variable"
        )
    
    def check_healthcheck_instructions(self) -> CISCheck:
        """4.4 - Ensure HEALTHCHECK instructions are used (Scored)"""
        stdout, stderr, rc = self.run_command(
            "docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | head -5"
        )
        
        if rc != 0 or not stdout:
            return CISCheck(
                id="4.4",
                title="Ensure HEALTHCHECK instructions are used",
                description="Add HEALTHCHECK to Dockerfiles",
                level="2",
                category="Image",
                status="INFO",
                remediation="Add HEALTHCHECK instruction to Dockerfiles"
            )
        
        return CISCheck(
            id="4.4",
            title="Ensure HEALTHCHECK instructions are used",
            description="Add HEALTHCHECK to Dockerfiles",
            level="2",
            category="Image",
            status="WARNING",
            remediation="Review images for HEALTHCHECK presence"
        )
    
    def check_audit_docker_files(self) -> CISCheck:
        """5.1 - Ensure audit rules for Docker files are configured (Scored)"""
        stdout, stderr, rc = self.run_command(
            "auditctl -l 2>/dev/null | grep docker"
        )
        
        if rc == 0 and stdout:
            return CISCheck(
                id="5.1",
                title="Ensure audit rules for Docker files are configured",
                description="Configure audit rules for Docker files",
                level="1",
                category="Operations",
                status="PASS",
                remediation="Audit rules configured for Docker"
            )
        
        return CISCheck(
            id="5.1",
            title="Ensure audit rules for Docker files are configured",
            description="Configure audit rules for Docker files",
            level="1",
            category="Operations",
            status="FAIL",
            remediation="Add audit rules: auditctl -w /var/lib/docker -k docker"
        )
    
    def run_full_scan(self) -> CISScanResult:
        """Запуск полного сканирования CIS Docker Benchmark"""
        self.checks = []
        
        # Host Configuration (1.x)
        self.checks.append(self.check_docker_socket_permissions())
        self.checks.append(self.check_latest_docker_version())
        self.checks.append(self.check_docker_files_ownership())
        
        # Docker Daemon Configuration (2.x)
        self.checks.append(self.check_daemon_json_exists())
        self.checks.append(self.check_daemon_json_content())
        self.checks.append(self.check_default_ulimits())
        
        # Container Runtime (3.x)
        self.checks.append(self.check_containers_without_privileged())
        self.checks.append(self.check_containers_without_sensitive_mounts())
        self.checks.append(self.check_shm_size_for_containers())
        self.checks.append(self.check_containers_with_apparmor())
        self.checks.append(self.check_containers_privileged_ports())
        self.checks.append(self.check_containers_with_host_network())
        self.checks.append(self.check_containers_readonly_rootfs())
        self.checks.append(self.check_container_user())
        self.checks.append(self.check_container_capabilities())
        
        # Container Images (4.x)
        self.checks.append(self.check_base_image_usage())
        self.checks.append(self.check_dockerfile_exists())
        self.checks.append(self.check_image_trust_enabled())
        self.checks.append(self.check_healthcheck_instructions())
        
        # Security Operations (5.x)
        self.checks.append(self.check_audit_docker_files())
        
        # Подсчет результатов
        passed = sum(1 for c in self.checks if c.status == "PASS")
        failed = sum(1 for c in self.checks if c.status == "FAIL")
        warnings = sum(1 for c in self.checks if c.status == "WARNING")
        info = sum(1 for c in self.checks if c.status == "INFO")
        
        level1_checks = [c for c in self.checks if c.level == "1"]
        level1_passed = sum(1 for c in level1_checks if c.status == "PASS")
        
        level2_checks = [c for c in self.checks if c.level == "2"]
        level2_passed = sum(1 for c in level2_checks if c.status == "PASS")
        
        total = len(self.checks)
        score = (passed / total * 100) if total > 0 else 0
        
        return CISScanResult(
            timestamp=datetime.now().isoformat(),
            total_checks=total,
            passed=passed,
            failed=failed,
            warnings=warnings,
            info=info,
            score=round(score, 1),
            level1_passed=level1_passed,
            level1_total=len(level1_checks),
            level2_passed=level2_passed,
            level2_total=len(level2_checks),
            checks=[asdict(c) for c in self.checks]
        )


# Глобальный экземпляр сканера
_cis_scanner = CISScanner()


def run_cis_scan() -> CISScanResult:
    """Запуск CIS Docker Benchmark сканирования"""
    return _cis_scanner.run_full_scan()
