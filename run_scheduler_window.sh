#!/usr/bin/env bash
set -euo pipefail

# Weekday window: start 08:55, stop 15:35.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_PATH="${PYTHON_PATH:-$ROOT_DIR/venv/bin/python}"
SCRIPT_PATH="$ROOT_DIR/data_engine/scheduler_rtdb.py"
STOP_HOUR=15
STOP_MINUTE=35

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

if [ ! -f "$SCRIPT_PATH" ]; then
  log "scheduler_rtdb.py를 찾을 수 없습니다: $SCRIPT_PATH"
  exit 1
fi

if [ ! -x "$PYTHON_PATH" ]; then
  PYTHON_PATH="$(command -v python3 || true)"
fi

if [ -z "$PYTHON_PATH" ] || [ ! -x "$PYTHON_PATH" ]; then
  log "python 실행 파일을 찾을 수 없습니다. PYTHON_PATH 환경변수로 지정하세요."
  exit 1
fi

log "scheduler_rtdb.py 시작 (caffeinate 래핑)."
/usr/bin/caffeinate -d -i -m -s "$PYTHON_PATH" "$SCRIPT_PATH" &
CAFFEINATE_PID=$!

cleanup() {
  log "종료 신호 수신, 프로세스 종료 중..."
  pkill -P "$CAFFEINATE_PID" 2>/dev/null || true
  kill "$CAFFEINATE_PID" 2>/dev/null || true
}
trap cleanup INT TERM

SECONDS_TO_STOP="$("$PYTHON_PATH" - <<PY
from datetime import datetime, timedelta
now = datetime.now()
stop = now.replace(hour=$STOP_HOUR, minute=$STOP_MINUTE, second=0, microsecond=0)
if stop <= now:
    stop += timedelta(days=1)
print(int((stop - now).total_seconds()))
PY
)"

log "종료 예정 시각까지 ${SECONDS_TO_STOP}s 대기."
sleep "$SECONDS_TO_STOP" || true

log "종료 시각 도달, 프로세스 종료."
pkill -P "$CAFFEINATE_PID" 2>/dev/null || true
kill "$CAFFEINATE_PID" 2>/dev/null || true
log "작업 종료."
