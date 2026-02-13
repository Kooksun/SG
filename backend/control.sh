#!/usr/bin/env bash

# Season 3 Backend Control Script
# Manages: price_updater, trade_engine, leaderboard_manager

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Find Virtual Environment (Local: venv, Server: myenv)
if [ -d "$PROJECT_ROOT/venv" ]; then
    VENV_PYTHON="$PROJECT_ROOT/venv/bin/python"
elif [ -d "$PROJECT_ROOT/myenv" ]; then
    VENV_PYTHON="$PROJECT_ROOT/myenv/bin/python"
else
    VENV_PYTHON="python3"
fi

PID_DIR="$BACKEND_DIR/pids"
LOG_DIR="$BACKEND_DIR/logs"

mkdir -p "$PID_DIR"
mkdir -p "$LOG_DIR"

APPS=("price_updater" "trade_engine" "leaderboard_manager" "chart_gateway" "minigame_manager" "lookup_gateway")

function usage() {
    echo "Usage: $0 {start|stop|restart|status|logs} [app_name]"
    echo "Apps: price_updater, trade_engine, leaderboard_manager (default: all)"
    exit 1
}

function start_app() {
    local app=$1
    local pid_file="$PID_DIR/$app.pid"
    local log_file="$LOG_DIR/$app.log"
    
    if [ -f "$pid_file" ] && kill -0 $(cat "$pid_file") 2>/dev/null; then
        echo "[-] $app is already running (PID: $(cat "$pid_file"))"
        return
    fi

    echo "[+] Starting $app..."
    export PYTHONPATH="$PROJECT_ROOT"
    # Use -u for unbuffered output to see logs in real-time
    nohup "$VENV_PYTHON" -u -m "backend.$app" > "$log_file" 2>&1 &
    echo $! > "$pid_file"
    echo "[!] $app started with PID $!"
}

function stop_app() {
    local app=$1
    local pid_file="$PID_DIR/$app.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        echo "[-] Stopping $app (PID: $pid)..."
        kill "$pid" 2>/dev/null || true
        sleep 1
        if kill -0 "$pid" 2>/dev/null; then
            echo "[!] $app did not stop, forcing..."
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm "$pid_file"
        echo "[!] $app stopped."
    else
        # Fallback to pgrep
        local pids=$(pgrep -f "backend.$app")
        if [ ! -z "$pids" ]; then
            echo "[-] Stopping $app by pgrep..."
            kill $pids
        else
            echo "[-] $app is not running."
        fi
    fi
}

function status_app() {
    local app=$1
    local pid_file="$PID_DIR/$app.pid"
    
    if [ -f "$pid_file" ] && kill -0 $(cat "$pid_file") 2>/dev/null; then
        echo -e "[RUNNING] $app (PID: $(cat "$pid_file"))"
    else
        echo -e "[STOPPED] $app"
    fi
}

function show_logs() {
    local app=$1
    local log_file="$LOG_DIR/$app.log"
    if [ -f "$log_file" ]; then
        tail -f "$log_file"
    else
        echo "[-] Log file not found for $app"
    fi
}

action=$1
target_app=$2

case "$action" in
    start)
        if [ -z "$target_app" ]; then
            for app in "${APPS[@]}"; do start_app "$app"; done
        else
            start_app "$target_app"
        fi
        ;;
    stop)
        if [ -z "$target_app" ]; then
            for app in "${APPS[@]}"; do stop_app "$app"; done
        else
            stop_app "$target_app"
        fi
        ;;
    restart)
        $0 stop "$target_app"
        sleep 1
        $0 start "$target_app"
        ;;
    status)
        if [ -z "$target_app" ]; then
            for app in "${APPS[@]}"; do status_app "$app"; done
        else
            status_app "$target_app"
        fi
        ;;
    logs)
        if [ -z "$target_app" ]; then
            echo "Please specify an app: ${APPS[*]}"
        else
            show_logs "$target_app"
        fi
        ;;
    *)
        usage
        ;;
esac
