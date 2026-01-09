#!/usr/bin/env bash

# Configuration
REMOTE_USER="leeksnet"
REMOTE_HOST="10.4.1.141"
REMOTE_DIR="/home/leeksnet/stockgame"
VENV_DIR="$REMOTE_DIR/myenv"
PYTHON_BIN="$VENV_DIR/bin/python"
SCRIPT_NAME="scheduler_rtdb.py"
SCRIPT_PATH="$REMOTE_DIR/data_engine/$SCRIPT_NAME"
LOG_FILE="$REMOTE_DIR/scheduler.log"
PID_FILE="$REMOTE_DIR/scheduler.pid"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function usage() {
    echo "Usage: $0 {deploy|start|stop|restart|status|log}"
    exit 1
}

function stop_process() {
    echo "Stopping existing process if any..."
    ssh "$REMOTE_USER@$REMOTE_HOST" "
        if [ -f $PID_FILE ]; then
            PID=\$(cat $PID_FILE)
            if kill -0 \$PID 2>/dev/null; then
                echo -e \"${GREEN}Killing process \$PID...${NC}\"
                kill \$PID
                sleep 2
                if kill -0 \$PID 2>/dev/null; then
                    echo -e \"${RED}Process didn't stop, forcing kill...${NC}\"
                    kill -9 \$PID
                fi
            else
                echo \"Process \$PID not running.\"
            fi
            rm $PID_FILE
        else
            # Fallback: find process by name if PID file doesn't exist
            PID=\$(pgrep -f $SCRIPT_NAME)
            if [ ! -z \"\$PID\" ]; then
                echo -e \"${GREEN}Killing process \$PID found by name...${NC}\"
                kill \$PID
                sleep 1
            fi
        fi
    "
}

function start_process() {
    echo "Starting process..."
    ssh "$REMOTE_USER@$REMOTE_HOST" "
        cd $REMOTE_DIR
        source $VENV_DIR/bin/activate
        nohup $PYTHON_BIN -u $SCRIPT_PATH >> $LOG_FILE 2>&1 &
        echo \$! > $PID_FILE
        echo -e \"${GREEN}Process started with PID \$(cat $PID_FILE).${NC}\"
    "
}

case "$1" in
    deploy)
        echo "Deploying files to $REMOTE_HOST..."
        # Sync the entire data_engine directory, excluding virtual environments
        rsync -avz --exclude 'test_venv' --exclude '__pycache__' ./data_engine/ "$REMOTE_USER@$REMOTE_HOST":"$REMOTE_DIR/data_engine/"
        
        # Optionally sync requirements if needed
        if [ -f "data_engine/requirements.txt" ]; then
            scp data_engine/requirements.txt "$REMOTE_USER@$REMOTE_HOST":"$REMOTE_DIR/requirements.txt"
            echo "Installing/Updating requirements..."
            ssh "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_DIR && $VENV_DIR/bin/pip install -r requirements.txt"
        fi

        stop_process
        start_process
        ;;
    start)
        start_process
        ;;
    stop)
        stop_process
        ;;
    restart)
        stop_process
        start_process
        ;;
    status)
        ssh "$REMOTE_USER@$REMOTE_HOST" "
            if [ -f $PID_FILE ]; then
                PID=\$(cat $PID_FILE)
                if kill -0 \$PID 2>/dev/null; then
                    echo -e \"${GREEN}Status: Running (PID: \$PID)${NC}\"
                    ps -up \$PID
                else
                    echo -e \"${RED}Status: PID file exists but process is NOT running.${NC}\"
                fi
            else
                PID=\$(pgrep -f $SCRIPT_NAME)
                if [ ! -z \"\$PID\" ]; then
                    echo -e \"${GREEN}Status: Running (PID: \$PID, found by name)${NC}\"
                else
                    echo -e \"${RED}Status: NOT running${NC}\"
                fi
            fi
        "
        ;;
    log)
        ssh "$REMOTE_USER@$REMOTE_HOST" "tail -f $LOG_FILE"
        ;;
    *)
        usage
        ;;
esac
