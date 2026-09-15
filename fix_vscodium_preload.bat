@echo off
:: Batch script to patch VSCodium Simple Browser preload script export syntax error (VSCodium Issue #2924)
title Patch VSCodium BrowserView Preload Script

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo =========================================================================
    echo [!] Administrator privileges required.
    echo Please right-click "fix_vscodium_preload.bat" and select "Run as administrator".
    echo =========================================================================
    pause
    exit /b 1
)

set "TARGET=C:\Program Files\VSCodium\resources\app\out\vs\platform\browserView\electron-browser\preload-browserView.js"

if not exist "%TARGET%" (
    echo [!] Target file not found at:
    echo     %TARGET%
    echo If VSCodium is installed elsewhere, please check the install path.
    pause
    exit /b 1
)

powershell -NoProfile -Command ^
    "$path = 'C:\Program Files\VSCodium\resources\app\out\vs\platform\browserView\electron-browser\preload-browserView.js';" ^
    "$content = [System.IO.File]::ReadAllText($path);" ^
    "if ($content.Contains('export{};')) {" ^
    "    $updated = $content.Replace('export{};', '/* export{}; */');" ^
    "    [System.IO.File]::WriteAllText($path, $updated);" ^
    "    Write-Host '[SUCCESS] Successfully patched VSCodium preload-browserView.js!' -ForegroundColor Green;" ^
    "} else {" ^
    "    Write-Host '[INFO] VSCodium preload script is already patched or does not contain export{};' -ForegroundColor Yellow;" ^
    "}"

echo.
echo You can now close this window and restart/refresh VSCodium Simple Browser.
pause
