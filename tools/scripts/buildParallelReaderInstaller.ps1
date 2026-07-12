# Copyright (C) Contributors to the Suwayomi project
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

[CmdletBinding()]
param(
    [Parameter()]
    [ValidatePattern('^[0-9A-Za-z][0-9A-Za-z._-]*$')]
    [string]$Version = '1.0.0',

    [Parameter()]
    [ValidatePattern('^[0-9A-Za-z][0-9A-Za-z._-]*$')]
    [string]$ServerVersion = '2.3.2238',

    [Parameter()]
    [string]$OutputDir,

    [Parameter()]
    [string]$ServerMsiPath,

    [Parameter()]
    [switch]$SkipWebUIBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PinnedServerMsiSha256 = @{
    '2.3.2238' = 'f638b9657d34d1f481e35ed26ec29073fe967abd5b977fe75ab24731e39aa52c'
}

$LzmaSdkVersion = '26.02'
$LzmaSdkFileName = 'lzma2602.7z'
$LzmaSdkSha256 = '2878c85f5f43a4a4e0952b1fd4e5fe097c1c143997a8047c7e1e788892aa9357'

function Write-Utf8WithoutBom {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$Content
    )

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Get-FullPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$BasePath
    )

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $Path))
}

function Find-SevenZip {
    $executableCandidates = New-Object System.Collections.Generic.List[string]
    $command = Get-Command '7z.exe' -ErrorAction SilentlyContinue

    if ($null -ne $command) {
        $commandPath = $command.Path
        if ([string]::IsNullOrWhiteSpace($commandPath)) {
            $commandPath = $command.Source
        }

        if (-not [string]::IsNullOrWhiteSpace($commandPath)) {
            $executableCandidates.Add($commandPath)
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
        $executableCandidates.Add((Join-Path $env:ProgramFiles '7-Zip\7z.exe'))
    }

    if (-not [string]::IsNullOrWhiteSpace(${env:ProgramFiles(x86)})) {
        $executableCandidates.Add((Join-Path ${env:ProgramFiles(x86)} '7-Zip\7z.exe'))
    }

    $scoopRoot = $env:SCOOP
    if ([string]::IsNullOrWhiteSpace($scoopRoot) -and -not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
        $scoopRoot = Join-Path $env:USERPROFILE 'scoop'
    }

    if (-not [string]::IsNullOrWhiteSpace($scoopRoot)) {
        $executableCandidates.Add((Join-Path $scoopRoot 'apps\7zip\current\7z.exe'))
    }

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $executableCandidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\7-Zip\7z.exe'))
    }

    foreach ($executablePath in ($executableCandidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
            continue
        }

        return [System.IO.Path]::GetFullPath($executablePath)
    }

    throw '7-Zip is required, but 7z.exe was not found. Install the 64-bit version of 7-Zip or add its installation directory to PATH.'
}

function Copy-FileIntoStream {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourcePath,

        [Parameter(Mandatory = $true)]
        [System.IO.Stream]$DestinationStream
    )

    $sourceStream = [System.IO.File]::Open(
        $SourcePath,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::Read
    )

    try {
        $sourceStream.CopyTo($DestinationStream)
    }
    finally {
        $sourceStream.Dispose()
    }
}

function New-WebUiDependencyLicenseReport {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepositoryRoot,

        [Parameter(Mandatory = $true)]
        [string]$OutputPath
    )

    $corepack = Get-Command 'corepack' -ErrorAction SilentlyContinue
    if ($null -eq $corepack) {
        throw 'Corepack is required to generate the production dependency license report.'
    }

    Push-Location $RepositoryRoot
    try {
        $licenseJson = (& $corepack.Path pnpm licenses list --prod --json | Out-String)
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($licenseJson)) {
            throw 'pnpm was unable to enumerate production dependency licenses.'
        }
    }
    finally {
        Pop-Location
    }

    $licenseGroups = $licenseJson | ConvertFrom-Json
    $report = New-Object System.Text.StringBuilder
    [void]$report.AppendLine('SUWAYOMI PARALLEL READER - WEBUI DEPENDENCY LICENSES')
    [void]$report.AppendLine('=====================================================')
    [void]$report.AppendLine()
    [void]$report.AppendLine('Generated from the production dependency graph by pnpm licenses list --prod.')
    [void]$report.AppendLine('Package license files are reproduced below when supplied by the package.')

    foreach ($licenseGroup in ($licenseGroups.PSObject.Properties | Sort-Object Name)) {
        foreach ($package in @($licenseGroup.Value | Sort-Object Name)) {
            [void]$report.AppendLine()
            [void]$report.AppendLine(('=' * 78))
            [void]$report.AppendLine("Package: $($package.name)")
            [void]$report.AppendLine("Version(s): $(@($package.versions) -join ', ')")
            [void]$report.AppendLine("Declared license: $($package.license)")
            if (-not [string]::IsNullOrWhiteSpace([string]$package.homepage)) {
                [void]$report.AppendLine("Homepage/source: $($package.homepage)")
            }

            $licenseFilesFound = $false
            foreach ($packagePath in @($package.paths | Select-Object -Unique)) {
                if (-not (Test-Path -LiteralPath $packagePath -PathType Container)) {
                    continue
                }

                $licenseFiles = @(Get-ChildItem -LiteralPath $packagePath -File | Where-Object {
                    $_.Name -match '^(?i:LICENSE|LICENCE|COPYING|NOTICE)(?:\..*)?$'
                } | Sort-Object Name)
                foreach ($licenseFile in $licenseFiles) {
                    $licenseFilesFound = $true
                    [void]$report.AppendLine()
                    [void]$report.AppendLine("--- $($licenseFile.Name) ---")
                    [void]$report.AppendLine([IO.File]::ReadAllText($licenseFile.FullName).TrimEnd())
                }
            }

            if (-not $licenseFilesFound) {
                [void]$report.AppendLine()
                [void]$report.AppendLine('No standalone license file was included at the package root; consult the source/homepage above.')
            }
        }
    }

    Write-Utf8WithoutBom -Path $OutputPath -Content ($report.ToString())
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$buildDir = Join-Path $repoRoot 'build'
$installerSourceDir = Join-Path $repoRoot 'installer'
$bootstrapSourcePath = Join-Path $installerSourceDir 'Install-ParallelReader.ps1'
$noticesSourcePath = Join-Path $installerSourceDir 'THIRD-PARTY-NOTICES.txt'
$licenseSourcePath = Join-Path $repoRoot 'LICENSE'

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $repoRoot 'release'
}
else {
    $OutputDir = Get-FullPath -Path $OutputDir -BasePath $repoRoot
}

if (-not [string]::IsNullOrWhiteSpace($ServerMsiPath)) {
    $ServerMsiPath = Get-FullPath -Path $ServerMsiPath -BasePath (Get-Location).Path
    if (-not (Test-Path -LiteralPath $ServerMsiPath -PathType Leaf)) {
        throw "The supplied server MSI does not exist: $ServerMsiPath"
    }

    if ([System.IO.Path]::GetExtension($ServerMsiPath) -ne '.msi') {
        throw "The supplied server package must be an .msi file: $ServerMsiPath"
    }
}

foreach ($requiredSource in @($bootstrapSourcePath, $noticesSourcePath, $licenseSourcePath)) {
    if (-not (Test-Path -LiteralPath $requiredSource -PathType Leaf)) {
        throw "Required installer source file was not found: $requiredSource"
    }
}

if (-not $PinnedServerMsiSha256.ContainsKey($ServerVersion)) {
    throw "There is no pinned Suwayomi-Server MSI checksum for version $ServerVersion. Add a reviewed checksum to `$PinnedServerMsiSha256 before building that version."
}

$sevenZip = Find-SevenZip
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("suwayomi-parallel-reader-{0}" -f [Guid]::NewGuid().ToString('N'))
$payloadDir = Join-Path $stagingRoot 'payload'
$payloadWebUiDir = Join-Path $payloadDir 'webUI'
$archivePath = Join-Path $stagingRoot 'payload.7z'
$configPath = Join-Path $stagingRoot 'sfx-config.txt'
$lzmaSdkArchivePath = Join-Path $stagingRoot $LzmaSdkFileName
$sfxModulePath = Join-Path $stagingRoot 'bin\7zSD.sfx'
$temporaryInstallerPath = Join-Path $stagingRoot 'installer.tmp'
$serverMsiFileName = "Suwayomi-Server-v$ServerVersion-windows-x64.msi"
$payloadMsiPath = Join-Path $payloadDir $serverMsiFileName
$installerFileName = "Suwayomi-Parallel-Reader-Setup-v$Version.exe"
$installerOutputPath = Join-Path $OutputDir $installerFileName
$checksumsOutputPath = Join-Path $OutputDir 'SHA256SUMS.txt'

try {
    New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $payloadWebUiDir -Force | Out-Null
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    if (-not $SkipWebUIBuild) {
        $corepack = Get-Command 'corepack' -ErrorAction SilentlyContinue
        if ($null -eq $corepack) {
            throw 'Corepack was not found. Install Node.js with Corepack, or pass -SkipWebUIBuild when a current build directory already exists.'
        }

        Write-Host 'Building the Parallel Reader WebUI...'
        Push-Location $repoRoot
        try {
            & $corepack.Path pnpm build
            if ($LASTEXITCODE -ne 0) {
                throw "The WebUI build failed with exit code $LASTEXITCODE."
            }
        }
        finally {
            Pop-Location
        }
    }

    Write-Host "Downloading the official 7-Zip installer SFX module v$LzmaSdkVersion..."
    $lzmaSdkUrl = "https://github.com/ip7z/7zip/releases/download/$LzmaSdkVersion/$LzmaSdkFileName"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $lzmaSdkUrl -OutFile $lzmaSdkArchivePath -UseBasicParsing
    $actualLzmaSdkSha256 = (Get-FileHash -LiteralPath $lzmaSdkArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualLzmaSdkSha256 -ne $LzmaSdkSha256) {
        throw "7-Zip LZMA SDK SHA-256 mismatch. Expected $LzmaSdkSha256 but received $actualLzmaSdkSha256."
    }

    & $sevenZip 'x' $lzmaSdkArchivePath 'bin\7zSD.sfx' "-o$stagingRoot" '-y'
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $sfxModulePath -PathType Leaf)) {
        throw 'Unable to extract the reviewed 7-Zip installer SFX module.'
    }

    if (-not (Test-Path -LiteralPath $buildDir -PathType Container)) {
        throw "The WebUI build directory was not found: $buildDir"
    }

    $buildItems = @(Get-ChildItem -LiteralPath $buildDir -Force)
    if ($buildItems.Count -eq 0) {
        throw "The WebUI build directory is empty: $buildDir"
    }

    Write-Host 'Staging the WebUI and installer files...'
    foreach ($item in $buildItems) {
        Copy-Item -LiteralPath $item.FullName -Destination $payloadWebUiDir -Recurse -Force
    }

    Write-Utf8WithoutBom -Path (Join-Path $payloadWebUiDir 'revision') -Content "parallel-reader-v$Version`n"
    Copy-Item -LiteralPath $bootstrapSourcePath -Destination (Join-Path $payloadDir 'Install-ParallelReader.ps1') -Force
    $bootstrapLauncher = @(
        '@echo off'
        'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-ParallelReader.ps1"'
        'exit /b %ERRORLEVEL%'
        ''
    ) -join "`r`n"
    Write-Utf8WithoutBom -Path (Join-Path $payloadDir 'Install-ParallelReader.cmd') -Content $bootstrapLauncher
    Copy-Item -LiteralPath $noticesSourcePath -Destination (Join-Path $payloadDir 'THIRD-PARTY-NOTICES.txt') -Force
    Copy-Item -LiteralPath $licenseSourcePath -Destination (Join-Path $payloadDir 'LICENSE') -Force
    Write-Host 'Generating the production dependency license report...'
    New-WebUiDependencyLicenseReport `
        -RepositoryRoot $repoRoot `
        -OutputPath (Join-Path $payloadDir 'WEBUI-DEPENDENCY-LICENSES.txt')

    if ([string]::IsNullOrWhiteSpace($ServerMsiPath)) {
        $downloadUrl = "https://github.com/Suwayomi/Suwayomi-Server/releases/download/v$ServerVersion/$serverMsiFileName"
        Write-Host "Downloading the official Suwayomi-Server MSI v$ServerVersion..."
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $downloadUrl -OutFile $payloadMsiPath -UseBasicParsing
    }
    else {
        Write-Host "Using the supplied Suwayomi-Server MSI: $ServerMsiPath"
        Copy-Item -LiteralPath $ServerMsiPath -Destination $payloadMsiPath -Force
    }

    $expectedMsiSha256 = $PinnedServerMsiSha256[$ServerVersion]
    $actualMsiSha256 = (Get-FileHash -LiteralPath $payloadMsiPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualMsiSha256 -ne $expectedMsiSha256) {
        throw "Suwayomi-Server MSI SHA-256 mismatch. Expected $expectedMsiSha256 but received $actualMsiSha256."
    }

    Write-Host 'Compressing the installer payload...'
    Push-Location $payloadDir
    try {
        & $sevenZip 'a' '-t7z' $archivePath '.\*' '-mx=1' '-m0=lzma2' '-ms=on'
        if ($LASTEXITCODE -ne 0) {
            throw "7-Zip failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    $sfxConfiguration = @(
        ';!@Install@!UTF-8!'
        "Title=`"Suwayomi Parallel Reader v$Version`""
        'BeginPrompt="This will install Suwayomi Parallel Reader and its bundled Suwayomi-Server. Continue?"'
        'ExecuteFile="Install-ParallelReader.cmd"'
        ';!@InstallEnd@!'
        ''
    ) -join "`r`n"
    [System.IO.File]::WriteAllText($configPath, $sfxConfiguration, (New-Object System.Text.UTF8Encoding($true)))

    Write-Host "Creating $installerFileName..."
    $installerStream = [System.IO.File]::Open(
        $temporaryInstallerPath,
        [System.IO.FileMode]::Create,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None
    )

    try {
        Copy-FileIntoStream -SourcePath $sfxModulePath -DestinationStream $installerStream
        Copy-FileIntoStream -SourcePath $configPath -DestinationStream $installerStream
        Copy-FileIntoStream -SourcePath $archivePath -DestinationStream $installerStream
        $installerStream.Flush()
    }
    finally {
        $installerStream.Dispose()
    }

    if (Test-Path -LiteralPath $installerOutputPath) {
        Remove-Item -LiteralPath $installerOutputPath -Force
    }
    Move-Item -LiteralPath $temporaryInstallerPath -Destination $installerOutputPath -Force

    $installerSha256 = (Get-FileHash -LiteralPath $installerOutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Utf8WithoutBom -Path $checksumsOutputPath -Content "$installerSha256  $installerFileName`n"

    Write-Host ''
    Write-Host 'Installer created successfully:'
    Write-Host "  $installerOutputPath"
    Write-Host "SHA-256: $installerSha256"
    Write-Host "Checksums: $checksumsOutputPath"
}
finally {
    if (Test-Path -LiteralPath $stagingRoot) {
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
