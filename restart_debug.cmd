@echo off
chcp 65001 >nul
rem Close EVERY CodeBuddy process, then relaunch with the CDP debug port.
rem Why: CodeBuddy uses a single-instance lock. If any instance is alive, a new
rem launch just forwards argv to it and exits, so the debug port never opens.
setlocal
set "PORT=%~1"
if "%PORT%"=="" set "PORT=9333"
set "EXE=%LOCALAPPDATA%\Programs\CodeBuddy CN\CodeBuddy CN.exe"

echo [1/3] 正在关闭所有 CodeBuddy 窗口...
taskkill /im "CodeBuddy CN.exe" >nul 2>&1
timeout /t 5 /nobreak >nul

tasklist /fi "imagename eq CodeBuddy CN.exe" 2>nul | find /i "CodeBuddy CN.exe" >nul
if not errorlevel 1 (
  echo [2/3] 仍有残留进程，强制结束...
  taskkill /f /im "CodeBuddy CN.exe" >nul 2>&1
  timeout /t 4 /nobreak >nul
) else (
  echo [2/3] 已全部退出。
)

echo [3/3] 以调试模式启动（端口 %PORT%）...
start "" "%EXE%" --remote-debugging-port=%PORT%
timeout /t 2 /nobreak >nul
echo.
echo 完成。请稍等 IDE 打开后，确认端口：
echo   http://127.0.0.1:%PORT%/json/version
echo.
pause
