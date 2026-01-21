# InfraWatch CLI Guide

## Overview

The `infrawatch` command is a unified command-line interface that replaces the traditional `make` commands for managing the InfraWatch project. It provides a more intuitive and user-friendly way to control all project operations.

## Installation

The `infrawatch` command is already installed globally in `/usr/local/bin/infrawatch` and should be available system-wide.

### Verify Installation

```bash
infrawatch version
```

## Quick Start

### 1. Initial Setup
```bash
infrawatch setup        # Full setup (recommended first time)
```

### 2. Start Services
```bash
infrawatch start        # Start all services
```

### 3. Check Status
```bash
infrawatch status       # Check if services are running
```

### 4. View Logs
```bash
infrawatch logs         # View all logs
infrawatch logs backend # View backend logs only
```

### 5. Stop Services
```bash
infrawatch stop         # Stop all services
```

## Command Reference

### Service Management

| Command | Description |
|---------|-------------|
| `infrawatch start` | Start all InfraWatch services (backend, frontend, agent) |
| `infrawatch stop` | Stop all running services |
| `infrawatch restart` | Restart all services |
| `infrawatch status` | Check the status of all services |

### Dependency Management

| Command | Description |
|---------|-------------|
| `infrawatch install` | Install all dependencies (backend, frontend, agent) |
| `infrawatch install-backend` | Install Python backend dependencies only |
| `infrawatch install-frontend` | Install Node.js frontend dependencies only |
| `infrawatch install-agent` | Install Go agent dependencies only |

### Development & Debugging

| Command | Description |
|---------|-------------|
| `infrawatch dev` | Quick development start (minimal setup) |
| `infrawatch logs` | Show all service logs in real-time |
| `infrawatch logs backend` | Show backend logs only |
| `infrawatch logs frontend` | Show frontend logs only |
| `infrawatch logs agent` | Show agent logs only |

### Building & Deployment

| Command | Description |
|---------|-------------|
| `infrawatch build-agent` | Compile the Go agent binary |
| `infrawatch deploy` | Deploy with Docker Compose |

### Maintenance

| Command | Description |
|---------|-------------|
| `infrawatch setup` | Full project setup (install all dependencies) |
| `infrawatch clean` | Clean build artifacts and cache |
| `infrawatch clean --all` | Full cleanup (removes venv, node_modules) |
| `infrawatch check-deps` | Verify system dependencies are installed |

### Information

| Command | Description |
|---------|-------------|
| `infrawatch version` | Show InfraWatch version |
| `infrawatch info` | Display project information |
| `infrawatch --help` | Show help message |

## Usage Examples

### Complete Workflow

```bash
# 1. Initial setup
infrawatch setup

# 2. Start services
infrawatch start

# 3. View status
infrawatch status

# 4. Check backend logs if needed
infrawatch logs backend

# 5. Stop when done
infrawatch stop
```

### Development Workflow

```bash
# Quick development environment
infrawatch dev

# In another terminal, view logs
infrawatch logs

# Restart if needed
infrawatch restart
```

### Fresh Start

```bash
# Complete cleanup and reinstall
infrawatch clean --all
infrawatch install
infrawatch start
```

## Service Ports

The InfraWatch services run on the following ports:

- **Backend API**: http://localhost:8000
- **Frontend UI**: http://localhost:5173
- **Agent**: localhost:8081

## Environment Variables

You can control the service ports using environment variables:

```bash
# Set custom ports
export BACKEND_PORT=9000
export FRONTEND_PORT=5174
export AGENT_PORT=8082

# Then run infrawatch
infrawatch start
```

## Project Root Detection

The `infrawatch` command automatically detects the InfraWatch project root by:

1. Checking the `INFRAWATCH_ROOT` environment variable
2. Looking in the current working directory
3. Searching parent directories (up to 5 levels)
4. Checking common installation paths:
   - `~/Documents/InfraWatch_2.0/InfraWatch`
   - `~/Documents/InfraWatch`
   - `~/InfraWatch`
   - `/opt/infrawatch`
   - `/usr/local/infrawatch`

To manually specify the project root:

```bash
export INFRAWATCH_ROOT=/path/to/InfraWatch
infrawatch status
```

## Troubleshooting

### Command Not Found
```bash
# Ensure the command is in PATH
which infrawatch

# If not found, add to shell profile
echo 'export PATH=/usr/local/bin:$PATH' >> ~/.bash_profile
source ~/.bash_profile
```

### Project Not Found
```bash
# Manually set the project root
export INFRAWATCH_ROOT=/Users/your-username/path/to/InfraWatch
infrawatch status
```

### Port Already in Use
```bash
# Change the port
export BACKEND_PORT=8001
infrawatch start
```

## Comparison: make vs infrawatch

### Old Way (make)
```bash
make install
make start
make status
make logs-backend
make stop
make clean
```

### New Way (infrawatch)
```bash
infrawatch install
infrawatch start
infrawatch status
infrawatch logs backend
infrawatch stop
infrawatch clean
```

## Integration with Shell

### Bash/Zsh Aliases (Optional)

You can create aliases for frequently used commands:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias iw='infrawatch'
alias iw-start='infrawatch start'
alias iw-stop='infrawatch stop'
alias iw-logs='infrawatch logs'
alias iw-status='infrawatch status'
```

Then use:
```bash
iw start
iw status
iw logs
```

## Additional Resources

- **Project Repository**: https://github.com/infrawatch/infrawatch
- **Documentation**: See README.md
- **Issues**: Report issues on GitHub

## Notes

- All commands are executed from the project root directory
- Some commands require the project dependencies to be installed first
- The `infrawatch` command is a wrapper around the `Makefile`
- For direct access to make commands, use `make` command directly

---

For more information, run `infrawatch --help` or `infrawatch info`
