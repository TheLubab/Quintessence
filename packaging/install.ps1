# Served at https://quint.run/install.ps1. Compatible with Windows PowerShell 5.1+.
& {
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $repo = if ($env:QUINT_RELEASE_REPO) { $env:QUINT_RELEASE_REPO } else { '@QUINT_RELEASE_REPO@' }
    if ($repo.Contains('@')) { throw 'The installer has not been configured with a release repository' }
    $root = if ($env:QUINT_INSTALL_ROOT) { $env:QUINT_INSTALL_ROOT } else { Join-Path $env:LOCALAPPDATA 'Quint\install' }
    $root = [IO.Path]::GetFullPath($root)
    if ($root -eq [IO.Path]::GetPathRoot($root) -or $root -eq $env:USERPROFILE) { throw 'Choose a dedicated Quint installation directory' }
    if ($root -match '[%\r\n]') { throw 'The installation directory cannot contain percent signs or newlines' }
    $bin = Join-Path $root 'bin'
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    if ($arch -notin @('x64', 'arm64')) { throw "Unsupported Windows architecture: $arch" }
    if ([Environment]::OSVersion.Version.Build -lt 17763) { throw 'Quint requires Windows 10 version 1809 or newer' }
    New-Item -ItemType Directory -Force -Path $root, $bin, (Join-Path $root 'releases') | Out-Null
    $lock = $null
    $tmp = Join-Path $root ('.download-' + [Guid]::NewGuid().ToString('N'))
    try {
        $lock = [IO.File]::Open((Join-Path $root 'install.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
        New-Item -ItemType Directory -Path $tmp | Out-Null
        $version = $env:QUINT_VERSION
        if (-not $version) { $version = (Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest").tag_name }
        if ($version -notmatch '^v\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$') { throw 'Could not resolve a valid release version' }
        $asset = "quint-windows-$arch.zip"
        $base = "https://github.com/$repo/releases/download/$version"
        Write-Host "Downloading Quint $version..."
        Invoke-WebRequest -UseBasicParsing "$base/$asset" -OutFile (Join-Path $tmp $asset)
        Invoke-WebRequest -UseBasicParsing "$base/checksums.txt" -OutFile (Join-Path $tmp 'checksums.txt')
        $checksums = Get-Content -LiteralPath (Join-Path $tmp 'checksums.txt') -Raw
        $matching = @($checksums -split "`n" | Where-Object { $_.Trim() -match ('^[a-f0-9]{64}\s+' + [Regex]::Escape($asset) + '$') })
        if ($matching.Count -ne 1) { throw 'The release checksum is missing' }
        $expected = ($matching[0] -split '\s+')[0]
        if ((Get-FileHash (Join-Path $tmp $asset) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
            throw 'The download checksum did not match; run the installer again'
        }
        $stage = Join-Path $tmp 'release'
        Expand-Archive -LiteralPath (Join-Path $tmp $asset) -DestinationPath $stage
        & (Join-Path $stage 'runtime\bun.exe') --version
        if ($LASTEXITCODE -ne 0) { throw 'The bundled runtime could not start on this computer' }
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
        & (Join-Path $stage 'runtime\bun.exe') (Join-Path $stage 'app\distribution\launcher.mjs') version
        if ($LASTEXITCODE -ne 0) { throw 'Quint could not start' }
        $id = "$version-$([Guid]::NewGuid().ToString('N'))"
        Move-Item -LiteralPath $stage -Destination (Join-Path $root "releases\$id")
        Copy-Item (Join-Path $root "releases\$id\app\distribution\install.ps1") (Join-Path $root 'install.ps1') -Force
        # cmd shims do not need PowerShell execution-policy changes or symlink privileges.
        $shim = @"
@echo off
chcp 65001 >nul
set "QUINT_INSTALL_ROOT=$root"
set /p QUINT_RELEASE=<"$root\current"
"$root\releases\%QUINT_RELEASE%\runtime\bun.exe" "$root\releases\%QUINT_RELEASE%\app\distribution\launcher.mjs" %*
"@
        [IO.File]::WriteAllText((Join-Path $bin 'quint.cmd'), $shim, (New-Object Text.UTF8Encoding $false))
        $pointer = Join-Path $root 'current'
        if (Test-Path $pointer) { Copy-Item $pointer (Join-Path $root 'previous') -Force }
        [IO.File]::WriteAllText((Join-Path $root 'current.new'), "$id`n")
        if (Test-Path $pointer) { [IO.File]::Replace((Join-Path $root 'current.new'), $pointer, $null) }
        else { [IO.File]::Move((Join-Path $root 'current.new'), $pointer) }
        [IO.File]::WriteAllText((Join-Path $root 'repository'), "$repo`n")
        [IO.File]::WriteAllText((Join-Path $root 'command'), (Join-Path $bin 'quint.cmd'))
        $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        if ($bin -notin ($userPath -split ';')) {
            [Environment]::SetEnvironmentVariable('Path', "$bin;$userPath", 'User')
        }
        $env:Path = "$bin;$env:Path"
        & (Join-Path $bin 'quint.cmd') shortcuts
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the Quint shortcut' }
        Write-Host 'Quint is installed. Open Quint from the Start menu'
    } finally {
        if ($lock) { $lock.Dispose() }
        if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
    }
    if ($env:QUINT_NO_OPEN -ne '1') { & (Join-Path $bin 'quint.cmd') open }
}
