param([string]$InstallRoot, [string]$CommandPath, [int]$ParentPid)
$ErrorActionPreference = 'Stop'
Wait-Process -Id $ParentPid -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
$bin = Split-Path $CommandPath
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$remaining = @($userPath -split ';' | Where-Object { $_ -and $_ -ine $bin }) -join ';'
[Environment]::SetEnvironmentVariable('Path', $remaining, 'User')
Remove-Item -LiteralPath $InstallRoot -Recurse -Force
