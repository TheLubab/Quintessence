# Quint installer for Windows PowerShell 5.1 and newer
#
# This script downloads the Quint release for your computer, verifies its
# SHA-256 checksum, and installs it under %LOCALAPPDATA%\Quint\install by default.
# It installs Muse Code from Meta if needed, adds the quint command to your user
# PATH, creates a Start menu shortcut, and opens Quint.
#
# Review the source: https://github.com/TheLubab/Quintessence/blob/main/packaging/install.ps1
& {
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    if ($PSVersionTable.PSVersion -lt [Version]'5.1') {
        throw 'Quint requires PowerShell 5.1 or newer'
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    # Resolve the release source and installation paths.
    $repo = if ($env:QUINT_RELEASE_REPO) { $env:QUINT_RELEASE_REPO } else { '@QUINT_RELEASE_REPO@' }
    $delivery = if ($env:QUINT_RELEASE_BASE) {
        $env:QUINT_RELEASE_BASE.TrimEnd('/')
    } else {
        'https://dl.quint.run'
    }
    if ($env:QUINT_RELEASE_REPO -and -not $env:QUINT_RELEASE_BASE) {
        $delivery = 'github'
    }
    $root = if ($env:QUINT_INSTALL_ROOT) {
        $env:QUINT_INSTALL_ROOT
    } else {
        Join-Path $env:LOCALAPPDATA 'Quint\install'
    }
    $root = [IO.Path]::GetFullPath($root)
    if ($root -eq [IO.Path]::GetPathRoot($root) -or $root -eq $env:USERPROFILE) {
        throw 'Choose a dedicated Quint installation directory'
    }
    if ($root -match '[%\r\n]') {
        throw 'The installation directory cannot contain percent signs or newlines'
    }
    $bin = Join-Path $root 'bin'

    # Select the native archive, including when PowerShell runs under WOW64.
    function Get-QuintArchitecture {
        try {
            return [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
        } catch {
            # Some Windows PowerShell 5.1 installations cannot resolve RuntimeInformation.
            # WOW64 exposes the native architecture separately from the shell architecture.
            $nativeArchitecture = if ($env:PROCESSOR_ARCHITEW6432) {
                $env:PROCESSOR_ARCHITEW6432
            } else {
                $env:PROCESSOR_ARCHITECTURE
            }
            switch ($nativeArchitecture) {
                'AMD64' { return 'x64' }
                'x64' { return 'x64' }
                'ARM64' { return 'arm64' }
                default { throw "Unsupported Windows architecture: $nativeArchitecture" }
            }
        }
    }
    $arch = Get-QuintArchitecture
    if ($arch -notin @('x64', 'arm64')) {
        throw "Unsupported Windows architecture: $arch"
    }
    if ([Environment]::OSVersion.Version.Build -lt 17763) {
        throw 'Quint requires Windows 10 version 1809 or newer'
    }

    # Serialize installs and clean up the temporary download on exit.
    New-Item -ItemType Directory -Force -Path $root, $bin, (Join-Path $root 'releases') | Out-Null
    $lock = $null
    $tmp = Join-Path $root ('.download-' + [Guid]::NewGuid().ToString('N'))
    try {
        $lock = [IO.File]::Open((Join-Path $root 'install.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
        New-Item -ItemType Directory -Path $tmp | Out-Null
        # Download the selected release and verify it before extraction.
        $version = $env:QUINT_VERSION
        if (-not $version) {
            $latest = if ($delivery -eq 'github') {
                "https://api.github.com/repos/$repo/releases/latest"
            } else {
                "$delivery/channels/stable.json"
            }
            $version = (Invoke-RestMethod $latest).tag_name
        }
        if ($version -notmatch '^v\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$') {
            throw 'Could not resolve a valid release version'
        }
        $asset = "quint-windows-$arch.zip"
        $base = if ($delivery -eq 'github') {
            "https://github.com/$repo/releases/download/$version"
        } else {
            "$delivery/$version"
        }
        Write-Host "Downloading Quint $version..."
        Invoke-WebRequest -UseBasicParsing "$base/$asset" -OutFile (Join-Path $tmp $asset)
        Invoke-WebRequest -UseBasicParsing "$base/checksums.txt" -OutFile (Join-Path $tmp 'checksums.txt')
        $checksums = Get-Content -LiteralPath (Join-Path $tmp 'checksums.txt') -Raw
        $matching = @($checksums -split "`n" | Where-Object {
            $_.Trim() -match ('^[a-f0-9]{64}\s+' + [Regex]::Escape($asset) + '$')
        })
        if ($matching.Count -ne 1) { throw 'The release checksum is missing' }
        $expected = ($matching[0] -split '\s+')[0]
        if ((Get-FileHash (Join-Path $tmp $asset) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
            throw 'The download checksum did not match; run the installer again'
        }
        $stage = Join-Path $tmp 'release'
        Expand-Archive -LiteralPath (Join-Path $tmp $asset) -DestinationPath $stage
        & (Join-Path $stage 'runtime\bun.exe') --version
        if ($LASTEXITCODE -ne 0) { throw 'The bundled runtime could not start on this computer' }
        # Install the official Muse Code launcher when it is not already present.
        $museDir = Join-Path $root 'muse'
        if (-not (Test-Path (Join-Path $museDir 'muse.cmd'))) {
            Write-Host 'Preparing Muse Code...'
            $oldMuseDir = $env:MUSE_INSTALL_DIR
            $oldMusePathPolicy = $env:MUSE_NO_MODIFY_PATH
            $env:MUSE_INSTALL_DIR = $museDir
            $env:MUSE_NO_MODIFY_PATH = '1'
            try {
                Invoke-WebRequest -UseBasicParsing 'https://dev.meta.ai/install.ps1' -OutFile (Join-Path $tmp 'muse-install.ps1')
                & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $tmp 'muse-install.ps1')
                if ($LASTEXITCODE -ne 0) { throw 'Muse Code installation failed' }
            } finally {
                $env:MUSE_INSTALL_DIR = $oldMuseDir
                $env:MUSE_NO_MODIFY_PATH = $oldMusePathPolicy
            }
        }
        & (Join-Path $museDir 'muse.cmd') --version
        if ($LASTEXITCODE -ne 0) { throw 'Muse Code could not start; run the installer again after completing its setup' }
        $env:QUINT_INSTALL_ROOT = $root
        & (Join-Path $stage 'runtime\bun.exe') (Join-Path $stage 'app\packaging\launcher.mjs') version
        if ($LASTEXITCODE -ne 0) { throw 'Quint could not start' }
        # Stage the release, create the command, and switch the active pointer.
        $id = "$version-$([Guid]::NewGuid().ToString('N'))"
        Move-Item -LiteralPath $stage -Destination (Join-Path $root "releases\$id")
        Copy-Item (Join-Path $root "releases\$id\app\packaging\install.ps1") (Join-Path $root 'install.ps1') -Force
        # cmd shims do not need PowerShell execution-policy changes or symlink privileges.
        $shim = @"
@echo off
chcp 65001 >nul
set "QUINT_INSTALL_ROOT=$root"
set /p QUINT_RELEASE=<"$root\current"
"$root\releases\%QUINT_RELEASE%\runtime\bun.exe" "$root\releases\%QUINT_RELEASE%\app\packaging\launcher.mjs" %*
"@
        $utf8 = [System.Text.UTF8Encoding]::new($false)
        [IO.File]::WriteAllText((Join-Path $bin 'quint.cmd'), $shim, $utf8)
        $pointer = Join-Path $root 'current'
        if (Test-Path $pointer) { Copy-Item $pointer (Join-Path $root 'previous') -Force }
        [IO.File]::WriteAllText((Join-Path $root 'current.new'), "$id`n")
        if (Test-Path $pointer) { [IO.File]::Replace((Join-Path $root 'current.new'), $pointer, $null) }
        else { [IO.File]::Move((Join-Path $root 'current.new'), $pointer) }
        [IO.File]::WriteAllText((Join-Path $root 'repository'), "$repo`n")
        [IO.File]::WriteAllText((Join-Path $root 'release-base'), "$delivery`n")
        [IO.File]::WriteAllText((Join-Path $root 'command'), (Join-Path $bin 'quint.cmd'))
        # Add the command to the user's PATH and create the Start menu shortcut.
        $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        if ($bin -notin ($userPath -split ';')) {
            [Environment]::SetEnvironmentVariable('Path', "$bin;$userPath", 'User')
        }
        $env:Path = "$bin;$env:Path"
        & (Join-Path $bin 'quint.cmd') shortcuts
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the Quint shortcut' }
        Write-Host "`nQuint is installed`n"
        Write-Host '  Start or open:  quint'
        Write-Host '  Stop:           quint quit'
        Write-Host '  Uninstall:      quint uninstall --yes'
        Write-Host "`nStop Quint before uninstalling"
        Write-Host 'Open a new terminal if the quint command is not found'
    } finally {
        if ($lock) { $lock.Dispose() }
        if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
    }
    if ($env:QUINT_NO_OPEN -ne '1') { & (Join-Path $bin 'quint.cmd') open }
}
