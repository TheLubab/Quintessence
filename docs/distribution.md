# Installation

Installers download a portable Quint release from GitHub. You do not need to
install Nix, Bun, Node, or build tools.

## Install and use

macOS or Linux, from Terminal:

```sh
curl -fsSL https://quint.run/install.sh | sh
```

Windows, from PowerShell:

```powershell
irm https://quint.run/install.ps1 | iex
```

`irm` and `iex` are aliases for `Invoke-RestMethod` and `Invoke-Expression`.
The installer targets Windows PowerShell 5.1 or newer, included in supported
Windows installations; PowerShell 7 is not required. Use PowerShell rather than
Command Prompt. Organization policies can restrict downloaded scripts; the
installer does not change machine execution policy or bypass organization policy.
Administrator access is not required.

The installer opens the browser. After installation, open **Quint** from
`~/Applications` on macOS, the application menu on Linux, or the Start menu on
Windows. A terminal does not need to stay open. The application runs locally and
opens its browser interface. `quint` or `quint open` does the same thing.

Sign in to Muse Code in Quint, or configure an API key. Accounts, subscriptions,
model access, and usage allowances belong to Meta. Installing Quint does not
provide model access. Image generation has a separate API-key requirement; see
[image generation](image-generation.md).

## Platform targets

| Target              | Release asset              |
| ------------------- | -------------------------- |
| Linux x86-64        | `quint-linux-x64.tar.gz`   |
| Linux ARM64         | `quint-linux-arm64.tar.gz` |
| macOS Intel         | `quint-macos-x64.tar.gz`   |
| macOS Apple Silicon | `quint-macos-arm64.tar.gz` |
| Windows x86-64      | `quint-windows-x64.zip`    |
| Windows ARM64       | `quint-windows-arm64.zip`  |

Linux targets glibc distributions, not Alpine/musl. The current Sharp dependency
requires glibc 2.28 or newer. Windows requires Windows 10 1809 or newer; Windows 11
is recommended. macOS support also depends on the pinned Bun and installed Muse
runtime's minimum OS requirements. Validate the actual minimum macOS version
before advertising one. NixOS users can continue using the development flake;
portable Linux archives do not provision NixOS dynamic linker compatibility.

These are packaging targets. Platform verification is described in the
[release checklist](releasing.md#verification-checklist).

## What is installed

Every archive contains a portable upstream Bun binary, Quint's prebuilt browser
UI, backend and shared sources, dependencies, workspace skills, distribution
scripts, and a `release.json` describing the version and target. The full Bun
runtime is necessary because Quint builds Quintlets and starts TypeScript
workers after installation. Dependencies retain their own license files.

Muse is obtained from Meta's official installer rather than redistributed in
the archive. Its launcher and downloaded native binary live in the private
installation's `muse` directory. On Windows Quint reads the official launcher's
`.muse-version` file and launches the corresponding native `.exe`, avoiding a
PowerShell or `.cmd` wrapper in the SDK transport.

Meta's launcher manages Muse updates independently of Quint. The release records
the Muse SDK version, but does **not** pin the installed Muse runtime. Confirm
compatibility with the current Muse release before publishing Quint. `quint doctor`
prints runtime paths and the Muse version. Authentication or access restrictions
in Meta's initial runtime download can interrupt setup; rerun the installer after
resolving those restrictions. Quint's old active release remains installed.

Default installation locations:

| Platform    | Application files              | Command                                      |
| ----------- | ------------------------------ | -------------------------------------------- |
| macOS/Linux | `~/.local/share/quint-install` | `~/.local/bin/quint`                         |
| Windows     | `%LOCALAPPDATA%\Quint\install` | `%LOCALAPPDATA%\Quint\install\bin\quint.cmd` |

Inside the installation:

```text
releases/<version-and-install-id>/
  runtime/bun[.exe]
  app/
  release.json
current                     Active release directory name
previous                    Previous release directory name
repository                  GitHub owner/repository
command                     Installed command path
muse/                       Official Muse launcher and runtime
logs/server.log             Launcher-started server output
install.sh or install.ps1    Installer used by updates
```

Installation files are separate from Quint's data directory, workspace folders,
and Muse credentials/history. See [configuration](config.md) for data ownership.
The installer adds the command directory to the user's PATH; new terminal
sessions see it automatically. Launchers use explicit paths immediately.

## Installation and recovery

Installation resolves a stable GitHub tag, downloads its platform archive and
SHA-256 checksum, verifies it, stages the release, prepares Muse, and checks CLI
startup. Only then does it switch the `current` pointer. A download or startup
failure before activation leaves the previous pointer unchanged. Installation is
serialized by a local lock. A stale Unix `install.lock` directory after a forced
termination must be removed before retrying; Windows releases its file lock when
the process exits.

The checksum detects corrupted or mismatched downloads. Both the checksum and
archive are fetched over HTTPS from the same GitHub release; this is not an
independent signature verification system.

Re-running the installer creates a fresh installation of the selected release
without deleting workspaces. A running old server continues until restarted.
Use the app's update action for an ordinary upgrade.

For an explicit version, including a preview:

```sh
curl -fsSL https://quint.run/install.sh | QUINT_VERSION=v0.12.1-next.3 sh
```

```powershell
$env:QUINT_VERSION = 'v0.12.1-next.3'
irm https://quint.run/install.ps1 | iex
Remove-Item Env:QUINT_VERSION
```

Installer overrides for development and support:

- `QUINT_RELEASE_REPO`: GitHub `owner/repository`; public scripts fill this in at release time.
- `QUINT_VERSION`: explicit `v`-prefixed tag; default is GitHub's latest stable release.
- `QUINT_INSTALL_ROOT`: alternate installation directory.
- `QUINT_BIN_DIR`: alternate Unix command directory; keep the same value on later installer runs.
- `QUINT_NO_OPEN=1`: install without opening the browser.

## Updates, rollback, and uninstall

The app's update action detects portable installs and obtains updates
from GitHub. It uses the saved installer, stages the new release,
and requests the existing graceful server restart. The supervising CLI resolves
the active pointer again and starts the new release with its private Bun runtime.
The API retains its existing active-agent guard.

`quint update --check` reports the latest stable release. With Quint stopped,
`quint update` installs it. For a running application, use the update action in
settings. Preview versions are not automatically updated by the app.

If an update fails to start, run:

```sh
quint quit
quint rollback
quint open
```

Rollback swaps the active and previous pointers. It does not migrate or restore
user data, and it does not roll back Muse. Old release directories are retained;
automatic pruning and automatic health-based rollback are not implemented.

To start at sign-in, run `quint service install`. macOS/Linux use the existing
launchd/systemd service. Windows creates a per-user Startup shortcut and starts
Quint immediately. Remove this with `quint service uninstall`. Windows does not
install a system service or require administrator permissions.

To uninstall, first remove sign-in startup if enabled, then:

```sh
quint quit
quint uninstall --yes
```

Application files and launchers are removed. Workspaces, Quint's data directory,
and Muse's credentials/history are preserved. Windows removal finishes in a
separate process after the running Bun executable exits. A harmless Unix PATH
entry may remain in the shell profile.

For maintainers, see [building and publishing releases](releasing.md).
