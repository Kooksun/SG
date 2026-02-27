#!/usr/bin/env bash
set -e

# Season 3 Integrated Deployment Script
# Targets: All backend modules managed by control.sh

# Configuration
REMOTE_USER="leeksnet"
REMOTE_HOST="10.4.1.141"
REMOTE_DIR="/home/leeksnet/stockgame"
VENV_DIR="$REMOTE_DIR/myenv"

# SSH Connection Multiplexing
SOCKET_DIR="/tmp/ssh_mux"
mkdir -p "$SOCKET_DIR"
CONTROL_PATH="$SOCKET_DIR/%r@%h:%p"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=$CONTROL_PATH -o ControlPersist=600"

function usage() {
    echo "Usage: $0 {deploy|status|restart|stop|logs <app>}"
    echo "  deploy  - Sync files and restart all backend services (default)"
    echo "  status  - Show status of all backend services"
    echo "  restart - Restart all backend services (no file sync)"
    echo "  stop    - Stop all backend services"
    echo "  logs    - Tail logs for a specific app (e.g. $0 logs trade_engine)"
    exit 1
}

function remote_control() {
    local action=$1
    local app=$2
    ssh $SSH_OPTS "$REMOTE_USER@$REMOTE_HOST" "
        cd $REMOTE_DIR
        chmod +x backend/control.sh
        bash backend/control.sh $action $app
    "
}

ACTION=${1:-deploy}

case "$ACTION" in
    deploy)
        echo "[+] Syncing backend directory for Season 3..."
        rsync -avz -e "ssh $SSH_OPTS" --exclude '__pycache__' backend/ "$REMOTE_USER@$REMOTE_HOST":"$REMOTE_DIR/backend/"

        echo "[+] Syncing environment..."
        scp $SSH_OPTS backend/.env "$REMOTE_USER@$REMOTE_HOST":"$REMOTE_DIR/backend/.env"

        echo "[+] Restarting all backend services via control.sh..."
        remote_control restart
        echo "[!] Deployment Complete."
        ;;
    status)
        remote_control status
        ;;
    restart)
        remote_control restart "$2"
        ;;
    stop)
        remote_control stop "$2"
        ;;
    logs)
        if [ -z "$2" ]; then
            echo "Please specify an app name. e.g. $0 logs trade_engine"
            exit 1
        fi
        remote_control logs "$2"
        ;;
    *)
        usage
        ;;
esac
