#!/bin/bash

# Ahova Test Script
# Быстрая проверка всех компонентов после запуска

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

API_BASE="${API_BASE:-http://localhost:8000}"
# Агент, которого создаёт этот тест (в конце он удаляется, поэтому запуск можно повторять).
TEST_AGENT_ID="${TEST_AGENT_ID:-test-agent-001}"

echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🧪 Ahova Test Suite${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo ""

# Функция для проверки endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    local data=${4:-}
    
    echo -n "Testing $name... "
    
    if [ "$method" = "POST" ] && [ -n "$data" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    fi
    
    if [ "$response" = "200" ] || [ "$response" = "201" ]; then
        echo -e "${GREEN}✓ PASS${NC} ($response)"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} ($response)"
        return 1
    fi
}

# Функция: ожидаем конкретный HTTP-статус (по умолчанию без авторизации)
expect_status() {
    local name=$1
    local url=$2
    local expected=$3
    shift 3

    echo -n "Testing $name... "
    response=$(curl -s -o /dev/null -w "%{http_code}" "$@" "$url")

    if [ "$response" = "$expected" ]; then
        echo -e "${GREEN}✓ PASS${NC} ($response as expected)"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (expected $expected, got $response)"
        return 1
    fi
}

# Функция для проверки с авторизацией
test_auth_endpoint() {
    local name=$1
    local url=$2
    local agent_id=$3
    local token=$4
    
    echo -n "Testing $name (with auth)... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url" \
        -H "Content-Type: application/json" \
        -H "X-Agent-ID: $agent_id" \
        -H "X-Agent-Token: $token" \
        -d '{"agent_id": "'$agent_id'", "timestamp": '$(date +%s)', "cpu": {"usage": 5.0}, "memory": {"used_percent": 50.0}, "system": {"hostname": "test", "os": "test", "platform": "test", "kernel_version": "test", "uptime": 100, "boot_time": 100, "num_goroutine": 1, "num_cpu": 1}}')
    
    if [ "$response" = "200" ] || [ "$response" = "201" ]; then
        echo -e "${GREEN}✓ PASS${NC} ($response)"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} ($response)"
        return 1
    fi
}

# Тест 1: Root endpoint
test_endpoint "Root endpoint" "$API_BASE/"

# Тест 2: Health check
test_endpoint "Health check" "$API_BASE/api/v1/health"

# Тесты 3-6: дашбордные эндпоинты требуют вход (сессию). Без неё — 401.
# (Раньше /system, /docker/metrics и др. были публичными, а доступ давал общий токен.)
expect_status "System info (anonymous)" "$API_BASE/api/v1/system" 401
expect_status "Docker metrics (anonymous)" "$API_BASE/api/v1/docker/metrics" 401
expect_status "Agents list (anonymous)" "$API_BASE/api/v1/agents" 401
expect_status "Metrics latest (anonymous)" "$API_BASE/api/v1/metrics/latest" 401

# Если заданы AHOVA_USERNAME и AHOVA_PASSWORD — входим и проверяем те же эндпоинты с сессией:
#   AHOVA_USERNAME=me AHOVA_PASSWORD='...' ./test.sh
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT
SIGNED_IN=0
if [ -n "${AHOVA_USERNAME:-}" ] && [ -n "${AHOVA_PASSWORD:-}" ]; then
    login_body=$(python3 -c 'import json,os; print(json.dumps({"username_or_email": os.environ["AHOVA_USERNAME"], "password": os.environ["AHOVA_PASSWORD"]}))')
    echo -n "Signing in as $AHOVA_USERNAME... "
    code=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_JAR" -X POST "$API_BASE/api/v1/auth/login" \
        -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest" -d "$login_body")
    if [ "$code" = "200" ]; then
        echo -e "${GREEN}✓ PASS${NC}"
        SIGNED_IN=1
        expect_status "System info (signed in)" "$API_BASE/api/v1/system" 200 -b "$COOKIE_JAR"
        expect_status "Docker metrics (signed in)" "$API_BASE/api/v1/docker/metrics" 200 -b "$COOKIE_JAR"
        expect_status "Agents list (signed in)" "$API_BASE/api/v1/agents" 200 -b "$COOKIE_JAR"
        expect_status "Metrics latest (signed in)" "$API_BASE/api/v1/metrics/latest" 200 -b "$COOKIE_JAR"
    else
        echo -e "${RED}✗ FAIL${NC} ($code)"
        echo -e "  ${RED}Credentials were provided but sign-in failed; aborting.${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}Skipping signed-in checks (set AHOVA_USERNAME and AHOVA_PASSWORD to run them)${NC}"
fi

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}🔐 Authentication Tests${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
echo ""

# Тест 7: регистрация агента. Теперь она требует одноразовый ключ, а ключ создаёт вошедший
# пользователь, так что без AHOVA_USERNAME/AHOVA_PASSWORD эти проверки пропускаются.
token=""
if [ "$SIGNED_IN" = "1" ]; then
    csrf=(-H "X-Requested-With: XMLHttpRequest")

    # Убираем агента от прошлого (оборвавшегося) запуска, чтобы ID был свободен
    curl -s -o /dev/null -b "$COOKIE_JAR" -X DELETE "${csrf[@]}" "$API_BASE/api/v1/agents/$TEST_AGENT_ID"

    echo -n "Creating enrollment key... "
    key_response=$(curl -s -b "$COOKIE_JAR" -X POST "$API_BASE/api/v1/agents/enrollment-keys" \
        -H "Content-Type: application/json" "${csrf[@]}" -d '{"label": "test.sh"}')
    enroll_key=$(echo "$key_response" | grep -o '"key":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$enroll_key" ]; then
        echo -e "${GREEN}✓ PASS${NC} (${enroll_key:0:8}...)"
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo -e "  Response: $key_response"
        exit 1
    fi

    expect_status "Register without a key (should fail)" "$API_BASE/api/v1/agents/register" 401 \
        -X POST -H "Content-Type: application/json" -d "{\"agent_id\": \"$TEST_AGENT_ID\"}"

    echo -n "Registering test agent with the key... "
    register_response=$(curl -s -X POST "$API_BASE/api/v1/agents/register" \
        -H "Content-Type: application/json" \
        -d "{\"agent_id\": \"$TEST_AGENT_ID\", \"enrollment_key\": \"$enroll_key\", \"hostname\": \"test-host\", \"version\": \"2.6.0\"}")
    token=$(echo "$register_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$token" ]; then
        echo -e "${GREEN}✓ PASS${NC}"
        echo -e "  ${YELLOW}Agent ID: ${NC}$TEST_AGENT_ID"
        echo -e "  ${YELLOW}Token:    ${NC}${token:0:20}..."
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo -e "  Response: $register_response"
        exit 1
    fi

    expect_status "Re-using the same key (should fail)" "$API_BASE/api/v1/agents/register" 401 \
        -X POST -H "Content-Type: application/json" \
        -d "{\"agent_id\": \"$TEST_AGENT_ID-again\", \"enrollment_key\": \"$enroll_key\"}"
else
    echo -e "${YELLOW}Skipping agent registration tests: they need an enrollment key, which needs sign-in${NC}"
    echo -e "${YELLOW}(set AHOVA_USERNAME and AHOVA_PASSWORD)${NC}"
fi

# Тест 8: Отправка метрик с токеном
if [ -n "$token" ]; then
    test_auth_endpoint "Send metrics (with token)" \
        "$API_BASE/api/v1/metrics" \
        "$TEST_AGENT_ID" \
        "$token"
fi

# Тест 9: Попытка отправки метрик БЕЗ токена (должна вернуть 401)
echo -n "Test metrics without token (should fail)... "
response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/api/v1/metrics" \
    -H "Content-Type: application/json" \
    -d '{"agent_id": "test-agent-002", "timestamp": '$(date +%s)'}')

if [ "$response" = "401" ]; then
    echo -e "${GREEN}✓ PASS${NC} (401 as expected)"
else
    echo -e "${RED}✗ FAIL${NC} (expected 401, got $response)"
fi

# Убираем за собой тестового агента: его токен перестаёт работать, ID свободен для следующего запуска
if [ "$SIGNED_IN" = "1" ] && [ -n "$token" ]; then
    expect_status "Removing the test agent (cleanup)" "$API_BASE/api/v1/agents/$TEST_AGENT_ID" 200 \
        -X DELETE -b "$COOKIE_JAR" -H "X-Requested-With: XMLHttpRequest"
    expect_status "Removed agent's token no longer works" "$API_BASE/api/v1/metrics" 401 \
        -X POST -H "Content-Type: application/json" -H "X-Agent-ID: $TEST_AGENT_ID" -H "X-Agent-Token: $token" \
        -d "{\"agent_id\": \"$TEST_AGENT_ID\", \"timestamp\": $(date +%s)}"
fi

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}📊 Quick Status${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
echo ""

if [ "$SIGNED_IN" = "1" ]; then
    # Получаем список агентов
    agents=$(curl -s -b "$COOKIE_JAR" "$API_BASE/api/v1/agents")
    agent_count=$(echo "$agents" | grep -o '"count":[0-9]*' | cut -d: -f2)
    echo -e "${BLUE}Registered Agents:${NC} $agent_count"

    # Получаем последние метрики
    metrics=$(curl -s -b "$COOKIE_JAR" "$API_BASE/api/v1/metrics/latest")
    if [ "$metrics" != "{\"message\":\"No metrics available\"}" ] && [ -n "$metrics" ]; then
        echo -e "${BLUE}Metrics Available:${NC} Yes"
    else
        echo -e "${BLUE}Metrics Available:${NC} No (agent may not have started yet)"
    fi
else
    echo -e "${YELLOW}Sign in (AHOVA_USERNAME / AHOVA_PASSWORD) to see agent and metrics status.${NC}"
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Test Suite Complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Check frontend: http://localhost:5173/"
echo "  2. Check API docs: http://localhost:8000/docs"
echo "  3. View logs: tail -f logs/agent.log"
echo ""
