# Releasing Quint

Quint uses Nix to assemble portable releases, GitHub Releases to approve publication,
and Cloudflare R2 to deliver downloads through `dl.quint.run`.
For installation, updates, rollback, and uninstall, see [installation](distribution.md).

The build is defined by [the release derivation](../nix/release.nix),
[the release workflow](../.github/workflows/portable-release.yml), and
[the staging script](../scripts/stage-release.ts). The
[runtime launcher](../packaging/launcher.mjs) starts installed releases.

## Build with Nix

After changing dependencies, inside `nix develop`:

```sh
bun install
bun run release:inputs
```

Commit `bun.lock` and [the generated inputs](../nix/release-inputs.json) together.
The generator converts Bun's JSONC lock into registry tarball URLs and integrity
hashes. Nix fetches each package as a separate fixed-output input. The build then
populates a private Bun cache and installs offline, with lifecycle scripts
disabled. The derivation checks that the generated inputs match the lockfile.

From a supported Linux/macOS builder:

```sh
nix build path:.#release
```

Windows archives are assembled using target-specific optional npm dependencies
and upstream Windows Bun binaries, also on Linux/macOS:

```sh
nix build path:.#release-windows-x64
nix build path:.#release-windows-arm64
```

`path:.` includes new files and the optional public license key input. Release
outputs appear under `result/`. No credentials should be put in this source tree.
Only the public tldraw browser license key belongs in
[tldraw-public-key.txt](../packaging/tldraw-public-key.txt); CI fills it from
the existing `PUBLIC_TLDRAW_LICENSE_KEY` repository variable.

Nix is the build environment. Shipped Bun is the unmodified upstream portable
binary, not Nix's patched executable. The derivation disables fixup/shebang
rewriting for the staged archive. Verify the extracted archive without Nix to
catch accidental store dependencies, especially native modules. Runtime
dependency builds are intentionally disabled; a new dependency that requires one
needs an explicit packaging change rather than a hidden installation-time build.

## Publish through GitHub

The repository containing this project must have the project at its root, as
expected by the existing workflows. The portable workflow infers the delivery
repository from `github.repository`; it does not use the checkout's current
upstream remote or a hardcoded repository name.

1. Set `package.json` to the intended version and commit the release inputs.
2. Create and push the matching `v<version>` tag, or run **Portable release**
   manually with an existing tag.
3. Approve the existing `release` environment when GitHub requests it.
4. Download the draft assets and perform platform verification.
5. Publish the draft GitHub Release. Mark preview versions as prereleases.
6. The **Deliver release to Cloudflare** workflow mirrors and verifies the assets
   in R2, then promotes the stable or preview channel. See [Cloudflare setup](cloudflare.md).

The workflow builds six archives with Nix, runs lightweight startup checks on
native Windows runners, creates `checksums.txt`, and attaches public installer
scripts with the correct repository substituted. Configure GitHub release immutability so a published
version is never silently replaced. Fix a published artifact by releasing a new
version.

The workflow leaves the release as a **draft** for your verification. It does not
publish releases or change DNS by itself. `releases/latest` only works once a
stable release has been published; before that, test an explicit preview tag.
Public installation requires publicly downloadable release assets.

## Connect quint.run

Follow [Cloudflare delivery](cloudflare.md) to configure the bucket, credentials,
custom domains, and first deployment. A Worker serves `landing/` at `quint.run`
and redirects `/install.sh` and `/install.ps1` to the stable version's scripts
on `dl.quint.run`. The stable manifest is promoted only after every release
object has been uploaded and verified. Landing-page deployment is independent
of release publication.

## Verification checklist

Before publishing each release, verify the extracted archives on their target
platforms:

- Clean install, repeated install, and paths containing spaces and non-English characters.
- Muse initial download, device-code sign-in, subscription-backed chat, and API-key chat.
- Browser launch, application shortcut, and repeated launch without duplicate servers.
- A Quintlet build, server function, image generation, and agent-issued `quint` command.
- In-app update, shutdown, rollback, sign-in startup, and uninstall with data preserved.
- Network interruptions, unsupported systems, and machines with another Quint already running.
- macOS launch behavior and any signing/notarization requirements for your chosen public delivery.

The current macOS launcher is generated locally by the installer; the workflow
does not build or sign a downloadable `.app`, `.dmg`, or `.pkg`. There is no
Windows MSI or desktop webview wrapper. Diagnostics are available through
`quint doctor` and the installation's `logs/server.log`.
