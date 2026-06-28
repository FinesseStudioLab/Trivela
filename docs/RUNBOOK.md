# Trivela Runbook

Operational procedures for the Trivela backend and infrastructure.

---

## Secret Rotation Procedure

If a private key, API key, or other secret is accidentally committed to the repository, follow these steps immediately.

### 1. Assess the exposure

- Determine what was committed: Stellar secret key, Trivela API key, environment variable, or third-party credential.
- Check if the commit reached GitHub (even briefly) — assume it did and treat it as compromised.

### 2. Revoke / rotate the secret immediately

| Secret type | Rotation action |
|---|---|
| Stellar secret key | Generate a new keypair. If the key held on-chain funds, sweep them to a new address first. |
| Trivela API key | Call `DELETE /api/v1/admin/api-keys/:id` to revoke the old key, then create a new one. |
| Third-party credential | Follow the provider's key rotation procedure. |

Do **not** wait until the commit is removed before revoking — assume the secret is already exploited.

### 3. Remove the secret from git history

Use `git filter-repo` (preferred) or BFG Repo Cleaner to rewrite history:

```bash
# Install: pip install git-filter-repo
git filter-repo --path-regex '.*' --replace-text <(echo 'COMPROMISED_VALUE==>REDACTED')
```

Then force-push all branches and tags. Coordinate with other contributors to re-clone.

### 4. Request a GitHub secret scan review

Open a GitHub support ticket to purge cached views of the exposed commit, and enable [GitHub's secret scanning alerts](https://docs.github.com/en/code-security/secret-scanning) if not already on.

### 5. Post-incident

- Add a custom rule to `.gitleaks.toml` for the leaked pattern if it is not already covered.
- Update `scripts/dev-setup.sh` if a `git-secrets` pattern needs to be added locally.
- Write a brief incident summary and share it with the team.

---

## Gitleaks CI Failures

If the `Secrets Scanning` CI workflow fails on a PR:

1. **Do not merge** until the finding is resolved.
2. Read the workflow output to see which file/line triggered the rule (the secret value itself is not printed).
3. If it is a **false positive**, add an `[allowlist]` entry in `.gitleaks.toml` for that path or pattern, and explain why in the PR.
4. If it is a **real secret**, follow the rotation procedure above before amending the commit.
