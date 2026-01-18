"""
Trivy Docker Image Vulnerability Scanner
Интегрирует Trivy для сканирования Docker образов на уязвимости
"""

import subprocess
import json
import logging
import os
from typing import Dict, List, Optional, Any
from datetime import datetime
import docker

logger = logging.getLogger(__name__)


class TrivyScanner:
    """Класс для сканирования Docker образов с помощью Trivy"""
    
    def __init__(self):
        self.docker_client = None
        try:
            # Try standard connection first
            self.docker_client = docker.from_env()
            logger.info("✅ Docker client initialized (standard)")
        except Exception as e:
            logger.warning(f"Docker client (standard) failed: {e}")
            try:
                # macOS Docker Desktop uses ~/.docker/run/docker.sock
                # On macOS, /var/run/docker.sock is often a symlink
                possible_sockets = [
                    "/Users/mac/.docker/run/docker.sock",  # Docker Desktop macOS (priority)
                    "/var/run/docker.sock",                 # Linux / Symlink on macOS
                    os.path.expanduser("~/.docker/run/docker.sock"),  # User home variation
                    os.path.expanduser("~/.colima/docker.sock"),      # Colima (macOS alternative)
                ]
                
                for socket_path in possible_sockets:
                    if os.path.exists(socket_path):
                        logger.info(f"Found Docker socket: {socket_path}")
                        try:
                            self.docker_client = docker.DockerClient(base_url=f"unix://{socket_path}")
                            # Test the connection
                            self.docker_client.ping()
                            logger.info(f"✅ Docker client initialized with socket: {socket_path}")
                            break
                        except Exception as socket_error:
                            logger.warning(f"Socket {socket_path} exists but failed to connect: {socket_error}")
                            self.docker_client = None
                            continue
                
                if not self.docker_client:
                    logger.warning("⚠️  Could not connect to Docker via any socket")
            except Exception as e2:
                logger.warning(f"Docker client (alternative) failed: {e2}")
    
    @staticmethod
    def check_trivy_installed() -> bool:
        """Проверяет, установлен ли Trivy"""
        try:
            subprocess.run(
                ["trivy", "version"],
                capture_output=True,
                check=True,
                timeout=5
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    @staticmethod
    def scan_image(image_name: str) -> Dict[str, Any]:
        """
        Сканирует Docker образ на уязвимости с помощью Trivy
        
        Args:
            image_name: Имя или ID образа (например: "ubuntu:20.04" или "nginx:latest")
        
        Returns:
            Dict с результатами сканирования
        """
        try:
            # Запускаем Trivy с JSON выводом
            result = subprocess.run(
                [
                    "trivy",
                    "image",
                    "--format", "json",
                    "--severity", "HIGH,CRITICAL",  # Только высокие и критические
                    image_name
                ],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            # Парсим JSON результат
            if result.returncode in [0, 1]:  # 0 = no vulns, 1 = vulns found
                try:
                    report = json.loads(result.stdout)
                    return TrivyScanner._parse_trivy_report(report, image_name)
                except json.JSONDecodeError:
                    return {
                        "image": image_name,
                        "status": "error",
                        "error": "Failed to parse Trivy output",
                        "raw_output": result.stdout[:500],
                        "timestamp": datetime.now().isoformat()
                    }
            else:
                return {
                    "image": image_name,
                    "status": "error",
                    "error": result.stderr or "Trivy scan failed",
                    "timestamp": datetime.now().isoformat()
                }
        
        except subprocess.TimeoutExpired:
            return {
                "image": image_name,
                "status": "error",
                "error": "Scan timeout (exceeded 120 seconds)",
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Trivy scan error for {image_name}: {e}")
            return {
                "image": image_name,
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    @staticmethod
    def _parse_trivy_report(report: Dict, image_name: str) -> Dict[str, Any]:
        """
        Парсит результат Trivy и форматирует в удобный вид
        
        Args:
            report: Raw JSON от Trivy
            image_name: Имя образа
        
        Returns:
            Отформатированный результат с информацией о проверенных компонентах
        """
        vulnerabilities = []
        summary = {
            "total": 0,
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0
        }
        
        # Информация о проверенных компонентах
        scanned_components = []
        
        # Извлекаем уязвимости и информацию о компонентах из всех результатов
        results = report.get("Results", [])
        for result in results:
            # Сохраняем информацию о проверенном компоненте
            component_info = {
                "target": result.get("Target", "Unknown"),
                "type": result.get("Type", "unknown"),
                "class": result.get("Class", "unknown"),
                "packages_count": len(result.get("Packages", [])),
                "vulnerabilities_count": len(result.get("Vulnerabilities", []))
            }
            scanned_components.append(component_info)
            
            # Обработка уязвимостей
            vulnerabilities_list = result.get("Vulnerabilities", [])
            for vuln in vulnerabilities_list:
                severity = vuln.get("Severity", "UNKNOWN").upper()
                
                # Обновляем статистику
                summary["total"] += 1
                if severity in summary:
                    summary[severity] += 1
                
                vulnerabilities.append({
                    "id": vuln.get("VulnerabilityID", "N/A"),
                    "title": vuln.get("Title", "Unknown vulnerability"),
                    "severity": severity,
                    "description": vuln.get("Description", ""),
                    "fix": vuln.get("FixedVersion", ""),
                    "references": vuln.get("References", []),
                    "package_name": vuln.get("PkgName", ""),
                    "installed_version": vuln.get("InstalledVersion", "")
                })
        
        return {
            "image": image_name,
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "summary": summary,
            "vulnerabilities": vulnerabilities,
            "scanned_components": scanned_components,
            "scan_tool": "trivy",
            "scan_type": "image-vulnerability"
        }
    
    def get_local_images(self) -> List[Dict[str, str]]:
        """Получает список локальных Docker образов"""
        if not self.docker_client:
            return []
        
        try:
            images = self.docker_client.images.list()
            result = []
            for image in images:
                if image.tags:
                    for tag in image.tags:
                        result.append({
                            "name": tag,
                            "id": image.id.replace("sha256:", "")[:12],
                            "size": image.attrs.get("Size", 0)
                        })
                else:
                    result.append({
                        "name": f"<none>:<none>",
                        "id": image.id.replace("sha256:", "")[:12],
                        "size": image.attrs.get("Size", 0)
                    })
            return result
        except Exception as e:
            logger.error(f"Error getting Docker images: {e}")
            return []


# Глобальный экземпляр сканера
trivy_scanner = TrivyScanner()
