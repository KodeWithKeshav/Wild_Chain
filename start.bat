@echo off
setlocal
title Wild Chain - Local Blockchain Startup
cd /d "%~dp0"

echo.
echo  =======================================
echo   Wild Chain - Local Blockchain Startup
echo  =======================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

:: Install root dependencies if needed
if not exist "node_modules" (
    echo [1/6] Installing root dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [1/6] Root dependencies already installed.
)

:: Install frontend dependencies if needed
if not exist "frontend\node_modules" (
    echo [2/6] Installing frontend dependencies...
    call npm --prefix frontend install
    if %errorlevel% neq 0 (
        echo [ERROR] Frontend npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [2/6] Frontend dependencies already installed.
)

:: Start Ganache if not already running
powershell -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:7545' -Method POST -Body '{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}' -ContentType 'application/json' -TimeoutSec 1).StatusCode } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo [3/6] Ganache is already running on port 7545.
    goto ganache_ready
)

echo [3/6] Starting Ganache (port 7545)...
start "Ganache" /min cmd /c "npx ganache --wallet.deterministic --chain.chainId 1337 --server.port 7545 --miner.blockGasLimit 30000000"

:: Wait for Ganache to be ready
echo      Waiting for Ganache to start...
:wait_ganache
timeout /t 2 /nobreak >nul
powershell -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:7545' -Method POST -Body '{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}' -ContentType 'application/json' -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if %errorlevel% neq 0 goto wait_ganache
echo      Ganache is ready!

:ganache_ready

:: Compile contracts
echo [4/6] Compiling contracts...
call npx hardhat compile
if %errorlevel% neq 0 (
    echo [ERROR] Contract compilation failed.
    pause
    exit /b 1
)

:: Deploy contracts
echo [5/6] Deploying contracts to Ganache...
call npx hardhat run scripts/deploy.ts --network ganache
if %errorlevel% neq 0 (
    echo [ERROR] Deployment failed.
    pause
    exit /b 1
)
call npx hardhat run scripts/export-abi.ts
if %errorlevel% neq 0 (
    echo [ERROR] ABI export failed.
    pause
    exit /b 1
)

:: Seed demo data
echo [6/6] Seeding demo data (5 orgs, 3 animals)...
call npx hardhat run scripts/seed-demo.ts --network ganache
if %errorlevel% neq 0 (
    echo [ERROR] Seeding failed.
    pause
    exit /b 1
)

echo.
echo  =======================================
echo   All ready! Starting frontend...
echo  =======================================
echo.
echo   Open http://localhost:5173 in your browser.
echo   Use the account switcher in the sidebar to act as different organizations.
echo.
echo   Press Ctrl+C to stop the frontend server.
echo   Close the "Ganache" window to stop the local blockchain.
echo.

:: Automatically open browser
start http://localhost:5173

:: Start Vite dev server (foreground)
call npm --prefix frontend run dev
