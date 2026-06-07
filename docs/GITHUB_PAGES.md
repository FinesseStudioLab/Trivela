# GitHub Pages — Contract API Documentation

The contract API reference (generated via `cargo doc`) is published to GitHub Pages by the
[Deploy Contract API Docs](../.github/workflows/docs.yml) workflow on every push to `main`.

## Maintainer setup (one-time)

GitHub Pages must be enabled in repository settings before the workflow can deploy. This requires
**admin or maintainer** access on `FinesseStudioLab/Trivela`.

1. Go to **Settings → Pages** in the repository.
2. Under **Build and deployment**, set **Source** to **GitHub Actions** (not a branch).
3. Save.

No further configuration is needed — the existing workflow handles build and deployment.

## Verification

After enabling Pages:

1. Merge to `main` (or re-run the latest failed **Deploy Contract API Docs** workflow).
2. Confirm the workflow completes successfully in the **Actions** tab.
3. Visit the published URLs (see [CONTRACTS_API.md](CONTRACTS_API.md#viewing-online)):
   - `https://finessestudiolab.github.io/Trivela/` — redirects to campaign contract docs
   - `https://finessestudiolab.github.io/Trivela/trivela_rewards_contract/` — rewards contract docs

## Manual deployment

Maintainers can trigger a deployment without pushing to `main`:

1. Go to **Actions → Deploy Contract API Docs**.
2. Click **Run workflow** and select the `main` branch.

## Troubleshooting

| Error | Cause | Fix |
| ----- | ----- | --- |
| `Get Pages site failed` | Pages not enabled | Complete the [one-time setup](#maintainer-setup-one-time) above |
| Broken cross-links in docs | Incorrect `html-root-url` | The workflow sets `RUSTDOCFLAGS` to `https://finessestudiolab.github.io/Trivela/` — do not change without updating the Pages URL |

## References

- [GitHub Pages publishing source docs](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
