#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
HOME_DIR=$(eval echo "~$USER_NAME")

SERVICE=/etc/systemd/system/dartdeck.service
sudo tee "$SERVICE" > /dev/null << UNIT
[Unit]
Description=DartDeck server
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=PORT=80
User=root

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable dartdeck
sudo systemctl restart dartdeck