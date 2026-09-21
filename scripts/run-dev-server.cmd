@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-dev-server.ps1" %1
exit /b %ERRORLEVEL%
