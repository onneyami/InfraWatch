# backend/docker_fix.py
#!/usr/bin/env python3
import docker
import os
import sys

def test_docker_connection():
    """Тестирование подключения к Docker на Mac"""
    print("🔍 Testing Docker connection on macOS...")
    
    # Возможные пути к Docker socket на Mac
    socket_paths = [
        '/var/run/docker.sock',
        '/Users/mac/.docker/run/docker.sock',
    ]
    
    # Проверяем наличие сокетов
    for path in socket_paths:
        if os.path.exists(path):
            print(f"✓ Found Docker socket: {path}")
            if os.access(path, os.R_OK) and os.access(path, os.W_OK):
                print(f"✓ Socket is readable and writable")
            else:
                print(f"✗ Socket permissions issue")
                print(f"  Current permissions: {oct(os.stat(path).st_mode)[-3:]}")
                print(f"  Trying to fix permissions...")
                try:
                    os.chmod(path, 0o666)
                    print(f"✓ Permissions fixed to 666")
                except Exception as e:
                    print(f"✗ Failed to fix permissions: {e}")
    
    # Тестируем подключение
    print("\n🔌 Testing connection methods:")
    
    connection_methods = [
        {"name": "from_env()", "method": lambda: docker.from_env()},
        {"name": "DockerClient(unix:///var/run/docker.sock)", 
         "method": lambda: docker.DockerClient(base_url='unix:///var/run/docker.sock', timeout=10)},
        {"name": "DockerClient(unix:///Users/mac/.docker/run/docker.sock)", 
         "method": lambda: docker.DockerClient(base_url='unix:///Users/mac/.docker/run/docker.sock', timeout=10)},
    ]
    
    for method in connection_methods:
        try:
            print(f"\nTrying {method['name']}...")
            client = method['method']()
            info = client.info()
            print(f"✅ SUCCESS!")
            print(f"   Docker Version: {info.get('ServerVersion', 'Unknown')}")
            print(f"   Containers: {info.get('Containers', 0)} total, {info.get('ContainersRunning', 0)} running")
            print(f"   Images: {info.get('Images', 0)}")
            return client
        except docker.errors.DockerException as e:
            print(f"❌ FAILED: {e}")
        except Exception as e:
            print(f"❌ ERROR: {type(e).__name__}: {e}")
    
    print("\n🔧 Troubleshooting steps:")
    print("1. Make sure Docker Desktop is running")
    print("2. Check Docker Desktop settings:")
    print("   - Open Docker Desktop")
    print("   - Go to Settings → General")
    print("   - Enable 'Expose daemon on tcp://localhost:2375 without TLS'")
    print("3. Or try TCP connection:")
    print("   export DOCKER_HOST=tcp://localhost:2375")
    print("4. Reset Docker Desktop:")
    print("   Docker Desktop → Troubleshoot → Reset to factory defaults")
    
    return None

if __name__ == "__main__":
    test_docker_connection()