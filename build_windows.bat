@echo off
setlocal

py -3 -m venv .venv
if errorlevel 1 exit /b 1

.venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe -m pip install -r requirements-windows.txt
if errorlevel 1 exit /b 1

.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --windowed --name Journote --add-data "static;static" --collect-all webview --hidden-import webview.platforms.edgechromium desktop.py
if errorlevel 1 exit /b 1

echo Portable application created at dist\Journote.exe
endlocal