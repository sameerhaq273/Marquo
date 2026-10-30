# Builds release\Marquo-Setup-<version>.exe. Needs the project's .venv and npm packages.
# Run with: npm run build:windows
$ErrorActionPreference = 'Stop'

# PowerShell doesn't stop on a failing program by itself
function Run {
    param([string]$Program, [Parameter(ValueFromRemainingArguments)][string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}

Set-Location (Resolve-Path "$PSScriptRoot\..\..")
$python = '.venv\Scripts\python.exe'

Write-Host '== Website'
Run npm.cmd run build

Write-Host '== App'
Run $python -m pip install --quiet --disable-pip-version-check -r requirements.txt -r requirements-desktop.txt
Run $python -m PyInstaller packaging\windows\marquo.spec --noconfirm --distpath build\pyinstaller\dist --workpath build\pyinstaller\work

Write-Host '== Installer'
$webview2 = 'packaging\windows\MicrosoftEdgeWebview2Setup.exe'
if (-not (Test-Path $webview2)) {
    # Microsoft's small online installer, for the few Windows 10 machines without WebView2
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $webview2 -UseBasicParsing
    if ((Get-AuthenticodeSignature $webview2).Status -ne 'Valid') {
        Remove-Item $webview2
        throw 'The WebView2 setup downloaded from Microsoft is not validly signed.'
    }
}
# The compiler comes from npm, so building needs no system-wide install of Inno Setup
Run npx.cmd --yes --package=innosetup@6.4.1 innosetup-compiler packaging\windows\installer.iss

Write-Host "== Done: $((Get-ChildItem release\Marquo-Setup-*.exe | Sort-Object LastWriteTime | Select-Object -Last 1).FullName)"
