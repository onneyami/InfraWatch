# InfraWatch Setup Script for Windows
# This script installs all dependencies and tools needed for the InfraWatch project

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         InfraWatch Development Environment Setup          ║" -ForegroundColor Cyan
Write-Host "║                      For Windows                          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "⚠️  This script requires Administrator privileges." -ForegroundColor Yellow
    Write-Host "   Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Running as Administrator" -ForegroundColor Green
Write-Host ""

# Function to check if command exists
function Test-CommandExists {
    param($command)
    try {
        if (Get-Command $command -ErrorAction Stop) {
            return $true
        }
    }
    catch {
        return $false
    }
}

# Install Chocolatey if not present
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 1: Installing Package Manager (Chocolatey)" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if (Test-CommandExists "choco") {
    Write-Host "✓ Chocolatey is already installed" -ForegroundColor Green
} else {
    Write-Host "Installing Chocolatey..." -ForegroundColor Yellow
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    Write-Host "✓ Chocolatey installed successfully" -ForegroundColor Green
}
Write-Host ""

# Install Node.js & npm
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 2: Installing Node.js & npm" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if (Test-CommandExists "node") {
    $nodeVersion = node --version
    Write-Host "✓ Node.js is already installed: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "Installing Node.js..." -ForegroundColor Yellow
    choco install nodejs -y
    Write-Host "✓ Node.js installed successfully" -ForegroundColor Green
}

if (Test-CommandExists "npm") {
    $npmVersion = npm --version
    Write-Host "✓ npm is already installed: v$npmVersion" -ForegroundColor Green
} else {
    Write-Host "Installing npm..." -ForegroundColor Yellow
    choco install npm -y
    Write-Host "✓ npm installed successfully" -ForegroundColor Green
}
Write-Host ""

# Install Python
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 3: Installing Python" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if (Test-CommandExists "python") {
    $pythonVersion = python --version
    Write-Host "✓ Python is already installed: $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "Installing Python..." -ForegroundColor Yellow
    choco install python -y
    Write-Host "✓ Python installed successfully" -ForegroundColor Green
}
Write-Host ""

# Install Git
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 4: Installing Git" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if (Test-CommandExists "git") {
    $gitVersion = git --version
    Write-Host "✓ Git is already installed: $gitVersion" -ForegroundColor Green
} else {
    Write-Host "Installing Git..." -ForegroundColor Yellow
    choco install git -y
    Write-Host "✓ Git installed successfully" -ForegroundColor Green
}
Write-Host ""

# Install Docker Desktop
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 5: Installing Docker Desktop" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if (Test-CommandExists "docker") {
    $dockerVersion = docker --version
    Write-Host "✓ Docker is already installed: $dockerVersion" -ForegroundColor Green
} else {
    Write-Host "Installing Docker Desktop..." -ForegroundColor Yellow
    Write-Host "Note: Docker Desktop requires restart. You can install it manually from:" -ForegroundColor Yellow
    Write-Host "https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
    # choco install docker-desktop -y
}
Write-Host ""

# Install VS Code
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 6: Installing Visual Studio Code" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if (Test-CommandExists "code") {
    Write-Host "✓ Visual Studio Code is already installed" -ForegroundColor Green
} else {
    Write-Host "Installing Visual Studio Code..." -ForegroundColor Yellow
    choco install vscode -y
    Write-Host "✓ Visual Studio Code installed successfully" -ForegroundColor Green
}
Write-Host ""

# Install Make (for Windows)
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 7: Installing Make (GNU Make for Windows)" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

if (Test-CommandExists "make") {
    $makeVersion = make --version
    Write-Host "✓ Make is already installed" -ForegroundColor Green
} else {
    Write-Host "Installing Make..." -ForegroundColor Yellow
    choco install make -y
    Write-Host "✓ Make installed successfully" -ForegroundColor Green
}
Write-Host ""

# Install project dependencies
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 8: Installing Project Dependencies" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
if (Test-Path "frontend\package.json") {
    Set-Location frontend
    npm install
    Set-Location ..
    Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "⚠️  frontend/package.json not found" -ForegroundColor Yellow
}

Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
if (Test-Path "backend\requirements.txt") {
    python -m pip install --upgrade pip
    python -m pip install -r backend/requirements.txt
    Write-Host "✓ Backend dependencies installed" -ForegroundColor Green
} else {
    Write-Host "⚠️  backend/requirements.txt not found" -ForegroundColor Yellow
}
Write-Host ""

# VS Code Extensions
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Step 9: Installing VS Code Extensions" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$extensions = @(
    "ms-python.python",                    # Python
    "ms-python.vscode-pylance",           # Python Pylance
    "ms-vscode.makefile-tools",           # Makefile Tools
    "esbenp.prettier-vscode",             # Prettier
    "dbaeumer.vscode-eslint",             # ESLint
    "Vue.volar",                          # Vue 3 Support
    "bradlc.vscode-tailwindcss",          # Tailwind CSS
    "ritwickdey.liveserver",              # Live Server
    "ms-docker.docker",                   # Docker
    "eamodio.gitlens",                    # GitLens
    "ms-vscode-remote.remote-wsl",        # WSL (optional, for Windows Subsystem for Linux)
    "GitHub.copilot",                     # GitHub Copilot (optional)
    "ms-vscode.PowerShell"                # PowerShell
)

if (Test-CommandExists "code") {
    Write-Host "Installing VS Code extensions..." -ForegroundColor Yellow
    foreach ($extension in $extensions) {
        Write-Host "  Installing $extension..." -ForegroundColor Gray
        code --install-extension $extension
    }
    Write-Host "✓ VS Code extensions installed" -ForegroundColor Green
} else {
    Write-Host "⚠️  VS Code not found. Please install extensions manually after installing VS Code." -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║          ✓ Setup Complete!                               ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Close and reopen PowerShell to apply changes" -ForegroundColor White
Write-Host "2. Navigate to project directory: cd InfraWatch" -ForegroundColor White
Write-Host "3. Start development:" -ForegroundColor White
Write-Host "   - Option A: make start  (uses Makefile)" -ForegroundColor Gray
Write-Host "   - Option B: Start frontend and backend separately:" -ForegroundColor Gray
Write-Host "     • Frontend: cd frontend && npm run dev" -ForegroundColor Gray
Write-Host "     • Backend: cd backend && python -m uvicorn src.main:app --reload" -ForegroundColor Gray
Write-Host ""

Write-Host "Project Structure:" -ForegroundColor Cyan
Write-Host "├── frontend/          - React + TypeScript + Tailwind CSS" -ForegroundColor Gray
Write-Host "├── backend/           - FastAPI + Python" -ForegroundColor Gray
Write-Host "├── agent/             - Go-based monitoring agent (optional)" -ForegroundColor Gray
Write-Host "└── Makefile           - Build automation" -ForegroundColor Gray
Write-Host ""

Write-Host "Installed Tools:" -ForegroundColor Cyan
Write-Host "• Node.js & npm - Frontend development" -ForegroundColor Gray
Write-Host "• Python - Backend development" -ForegroundColor Gray
Write-Host "• Git - Version control" -ForegroundColor Gray
Write-Host "• Make - Build automation" -ForegroundColor Gray
Write-Host "• Docker - Containerization (optional)" -ForegroundColor Gray
Write-Host "• VS Code - Code editor + extensions" -ForegroundColor Gray
Write-Host ""

Write-Host "Documentation:" -ForegroundColor Cyan
Write-Host "See README.md for detailed setup and development instructions" -ForegroundColor Gray
Write-Host ""

Read-Host "Press Enter to exit"
