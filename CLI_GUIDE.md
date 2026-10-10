# Ahova CLI Guide

## Overview

The `ahova` command is a unified command-line interface that replaces the traditional `make` commands for managing the Ahova project. It provides a more intuitive and user-friendly way to control all project operations.

## Installation

The `ahova` command is already installed globally in `/usr/local/bin/ahova` and should be available system-wide.

### Verify Installation

```bash
ahova version
```

## Quick Start

### 1. Initial Setup
```bash
ahova setup        # Full setup (recommended first time)
```

### 2. Start Services
```bash
ahova start        # Start all services
```

### 3. Check Status
```bash
ahova status       # Check if services are running
```

### 4. View Logs
```bash
ahova logs         # View all logs
ahova logs backend # View backend logs only
```

### 5. Stop Services
```bash
ahova stop         # Stop all services
```

## Command Reference

### Service Management

| Command | Description |
|---------|-------------|
| `ahova start` | Start all Ahova services (backend, frontend, agent) |
| `ahova stop` | Stop all running services |
| `ahova restart` | Restart all services |
| `ahova status` | Check the status of all services |

### Dependency Management

| Command | Description |
|---------|-------------|
| `ahova install` | Install all dependencies (backend, frontend, agent) |
| `ahova install-backend` | Install Python backend dependencies only |
| `ahova install-frontend` | Install Node.js frontend dependencies only |
| `ahova install-agent` | Install Go agent dependencies only |

### Development & Debugging

| Command | Description |
|---------|-------------|
| `ahova dev` | Quick development start (minimal setup) |
| `ahova logs` | Show all service logs in real-time |
| `ahova logs backend` | Show backend logs only |
| `ahova logs frontend` | Show frontend logs only |
| `ahova logs agent` | Show agent logs only |

### Building & Deployment

| Command | Description |
|---------|-------------|
| `ahova build-agent` | Compile the Go agent binary |
| `ahova deploy` | Deploy with Docker Compose |

### Maintenance

| Command | Description |
|---------|-------------|
| `ahova setup` | Full project setup (install all dependencies) |
| `ahova clean` | Clean build artifacts and cache |
| `ahova clean --all` | Full cleanup (removes venv, node_modules) |
| `ahova check-deps` | Verify system dependencies are installed |

### Information

| Command | Description |
|---------|-------------|
| `ahova version` | Show Ahova version |
| `ahova info` | Display project information |
| `ahova --help` | Show help message |

## Usage Examples

### Complete Workflow

```bash
# 1. Initial setup
ahova setup

# 2. Start services
ahova start

# 3. View status
ahova status

# 4. Check backend logs if needed
ahova logs backend

# 5. Stop when done
ahova stop
```

### Development Workflow

```bash
# Quick development environment
ahova dev

# In another terminal, view logs
ahova logs

# Restart if needed
ahova restart
```

### Fresh Start

```bash
# Complete cleanup and reinstall
ahova clean --all
ahova install
ahova start
```

## Service Ports

The Ahova services run on the following ports:

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

# Then run ahova
ahova start
```

## Project Root Detection

The `ahova` command automatically detects the Ahova project root by:

1. Checking the `AHOVA_ROOT` environment variable
2. Looking in the current working directory
3. Searching parent directories (up to 5 levels)
4. Checking common installation paths:
   - `~/Documents/Ahova_2.0/Ahova`
   - `~/Documents/Ahova`
   - `~/Ahova`
   - `/opt/ahova`
   - `/usr/local/ahova`

To manually specify the project root:

```bash
export AHOVA_ROOT=/path/to/Ahova
ahova status
```

## Troubleshooting

### Command Not Found
```bash
# Ensure the command is in PATH
which ahova

# If not found, add to shell profile
echo 'export PATH=/usr/local/bin:$PATH' >> ~/.bash_profile
source ~/.bash_profile
```

### Project Not Found
```bash
# Manually set the project root
export AHOVA_ROOT=/Users/your-username/path/to/Ahova
ahova status
```

### Port Already in Use
```bash
# Change the port
export BACKEND_PORT=8001
ahova start
```

## Comparison: make vs ahova

### Old Way (make)
```bash
make install
make start
make status
make logs-backend
make stop
make clean
```

### New Way (ahova)
```bash
ahova install
ahova start
ahova status
ahova logs backend
ahova stop
ahova clean
```

## Integration with Shell

### Bash/Zsh Aliases (Optional)

You can create aliases for frequently used commands:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias iw='ahova'
alias iw-start='ahova start'
alias iw-stop='ahova stop'
alias iw-logs='ahova logs'
alias iw-status='ahova status'
```

Then use:
```bash
iw start
iw status
iw logs
```

## Additional Resources

- **Project Repository**: https://github.com/ahova/ahova
- **Documentation**: See README.md
- **Issues**: Report issues on GitHub

## Notes

- All commands are executed from the project root directory
- Some commands require the project dependencies to be installed first
- The `ahova` command is a wrapper around the `Makefile`
- For direct access to make commands, use `make` command directly

---

For more information, run `ahova --help` or `ahova info`
