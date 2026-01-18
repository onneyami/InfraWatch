#!/usr/bin/env python3
"""
InfraWatch CLI - Command line interface for InfraWatch infrastructure monitoring system
"""

import sys
import os
import subprocess
import argparse
import json
import time
from pathlib import Path
from typing import Optional, List


class InfraWatchCLI:
    """Main CLI handler for InfraWatch"""
    
    def __init__(self):
        # Find the project root
        self.project_root = self._find_project_root()
        if not self.project_root:
            print("❌ Error: Could not find InfraWatch project root", file=sys.stderr)
            print("\nTip: Set INFRAWATCH_ROOT environment variable:", file=sys.stderr)
            print("  export INFRAWATCH_ROOT=/path/to/InfraWatch", file=sys.stderr)
            print("\nOr run 'infrawatch' from the InfraWatch project directory", file=sys.stderr)
            sys.exit(1)
        
        self.makefile_path = self.project_root / "Makefile"
        
    @staticmethod
    def _find_project_root() -> Optional[Path]:
        """Find the InfraWatch project root directory"""
        # Check environment variable first
        if env_path := os.environ.get("INFRAWATCH_ROOT"):
            env_root = Path(env_path)
            if (env_root / "Makefile").exists() and (env_root / "frontend").exists():
                return env_root
        
        current_path = Path.cwd()
        
        # Check if we're already in project root
        if (current_path / "Makefile").exists() and (current_path / "frontend").exists():
            return current_path
        
        # Search up the directory tree
        for parent in current_path.parents:
            if (parent / "Makefile").exists() and (parent / "frontend").exists():
                return parent
        
        # Try common installation paths
        common_paths = [
            Path.home() / "InfraWatch",
            Path.home() / "Documents" / "InfraWatch_2.0" / "InfraWatch",
            Path.home() / "Documents" / "InfraWatch",
            Path("/opt/infrawatch"),
            Path("/usr/local/infrawatch"),
        ]
        
        for path in common_paths:
            if (path / "Makefile").exists() and (path / "frontend").exists():
                return path
        
        return None
    
    def _run_make(self, target: str) -> int:
        """Run a make target from project root"""
        try:
            result = subprocess.run(
                ["make", target],
                cwd=str(self.project_root),
                capture_output=False,
                text=True
            )
            return result.returncode
        except FileNotFoundError:
            print("❌ Error: 'make' command not found", file=sys.stderr)
            return 1
    
    def _run_command(self, command: List[str], description: str = "") -> int:
        """Run a shell command"""
        try:
            # Convert list to shell command with cd
            cmd_str = " ".join(command)
            full_cmd = f"cd '{self.project_root}' && {cmd_str}"
            result = subprocess.run(
                ["bash", "-c", full_cmd],
                capture_output=False,
                text=True
            )
            return result.returncode
        except Exception as e:
            print(f"❌ Error: {description or 'Command failed'}: {e}", file=sys.stderr)
            return 1
    
    def start(self, args: argparse.Namespace) -> int:
        """Start InfraWatch services"""
        print("🚀 Starting InfraWatch...")
        return self._run_make("start")
    
    def stop(self, args: argparse.Namespace) -> int:
        """Stop InfraWatch services"""
        print("⏹️  Stopping InfraWatch...")
        return self._run_make("stop")
    
    def restart(self, args: argparse.Namespace) -> int:
        """Restart InfraWatch services"""
        print("🔄 Restarting InfraWatch...")
        return self._run_make("restart")
    
    def status(self, args: argparse.Namespace) -> int:
        """Check status of InfraWatch services"""
        print("📊 InfraWatch Service Status:")
        print("-" * 40)
        return self._run_make("status")
    
    def logs(self, args: argparse.Namespace) -> int:
        """Show InfraWatch logs"""
        service = getattr(args, 'service', None)
        
        if service:
            target = f"logs-{service}"
            print(f"📝 Showing {service} logs...")
        else:
            target = "logs"
            print("📝 Showing all logs...")
        
        return self._run_make(target)
    
    def install(self, args: argparse.Namespace) -> int:
        """Install InfraWatch dependencies"""
        print("📦 Installing dependencies...")
        return self._run_make("install")
    
    def setup(self, args: argparse.Namespace) -> int:
        """Setup InfraWatch (initial setup)"""
        print("⚙️  Setting up InfraWatch...")
        return self._run_make("setup")
    
    def clean(self, args: argparse.Namespace) -> int:
        """Clean InfraWatch build artifacts"""
        all_flag = getattr(args, 'all', False)
        target = "clean-all" if all_flag else "clean"
        print("🧹 Cleaning up...")
        return self._run_make(target)
    
    def build_agent(self, args: argparse.Namespace) -> int:
        """Build Go agent"""
        print("🔨 Building Go agent...")
        return self._run_make("build-agent")
    
    def dev(self, args: argparse.Namespace) -> int:
        """Quick development start"""
        print("💻 Starting development environment...")
        return self._run_make("dev")
    
    def version(self, args: argparse.Namespace) -> int:
        """Show InfraWatch version"""
        print("InfraWatch v2.5.0")
        return 0
    
    def info(self, args: argparse.Namespace) -> int:
        """Show InfraWatch project information"""
        print("📋 InfraWatch Information:")
        print("-" * 40)
        print(f"Project Root: {self.project_root}")
        print(f"Version: 2.5.0")
        print(f"Backend: Python FastAPI")
        print(f"Frontend: React + TypeScript")
        print(f"Agent: Go")
        print(f"Monitoring: Docker, System, Network, Processes")
        return 0


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="InfraWatch - Infrastructure Monitoring System CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  infrawatch start                Start all services
  infrawatch stop                 Stop all services  
  infrawatch restart              Restart all services
  infrawatch status               Check service status
  infrawatch logs                 Show all logs
  infrawatch logs backend         Show backend logs only
  infrawatch install              Install dependencies
  infrawatch setup                Setup project (first time)
  infrawatch build-agent          Build Go agent
  infrawatch dev                  Quick development start
  infrawatch clean                Clean build artifacts
  infrawatch clean --all          Full cleanup (venv, node_modules)
  infrawatch version              Show version
  infrawatch info                 Show project information
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    # Commands
    subparsers.add_parser('start', help='Start InfraWatch services')
    subparsers.add_parser('stop', help='Stop InfraWatch services')
    subparsers.add_parser('restart', help='Restart InfraWatch services')
    subparsers.add_parser('status', help='Check service status')
    
    logs_parser = subparsers.add_parser('logs', help='Show logs')
    logs_parser.add_argument(
        'service',
        nargs='?',
        choices=['backend', 'frontend', 'agent'],
        help='Specific service logs (optional)'
    )
    
    subparsers.add_parser('install', help='Install dependencies')
    subparsers.add_parser('setup', help='Setup project')
    
    clean_parser = subparsers.add_parser('clean', help='Clean artifacts')
    clean_parser.add_argument(
        '--all',
        action='store_true',
        help='Full cleanup (venv, node_modules)'
    )
    
    subparsers.add_parser('build-agent', help='Build Go agent')
    subparsers.add_parser('dev', help='Quick development start')
    subparsers.add_parser('version', help='Show version')
    subparsers.add_parser('info', help='Show project information')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 0
    
    # Initialize CLI
    cli = InfraWatchCLI()
    
    # Map commands to methods
    commands = {
        'start': cli.start,
        'stop': cli.stop,
        'restart': cli.restart,
        'status': cli.status,
        'logs': cli.logs,
        'install': cli.install,
        'setup': cli.setup,
        'clean': cli.clean,
        'build-agent': cli.build_agent,
        'dev': cli.dev,
        'version': cli.version,
        'info': cli.info,
    }
    
    command_func = commands.get(args.command)
    if command_func:
        return command_func(args)
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
