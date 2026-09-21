@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start APOE Research OS.ps1" %*
if errorlevel 1 (
  echo.
  echo Research OS did not start. See the message above.
  pause
)
exit /b %ERRORLEVEL%
