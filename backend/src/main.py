"""Ahova API v2.6 - Main Application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
import asyncio

from .middleware import (
    verify_agent_middleware,
    get_allowed_origins,
    limiter
)
from .stores import cleanup_old_metrics

# Import routers
from .routers.metrics_router import router as metrics_router
from .routers.docker_router import router as docker_router
from .routers.process_router import router as process_router
from .routers.security_router import router as security_router
from .routers.system_router import router as system_router
from .routers.auth_router import router as auth_router

# Create FastAPI app
app = FastAPI(
    title="Ahova API v2.6",
    description="Advanced Infrastructure Monitoring System with Authentication",
    version="2.6.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add auth middleware
app.middleware("http")(verify_agent_middleware)

# Add CORS with whitelist
allowed_origins = get_allowed_origins()
print(f"🔒 Allowed CORS origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(metrics_router)
app.include_router(docker_router)
app.include_router(process_router)
app.include_router(security_router)
app.include_router(system_router)
app.include_router(auth_router)


@app.on_event("startup")
async def startup_event():
    """Start background tasks."""
    asyncio.create_task(cleanup_old_metrics_task())
    print("✅ Ahova API v2.6 started")
    print("📚 API Documentation: http://localhost:8000/docs")


async def cleanup_old_metrics_task():
    """Background task to clean old metrics."""
    while True:
        try:
            await asyncio.sleep(300)  # 5 minutes
            cleanup_old_metrics()
        except Exception as e:
            print(f"Error during cleanup: {e}")
