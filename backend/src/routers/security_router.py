"""
Security scanning router (CIS benchmark, Trivy vulnerabilities).

Endpoints:
- GET /api/v1/docker/cis/scan - CIS benchmark scan
- GET /api/v1/docker/cis/categories - CIS categories
- GET /api/v1/docker/image/{image_id}/vulnerabilities - Trivy scan
- POST /api/v1/docker/image/scan - Trivy scan (используется UI-кнопкой Scan)
- POST /api/v1/docker/image/secrets-scan - Trivy secrets scan (кнопка Secrets)
"""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

router = APIRouter(prefix="/api/v1", tags=["Security"])


class ImageScanRequest(BaseModel):
    image_name: str


@router.get("/docker/cis/scan")
async def cis_scan():
    """CIS benchmark scan"""
    try:
        from ..cis_scanner import run_cis_scan
        
        result = run_cis_scan()
        return {
            "status": "success",
            "scan_type": "cis_benchmark",
            "result": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CIS scan error: {str(e)}")


@router.get("/docker/cis/categories")
async def cis_categories():
    """CIS benchmark categories"""
    try:
        from ..cis_scanner import CIS_CATEGORIES
        
        return {
            "status": "success",
            "categories": CIS_CATEGORIES
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting categories: {str(e)}")


@router.get("/docker/image/{image_id}/vulnerabilities")
async def scan_image_vulnerabilities(image_id: str):
    """Сканирует Docker образ на уязвимости с помощью Trivy"""
    try:
        from ..trivy_scanner import trivy_scanner, TrivyScanner
        
        # Проверяем доступность Trivy
        if not TrivyScanner.check_trivy_installed():
            return {
                "status": "warning",
                "image": image_id,
                "message": "Trivy is not installed",
                "trivy_available": False
            }
        
        # Запускаем сканирование
        result = trivy_scanner.scan_image(image_id)
        return result
    
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error scanning image vulnerabilities: {str(e)}"
        )


@router.post("/docker/image/scan")
async def scan_image(request: ImageScanRequest):
    """Сканирует Docker образ на уязвимости с помощью Trivy (используется Image Vulnerability Scanner)."""
    try:
        from ..trivy_scanner import trivy_scanner, TrivyScanner

        if not TrivyScanner.check_trivy_installed():
            return {
                "status": "warning",
                "image": request.image_name,
                "message": "Trivy is not installed",
                "trivy_available": False
            }

        result = await asyncio.to_thread(trivy_scanner.scan_image, request.image_name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error scanning image: {str(e)}")


@router.post("/docker/image/secrets-scan")
async def scan_image_secrets(request: ImageScanRequest):
    """Сканирует Docker образ на секреты с помощью Trivy (используется Image Vulnerability Scanner)."""
    try:
        from ..trivy_scanner import trivy_scanner, TrivyScanner

        if not TrivyScanner.check_trivy_installed():
            return {
                "status": "warning",
                "image": request.image_name,
                "message": "Trivy is not installed",
                "trivy_available": False
            }

        result = await asyncio.to_thread(trivy_scanner.scan_secrets, request.image_name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error scanning image secrets: {str(e)}")
