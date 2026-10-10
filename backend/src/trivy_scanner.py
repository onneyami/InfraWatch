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
        vulnerabilities_seen = set()  # Для дедубликации по ID
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
                vuln_id = vuln.get("VulnerabilityID", "N/A")
                
                # Пропускаем дубликаты - учитываем только первое появление
                if vuln_id in vulnerabilities_seen:
                    continue
                vulnerabilities_seen.add(vuln_id)
                
                severity = vuln.get("Severity", "UNKNOWN").upper()
                severity_lower = severity.lower()
                
                # Обновляем статистику
                summary["total"] += 1
                if severity_lower in summary:
                    summary[severity_lower] += 1
                
                vulnerabilities.append({
                    "id": vuln_id,
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

    @staticmethod
    def scan_secrets(image_name: str) -> Dict[str, Any]:
        """
        Сканирует Docker образ на секреты с помощью Trivy

        Args:
            image_name: Имя или ID образа
        
        Returns:
            Dict с результатами сканирования секретов
        """
        try:
            # Запускаем Trivy с сканером секретов
            result = subprocess.run(
                [
                    "trivy",
                    "image",
                    "--scanners", "secret",
                    "--format", "json",
                    image_name
                ],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode in [0, 1]:
                try:
                    report = json.loads(result.stdout)
                    return TrivyScanner._parse_secrets_report(report, image_name)
                except json.JSONDecodeError:
                    return {
                        "image": image_name,
                        "status": "error",
                        "error": "Failed to parse Trivy secrets output",
                        "raw_output": result.stdout[:500],
                        "timestamp": datetime.now().isoformat()
                    }
            else:
                return {
                    "image": image_name,
                    "status": "error",
                    "error": result.stderr or "Trivy secrets scan failed",
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
            logger.error(f"Trivy secrets scan error for {image_name}: {e}")
            return {
                "image": image_name,
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    @staticmethod
    def _parse_secrets_report(report: Dict, image_name: str) -> Dict[str, Any]:
        """
        Парсит результат сканирования секретов
        
        Args:
            report: Raw JSON от Trivy
            image_name: Имя образа
        
        Returns:
            Отформатированный результат с найденными секретами
        """
        secrets = []
        secrets_seen = set()  # Для дедубликации
        summary = {
            "total": 0,
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0
        }
        
        # Категории секретов
        secret_types = {}
        
        results = report.get("Results", [])
        for result in results:
            secrets_list = result.get("Secrets", [])
            for secret in secrets_list:
                secret_id = f"{secret.get('RuleID', '')}-{secret.get('Target', '')}"
                
                if secret_id in secrets_seen:
                    continue
                secrets_seen.add(secret_id)
                
                severity = secret.get("Severity", "UNKNOWN").upper()
                severity_lower = severity.lower()
                
                # Обновляем статистику
                summary["total"] += 1
                if severity_lower in summary:
                    summary[severity_lower] += 1
                
                # Категоризация по типу
                category = secret.get("Category", "Unknown")
                if category not in secret_types:
                    secret_types[category] = 0
                secret_types[category] += 1
                
                # Маскируем часть значения для безопасности
                raw_value = secret.get("Match", "")
                masked_value = TrivyScanner._mask_secret(raw_value)
                
                secrets.append({
                    "id": secret.get("RuleID", "N/A"),
                    "title": secret.get("Title", "Secret detected"),
                    "category": category,
                    "severity": severity,
                    "description": secret.get("Description", ""),
                    "file": secret.get("Target", ""),
                    "line": secret.get("StartLine", 0),
                    "end_line": secret.get("EndLine", 0),
                    "masked_value": masked_value,
                    "match": secret.get("Match", "")[:50] + "..." if len(secret.get("Match", "")) > 50 else secret.get("Match", "")
                })
        
        return {
            "image": image_name,
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "summary": summary,
            "secrets": secrets,
            "secret_types": secret_types,
            "scan_tool": "trivy",
            "scan_type": "secrets"
        }
    
    @staticmethod
    def _mask_secret(value: str) -> str:
        """Маскирует секрет для безопасного отображения"""
        if not value:
            return "***"
        
        if len(value) <= 8:
            return "*" * len(value)
        
        # Показываем только первые 4 и последние 4 символа
        return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"


# Глобальный экземпляр сканера
trivy_scanner = TrivyScanner()
