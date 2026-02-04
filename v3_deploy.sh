#!/usr/bin/env bash
set -e

# Season 3 Integrated Deployment Script
# Targets: price_updater, trade_engine, leaderboard_manager

# Configuration
REMOTE_USER="leeksnet"
REMOTE_HOST="10.4.1.141"
REMOTE_DIR="/home/leeksnet/stockgame"
VENV_DIR="$REMOTE_DIR/myenv"

# SSH Connection Multiplexing (from deploy_scheduler.sh)
SOCKET_DIR="/tmp/ssh_mux"
mkdir -p "$SOCKET_DIR"
CONTROL_PATH="$SOCKET_DIR/%r@%h:%p"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=$CONTROL_PATH -o ControlPersist=600"

echo "[+] Syncing backend directory for Season 3..."
rsync -avz -e "ssh $SSH_OPTS" --exclude '__pycache__' backend/ "$REMOTE_USER@$REMOTE_HOST":"$REMOTE_DIR/backend/"

echo "[+] Syncing environment..."
scp $SSH_OPTS backend/.env "$REMOTE_USER@$REMOTE_HOST":"$REMOTE_DIR/backend/.env"
# Assumes root requirements.txt or backend/requirements.txt
# If you have new deps, sync them here

echo "[+] Restarting all backend services via control.sh..."
ssh -i "$SSH_KEY" "$REMOTE_USER"@"$REMOTE_HOST" "
    cd $REMOTE_DIR
    chmod +x backend/control.sh
    ./backend/control.sh restart
"

echo "[!] Deployment Complete. Check status with: ssh $REMOTE_HOST '$REMOTE_DIR/backend/control.sh status'"
