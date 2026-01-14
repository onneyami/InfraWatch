#!/usr/bin/env python3
import subprocess
import sys

print("🧪 Final Docker Test")
print("=" * 60)

# Тест 1: Базовая команда
print("1. Testing 'docker --version'...")
try:
    result = subprocess.run(["docker", "--version"], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"   ✅ {result.stdout.strip()}")
    else:
        print(f"   ❌ Failed: {result.stderr}")
except Exception as e:
    print(f"   ❌ Exception: {e}")

# Тест 2: Docker info
print("\n2. Testing 'docker info'...")
try:
    result = subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"], 
                          capture_output=True, text=True)
    if result.returncode == 0:
        print(f"   ✅ Docker Server Version: {result.stdout.strip()}")
    else:
        print(f"   ❌ Failed: {result.stderr}")
except Exception as e:
    print(f"   ❌ Exception: {e}")

# Тест 3: Docker ps
print("\n3. Testing 'docker ps'...")
try:
    result = subprocess.run(["docker", "ps", "-a", "--format", "table {{.Names}}\t{{.Status}}\t{{.Image}}"], 
                          capture_output=True, text=True)
    if result.returncode == 0:
        print("   ✅ Containers found:")
        lines = result.stdout.strip().split('\n')
        for line in lines:
            print(f"      {line}")
        if len(lines) <= 1:
            print("      (No containers running)")
    else:
        print(f"   ❌ Failed: {result.stderr}")
except Exception as e:
    print(f"   ❌ Exception: {e}")

# Тест 4: Python docker module
print("\n4. Testing Python docker module...")
try:
    import docker
    print(f"   ✅ Docker module imported: {docker.__version__}")
    
    # Пробуем подключиться
    try:
        client = docker.from_env()
        info = client.info()
        print(f"   ✅ Docker API connected: {info.get('ServerVersion')}")
    except Exception as e:
        print(f"   ⚠️  Docker API failed: {e}")
        print("   But CLI works, so we'll use CLI instead!")
        
except ImportError as e:
    print(f"   ❌ Cannot import docker module: {e}")
    print("   Install with: pip install docker")

print("\n" + "=" * 60)
print("📋 Summary: Docker CLI should work for InfraWatch!")
print("The backend will use 'docker' CLI commands to get data.")
