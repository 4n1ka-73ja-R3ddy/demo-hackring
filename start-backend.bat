@echo off
REM One-click start for the Cutwise analysis server (http://127.0.0.1:8000)
cd /d "%~dp0backend"
if not exist .venv (
  echo Creating Python virtual environment...
  python -m venv .venv || (echo Python 3.10+ is required. & pause & exit /b 1)
)
call .venv\Scripts\activate.bat
echo Installing dependencies (first run takes a few minutes)...
python -m pip install -q --upgrade pip
pip install -q -r requirements.txt || (echo Dependency install failed. & pause & exit /b 1)
if not exist .env if exist .env.example copy .env.example .env >nul
echo Starting server on http://127.0.0.1:8000 ...
uvicorn app.main:app --port 8000
pause
