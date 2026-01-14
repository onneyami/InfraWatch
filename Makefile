.PHONY: help install install-backend install-frontend install-agent start stop restart clean logs test test-backend test-frontend deploy dev setup check-deps

# Variables
BACKEND_PORT ?= 8000
FRONTEND_PORT ?= 5173
AGENT_PORT ?= 8081

help:
	@echo "InfraWatch - Infrastructure Monitoring System"
	@echo ""
	@echo "Commands:"
	@echo "  make setup           - Full project setup (recommended first time)"
	@echo "  make install         - Install all dependencies"
	@echo "  make install-backend - Install backend dependencies"
	@echo "  make install-frontend- Install frontend dependencies"
	@echo "  make install-agent   - Install agent dependencies"
	@echo "  make check-deps      - Check system dependencies"
	@echo "  make start           - Start all services (using run-dev.sh)"
	@echo "  make stop            - Stop all services"
	@echo "  make restart         - Restart all services"
	@echo "  make clean           - Clean up build artifacts"
	@echo "  make clean-all       - Full clean (including node_modules and venv)"
	@echo "  make logs            - Show logs for all services"
	@echo "  make logs-backend    - Show backend logs"
	@echo "  make logs-frontend   - Show frontend logs"
	@echo "  make logs-agent      - Show agent logs"
	@echo "  make test            - Run all tests"
	@echo "  make test-backend    - Run backend tests"
	@echo "  make test-frontend   - Run frontend tests"
	@echo "  make deploy          - Deploy with Docker Compose"
	@echo "  make dev             - Quick development start"
	@echo "  make status          - Check service status"
	@echo "  make build-agent     - Build Go agent"

setup: check-deps install
	@echo "✅ Setup complete! Run 'make start' to launch InfraWatch"

check-deps:
	@echo "🔍 Checking system dependencies..."
	@command -v python3 >/dev/null 2>&1 || (echo "❌ Python3 is required" && exit 1)
	@command -v pip3 >/dev/null 2>&1 || (echo "❌ pip3 is required" && exit 1)
	@command -v node >/dev/null 2>&1 || (echo "❌ Node.js is required" && exit 1)
	@command -v npm >/dev/null 2>&1 || (echo "❌ npm is required" && exit 1)
	@command -v go >/dev/null 2>&1 || (echo "❌ Go is required" && exit 1)
	@command -v docker >/dev/null 2>&1 || echo "⚠️  Docker is not installed (Docker features will be limited)"
	@echo "✅ All dependencies found"

install: install-backend install-frontend install-agent
	@echo "✅ All dependencies installed"

install-backend:
	@echo "Installing backend dependencies..."
	@cd backend && python3 -m venv venv 2>/dev/null || true
	@cd backend && . venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
	@echo "✅ Backend dependencies installed"

install-frontend:
	@echo "Installing frontend dependencies..."
	@cd frontend && npm install
	@echo "✅ Frontend dependencies installed"

install-agent:
	@echo "Installing agent dependencies..."
	@cd agent/cmd/agent && go mod download
	@echo "✅ Agent dependencies installed"

build-agent:
	@echo "Building agent binary..."
	@cd agent/cmd/agent && go build -o agent main.go docker_monitor.go
	@echo "✅ Agent binary built: agent/cmd/agent/agent"

start:
	@chmod +x run-dev.sh
	@./run-dev.sh

stop:
	@echo "Stopping all services..."
	@pkill -f "uvicorn" || true
	@pkill -f "vite" || true
	@pkill -f "./agent" || true
	@pkill -f "go run" || true
	@-lsof -ti:$(BACKEND_PORT) | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(FRONTEND_PORT) | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(AGENT_PORT) | xargs kill -9 2>/dev/null || true
	@echo "✅ All services stopped"

restart: stop
	@sleep 2
	@make start

status:
	@echo "Service Status:"
	@echo -n "Backend (port $(BACKEND_PORT)): "
	@if lsof -Pi :$(BACKEND_PORT) -sTCP:LISTEN -t >/dev/null; then \
		echo "✅ Running"; \
	else \
		echo "❌ Stopped"; \
	fi
	@echo -n "Frontend (port $(FRONTEND_PORT)): "
	@if lsof -Pi :$(FRONTEND_PORT) -sTCP:LISTEN -t >/dev/null; then \
		echo "✅ Running"; \
	else \
		echo "❌ Stopped"; \
	fi
	@echo -n "Agent (port $(AGENT_PORT)): "
	@if lsof -Pi :$(AGENT_PORT) -sTCP:LISTEN -t >/dev/null; then \
		echo "✅ Running (listening)"; \
	elif pgrep -f "agent" >/dev/null 2>&1; then \
		echo "✅ Running (process)"; \
	else \
		echo "❌ Stopped"; \
	fi

clean:
	@echo "Cleaning up..."
	@rm -rf backend/__pycache__
	@rm -rf backend/src/__pycache__
	@rm -rf logs/
	@rm -f agent/cmd/agent/agent
	@find . -name "*.pyc" -delete
	@find . -name "__pycache__" -delete
	@find . -name "*.log" -delete
	@echo "✅ Cleanup complete"

clean-all: clean
	@echo "Cleaning all dependencies..."
	@rm -rf backend/venv
	@rm -rf frontend/node_modules
	@rm -rf frontend/.next
	@rm -rf frontend/dist
	@echo "✅ Full cleanup complete"

logs:
	@echo "📊 Viewing all logs (Ctrl+C to exit)..."
	@tail -f logs/backend.log -f logs/frontend.log -f logs/agent.log 2>/dev/null || \
		echo "Logs not found. Run 'make start' first."

logs-backend:
	@tail -f logs/backend.log 2>/dev/null || \
		echo "Backend log not found. Run 'make start' first."

logs-frontend:
	@tail -f logs/frontend.log 2>/dev/null || \
		echo "Frontend log not found. Run 'make start' first."

logs-agent:
	@tail -f logs/agent.log 2>/dev/null || \
		echo "Agent log not found. Run 'make start' first."

test: test-backend test-frontend
	@echo "✅ All tests passed"

test-backend:
	@echo "Running backend tests..."
	@cd backend && source venv/bin/activate && python -m pytest tests/ -v

test-frontend:
	@echo "Running frontend tests..."
	@cd frontend && npm test

deploy:
	@echo "Building and deploying with Docker..."
	@docker-compose down
	@docker-compose build
	@docker-compose up -d
	@echo "✅ Services deployed!"
	@echo "Frontend: http://localhost:3000"
	@echo "Backend:  http://localhost:8000"

# Quick development start (minimal)
dev:
	@echo "Starting development environment..."
	@echo "Starting development environment (run-dev.sh)..."
	@chmod +x run-dev.sh || true
	@AGENT_PORT=$(AGENT_PORT) ./run-dev.sh