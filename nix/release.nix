{
  pkgs,
  bun,
  portableBun,
  target,
  publicTldrawLicenseKey ? "",
}:
let
  inputs = builtins.fromJSON (builtins.readFile ./release-inputs.json);
  sources = map (
    package:
    package
    // {
      archive = pkgs.fetchurl { inherit (package) url hash; };
    }
  ) inputs.packages;
  cache =
    pkgs.runCommand "quint-bun-cache"
      {
        nativeBuildInputs = [
          pkgs.gnutar
          pkgs.gzip
        ];
      }
      (
        pkgs.lib.concatMapStringsSep "\n" (
          package:
          let
            # Bun 1.4.4 hashes the prerelease portion of its cache directory.
            cacheVersion =
              if package.name == "gensync" && package.version == "1.0.0-beta.2" then
                "1.0.0-4049f5e8f1219d89"
              else
                package.version;
          in
          ''
            mkdir -p "$out/${package.name}@${cacheVersion}@@@1"
            tar -xzf ${package.archive} --strip-components=1 -C "$out/${package.name}@${cacheVersion}@@@1"
          ''
        ) sources
      );
  os =
    if pkgs.lib.hasPrefix "windows-" target then
      "win32"
    else if pkgs.lib.hasPrefix "macos-" target then
      "darwin"
    else
      "linux";
  cpu = if pkgs.lib.hasSuffix "arm64" target then "arm64" else "x64";
in
pkgs.stdenvNoCC.mkDerivation {
  pname = "quint-portable-${target}";
  version = (builtins.fromJSON (builtins.readFile ../package.json)).version;
  src = pkgs.lib.cleanSourceWith {
    src = ../.;
    filter =
      path: type:
      let
        name = baseNameOf path;
      in
      !(builtins.elem name [
        "node_modules"
        ".git"
        "dist"
        "out"
        "test-workspace"
        "result"
        "portable-result"
        ".build"
        ".cache"
        ".env"
      ])
      && !(pkgs.lib.hasPrefix ".env" name)
      && !(pkgs.lib.hasSuffix ".tgz" name)
      && !(pkgs.lib.hasSuffix ".zip" name);
  };
  nativeBuildInputs = [
    bun
    pkgs.gnutar
    pkgs.gzip
    pkgs.unzip
    pkgs.zip
  ];
  # Never rewrite interpreters in the tree shipped to non-Nix users.
  dontFixup = true;
  dontStrip = true;
  PUBLIC_TLDRAW_LICENSE_KEY = publicTldrawLicenseKey;
  buildPhase = ''
    export HOME="$TMPDIR/home"
    mkdir -p "$HOME" cache
    cp -R ${cache}/. cache/
    chmod -R u+w cache
    export BUN_INSTALL_CACHE_DIR="$PWD/cache"
    bun install --offline --frozen-lockfile --ignore-scripts
    bun scripts/release-inputs.ts --check
    bun run prepare:browser-assets
    bun run build:frontend
    # Install only target-specific optional dependencies into the delivered tree.
    rm -rf node_modules
    bun install --offline --frozen-lockfile --ignore-scripts --os=${os} --cpu=${cpu} --libc=glibc
    unzip -q ${portableBun} -d portable-runtime
    runtime=$(find portable-runtime -type f -name '${
      if os == "win32" then "bun.exe" else "bun"
    }' -print -quit)
    test -n "$runtime"
    bun scripts/stage-release.ts ${target} stage "$runtime"
  '';
  installPhase = ''
    mkdir -p "$out"
    ${
      if os == "win32" then
        ''
          (cd stage && zip -qr "$out/quint-${target}.zip" .)
        ''
      else
        ''
          tar -czf "$out/quint-${target}.tar.gz" -C stage .
        ''
    }
  '';
}
