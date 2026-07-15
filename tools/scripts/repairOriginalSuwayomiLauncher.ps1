# Repairs the Windows launcher shipped by Suwayomi when its GUI launcher stops
# starting the server. It preserves the original data root and keeps a backup
# of the original batch file before installing a direct, browser-based launcher.

[CmdletBinding()]
param(
    [string]$ServerRoot,
    [string]$DataRoot,
    [ValidateRange(1, 65535)]
    [int]$Port = 4567,
    [switch]$NoLaunch
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ServerRoot)) {
    $ProgramFiles64 = if ($env:ProgramW6432) { $env:ProgramW6432 } else { $env:ProgramFiles }
    $ServerRoot = Join-Path $ProgramFiles64 'Suwayomi-Server'
}
if ([string]::IsNullOrWhiteSpace($DataRoot)) {
    $DataRoot = Join-Path $env:LOCALAPPDATA 'Tachidesk'
}

$ServerRoot = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($ServerRoot))
$DataRoot = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($DataRoot))
$LauncherBatch = Join-Path $ServerRoot 'Suwayomi Launcher.bat'
$BackupBatch = Join-Path $ServerRoot 'Suwayomi Launcher.original.bat'
$RepairRoot = Join-Path $env:LOCALAPPDATA 'Suwayomi Launcher Repair'
$RepairScript = Join-Path $RepairRoot 'Start-Original-Suwayomi.ps1'
$Java = Join-Path $ServerRoot 'jre\bin\javaw.exe'
$ServerJar = Join-Path $ServerRoot 'bin\Suwayomi-Server.jar'

if (-not (Test-Path -LiteralPath $LauncherBatch -PathType Leaf)) {
    throw "No se encontro el lanzador instalado: $LauncherBatch"
}
if (-not (Test-Path -LiteralPath $Java -PathType Leaf)) {
    $Java = Join-Path $ServerRoot 'jre\bin\java.exe'
}
if (-not (Test-Path -LiteralPath $Java -PathType Leaf) -or -not (Test-Path -LiteralPath $ServerJar -PathType Leaf)) {
    throw 'No se encontro una instalacion compatible de Suwayomi-Server.'
}

[void](New-Item -ItemType Directory -Path $RepairRoot -Force)
$EscapedServerRoot = $ServerRoot.Replace("'", "''")
$EscapedDataRoot = $DataRoot.Replace("'", "''")
$RepairContents = @"
`$ErrorActionPreference = 'Stop'
`$serverRoot = '$EscapedServerRoot'
`$dataRoot = '$EscapedDataRoot'
`$port = $Port
`$java = Join-Path `$serverRoot 'jre\bin\javaw.exe'
if (-not (Test-Path -LiteralPath `$java -PathType Leaf)) { `$java = Join-Path `$serverRoot 'jre\bin\java.exe' }
`$serverJar = Join-Path `$serverRoot 'bin\Suwayomi-Server.jar'
function Test-LocalPort([int]`$testPort) {
    `$client = New-Object Net.Sockets.TcpClient
    try { `$client.Connect('127.0.0.1', `$testPort); return `$true } catch { return `$false } finally { `$client.Dispose() }
}
if (-not (Test-LocalPort `$port)) {
    `$arguments = '-Dsuwayomi.tachidesk.config.server.rootDir="{0}" -jar "{1}"' -f `$dataRoot, `$serverJar
    Start-Process -FilePath `$java -ArgumentList `$arguments -WorkingDirectory `$serverRoot -WindowStyle Hidden
    for (`$attempt = 0; `$attempt -lt 80 -and -not (Test-LocalPort `$port); `$attempt += 1) { Start-Sleep -Milliseconds 250 }
}
if (Test-LocalPort `$port) { Start-Process "http://127.0.0.1:`$port/" } else { throw 'El servidor no pudo iniciar.' }
"@
[IO.File]::WriteAllText($RepairScript, $RepairContents, (New-Object Text.UTF8Encoding($false)))

$BatchContents = @(
    '@echo off',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\Suwayomi Launcher Repair\Start-Original-Suwayomi.ps1"',
    'exit /b %ERRORLEVEL%',
    ''
) -join "`r`n"
$BatchWasRepaired = $false
try {
    if (-not (Test-Path -LiteralPath $BackupBatch -PathType Leaf)) {
        Copy-Item -LiteralPath $LauncherBatch -Destination $BackupBatch -Force
    }
    [IO.File]::WriteAllText($LauncherBatch, $BatchContents, (New-Object Text.UTF8Encoding($false)))
    $BatchWasRepaired = $true
} catch {
    Write-Warning 'Windows requiere permisos de administrador para reemplazar el archivo dentro de Program Files. Se creo un acceso de usuario equivalente llamado Suwayomi Launcher.'
}

function New-UserLauncherShortcut {
    param([string]$ShortcutPath)

    [void](New-Item -ItemType Directory -Path (Split-Path -Parent $ShortcutPath) -Force)
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = (Get-Command powershell.exe).Source
    $Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $RepairScript
    $Shortcut.WorkingDirectory = $ServerRoot
    $Shortcut.Description = 'Suwayomi Launcher reparado'
    $Shortcut.Save()
}

$StartMenuShortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Suwayomi Original.lnk'
New-UserLauncherShortcut -ShortcutPath $StartMenuShortcut
$DesktopPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
if (-not [string]::IsNullOrWhiteSpace($DesktopPath)) {
    New-UserLauncherShortcut -ShortcutPath (Join-Path $DesktopPath 'Suwayomi Original.lnk')
}

if (-not $NoLaunch) {
    Start-Process -FilePath (Get-Command powershell.exe).Source -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $RepairScript)
}

if ($BatchWasRepaired) {
    Write-Host "El Suwayomi Launcher original ya usa un inicio directo y fiable. Copia de seguridad: $BackupBatch"
} else {
    Write-Host "El acceso de usuario reparado se creo en: $StartMenuShortcut"
}
