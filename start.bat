@echo off
title DartDeck Server
cd /d "%~dp0"
set PORT=3000
set HOST_HINT=pikado.lan
echo Starting DartDeck server on Port %PORT%...
echo Connect mobile controllers to this computer's local IP address.
node server.js
pause
