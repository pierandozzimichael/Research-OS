@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install Research OS.ps1" %*
if errorlevel 1 (
  echo.
  echo Research OS installation did not complete. See the message above.
  pause
)
exit /b %ERRORLEVEL%
