{
  description = "dev flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
  };

  outputs =
    {
      nixpkgs,
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

      nixpkgsFor = forEachSystem (system: import nixpkgs { inherit system; });
    in
    {
      devShells = forEachSystem (
        system:
        let
          pkgs = nixpkgsFor.${system};
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs
              typescript
              eslint_d
              prettierd
              # corepack
              vitejs

              # python3
              # stdenv.cc
              # gnumake
              # cmake
              # pkg-config
              # openssl
            ];

            shellHook = ''
              echo "Node.js package development shell ready"
              echo "Node.js: $(node --version)"
              echo "npm:     $(npm --version)"
              echo ""
            '';
          };
        }
      );
    };
}
