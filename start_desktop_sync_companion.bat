@echo off
title Digital Twin Suite - Desktop Sync Companion
echo ==============================================================
echo    DIGITAL TWIN SUITE - CONTINUOUS DESKTOP SYNC COMPANION
echo ==============================================================
echo Checking system tasks and streaming desktop app data to cloud...
cd /d "%~dp0"
node scripts\desktop_sync_companion.mjs
pause
