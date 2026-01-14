#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting InfraWatch Development Environment${NC}"
echo "=========================================="

# Function to check if a command is available
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        exit 1
    fi
}

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}Port $1 is already in use. Trying to free...${NC}"
        lsof -ti:$1 | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Check required commands
check_command python3
check_command npm

# Check if Docker Desktop is running
echo -e "${YELLOW}Checking Docker Desktop...${NC}"

# Check if docker command exists
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker command not found in PATH. Trying /usr/local/bin/docker...${NC}"
    # Try common Docker paths on macOS
    if [ -f "/usr/local/bin/docker" ]; then
        DOCKER_CMD="/usr/local/bin/docker"
    elif [ -f "/opt/homebrew/bin/docker" ]; then
        DOCKER_CMD="/opt/homebrew/bin/docker"
    else
        echo -e "${RED}❌ Docker is not installed or not in PATH${NC}"
        DOCKER_CMD="docker"
    fi
else
    DOCKER_CMD="docker"
fi

# Determine which timeout command to use (macOS uses gtimeout or no timeout at all)
if command -v timeout &> /dev/null; then
    TIMEOUT_CMD="timeout 3"
elif command -v gtimeout &> /dev/null; then
    TIMEOUT_CMD="gtimeout 3"
else
    TIMEOUT_CMD=""
fi

# Function to check Docker with timeout and proper error handling
check_docker() {
    if [ -z "$TIMEOUT_CMD" ]; then
        # No timeout available, just run docker info directly
        $DOCKER_CMD info >/dev/null 2>&1
    else
        $TIMEOUT_CMD $DOCKER_CMD info >/dev/null 2>&1
    fi
    return $?
}

# First check if Docker is already running
if check_docker; then
    echo -e "${GREEN}✓ Docker Desktop is running${NC}"
else
    # Docker is not responding or not running, try to start it
    echo -e "${YELLOW}Docker is not responding. Opening Docker Desktop...${NC}"
    open -a Docker 2>/dev/null || echo -e "${YELLOW}Could not open Docker application${NC}"
    
    # Wait for Docker to be ready
    DOCKER_MAX_WAIT=60
    DOCKER_WAIT_COUNT=0
    
    echo -n "Waiting for Docker"
    while ! check_docker; do
        DOCKER_WAIT_COUNT=$((DOCKER_WAIT_COUNT + 1))
        if [ $DOCKER_WAIT_COUNT -gt $DOCKER_MAX_WAIT ]; then
            echo ""
            echo -e "${YELLOW}⚠️  Docker Desktop is taking too long to start${NC}"
            echo -e "${YELLOW}Continuing anyway - Docker features may be limited${NC}"
            break
        fi
        
        echo -n "."
        sleep 1
    done
    
    echo ""
    if check_docker; then
        echo -e "${GREEN}✓ Docker Desktop is now running${NC}"
    else
        echo -e "${YELLOW}⚠️  Docker is still not responding${NC}"
    fi
fi

# Clean up existing processes
echo -e "${YELLOW}Cleaning up existing processes...${NC}"
check_port 8000
check_port 5173
pkill -f "uvicorn" || true
pkill -f "vite" || true

# Create log directory
mkdir -p logs

# Function to handle cleanup
cleanup() {
    echo -e "\n${YELLOW}Shutting down InfraWatch...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo -e "${GREEN}All services stopped. Goodbye! 👋${NC}"
    exit 0
}

trap cleanup INT TERM

# Start Backend
echo -e "\n${CYAN}=== Starting Backend (FastAPI) ===${NC}"
echo -e "${GREEN}API: http://localhost:8000${NC}"
echo -e "${GREEN}Docs: http://localhost:8000/docs${NC}"
cd backend
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi
source venv/bin/activate

# Update pip and install dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip > /dev/null 2>&1

# Create requirements.txt if it doesn't exist
if [ ! -f "requirements.txt" ]; then
    cat > requirements.txt << 'EOF'
fastapi>=0.104.1
uvicorn[standard]>=0.24.0
psutil>=5.9.6
pydantic>=2.5.0
docker>=7.0.0
requests>=2.31.0
EOF
fi

pip install -r requirements.txt > /dev/null 2>&1

# Запускаем бэкенд
echo "Starting FastAPI server..."
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000 --log-level info > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to start
echo -e "${YELLOW}Waiting for backend to start...${NC}"
sleep 5
for i in {1..30}; do
    if curl -s http://localhost:8000/ > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready!${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

# Start Frontend
echo -e "\n${CYAN}=== Starting Frontend (Vite) ===${NC}"
echo -e "${GREEN}URL: http://localhost:5173${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install > /dev/null 2>&1
fi
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo ""
echo -e "${BLUE}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Services started successfully!${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}📊 Service Status:${NC}"
echo -e "  ${GREEN}✓ Backend API:    ${NC}http://localhost:8000"
echo -e "  ${GREEN}✓ API Documentation: ${NC}http://localhost:8000/docs"
echo -e "  ${GREEN}✓ Frontend App:   ${NC}http://localhost:5173"
echo -e "  ${YELLOW}⚠ Agent:          ${NC}Temporarily disabled (Go compilation issues)"
echo ""
echo -e "${CYAN}🔍 Test Endpoints:${NC}"
echo -e "  ${YELLOW}↪  Docker Debug:   ${NC}http://localhost:8000/api/v1/docker/debug"
echo -e "  ${YELLOW}↪  Docker Metrics: ${NC}http://localhost:8000/api/v1/docker/metrics"
echo -e "  ${YELLOW}↪  Docker Simple:  ${NC}http://localhost:8000/api/v1/docker/simple"
echo -e "  ${YELLOW}↪  System Info:    ${NC}http://localhost:8000/api/v1/system/info"
echo ""
echo -e "${CYAN}📋 Log Files:${NC}"
echo -e "  ${BLUE}tail -f logs/backend.log${NC}    - Backend logs"
echo -e "  ${BLUE}tail -f logs/frontend.log${NC}   - Frontend logs"
echo ""
echo -e "${RED}⚠️  Press Ctrl+C to stop all services${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════${NC}"

# Start Agent (build if necessary)
echo -e "\n${CYAN}=== Starting Agent (Go) ===${NC}"
AGENT_DIR="agent/cmd/agent"
if [ ! -f "$AGENT_DIR/agent" ]; then
    echo "Building agent binary..."
    (cd $AGENT_DIR && go build -o agent main.go docker_monitor.go) > /dev/null 2>&1 || true
fi
if [ -f "$AGENT_DIR/agent" ]; then
    # Ensure logs directory
    mkdir -p logs
    echo "Starting agent binary..."
    # Ensure Docker socket/environment is visible to the agent when possible
    if [ -z "$DOCKER_HOST" ] && [ -S "/var/run/docker.sock" ]; then
        export DOCKER_HOST="unix:///var/run/docker.sock"
        echo -e "${YELLOW}Exported DOCKER_HOST=$DOCKER_HOST for agent (found unix socket)${NC}"
    fi
    # Start agent with AGENT_DEBUG enabled to aid troubleshooting
    (cd $AGENT_DIR && AGENT_DEBUG=1 ./agent > ../../../logs/agent.log 2>&1 &) || true
    # Try to capture pid of started agent
    sleep 1
    AGENT_PID=$(pgrep -f "agent/cmd/agent/agent" || true)
    if [ -n "$AGENT_PID" ]; then
        echo -e "${GREEN}✓ Agent started (PID: $AGENT_PID)${NC}"
    else
        echo -e "${YELLOW}⚠ Agent binary started but PID not found. Check logs.${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Agent binary not found and build failed. Agent will be disabled.${NC}"
fi

# Wait for all processes
wait $BACKEND_PID $FRONTEND_PID