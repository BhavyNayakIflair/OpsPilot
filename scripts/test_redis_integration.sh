#!/usr/bin/env bash
set -euo pipefail

# OpsPilot - Real Redis Integration Test Runner
# Spins up Redis via docker-compose (or uses existing Redis) and executes the ARQ durable queue integration test.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SPUN_UP_CONTAINER=0

cleanup() {
  if [ "$SPUN_UP_CONTAINER" -eq 1 ]; then
    echo "Stopping test Redis container..."
    docker-compose stop redis || true
  fi
}
trap cleanup EXIT

echo "=== Checking Redis Availability ==="
if command -v nc >/dev/null 2>&1 && nc -z localhost 6379 2>/dev/null; then
  echo "Redis is already running on port 6379."
elif command -v docker-compose >/dev/null 2>&1 || docker compose version >/dev/null 2>&1; then
  echo "Starting Redis via docker-compose..."
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose up -d redis
  else
    docker compose up -d redis
  fi
  SPUN_UP_CONTAINER=1
  echo "Waiting for Redis to be healthy..."
  for i in {1..15}; do
    if docker exec opspilot_redis redis-cli ping 2>/dev/null | grep -q PONG; then
      echo "Redis is ready!"
      break
    fi
    sleep 1
  done
elif command -v redis-server >/dev/null 2>&1; then
  echo "Starting local redis-server in background..."
  redis-server --daemonize yes --port 6379
else
  echo "Notice: Neither running Redis nor Docker found."
  echo "Pytest will test Redis availability and skip gracefully if unreachable."
fi

echo "=== Running Redis Integration Tests ==="
VENV_PYTEST="$ROOT_DIR/.venv/bin/pytest"
if [ ! -f "$VENV_PYTEST" ]; then
  VENV_PYTEST="pytest"
fi

cd "$ROOT_DIR/backend"
PYTHONPATH=. "$VENV_PYTEST" tests/test_redis_integration.py -v -m redis
echo "=== Redis Integration Test Completed Successfully ==="
