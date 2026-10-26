@echo off
title BookStore Backend Server (Port 5000)
cd /d "%~dp0"
echo ==============================================
echo    Starting BookStore Backend (Node/Express)
echo ==============================================
echo Running on http://localhost:5000
echo.
node server.js
pause
