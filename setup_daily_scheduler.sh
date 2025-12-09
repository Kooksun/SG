#!/usr/bin/env bash
set -euo pipefail

# Set up a daily 09:00 wake and a launchd job that runs scheduler_rtdb.py.
# Run this as your normal user (not with sudo); the script will prompt for sudo only where needed.

if [ "$(id -u)" -eq 0 ]; then
  echo "이 스크립트는 일반 사용자로 실행하세요 (sudo 없이)."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_PATH="${PYTHON_PATH:-$ROOT_DIR/venv/bin/python}"
SCHEDULER_PATH="$ROOT_DIR/data_engine/scheduler_rtdb.py"
PLIST_PATH="$HOME/Library/LaunchAgents/com.stockgame.scheduler_rtdb.plist"
RUNNER_PATH="$ROOT_DIR/run_scheduler_window.sh"

if [ ! -f "$SCHEDULER_PATH" ]; then
  echo "scheduler_rtdb.py를 찾을 수 없습니다: $SCHEDULER_PATH"
  exit 1
fi

chmod +x "$RUNNER_PATH"

if [ ! -x "$PYTHON_PATH" ]; then
  PYTHON_PATH="$(command -v python3 || true)"
fi

if [ -z "$PYTHON_PATH" ] || [ ! -x "$PYTHON_PATH" ]; then
  echo "python 실행 파일을 찾을 수 없습니다. PYTHON_PATH 환경변수로 지정하세요."
  exit 1
fi

echo "1) 월~금 08:55에 자동으로 깨우도록 설정합니다 (sudo 필요)."
sudo pmset repeat wakeorpoweron MTWRF 08:55:00

echo "2) 08:55에 scheduler_rtdb.py를 실행(15:35에 종료)하는 launchd 에이전트를 만듭니다."
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.stockgame.scheduler_rtdb</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ROOT_DIR/run_scheduler_window.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT_DIR</string>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>8</integer><key>Minute</key><integer>55</integer></dict>
    <dict><key>Weekday</key><integer>2</integer><key>Hour</key><integer>8</integer><key>Minute</key><integer>55</integer></dict>
    <dict><key>Weekday</key><integer>3</integer><key>Hour</key><integer>8</integer><key>Minute</key><integer>55</integer></dict>
    <dict><key>Weekday</key><integer>4</integer><key>Hour</key><integer>8</integer><key>Minute</key><integer>55</integer></dict>
    <dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>8</integer><key>Minute</key><integer>55</integer></dict>
  </array>
  <key>StandardOutPath</key>
  <string>/tmp/scheduler_rtdb.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/scheduler_rtdb.err</string>
</dict>
</plist>
EOF

echo "launchd 에이전트를 로드합니다."
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

cat <<'MSG'
설정 완료:
- 월~금 08:55에 자동으로 깨움 (pmset repeat).
- 월~금 08:55에 launchd가 run_scheduler_window.sh를 실행해 scheduler_rtdb.py를 실행하고 15:35에 종료.
- 로그: /tmp/scheduler_rtdb.log , /tmp/scheduler_rtdb.err

주의:
- 맥북 덮개를 닫아두면 깨움이 안 될 수 있으니 열어두세요.
- 해제하려면: sudo pmset repeat cancel && launchctl unload ~/Library/LaunchAgents/com.stockgame.scheduler_rtdb.plist
MSG
