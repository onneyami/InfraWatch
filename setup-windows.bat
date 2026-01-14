@echo off
REM InfraWatch Setup Script for Windows
REM This batch file runs the PowerShell setup script

setlocal enabledelayedexpansion

REM Check if PowerShell is available
powershell -Command "exit" >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: PowerShell is not available
    pause
    exit /b 1
)

REM Run the PowerShell script with administrator privileges
echo Starting InfraWatch Setup...
echo.

powershell -Command "& {Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0setup-windows.ps1""' -Verb RunAs; exit}"

if %errorlevel% neq 0 (
    echo.
    echo Setup was cancelled or encountered an error.
    echo Please run this script as Administrator.
)

endlocal
