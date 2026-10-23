@echo off
title StreamFusion Mobile Mirroring
cd /d "%~dp0"
echo ===================================================
echo   StreamFusion Mobile Mirroring - Desktop App
echo   Powered by scrcpy v5.0 ^& adb
echo ===================================================
echo.
echo Launching StreamFusion...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit
