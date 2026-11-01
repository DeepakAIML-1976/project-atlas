@echo off
echo ========================================================
echo   Digital Twin Suite - Local Outlook to Cloud Sync
echo ========================================================
echo Ingesting emails from deepak.paranjape@kentplc.com into cloud database...
node "%~dp0scripts\sync_outlook.mjs"
echo.
echo Sync Complete! Refresh your browser on Render to see the updated emails.
pause
