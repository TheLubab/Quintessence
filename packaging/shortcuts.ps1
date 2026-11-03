param([switch]$Startup, [switch]$Remove)
$ErrorActionPreference = 'Stop'
$folder = if ($Startup) { [Environment]::GetFolderPath('Startup') } else { [Environment]::GetFolderPath('Programs') }
$path = Join-Path $folder 'Quint.lnk'
if ($Remove) {
    Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    exit 0
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($path)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\cmd.exe'
$shortcut.Arguments = '/c ""' + $env:QUINT_COMMAND + '" open"'
$shortcut.WorkingDirectory = $env:USERPROFILE
$shortcut.WindowStyle = 7
$shortcut.Description = 'Quint local AI workspace'
$shortcut.Save()
