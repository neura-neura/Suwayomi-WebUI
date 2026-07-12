# Parallel Reader Windows installer

The Windows x64 release is a single executable named
`Suwayomi-Parallel-Reader-Setup-v<VERSION>.exe`. It is intended for people who
want the Parallel Reader fork without setting up Node.js, pnpm, or a separate
WebUI manually.

## What the installer contains

The executable is a self-extracting package containing:

- the official Suwayomi-Server Windows x64 MSI;
- the production build of this Parallel Reader WebUI fork;
- the PowerShell installation bootstrap;
- the MPL 2.0 license and third-party notices.

The official MSI includes the server launcher and its Java and Electron
runtimes, so the recipient does not install those separately. The bootstrap
installs the server in `C:\Program Files\Suwayomi-Server`, atomically replaces
`%LOCALAPPDATA%\Tachidesk\webUI` with this fork, updates only its managed block
in `server.conf`, and creates a per-user **Suwayomi Parallel Reader** Start Menu
shortcut. Administrator approval is required to install or update files under
`Program Files`.

This package is currently Windows x64 only. It does not install development
tools, and the recipient does not need the source checkout to use it.

## Install or update

1. Download both the `.exe` and `SHA256SUMS.txt` from the same GitHub Release.
2. In PowerShell, run:

    ```powershell
    Get-FileHash .\Suwayomi-Parallel-Reader-Setup-v1.0.0.exe -Algorithm SHA256
    Get-Content .\SHA256SUMS.txt
    ```

3. Confirm that the two hashes are identical, then run the executable and
   approve the administrator prompt.
4. Open **Suwayomi Parallel Reader** from the created shortcut.

The shortcut starts the official `Suwayomi Launcher.bat`; Suwayomi opens the
browser according to its normal server setting.

Installing a newer package updates Suwayomi-Server and replaces only the
WebUI and the installer-managed `server.conf` block. The library, other
settings, downloaded manga, extension data, and reading state under
`%LOCALAPPDATA%\Tachidesk` are not deleted or moved by the installer. A backup
of that directory is still recommended before any upgrade.

The MPL license, bundled-component notices, and the generated production npm
dependency license report remain available after installation under
`%LOCALAPPDATA%\Tachidesk\parallel-reader-notices`.

### Windows SmartScreen

The generated executable is not code-signed. Windows can therefore display an
**Unknown publisher** or Microsoft Defender SmartScreen warning even when the
file is unchanged. Verify the SHA-256 checksum against the file attached to the
same GitHub Release before selecting **More info** and **Run anyway**. Do not
disable SmartScreen globally. If the checksum differs, delete the file and do
not run it.

## Uninstall

Open Windows **Settings > Apps > Installed apps**, find **Suwayomi-Server**, and
select **Uninstall**. The wrapper does not register a second application or a
second uninstaller. Remove the **Suwayomi Parallel Reader** shortcut manually if
it remains after the server is removed.

Uninstallation intentionally preserves `%LOCALAPPDATA%\Tachidesk`. To remove
the library, downloads, settings, and other user data as well, first make any
desired backup, close Suwayomi completely, and then delete that directory
manually. Reinstalling while it remains will reuse the existing data.

## Build locally

Prerequisites:

- Windows x64 and Windows PowerShell 5.1;
- Node.js 24 with Corepack/pnpm;
- 7-Zip with `7z.exe` available (the builder downloads and verifies the official installer SFX module);
- network access to download the official server MSI, unless an already
  downloaded MSI is supplied.

From the repository root:

```powershell
corepack enable
corepack install --global pnpm@11.1.2
.\tools\scripts\buildParallelReaderInstaller.ps1 -Version 1.0.0 -ServerVersion 2.3.2238
```

The default `release` output directory contains the setup executable and
`SHA256SUMS.txt`. Use `-OutputDir <path>` to choose another destination, or
`-ServerMsiPath <path-to-msi>` for an offline/local server input. The builder
checks the pinned SHA-256 digest for the default server release before packaging
it. `-SkipWebUIBuild` is available only when a verified production `build`
directory already exists.

## Create a GitHub Release

The **Build Parallel Reader installer** workflow is deliberately artifact-only:
it has read-only repository permissions and cannot create a tag or publish a
release. This keeps an untested executable from becoming a public download.

1. Push the exact commit to distribute and run all project checks.
2. Open **Actions > Build Parallel Reader installer > Run workflow**.
3. Select the branch or tag, enter an installer version without a leading `v`,
   and confirm the official server version.
4. Download the workflow artifact. It contains the `.exe`, `SHA256SUMS.txt`, and
   `BUILD-PROVENANCE.txt` with the source commit and build inputs.
5. Verify the checksum and smoke-test install, launch, Parallel Reader, update,
   and uninstall on Windows x64.
6. Create a draft GitHub Release from the tested source commit. Use a tag such
   as `parallel-reader-v1.0.0`, describe the bundled server version, and attach
   the `.exe`, `SHA256SUMS.txt`, and `BUILD-PROVENANCE.txt` individually.
7. Publish the draft only after reviewing the attached files and release notes.

GitHub artifact archives are temporary; the individually attached Release files
are the durable distribution downloads.

## Source and licenses

- [Parallel Reader fork source](https://github.com/neura-neura/Suwayomi-WebUI)
- [Upstream Suwayomi-WebUI source](https://github.com/Suwayomi/Suwayomi-WebUI)
- [Suwayomi-Server source and releases](https://github.com/Suwayomi/Suwayomi-Server)
- [Mozilla Public License 2.0](../LICENSE)

The installer is a distribution convenience, not a change of license. Modified
MPL-covered source remains available in this repository. The packaged
`THIRD-PARTY-NOTICES.txt` identifies bundled upstream components and their
source locations.
