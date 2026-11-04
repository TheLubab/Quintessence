#!/bin/sh
# Quint installer for macOS and Linux
#
# This script downloads the Quint release for your computer, verifies its
# SHA-256 checksum, and installs it under ~/.local/share/quint-install by default.
# It installs Muse Code from Meta if needed, adds the quint command to your PATH
# when possible, creates an application shortcut, and opens Quint.
#
# Review the source: https://github.com/TheLubab/Quintessence/blob/main/packaging/install.sh
#
# CI fills in the backup GitHub repository.
set -eu

die() {
  printf 'Quint: %s\n' "$*" >&2
  exit 1
}

# Resolve the release source and installation paths.
repo=${QUINT_RELEASE_REPO:-@QUINT_RELEASE_REPO@}
delivery=${QUINT_RELEASE_BASE:-https://dl.quint.run}
if [ -n "${QUINT_RELEASE_REPO:-}" ] && [ -z "${QUINT_RELEASE_BASE:-}" ]; then
  delivery=github
fi
root=${QUINT_INSTALL_ROOT:-"$HOME/.local/share/quint-install"}
bin=${QUINT_BIN_DIR:-"$HOME/.local/bin"}
case "$root" in
/ | "$HOME" | '') die 'Choose a dedicated Quint installation directory' ;;
/*) ;;
*) die 'The installation directory must be an absolute path' ;;
esac
case "$root$bin" in
*"'"* | *'
'*) die 'Installation paths cannot contain quotes or newlines' ;;
esac
for tool in curl tar awk; do
  command -v "$tool" >/dev/null || die "Install $tool and try again"
done

# Choose the archive for this system.
case "$(uname -s)" in
Darwin) os=macos ;;
Linux) os=linux ;;
*) die 'Use install.ps1 from PowerShell on Windows' ;;
esac
case "$(uname -m)" in
arm64 | aarch64) arch=arm64 ;;
x86_64 | amd64) arch=x64 ;;
*) die 'This CPU is not supported' ;;
esac
if [ "$os" = linux ]; then
  libc=$(getconf GNU_LIBC_VERSION 2>/dev/null) ||
    die 'This release requires glibc 2.28 or newer (Alpine/musl is not supported)'
  printf '%s\n' "$libc" | awk '{split($2,v,"."); exit !(v[1]>2 || (v[1]==2 && v[2]>=28))}' ||
    die 'This release requires glibc 2.28 or newer'
fi

# Prevent simultaneous installs and clean up the temporary download on exit.
mkdir -p "$root/releases" "$bin"
mkdir "$root/install.lock" 2>/dev/null ||
  die 'Another installation is running; if it was interrupted, remove install.lock and retry'
tmp=$(mktemp -d "$root/.download.XXXXXX")
trap 'rm -rf "$tmp"; rmdir "$root/install.lock"' EXIT
trap 'exit 1' HUP INT TERM

# Download the selected release and verify its checksum before extracting it.
version=${QUINT_VERSION:-}
if [ -z "$version" ]; then
  latest="$delivery/channels/stable.json"
  [ "$delivery" != github ] || latest="https://api.github.com/repos/$repo/releases/latest"
  version=$(curl -fsSL "$latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)
fi
printf '%s' "$version" | awk '/^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$/ {ok=1} END {exit !ok}' ||
  die 'Could not resolve a valid release version'
asset="quint-$os-$arch.tar.gz"
base="$delivery/$version"
[ "$delivery" != github ] || base="https://github.com/$repo/releases/download/$version"
printf 'Downloading Quint %s…\n' "$version"
curl -fL --retry 3 "$base/$asset" -o "$tmp/$asset"
curl -fsSL --retry 3 "$base/checksums.txt" -o "$tmp/checksums.txt"
expected=$(awk -v asset="$asset" '$2 == asset {print $1}' "$tmp/checksums.txt")
[ ${#expected} -eq 64 ] || die 'The release checksum is missing'
if command -v sha256sum >/dev/null; then
  actual=$(sha256sum "$tmp/$asset" | awk '{print $1}')
else
  actual=$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')
fi
[ "$actual" = "$expected" ] || die 'The download checksum did not match; run the installer again'
mkdir "$tmp/release"
tar -xzf "$tmp/$asset" -C "$tmp/release"
"$tmp/release/runtime/bun" --version >/dev/null

# Install the official Muse Code launcher when it is not already present.
printf 'Preparing Muse Code…\n'
if [ ! -x "$root/muse/muse" ]; then
  command -v bash >/dev/null || die 'Bash is required to install Muse Code'
  curl -fsSL --retry 3 https://dev.meta.ai/install.sh -o "$tmp/muse-install.sh"
  MUSE_INSTALL_DIR="$root/muse" MUSE_NO_MODIFY_PATH=1 bash "$tmp/muse-install.sh"
fi
# This also downloads the native runtime when Meta's launcher requires it.
"$root/muse/muse" --version
export QUINT_INSTALL_ROOT="$root"
"$tmp/release/runtime/bun" "$tmp/release/app/packaging/launcher.mjs" version >/dev/null

# Stage the release, create the command, and switch the active pointer.
id="$version-$(date +%s)-$$"
mv "$tmp/release" "$root/releases/$id"
cp "$root/releases/$id/app/packaging/install.sh" "$root/install.sh"
cat >"$bin/quint" <<EOF
#!/bin/sh
export QUINT_INSTALL_ROOT='$root'
release=\$(cat '$root/current')
release_dir="\$QUINT_INSTALL_ROOT/releases/\$release"
exec "\$release_dir/runtime/bun" "\$release_dir/app/packaging/launcher.mjs" "\$@"
EOF
chmod +x "$bin/quint"
if [ -f "$root/current" ]; then
  cp "$root/current" "$root/previous"
fi
printf '%s\n' "$id" >"$root/current.new"
mv "$root/current.new" "$root/current"
printf '%s\n' "$repo" >"$root/repository"
printf '%s\n' "$delivery" >"$root/release-base"
printf '%s\n' "$bin/quint" >"$root/command"
# Make the command available to future shells when the profile can be edited.
case ":$PATH:" in
*":$bin:"*) ;;
*)
  profile="$HOME/.profile"
  shell_name=${SHELL:-}
  [ "${shell_name##*/}" != zsh ] || profile="$HOME/.zprofile"
  line="export PATH=\"$bin:\$PATH\" # Quint"
  # Shell profiles may be managed symlinks (for example, by Home Manager).
  # PATH setup is optional and must not prevent shortcuts or startup.
  if grep -Fqx "$line" "$profile" 2>/dev/null ||
    { [ ! -L "$profile" ] && printf '\n%s\n' "$line" >>"$profile"; } 2>/dev/null; then
    printf 'The quint command will be available in new terminals\n'
  else
    printf 'Could not update %s; add Quint to PATH in your shell configuration:\n' "$profile"
    printf '  %s\n' "$line"
  fi
  ;;
esac
export PATH="$bin:$PATH"
"$bin/quint" shortcuts
printf '\nQuint is installed\n\n'
printf '  Start or open:  quint\n'
printf '  Stop:           quint quit\n'
printf '  Uninstall:      quint uninstall --yes\n\n'
printf 'Stop Quint before uninstalling\n'
printf 'If quint is not on your PATH, use "%s/quint" with the same arguments\n' "$bin"
if [ "${QUINT_NO_OPEN:-0}" != 1 ]; then
  "$bin/quint" open
fi
