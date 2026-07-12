# Copyright (C) Contributors to the Suwayomi project
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

[CmdletBinding()]
param(
    [switch]$SkipMsi,
    [string]$DataRoot,
    [string]$InstallRoot,
    [switch]$NoLaunch
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$MsiName = 'Suwayomi-Server-v2.3.2238-windows-x64.msi'
$ExpectedMsiSha256 = 'f638b9657d34d1f481e35ed26ec29073fe967abd5b977fe75ab24731e39aa52c'
$ManagedBlockStart = '# >>> Suwayomi Parallel Reader - managed settings >>>'
$ManagedBlockEnd = '# <<< Suwayomi Parallel Reader - managed settings <<<'
$DataRootWasProvided = $PSBoundParameters.ContainsKey('DataRoot')
$InstallRootWasProvided = $PSBoundParameters.ContainsKey('InstallRoot')

if ([string]::IsNullOrWhiteSpace($DataRoot)) {
    $DataRoot = Join-Path $env:LOCALAPPDATA 'Tachidesk'
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    $ProgramFiles64 = if ($env:ProgramW6432) { $env:ProgramW6432 } else { $env:ProgramFiles }
    $InstallRoot = Join-Path $ProgramFiles64 'Suwayomi-Server'
}

$DataRoot = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($DataRoot))
$InstallRoot = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($InstallRoot))
$TestMode = $SkipMsi -and $NoLaunch -and $DataRootWasProvided -and $InstallRootWasProvided

function Show-InstallerMessage {
    param([string]$Text, [string]$Title, [bool]$IsError = $false)

    try {
        Add-Type -AssemblyName PresentationFramework
        $Icon = if ($IsError) {
            [System.Windows.MessageBoxImage]::Error
        } else {
            [System.Windows.MessageBoxImage]::Information
        }
        [void][System.Windows.MessageBox]::Show(
            $Text,
            $Title,
            [System.Windows.MessageBoxButton]::OK,
            $Icon
        )
    } catch {
        Write-Host "$Title`n$Text"
    }
}

function Stop-InstalledSuwayomi {
    param([string]$Root)

    if (-not (Test-Path -LiteralPath $Root)) { return }

    $Prefix = $Root.TrimEnd('\') + '\'
    $Candidates = @(Get-CimInstance Win32_Process | Where-Object {
        $Executable = [string]$_.ExecutablePath
        $CommandLine = [string]$_.CommandLine
        ($Executable.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase)) -or
        ($CommandLine.IndexOf($Root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            $CommandLine -match 'Suwayomi-(Launcher|Server)\.jar')
    })

    foreach ($Candidate in $Candidates) {
        if ($Candidate.ProcessId -eq $PID) { continue }
        try {
            $Process = Get-Process -Id $Candidate.ProcessId -ErrorAction Stop
            if ($Process.MainWindowHandle -ne 0) { [void]$Process.CloseMainWindow() }
        } catch { }
    }

    if ($Candidates.Count -gt 0) { Start-Sleep -Seconds 3 }

    foreach ($Candidate in $Candidates) {
        if ($Candidate.ProcessId -eq $PID) { continue }
        if (Get-Process -Id $Candidate.ProcessId -ErrorAction SilentlyContinue) {
            Stop-Process -Id $Candidate.ProcessId -Force
        }
    }
}

function Install-OfficialMsi {
    param([string]$MsiPath)

    if (-not (Test-Path -LiteralPath $MsiPath -PathType Leaf)) {
        throw "No se encontro el instalador oficial requerido: $MsiName"
    }

    $ActualHash = (Get-FileHash -LiteralPath $MsiPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ActualHash -ne $ExpectedMsiSha256) {
        throw "La verificacion de seguridad del instalador oficial fallo. No se realizo ningun cambio. Descarga nuevamente el paquete."
    }

    Stop-InstalledSuwayomi -Root $InstallRoot
    $Arguments = '/i "{0}" /passive /norestart' -f $MsiPath.Replace('"', '""')
    $MsiProcess = Start-Process -FilePath 'msiexec.exe' -ArgumentList $Arguments -Wait -PassThru
    if ($MsiProcess.ExitCode -notin @(0, 1641, 3010)) {
        throw "Windows Installer no pudo instalar Suwayomi (codigo $($MsiProcess.ExitCode)). Cierra Suwayomi y vuelve a intentarlo."
    }
}

function Install-CustomWebUi {
    param([string]$Source, [string]$DestinationRoot)

    if (-not (Test-Path -LiteralPath (Join-Path $Source 'index.html') -PathType Leaf)) {
        throw 'El paquete no contiene una WebUI valida. Descarga nuevamente el instalador.'
    }

    $DriveRoot = [IO.Path]::GetPathRoot($DestinationRoot)
    if ($DestinationRoot.TrimEnd('\') -eq $DriveRoot.TrimEnd('\')) {
        throw 'La carpeta de datos no puede ser la raiz de una unidad.'
    }

    [void](New-Item -ItemType Directory -Path $DestinationRoot -Force)
    $Destination = Join-Path $DestinationRoot 'webUI'
    $Token = [Guid]::NewGuid().ToString('N')
    $Staging = Join-Path $DestinationRoot ('.parallel-reader-webui-staging-' + $Token)
    $Backup = Join-Path $DestinationRoot ('.parallel-reader-webui-backup-' + $Token)

    try {
        Copy-Item -LiteralPath $Source -Destination $Staging -Recurse -Force
        if (-not (Test-Path -LiteralPath (Join-Path $Staging 'index.html') -PathType Leaf)) {
            throw 'No se pudo preparar la nueva WebUI.'
        }

        if (Test-Path -LiteralPath $Destination) {
            Move-Item -LiteralPath $Destination -Destination $Backup
        }

        try {
            Move-Item -LiteralPath $Staging -Destination $Destination
        } catch {
            if ((Test-Path -LiteralPath $Backup) -and -not (Test-Path -LiteralPath $Destination)) {
                Move-Item -LiteralPath $Backup -Destination $Destination
            }
            throw
        }

        if (Test-Path -LiteralPath $Backup) {
            Remove-Item -LiteralPath $Backup -Recurse -Force
        }
    } finally {
        if (Test-Path -LiteralPath $Staging) {
            Remove-Item -LiteralPath $Staging -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Set-ParallelReaderConfiguration {
    param([string]$Root)

    $ConfigPath = Join-Path $Root 'server.conf'
    $Existing = if (Test-Path -LiteralPath $ConfigPath) {
        [IO.File]::ReadAllText($ConfigPath)
    } else { '' }

    $Pattern = '(?ms)^\s*' + [regex]::Escape($ManagedBlockStart) +
        '.*?^\s*' + [regex]::Escape($ManagedBlockEnd) + '\s*(?:\r?\n)?'
    $Existing = [regex]::Replace($Existing, $Pattern, '').TrimEnd()
    $Block = @(
        $ManagedBlockStart,
        'server.webUIFlavor = "Custom"',
        'server.webUIUpdateCheckInterval = 0',
        $ManagedBlockEnd
    ) -join "`r`n"
    $NewContent = if ($Existing) { $Existing + "`r`n`r`n" + $Block + "`r`n" } else { $Block + "`r`n" }
    $TemporaryPath = Join-Path $Root ('.parallel-reader-server-conf-' + [Guid]::NewGuid().ToString('N'))
    $BackupPath = $TemporaryPath + '.backup'

    try {
        [IO.File]::WriteAllText($TemporaryPath, $NewContent, (New-Object Text.UTF8Encoding($false)))
        if (Test-Path -LiteralPath $ConfigPath) {
            [IO.File]::Replace($TemporaryPath, $ConfigPath, $BackupPath)
        } else {
            [IO.File]::Move($TemporaryPath, $ConfigPath)
        }
    } finally {
        if (Test-Path -LiteralPath $TemporaryPath) {
            Remove-Item -LiteralPath $TemporaryPath -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $BackupPath) {
            Remove-Item -LiteralPath $BackupPath -Force -ErrorAction SilentlyContinue
        }
    }
}

function Install-ParallelReaderNotices {
    param([string]$Root)

    $NoticesRoot = Join-Path $Root 'parallel-reader-notices'
    [void](New-Item -ItemType Directory -Path $NoticesRoot -Force)
    foreach ($FileName in @('LICENSE', 'THIRD-PARTY-NOTICES.txt', 'WEBUI-DEPENDENCY-LICENSES.txt')) {
        $SourcePath = Join-Path $PSScriptRoot $FileName
        if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
            throw "El paquete no contiene el aviso legal requerido: $FileName"
        }
        Copy-Item -LiteralPath $SourcePath -Destination (Join-Path $NoticesRoot $FileName) -Force
    }
}

function New-ParallelReaderShortcut {
    param([string]$Launcher)

    $Programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    [void](New-Item -ItemType Directory -Path $Programs -Force)
    $ShortcutPath = Join-Path $Programs 'Suwayomi Parallel Reader.lnk'
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $Launcher
    $Shortcut.WorkingDirectory = $InstallRoot
    $Shortcut.Description = 'Suwayomi con Parallel Reader integrado'
    $Shortcut.Save()
}

try {
    $MsiPath = Join-Path $PSScriptRoot $MsiName
    $WebUiSource = Join-Path $PSScriptRoot 'webUI'
    $LauncherPath = Join-Path $InstallRoot 'Suwayomi Launcher.bat'

    if (-not $SkipMsi) {
        Install-OfficialMsi -MsiPath $MsiPath
    }

    Install-CustomWebUi -Source $WebUiSource -DestinationRoot $DataRoot
    Set-ParallelReaderConfiguration -Root $DataRoot
    Install-ParallelReaderNotices -Root $DataRoot

    if (-not $TestMode) {
        if (-not (Test-Path -LiteralPath $LauncherPath -PathType Leaf)) {
            throw "No se encontro el lanzador oficial en $LauncherPath. Reinstala sin usar -SkipMsi."
        }
        New-ParallelReaderShortcut -Launcher $LauncherPath
    }

    if (-not $NoLaunch) {
        Start-Process -FilePath $LauncherPath -WorkingDirectory $InstallRoot
        Show-InstallerMessage -Title 'Suwayomi Parallel Reader' -Text 'Instalacion completada. Suwayomi se iniciara ahora; Parallel Reader ya esta integrado.'
    } else {
        Write-Host 'Instalacion de Parallel Reader completada correctamente.'
    }
} catch {
    $FriendlyError = "No se pudo instalar Suwayomi Parallel Reader.`n`n$($_.Exception.Message)`n`nTus mangas, descargas y demas datos no fueron eliminados."
    if ($TestMode) {
        Write-Error $FriendlyError
    } else {
        Show-InstallerMessage -Title 'Error de instalacion' -Text $FriendlyError -IsError $true
        Write-Error $_
    }
    exit 1
}
