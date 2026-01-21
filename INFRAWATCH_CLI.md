# 🚀 Quick Start Guide - InfraWatch CLI

## Using the `infrawatch` Command

The `infrawatch` command is your new unified interface for managing the InfraWatch project. It replaces the traditional `make` commands with a more intuitive command structure.

### First Time Setup

```bash
# 1. Navigate to the InfraWatch project directory (optional)
cd /path/to/InfraWatch

# 2. Run the complete setup
infrawatch setup

# This will:
# - Check system dependencies
# - Install all Python/Node.js/Go dependencies
# - Build necessary binaries
```

### Start Development

```bash
# Start all services
infrawatch start

# In your browser:
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:8000
# - API Docs: http://localhost:8000/docs
```

### Monitor Services

```bash
# Check service status
infrawatch status

# View all logs in real-time
infrawatch logs

# View specific service logs
infrawatch logs backend
infrawatch logs frontend
infrawatch logs agent

# Exit logs with Ctrl+C
```

### Stop Services

```bash
infrawatch stop
```

## Available Commands

### Core Operations
- `infrawatch start` - Start all services
- `infrawatch stop` - Stop all services
- `infrawatch restart` - Restart all services
- `infrawatch status` - Check service status

### Installation & Setup
- `infrawatch setup` - Complete project setup
- `infrawatch install` - Install all dependencies
- `infrawatch install-backend` - Install backend only
- `infrawatch install-frontend` - Install frontend only
- `infrawatch install-agent` - Install agent only

### Logs & Debugging
- `infrawatch logs` - Show all logs
- `infrawatch logs backend`
- `infrawatch logs frontend`
- `infrawatch logs agent`

### Development
- `infrawatch dev` - Quick dev start
- `infrawatch build-agent` - Build Go agent
- `infrawatch deploy` - Docker deployment

### Maintenance
- `infrawatch clean` - Clean artifacts
- `infrawatch clean --all` - Full cleanup
- `infrawatch check-deps` - Check dependencies

### Info
- `infrawatch version` - Show version
- `infrawatch info` - Project information
- `infrawatch --help` - Show help

## Common Workflows

### Quick Development Session
```bash
infrawatch start          # Start all services
infrawatch status         # Check they're running
infrawatch logs           # Monitor in real-time
# ... do your development ...
infrawatch stop           # Clean shutdown
```

### Troubleshooting
```bash
infrawatch status                 # See what's running
infrawatch logs backend           # Check backend errors
infrawatch restart                # Full restart
infrawatch clean && infrawatch setup  # Fresh start
```

### Fresh Install
```bash
infrawatch clean --all            # Remove old files
infrawatch setup                  # Fresh install
infrawatch start                  # Launch
```

## Port Information

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:8000
- **Agent**: localhost:8081

## Custom Ports

```bash
export BACKEND_PORT=8001
export FRONTEND_PORT=5174
infrawatch start
```

## For More Details

See [CLI_GUIDE.md](./CLI_GUIDE.md) for comprehensive command reference.

---

**Tip**: The `infrawatch` command automatically finds your project root, so you can run it from any directory!
