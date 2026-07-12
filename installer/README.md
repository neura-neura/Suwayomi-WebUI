# Parallel Reader installer bootstrap

`Install-ParallelReader.ps1` is the Windows PowerShell 5.1-compatible bootstrap used by the distributable installer. The release payload must place these files together:

```text
Install-ParallelReader.ps1
Install-ParallelReader.cmd
Suwayomi-Server-v2.3.2238-windows-x64.msi
THIRD-PARTY-NOTICES.txt
WEBUI-DEPENDENCY-LICENSES.txt
LICENSE
webUI/
```

The bootstrap verifies the official MSI's pinned SHA-256 before running it with `/passive /norestart`. It replaces only `%LOCALAPPDATA%\Tachidesk\webUI` using a staged directory and rollback, writes an idempotent managed block with `webUIFlavor = "Custom"` to `server.conf`, and preserves the rest of the user's Tachidesk data. It then creates the per-user Start Menu shortcut **Suwayomi Parallel Reader** and starts the official launcher.

The installer targets 64-bit Windows. The official MSI provides Suwayomi-Server, its Java runtime, Electron, and the launcher under `C:\Program Files\Suwayomi-Server`.

## Non-destructive local test

Use temporary data and install roots, skip the MSI, and suppress launching/UI:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-ParallelReader.ps1 `
  -SkipMsi `
  -DataRoot "$env:TEMP\parallel-reader-test\data" `
  -InstallRoot "$env:TEMP\parallel-reader-test\program" `
  -NoLaunch
```

That exact combination is treated as test mode, so it does not stop processes, run MSI, create a Start Menu shortcut, launch Suwayomi, or show a success dialog. It only exercises the WebUI deployment and configuration inside the supplied temporary data root.

`-SkipMsi` by itself is intended for an existing official installation. `-NoLaunch` suppresses the final launch and success dialog but still performs normal installation work unless both custom roots are supplied as above.

The bootstrap is not an uninstaller. Suwayomi-Server can be removed from Windows **Installed apps**; Tachidesk user data remains in `%LOCALAPPDATA%\Tachidesk` unless the user explicitly removes it.
