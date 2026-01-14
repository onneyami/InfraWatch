# backend/src/docker_simple_test.py
#!/usr/bin/env python3
from docker_simple import SimpleDockerMetrics
import json

def main():
    print("🧪 Testing Docker Simple Integration")
    print("=" * 60)
    
    # Тестируем парсинг даты
    test_dates = [
        "2025-12-19 16:42:16 +0300 +03",
        "2025-12-19 16:42:16 +0300",
        "2025-12-19T16:42:16Z",
        ""
    ]
    
    print("Testing date parsing:")
    for date_str in test_dates:
        timestamp = SimpleDockerMetrics.parse_date_to_timestamp(date_str)
        print(f"  '{date_str}' -> {timestamp}")
    
    # Тестируем парсинг портов
    test_ports = [
        "0.0.0.0:8081->80/tcp, :::8081->80/tcp",
        "3306/tcp",
        "",
        "0.0.0.0:8080->80/tcp"
    ]
    
    print("\nTesting port parsing:")
    for port_str in test_ports:
        ports = SimpleDockerMetrics.parse_ports(port_str)
        print(f"  '{port_str}' -> {ports}")
    
    # Получаем реальные метрики
    print("\n" + "=" * 60)
    print("Getting real Docker metrics...")
    
    metrics = SimpleDockerMetrics.get_metrics()
    
    if metrics.get("success"):
        print(f"✅ Success!")
        print(f"  Docker Version: {metrics['engine']['version']}")
        print(f"  Containers: {len(metrics['containers'])}")
        print(f"  Images: {len(metrics['images'])}")
        
        # Проверяем, что поля created являются числами
        print("\nChecking container 'created' fields:")
        for i, container in enumerate(metrics['containers'][:2]):  # Первые 2 контейнера
            created = container.get('created', 0)
            print(f"  Container {i}: created={created}, type={type(created).__name__}")
            
            if not isinstance(created, int):
                print(f"    ⚠️  WARNING: created is not an integer!")
        
        # Сохраняем для отладки
        with open("test_output.json", "w") as f:
            json.dump(metrics, f, indent=2, default=str)
        print("\n📄 Full output saved to test_output.json")
        
    else:
        print(f"❌ Failed: {metrics.get('error')}")

if __name__ == "__main__":
    main()