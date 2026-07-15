# Copyright (C) Contributors to the Suwayomi project
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

[CmdletBinding()]
param(
    # Used by the small patcher package. It never modifies the detected server.
    [switch]$SkipMsi,

    # A compatible, existing Suwayomi-Server installation to copy into the
    # independent Parallel Reader installation. It is detected automatically.
    [Alias('ServerRoot')]
    [string]$ExistingServerRoot,

    # The independent server files and data. Neither default is Tachidesk.
    [string]$DataRoot,
    [string]$InstallRoot,

    [ValidateRange(1, 65535)]
    [int]$Port = 4568,

    [switch]$NoLaunch
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$MsiName = 'Suwayomi-Server-v2.3.2238-windows-x64.msi'
$ExpectedMsiSha256 = 'f638b9657d34d1f481e35ed26ec29073fe967abd5b977fe75ab24731e39aa52c'
$ManagedBlockStart = '# >>> Suwayomi Parallel Reader - managed settings >>>'
$ManagedBlockEnd = '# <<< Suwayomi Parallel Reader - managed settings <<<'
$ParallelReaderHome = Join-Path $env:LOCALAPPDATA 'Suwayomi Parallel Reader'
$DataRootWasProvided = $PSBoundParameters.ContainsKey('DataRoot')
$InstallRootWasProvided = $PSBoundParameters.ContainsKey('InstallRoot')
$ExistingServerRootWasProvided = $PSBoundParameters.ContainsKey('ExistingServerRoot')

if ([string]::IsNullOrWhiteSpace($DataRoot)) {
    $DataRoot = Join-Path $ParallelReaderHome 'data'
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    $InstallRoot = Join-Path $ParallelReaderHome 'server'
}

$DataRoot = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($DataRoot))
$InstallRoot = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($InstallRoot))
$TestMode = $SkipMsi -and $NoLaunch -and $DataRootWasProvided -and $InstallRootWasProvided -and $ExistingServerRootWasProvided

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

function Get-OfficialServerRoot {
    $ProgramFiles64 = if ($env:ProgramW6432) { $env:ProgramW6432 } else { $env:ProgramFiles }
    return Join-Path $ProgramFiles64 'Suwayomi-Server'
}

function Test-SuwayomiServerRoot {
    param([Parameter(Mandatory = $true)][string]$Root)

    $ServerJar = Join-Path $Root 'bin\Suwayomi-Server.jar'
    $Java = @(
        (Join-Path $Root 'jre\bin\javaw.exe'),
        (Join-Path $Root 'jre\bin\java.exe')
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

    return (Test-Path -LiteralPath $ServerJar -PathType Leaf) -and $null -ne $Java
}

function Resolve-ExistingServerRoot {
    param([string]$RequestedRoot)

    $Candidates = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrWhiteSpace($RequestedRoot)) {
        $Candidates.Add([IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($RequestedRoot)))
    }

    $Candidates.Add((Get-OfficialServerRoot))
    if ($env:ProgramFiles -and $env:ProgramFiles -ne $env:ProgramW6432) {
        $Candidates.Add((Join-Path $env:ProgramFiles 'Suwayomi-Server'))
    }
    if (${env:ProgramFiles(x86)}) {
        $Candidates.Add((Join-Path ${env:ProgramFiles(x86)} 'Suwayomi-Server'))
    }

    foreach ($Candidate in ($Candidates | Select-Object -Unique)) {
        if (Test-SuwayomiServerRoot -Root $Candidate) {
            return $Candidate
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($RequestedRoot)) {
        throw "La instalacion indicada no parece un Suwayomi-Server compatible: $RequestedRoot"
    }

    throw 'No se encontro una instalacion compatible de Suwayomi-Server. Instala o actualiza Suwayomi normalmente y vuelve a ejecutar este parche.'
}

function Stop-ParallelReaderServer {
    param([Parameter(Mandatory = $true)][string]$Root)

    if (-not (Test-Path -LiteralPath $Root)) { return }

    $Candidates = @(Get-CimInstance Win32_Process | Where-Object {
        $CommandLine = [string]$_.CommandLine
        $CommandLine.IndexOf($Root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            $CommandLine -match 'Suwayomi-Server\.jar'
    })

    foreach ($Candidate in $Candidates) {
        if ($Candidate.ProcessId -eq $PID) { continue }
        Stop-Process -Id $Candidate.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Install-OfficialMsi {
    param([string]$MsiPath)

    if (-not (Test-Path -LiteralPath $MsiPath -PathType Leaf)) {
        throw "No se encontro el instalador oficial requerido: $MsiName"
    }

    $ActualHash = (Get-FileHash -LiteralPath $MsiPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ActualHash -ne $ExpectedMsiSha256) {
        throw 'La verificacion de seguridad del instalador oficial fallo. No se realizo ningun cambio. Descarga nuevamente el paquete.'
    }

    $Arguments = '/i "{0}" /passive /norestart' -f $MsiPath.Replace('"', '""')
    $MsiProcess = Start-Process -FilePath 'msiexec.exe' -ArgumentList $Arguments -Wait -PassThru
    if ($MsiProcess.ExitCode -notin @(0, 1641, 3010)) {
        throw "Windows Installer no pudo instalar Suwayomi (codigo $($MsiProcess.ExitCode)). Cierra Suwayomi y vuelve a intentarlo."
    }
}

function Copy-ServerInstallation {
    param([Parameter(Mandatory = $true)][string]$Source, [Parameter(Mandatory = $true)][string]$Destination)

    $Source = [IO.Path]::GetFullPath($Source)
    $Destination = [IO.Path]::GetFullPath($Destination)
    if ($Source.Equals($Destination, [StringComparison]::OrdinalIgnoreCase)) {
        return
    }

    $DestinationParent = Split-Path -Parent $Destination
    [void](New-Item -ItemType Directory -Path $DestinationParent -Force)
    $Token = [Guid]::NewGuid().ToString('N')
    $Staging = Join-Path $DestinationParent ('.parallel-reader-server-staging-' + $Token)
    $Backup = Join-Path $DestinationParent ('.parallel-reader-server-backup-' + $Token)

    try {
        Copy-Item -LiteralPath $Source -Destination $Staging -Recurse -Force
        if (-not (Test-SuwayomiServerRoot -Root $Staging)) {
            throw 'La copia del servidor no contiene los archivos requeridos de Suwayomi.'
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
    param([string]$Root, [int]$ServerPort)

    $ConfigPath = Join-Path $Root 'server.conf'
    $Existing = if (Test-Path -LiteralPath $ConfigPath) {
        [IO.File]::ReadAllText($ConfigPath)
    } else { '' }

    $Pattern = '(?ms)^\s*' + [regex]::Escape($ManagedBlockStart) +
        '.*?^\s*' + [regex]::Escape($ManagedBlockEnd) + '\s*(?:\r?\n)?'
    $Existing = [regex]::Replace($Existing, $Pattern, '').TrimEnd()
    $Block = @(
        $ManagedBlockStart,
        'server.ip = "127.0.0.1"',
        "server.port = $ServerPort",
        'server.webUIFlavor = "Custom"',
        'server.webUIUpdateCheckInterval = 0',
        'server.webUIInterface = "BROWSER"',
        'server.initialOpenInBrowserEnabled = false',
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

function Write-ParallelReaderLauncher {
    param(
        [Parameter(Mandatory = $true)][string]$LauncherPath,
        [Parameter(Mandatory = $true)][string]$ServerRoot,
        [Parameter(Mandatory = $true)][string]$ServerDataRoot,
        [Parameter(Mandatory = $true)][int]$ServerPort
    )

    $EscapedServerRoot = $ServerRoot.Replace("'", "''")
    $EscapedDataRoot = $ServerDataRoot.Replace("'", "''")
    $Launcher = @"
`$ErrorActionPreference = 'Stop'
`$serverRoot = '$EscapedServerRoot'
`$dataRoot = '$EscapedDataRoot'
`$port = $ServerPort
`$java = Join-Path `$serverRoot 'jre\bin\javaw.exe'
if (-not (Test-Path -LiteralPath `$java -PathType Leaf)) { `$java = Join-Path `$serverRoot 'jre\bin\java.exe' }
`$serverJar = Join-Path `$serverRoot 'bin\Suwayomi-Server.jar'
if (-not (Test-Path -LiteralPath `$java -PathType Leaf) -or -not (Test-Path -LiteralPath `$serverJar -PathType Leaf)) {
    throw 'No se encontro la instalacion independiente de Suwayomi Parallel Reader. Ejecuta el parche otra vez.'
}
function Test-LocalPort([int]`$testPort) {
    `$client = New-Object Net.Sockets.TcpClient
    try { `$client.Connect('127.0.0.1', `$testPort); return `$true } catch { return `$false } finally { `$client.Dispose() }
}
if (-not (Test-LocalPort `$port)) {
    `$arguments = '-Dsuwayomi.tachidesk.config.server.rootDir="{0}" -jar "{1}"' -f `$dataRoot, `$serverJar
    Start-Process -FilePath `$java -ArgumentList `$arguments -WorkingDirectory `$serverRoot -WindowStyle Hidden
    for (`$attempt = 0; `$attempt -lt 80 -and -not (Test-LocalPort `$port); `$attempt += 1) { Start-Sleep -Milliseconds 250 }
}
if (Test-LocalPort `$port) {
    Start-Process "http://127.0.0.1:`$port/"
} else {
    Add-Type -AssemblyName PresentationFramework
    [void][System.Windows.MessageBox]::Show('Suwayomi Parallel Reader no pudo iniciar. Ejecuta el parche de nuevo o consulta server.log en su carpeta de datos.', 'Suwayomi Parallel Reader')
}
"@
    [IO.File]::WriteAllText($LauncherPath, $Launcher, (New-Object Text.UTF8Encoding($false)))
}

function New-ParallelReaderShortcut {
    param([string]$Launcher)

    $Programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    [void](New-Item -ItemType Directory -Path $Programs -Force)
    $ShortcutPath = Join-Path $Programs 'Suwayomi Parallel Reader.lnk'
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = (Get-Command powershell.exe).Source
    $Shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $Launcher
    $Shortcut.WorkingDirectory = $InstallRoot
    $Shortcut.Description = 'Instalacion independiente de Suwayomi con Parallel Reader integrado'
    $Shortcut.Save()
}

try {
    $MsiPath = Join-Path $PSScriptRoot $MsiName
    $WebUiSource = Join-Path $PSScriptRoot 'webUI'

    if (-not $SkipMsi) {
        Install-OfficialMsi -MsiPath $MsiPath
        $ExistingServerRoot = Get-OfficialServerRoot
    }

    $SourceServerRoot = Resolve-ExistingServerRoot -RequestedRoot $ExistingServerRoot
    Stop-ParallelReaderServer -Root $DataRoot
    Copy-ServerInstallation -Source $SourceServerRoot -Destination $InstallRoot
    Install-CustomWebUi -Source $WebUiSource -DestinationRoot $DataRoot
    Set-ParallelReaderConfiguration -Root $DataRoot -ServerPort $Port
    Install-ParallelReaderNotices -Root $DataRoot
    $LauncherPath = Join-Path $DataRoot 'Start-Suwayomi-ParallelReader.ps1'
    Write-ParallelReaderLauncher -LauncherPath $LauncherPath -ServerRoot $InstallRoot -ServerDataRoot $DataRoot -ServerPort $Port

    if (-not $TestMode) {
        New-ParallelReaderShortcut -Launcher $LauncherPath
    }

    if (-not $NoLaunch) {
        Start-Process -FilePath (Get-Command powershell.exe).Source -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $LauncherPath)
        Show-InstallerMessage -Title 'Suwayomi Parallel Reader' -Text 'Instalacion independiente completada. El original conserva sus datos y usa el puerto 4567; Parallel Reader usa sus propios datos y el puerto 4568.'
    } else {
        Write-Host 'Instalacion independiente de Parallel Reader completada correctamente.'
    }
} catch {
    $FriendlyError = "No se pudo instalar Suwayomi Parallel Reader.`n`n$($_.Exception.Message)`n`nLa instalacion y los datos originales de Suwayomi no fueron modificados."
    if ($TestMode) {
        Write-Error $FriendlyError
    } else {
        Show-InstallerMessage -Title 'Error de instalacion' -Text $FriendlyError -IsError $true
        Write-Error $_
    }
    exit 1
}
