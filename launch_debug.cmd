@echo off
rem Launch CodeBuddy CN with a local CDP debug port (loopback only).
rem Usage: launch_debug.cmd [port]   (default 9333)
setlocal
set "PORT=%~1"
if "%PORT%"=="" set "PORT=9333"
set "EXE=%LOCALAPPDATA%\Programs\CodeBuddy CN\CodeBuddy CN.exe"

if not exist "%EXE%" (
  echo [FAIL] CodeBuddy not found at:
  echo        %EXE%
  echo        Adjust EXE at the top of this file if it is installed elsewhere.
  pause
  exit /b 1
)

tasklist /fi "imagename eq CodeBuddy CN.exe" 2>nul | find /i "CodeBuddy CN.exe" >nul
if not errorlevel 1 (
  echo [WARN] CodeBuddy is already running. Close ALL its windows first,
  echo        otherwise Qt/Electron single-instance will forward args to the
  echo        existing process and the debug port will NOT open.
  echo.
  pause
  exit /b 1
)

echo Starting CodeBuddy CN with --remote-debugging-port=%PORT% ...
start "" "%EXE%" --remote-debugging-port=%PORT%
exit /b 0
