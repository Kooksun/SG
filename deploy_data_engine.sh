#!/usr/bin/env bash
set -e

# Configuration
REMOTE_USER=opc
REMOTE_HOST=158.179.170.209
REMOTE_DIR=/home/opc/stockgame
SSH_KEY=~/.ssh/id_rsa_opc

# Ensure remote directory exists
ssh -i "$SSH_KEY" "$REMOTE_USER"@"$REMOTE_HOST" "mkdir -p $REMOTE_DIR"

# Sync data_engine directory
rsync -avz -e "ssh -i $SSH_KEY" data_engine/ "$REMOTE_USER"@"$REMOTE_HOST":"$REMOTE_DIR/data_engine/"

# Sync requirements.txt (located in data_engine)
scp -i "$SSH_KEY" data_engine/requirements.txt "$REMOTE_USER"@"$REMOTE_HOST":"$REMOTE_DIR/requirements.txt"

# Remote setup and service installation (system-wide)
# Pass variables to the remote session
ssh -i "$SSH_KEY" "$REMOTE_USER"@"$REMOTE_HOST" "REMOTE_DIR=$REMOTE_DIR REMOTE_USER=$REMOTE_USER bash" <<'EOF'
cd "$REMOTE_DIR"
# Create virtual environment if not exists
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
# requirements.txt was copied to REMOTE_DIR, so install from there
pip install -r "$REMOTE_DIR/requirements.txt"

# Create systemd service file (system-wide)
# Use absolute paths in ExecStart and WorkingDirectory
sudo tee /etc/systemd/system/data_engine.service > /dev/null <<EOT
[Unit]
Description=Stock Game Data Engine
After=network.target

[Service]
User=$REMOTE_USER
WorkingDirectory=$REMOTE_DIR/data_engine
ExecStart=$REMOTE_DIR/venv/bin/python $REMOTE_DIR/data_engine/scheduler_rtdb.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOT

# Fix SELinux context for systemd execution
# Set venv binaries to bin_t so systemd can execute them
sudo chcon -R -t bin_t "$REMOTE_DIR/venv/bin"

# Reload systemd daemon and enable/start service
sudo systemctl daemon-reload
sudo systemctl enable --now data_engine.service
EOF

echo "Deployment complete. Systemd service 'data_engine' should be running on remote host."
