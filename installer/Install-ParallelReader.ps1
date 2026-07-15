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
        'server.initialOpenInBrowserEnabled = true',
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
            # The release package stores notices beside this script; the source
            # checkout keeps the canonical copies at the repository root.
            $DevelopmentSource = Join-Path (Split-Path -Parent $PSScriptRoot) $FileName
            if (Test-Path -LiteralPath $DevelopmentSource -PathType Leaf) {
                $SourcePath = $DevelopmentSource
            }
        }
        if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
            throw "El paquete no contiene el aviso legal requerido: $FileName"
        }
        Copy-Item -LiteralPath $SourcePath -Destination (Join-Path $NoticesRoot $FileName) -Force
    }
}

function Replace-LauncherAsciiString {
    param(
        [Parameter(Mandatory = $true)][byte[]]$Bytes,
        [Parameter(Mandatory = $true)][string]$Find,
        [Parameter(Mandatory = $true)][string]$Replace
    )

    $FindBytes = [Text.Encoding]::UTF8.GetBytes($Find)
    $ReplaceBytes = [Text.Encoding]::UTF8.GetBytes($Replace)
    if ($FindBytes.Length -ne $ReplaceBytes.Length) {
        throw "La sustitucion del launcher debe mantener la misma longitud: $Find"
    }

    $Replacements = 0
    for ($Index = 0; $Index -le $Bytes.Length - $FindBytes.Length; $Index += 1) {
        $Matches = $true
        for ($Offset = 0; $Offset -lt $FindBytes.Length; $Offset += 1) {
            if ($Bytes[$Index + $Offset] -ne $FindBytes[$Offset]) {
                $Matches = $false
                break
            }
        }
        if ($Matches) {
            [Array]::Copy($ReplaceBytes, 0, $Bytes, $Index, $ReplaceBytes.Length)
            $Replacements += 1
            $Index += $FindBytes.Length - 1
        }
    }
    return $Replacements
}

function Update-ParallelReaderGraphicalLauncher {
    param([Parameter(Mandatory = $true)][string]$ServerRoot)

    $LauncherJar = Join-Path $ServerRoot 'Suwayomi-Launcher.jar'
    $ReplacementsToApply = @(
        [PSCustomObject]@{
            Find = 'Tachidesk'
            Replace = 'ParallelR'
        },
        [PSCustomObject]@{
            Find = 'suwayomi/launcher'
            Replace = 'suwayomi/parallel'
        }
    )
    if (-not (Test-Path -LiteralPath $LauncherJar -PathType Leaf)) {
        throw "No se encontro el launcher grafico de Suwayomi: $LauncherJar"
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $Archive = [IO.Compression.ZipFile]::OpenRead($LauncherJar)
    $TemporaryJar = $LauncherJar + '.parallel-reader.tmp'
    try {
        $PatchedEntries = @{}
        $Changed = $false
        $FoundAppDirectory = $false
        $FoundPreferenceNode = $false
        foreach ($Entry in $Archive.Entries | Where-Object { $_.FullName.EndsWith('.class', [StringComparison]::Ordinal) }) {
            $Memory = New-Object IO.MemoryStream
            $EntryStream = $Entry.Open()
            try { $EntryStream.CopyTo($Memory) } finally { $EntryStream.Dispose() }
            $EntryBytes = $Memory.ToArray()
            $Memory.Dispose()

            $EntryChanged = $false
            foreach ($Replacement in $ReplacementsToApply) {
                $Count = Replace-LauncherAsciiString -Bytes $EntryBytes -Find $Replacement.Find -Replace $Replacement.Replace
                if ($Count -gt 0) {
                    $Changed = $true
                    $EntryChanged = $true
                }
                $EntryText = [Text.Encoding]::GetEncoding(28591).GetString($EntryBytes)
                if ($Replacement.Replace -eq 'ParallelR' -and $EntryText.Contains($Replacement.Replace)) {
                    $FoundAppDirectory = $true
                }
                if ($Replacement.Replace -eq 'suwayomi/parallel' -and $EntryText.Contains($Replacement.Replace)) {
                    $FoundPreferenceNode = $true
                }
            }
            if ($EntryChanged) {
                $PatchedEntries[$Entry.FullName] = $EntryBytes
            }
        }
        if (-not $FoundAppDirectory -or -not $FoundPreferenceNode) {
            throw 'La version instalada del launcher no se pudo aislar de forma segura.'
        }
        if (-not $Changed) {
            # The launcher was already made independent by an earlier patch run.
            return
        }

        if (Test-Path -LiteralPath $TemporaryJar) {
            Remove-Item -LiteralPath $TemporaryJar -Force
        }
        $OutputArchive = [IO.Compression.ZipFile]::Open($TemporaryJar, [IO.Compression.ZipArchiveMode]::Create)
        try {
            foreach ($SourceEntry in $Archive.Entries) {
                $DestinationEntry = $OutputArchive.CreateEntry($SourceEntry.FullName, [IO.Compression.CompressionLevel]::Optimal)
                $DestinationEntry.LastWriteTime = $SourceEntry.LastWriteTime
                $DestinationStream = $DestinationEntry.Open()
                try {
                    if ($PatchedEntries.ContainsKey($SourceEntry.FullName)) {
                        $EntryBytes = [byte[]]$PatchedEntries[$SourceEntry.FullName]
                        $DestinationStream.Write($EntryBytes, 0, $EntryBytes.Length)
                    } else {
                        $SourceStream = $SourceEntry.Open()
                        try { $SourceStream.CopyTo($DestinationStream) } finally { $SourceStream.Dispose() }
                    }
                } finally { $DestinationStream.Dispose() }
            }
        } finally { $OutputArchive.Dispose() }
    } finally {
        $Archive.Dispose()
    }

    try {
        Move-Item -LiteralPath $TemporaryJar -Destination $LauncherJar -Force
    } finally {
        if (Test-Path -LiteralPath $TemporaryJar) {
            Remove-Item -LiteralPath $TemporaryJar -Force -ErrorAction SilentlyContinue
        }
    }
}

function Set-ParallelReaderLauncherDataRoot {
    param([Parameter(Mandatory = $true)][string]$Root)

    # The patched graphical launcher stores its defaults under LocalAppData\ParallelR.
    # A junction keeps that internal location bound to the independent data directory.
    $LauncherDataRoot = Join-Path $env:LOCALAPPDATA 'ParallelR'
    if ($LauncherDataRoot.Equals($Root, [StringComparison]::OrdinalIgnoreCase)) {
        return
    }

    if (Test-Path -LiteralPath $LauncherDataRoot) {
        $ExistingItem = Get-Item -LiteralPath $LauncherDataRoot -Force
        if (($ExistingItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            $Target = @($ExistingItem.Target)[0]
            if (-not [string]::IsNullOrWhiteSpace($Target) -and
                ([IO.Path]::GetFullPath($Target).TrimEnd('\') -eq $Root.TrimEnd('\'))) {
                return
            }
            throw "La ruta interna del launcher ya apunta a otro directorio: $LauncherDataRoot"
        }
        if ((Get-ChildItem -LiteralPath $LauncherDataRoot -Force | Measure-Object).Count -ne 0) {
            throw "No se puede aislar el launcher porque esta ruta ya contiene datos ajenos: $LauncherDataRoot"
        }
        Remove-Item -LiteralPath $LauncherDataRoot -Force
    }

    [void](New-Item -ItemType Junction -Path $LauncherDataRoot -Target $Root)
}

function Get-ParallelReaderGraphicalLauncher {
    param([Parameter(Mandatory = $true)][string]$ServerRoot)

    $Java = Join-Path $ServerRoot 'jre\bin\javaw.exe'
    if (-not (Test-Path -LiteralPath $Java -PathType Leaf)) {
        $Java = Join-Path $ServerRoot 'jre\bin\java.exe'
    }
    $LauncherJar = Join-Path $ServerRoot 'Suwayomi-Launcher.jar'
    if (-not (Test-Path -LiteralPath $Java -PathType Leaf) -or -not (Test-Path -LiteralPath $LauncherJar -PathType Leaf)) {
        throw 'No se encontro el launcher grafico de la instalacion independiente.'
    }

    return [PSCustomObject]@{
        Java = $Java
        Arguments = '--add-exports=java.desktop/sun.awt=ALL-UNNAMED -jar "{0}"' -f $LauncherJar
    }
}

function New-ParallelReaderShortcut {
    param([Parameter(Mandatory = $true)][string]$ServerRoot)

    $Launcher = Get-ParallelReaderGraphicalLauncher -ServerRoot $ServerRoot
    $CreateShortcut = {
        param([string]$ShortcutPath, [string]$Description)

        if (Test-Path -LiteralPath $ShortcutPath -PathType Leaf) {
            Remove-Item -LiteralPath $ShortcutPath -Force
        }
        [void](New-Item -ItemType Directory -Path (Split-Path -Parent $ShortcutPath) -Force)
        $Shell = New-Object -ComObject WScript.Shell
        $Shortcut = $Shell.CreateShortcut($ShortcutPath)
        $Shortcut.TargetPath = $Launcher.Java
        $Shortcut.Arguments = $Launcher.Arguments
        $Shortcut.WorkingDirectory = $ServerRoot
        $Shortcut.Description = $Description
        $Shortcut.Save()
    }

    $Programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    & $CreateShortcut (Join-Path $Programs 'Suwayomi Parallel Reader.lnk') 'Suwayomi con Parallel Reader integrado'
    & $CreateShortcut (Join-Path $Programs 'Suwayomi Launcher.lnk') 'Suwayomi con Parallel Reader integrado'

    $Desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
    if (-not [string]::IsNullOrWhiteSpace($Desktop)) {
        & $CreateShortcut (Join-Path $Desktop 'Suwayomi Launcher.lnk') 'Suwayomi con Parallel Reader integrado'
    }
}

try {
    $MsiPath = Join-Path $PSScriptRoot $MsiName
    $WebUiSource = Join-Path $PSScriptRoot 'webUI'
    if (-not (Test-Path -LiteralPath (Join-Path $WebUiSource 'index.html') -PathType Leaf)) {
        # In the source checkout, the built WebUI lives beside installer/.
        $DevelopmentWebUi = Join-Path (Split-Path -Parent $PSScriptRoot) 'build'
        if (Test-Path -LiteralPath (Join-Path $DevelopmentWebUi 'index.html') -PathType Leaf) {
            $WebUiSource = $DevelopmentWebUi
        }
    }

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
    Update-ParallelReaderGraphicalLauncher -ServerRoot $InstallRoot
    Set-ParallelReaderLauncherDataRoot -Root $DataRoot
    $LegacyLauncherPath = Join-Path $DataRoot 'Start-Suwayomi-ParallelReader.ps1'
    if (Test-Path -LiteralPath $LegacyLauncherPath -PathType Leaf) {
        Remove-Item -LiteralPath $LegacyLauncherPath -Force
    }

    if (-not $TestMode) {
        New-ParallelReaderShortcut -ServerRoot $InstallRoot
    }

    if (-not $NoLaunch) {
        $Launcher = Get-ParallelReaderGraphicalLauncher -ServerRoot $InstallRoot
        Start-Process -FilePath $Launcher.Java -ArgumentList $Launcher.Arguments -WorkingDirectory $InstallRoot
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
