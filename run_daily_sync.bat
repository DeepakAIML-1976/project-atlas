@echo off
title Digital Twin Suite - Daily Sync
cd /d "%~dp0"
echo ========================================================
echo  Digital Twin Suite - Daily Outlook Email & Calendar Sync
echo ========================================================
node scripts\daily_sync.mjs
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Sync encountered an issue. See details above.
) else (
  echo.
  echo [SUCCESS] Daily sync completed successfully.
)
pause
