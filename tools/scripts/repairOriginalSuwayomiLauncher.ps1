# Recreates user shortcuts for the stock graphical Suwayomi launcher without
# touching the installed application, its data, or its server configuration.

[CmdletBinding()]
param(
    [string]$ServerRoot,
    [switch]$NoLaunch
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ServerRoot)) {
    $ProgramFiles64 = if ($env:ProgramW6432) { $env:ProgramW6432 } else { $env:ProgramFiles }
    $ServerRoot = Join-Path $ProgramFiles64 'Suwayomi-Server'
}
$ServerRoot = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($ServerRoot))
$Java = Join-Path $ServerRoot 'jre\bin\javaw.exe'
$LauncherJar = Join-Path $ServerRoot 'Suwayomi-Launcher.jar'

if (-not (Test-Path -LiteralPath $Java -PathType Leaf)) {
    $Java = Join-Path $ServerRoot 'jre\bin\java.exe'
}
if (-not (Test-Path -LiteralPath $Java -PathType Leaf) -or -not (Test-Path -LiteralPath $LauncherJar -PathType Leaf)) {
    throw 'No se encontro el launcher grafico de la instalacion oficial de Suwayomi.'
}

$Arguments = '--add-exports=java.desktop/sun.awt=ALL-UNNAMED -jar "{0}"' -f $LauncherJar

function New-UserLauncherShortcut {
    param([string]$ShortcutPath)

    [void](New-Item -ItemType Directory -Path (Split-Path -Parent $ShortcutPath) -Force)
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $Java
    $Shortcut.Arguments = $Arguments
    $Shortcut.WorkingDirectory = $ServerRoot
    $Shortcut.Description = 'Suwayomi Launcher oficial'
    $Shortcut.Save()
}

$StartMenuShortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Suwayomi Original.lnk'
New-UserLauncherShortcut -ShortcutPath $StartMenuShortcut
$DesktopPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
if (-not [string]::IsNullOrWhiteSpace($DesktopPath)) {
    New-UserLauncherShortcut -ShortcutPath (Join-Path $DesktopPath 'Suwayomi Original.lnk')
}

if (-not $NoLaunch) {
    Start-Process -FilePath $Java -ArgumentList $Arguments -WorkingDirectory $ServerRoot
}

Write-Host "El acceso directo al launcher grafico oficial se creo en: $StartMenuShortcut"
