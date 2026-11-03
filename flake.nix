{
  description = "Quint development shell (Bun + Muse Code)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    {
      nixpkgs,
      nixpkgs-unstable,
      ...
    }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forEachSystem = nixpkgs.lib.genAttrs supportedSystems;

      bunSources = {
        windows-x64 = {
          url = "https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-windows-x64.zip";
          hash = "sha256-zSwPzMePPt4fUMqCehXwY+2hPU0VCj0GdPT24yPYZKU=";
        };
        windows-arm64 = {
          url = "https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-windows-aarch64.zip";
          hash = "sha256-LVeg7sDLRNlckYw/lzT2BFWhMGrlCF12/Gj0Tj7jDQk=";
        };
      };

      bun-1_4_4 = forEachSystem (
        system:
        let
          # Nixpkgs unstable no longer supports Intel Macs; 26.05 still does.
          pkgs = import (if system == "x86_64-darwin" then nixpkgs else nixpkgs-unstable) {
            inherit system;
          };
          srcBySystem = {
            x86_64-linux = {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-x64.zip";
              hash = "sha256-v4zL+ysLgBWeD5ptFcVTF63YB3U028YTCj7bUvzLOVw=";
            };
            aarch64-linux = {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-aarch64.zip";
              hash = "sha256-uqa7NvUdblhWHgK76oJQOKnfRU9nPW13bou/hvjHhQ4=";
            };
            x86_64-darwin = {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-darwin-x64.zip";
              hash = "sha256-UKNJH3Orwv6BZzFxqFdi07wswWgMzsrdmD3pmt93l34=";
            };
            aarch64-darwin = {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-darwin-aarch64.zip";
              hash = "sha256-wkDX8My5DCY6hJ/NsJt+5iYw2SE0jtaq/ahrnVd7xRA=";
            };
          };
          src = srcBySystem.${system};
        in
        pkgs.bun.overrideAttrs (old: {
          version = "1.4.4";
          # Stable's Bun recipe expects the baseline archive on Intel Macs.
          sourceRoot = if system == "x86_64-darwin" then "bun-darwin-x64" else old.sourceRoot;
          src = pkgs.fetchurl {
            inherit (src) url hash;
          };
        })
      );
    in
    {
      packages = forEachSystem (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          bun = bun-1_4_4.${system};
          target =
            {
              x86_64-linux = "linux-x64";
              aarch64-linux = "linux-arm64";
              x86_64-darwin = "macos-x64";
              aarch64-darwin = "macos-arm64";
            }
            .${system};
          release = import ./nix/release.nix {
            inherit pkgs bun target;
            portableBun = bun.src;
            publicTldrawLicenseKey = builtins.readFile ./packaging/tldraw-public-key.txt;
          };
          windowsRelease =
            target:
            import ./nix/release.nix {
              inherit pkgs bun target;
              portableBun = pkgs.fetchurl bunSources.${target};
              publicTldrawLicenseKey = builtins.readFile ./packaging/tldraw-public-key.txt;
            };
        in
        {
          inherit release;
          default = release;
          release-windows-x64 = windowsRelease "windows-x64";
          release-windows-arm64 = windowsRelease "windows-arm64";
        }
      );

      devShells = forEachSystem (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          runtimePkgs = import (if system == "x86_64-darwin" then nixpkgs else nixpkgs-unstable) {
            inherit system;
            config.allowUnfreePredicate = pkg: builtins.elem (nixpkgs.lib.getName pkg) [ "muse-code" ];
          };
          bun = bun-1_4_4.${system};
          # Use the current Muse recipe with stable dependencies on Intel Macs.
          muse-code =
            if system == "x86_64-darwin" then
              runtimePkgs.callPackage "${nixpkgs-unstable}/pkgs/by-name/mu/muse-code/package.nix" { }
            else
              runtimePkgs.muse-code;
          runtimeLibs = with pkgs; [
            stdenv.cc.cc.lib
            zlib
            openssl
            libffi
          ];
          quint-cli = pkgs.writeShellScriptBin "quint" ''
            : "''${QUINT_ROOT:?QUINT_ROOT is missing. Enter nix develop from the Quint repository root.}"
            exec ${bun}/bin/bun "$QUINT_ROOT/backend/cli.ts" "$@"
          '';
        in
        {
          default = pkgs.mkShell {
            packages = [
              bun
              muse-code
              quint-cli

              pkgs.nodejs
              pkgs.typescript
              pkgs.typescript-language-server
              pkgs.typescript
              pkgs.oxlint
              pkgs.oxfmt

              pkgs.git
              pkgs.awscli2
              pkgs.pkg-config
              pkgs.python3
            ];

            shellHook = ''
              export QUINT_ROOT="''${QUINT_ROOT:-$PWD}"
              export MUSE_BIN="${muse-code}/bin/muse"
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath runtimeLibs}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

              echo "Quint development shell"
              echo "Bun:       $(bun --version)"
              echo "Muse Code: $(muse --version)"
              echo "MUSE_BIN:  $MUSE_BIN"
              echo ""
              if [ ! -d node_modules ]; then
                echo "Dependencies are not installed yet. Run: bun install"
                echo ""
              else
                bun run prepare:browser-assets || return $?
              fi
            '';
          };
        }
      );

      formatter = forEachSystem (system: (import nixpkgs { inherit system; }).nixfmt);
    };
}
