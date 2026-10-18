@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title Mahjong 2P - LAN Server

echo ==========================================
echo    Mahjong 2P   -   Phone / LAN server
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto NONODE

echo Starting local server, please wait...
echo.
echo   1. Keep this window OPEN (closing it stops the game)
echo   2. On your phone: connect to the SAME Wi-Fi as this PC
echo   3. Type the "phone" address shown below into the phone browser
echo.
echo ==========================================
echo.

start "" http://localhost:8080/
node server.js

echo.
echo Server stopped.
pause
exit /b 0

:NONODE
echo [ERROR] Node.js was not found on this computer.
echo.
echo   Option A: install Node.js LTS from https://nodejs.org,
echo             then double-click this file again.
echo   Option B: just double-click index.html to play on this PC.
echo.
pause
exit /b 1
