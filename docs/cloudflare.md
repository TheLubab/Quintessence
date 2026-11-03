# Cloudflare delivery

Quint uses a Worker with Static Assets for `quint.run` and an R2 bucket with
the custom domain `dl.quint.run` for downloads. Pages is not needed. GitHub
Releases remains the publication gate and backup download source.

## Cloudflare setup

1. In **R2 object storage**, enable R2 if prompted and create a Standard storage
   bucket named **quint-releases**. Do not enable a lifecycle rule that deletes
   published versions.
2. Open the bucket's **Settings → Custom domains → Add** and enter
   **dl.quint.run**. Let Cloudflare create the DNS record and wait until active.
   Leave the `r2.dev` public development URL disabled. Objects in this bucket
   will be publicly downloadable through the custom domain.
3. Under **R2 → Manage R2 API tokens**, create an account token with **Object Read
   & Write**, limited to **quint-releases**. Save its Access Key ID and Secret
   Access Key for GitHub. Copy the Cloudflare Account ID from the dashboard.
4. Under **Manage account → Account API tokens → Create Token**, create an
   account-owned deployment token using the current Workers roles:
   - **Workers product scope → Admin** for the first deployment, because it
     creates `quint-site`. After that, replace it with a token granting
     **Workers product scope → Editor** for subsequent deployments.
     No zone permission is required for this workflow: attach the Custom Domain
     manually after the first deployment, as described below. No separate R2
     permission is required on this deployment token merely to attach the R2
     binding. The separate R2 credentials from step 3 perform uploads.
5. Inspect existing DNS for `quint.run`. If it already points to an old site,
   remove the conflicting apex A/AAAA/CNAME records immediately before the first
   domain attachment. Preserve mail records and unrelated subdomains. After the
   first deployment, open **Workers & Pages → quint-site → Settings → Domains &
   Routes → Add → Custom Domain** and enter **quint.run**. Cloudflare creates the
   DNS record and certificate. The [Wrangler configuration](../cloudflare/wrangler.jsonc)
   intentionally omits `route` and `routes` and sets `workers_dev` to false so
   domain connections remain managed through the dashboard.
6. Use **Caching → Cache Rules** to make `dl.quint.run/v*` eligible for caching,
   respecting origin Cache-Control. Exclude `/channels/*` from caching, including
   any existing broad rules. Archives and versioned scripts have a one-year
   immutable lifetime; channel manifests use `no-store`. Cloudflare's plan-based
   maximum cacheable file size still applies; larger files can be served from R2.
7. Exclude installer, manifest, and download requests from any interactive bot
   challenges or Cloudflare Access login. CLI clients must receive files, not HTML.

See Cloudflare's [public bucket guide](https://developers.cloudflare.com/r2/buckets/public-buckets/),
[R2 credentials guide](https://developers.cloudflare.com/r2/get-started/cli/), and
[Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

### Current token model

Verified against Cloudflare documentation on November 3, 2026. Use
[account-owned tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/)
for GitHub Actions. The older `Workers Scripts → Edit` permission is legacy;
Cloudflare's replacement is **Editor** at the Workers product scope. **Editor**
cannot create Workers, so the initial deployment requires **Admin** or a Worker
created beforehand through the dashboard.

Cloudflare documents **Zone → Workers Routes → Write** for automated domain
changes, but that permission may not appear in the policy editor you are using.
This setup avoids that dependency: attach the domain through the dashboard and
keep domain management outside GitHub Actions. After creation, the token can use
**Editor** restricted to `quint-site`, provided deployments leave the domain
connection unchanged. See [Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)
and [dashboard-managed routes](https://developers.cloudflare.com/workers/wrangler/deprecations/#other-deprecated-behavior).

The [granular Wrangler authentication guide](https://developers.cloudflare.com/workers/authorization/#use-granular-permissions-with-wrangler)
uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, which the website workflow
already supplies. Creating account-owned tokens requires Super Administrator
status or API Token Provisioning capabilities. The
[R2 S3 credential flow](https://developers.cloudflare.com/r2/api/tokens/)
still uses its separate Object Read & Write permission and bucket scope.

## GitHub setup

In **Settings → Environments**, create **cloudflare**. If restricting deployments,
allow the `main` branch and tags matching `v*`; release events run in a tag context.
Optionally add a required reviewer. Both delivery workflows use
this environment; publishing downloads waits for its approval if configured.

Add this environment variable:

| Variable                | Value                 |
| ----------------------- | --------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

Add these environment secrets:

| Secret                 | Value                       |
| ---------------------- | --------------------------- |
| `CLOUDFLARE_API_TOKEN` | Worker deployment API token |
| `R2_ACCESS_KEY_ID`     | R2 token Access Key ID      |
| `R2_SECRET_ACCESS_KEY` | R2 token Secret Access Key  |

Keep the existing `release` environment and `PUBLIC_TLDRAW_LICENSE_KEY` repository
variable used by the portable build workflow. Cloudflare credentials never
belong in repository files.

## First deployment and release

1. Merge the delivery changes to `main`, including both new workflows. In Actions,
   run **Deploy Quint website** manually after configuring Cloudflare and GitHub.
   Later pushes affecting `landing/` or `cloudflare/` deploy automatically.
2. Attach **quint.run** through **quint-site → Settings → Domains & Routes → Add
   → Custom Domain**, then check `https://quint.run`. The first deployment has
   no public URL until this is done. Until a stable release is mirrored, `/install.sh`,
   `/install.ps1`, and `/releases/stable.json` return 503; the landing page works.
3. Commit the intended `package.json` version, create the matching `v<version>`
   tag, and push it. **Portable release** builds and tests the archives, then
   creates a draft. Review it and publish it manually.
4. Publishing triggers **Deliver release to Cloudflare**. It downloads the
   published assets, validates all six checksums, uploads versioned objects, reads
   them back to verify their hashes, then updates one channel manifest last.
   Stable releases update `channels/stable.json`; prereleases update
   `channels/preview.json`. Mark tags containing `-` as prereleases.
5. Check `https://quint.run/releases/stable.json` and
   `https://dl.quint.run/channels/stable.json`. Check that `/install.sh` redirects
   to `https://dl.quint.run/v<version>/install.sh`, then test installation and
   in-app updates on the supported platforms.

To mirror an already published release or retry a failed upload, manually run
**Deliver release to Cloudflare** with its existing tag. Retries accept identical
objects and reject different bytes at an existing versioned path. Older stable
versions are mirrored without moving the stable channel backward. A failed
upload leaves the old channel active. Do not edit or delete published objects;
publish a new version to correct a release.

Only the GitHub delivery workflow should write this bucket. Its concurrency group
serializes uploads and channel promotion. GitHub may replace intermediate pending
runs when several are queued; manually rerun delivery for any skipped versions
that should also be mirrored.

## Installer compatibility

New installations download from `dl.quint.run` and save their delivery base in
the local installation's `release-base` file. Updates use that same base.
Installations created before this change continue using GitHub; rerunning the
public installer migrates them to Cloudflare. Explicit `QUINT_RELEASE_REPO`
overrides continue selecting GitHub unless `QUINT_RELEASE_BASE` is also supplied.
`QUINT_VERSION` still selects an explicit stable or preview tag.

Site deployment is independent of releases. The Worker redirects installers by
reading the stable R2 manifest, so publishing a release never requires redeploying
the website. Installers and manifests must remain short-lived or uncached.
