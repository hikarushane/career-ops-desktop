# Release Setup — One-time Configuration

This document lists the one-time steps to enable the full release pipeline for CareerOps Desktop.

## 1. Fork GitHub Repository

Create your fork and update `.fork/release.json`:

```json
{
  "repository": "YOUR_GITHUB_USER/career-ops",
  "updateEndpoint": null,
  "homebrewTap": null
}
```

The `updateEndpoint` is derived automatically from `repository` at build time.

## 2. GitHub Secrets

Set these in the fork repo under Settings → Secrets and variables → Actions:

| Secret | Purpose | Required |
|--------|---------|----------|
| `TAURI_SIGNING_PRIVATE_KEY` | Updater signature (base64-encoded Ed25519 key) | Yes |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the signing key | Yes |
| `OPENAI_API_KEY` | Codex upstream maintenance agent | For upstream sync |
| `APPLE_CERTIFICATE` | macOS code signing certificate (base64 .p12) | For signed macOS builds |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12 | For signed macOS builds |
| `APPLE_SIGNING_IDENTITY` | Code signing identity string | For signed macOS builds |
| `APPLE_ID` | Apple ID for notarization | For notarization |
| `APPLE_PASSWORD` | App-specific password for notarization | For notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID | For notarization |
| `HOMEBREW_TAP_TOKEN` | PAT with write access to the tap repo | For Homebrew |

### Generate Tauri updater keys

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/career-ops.key
```

This outputs a private key file and prints the public key. Set the private key as `TAURI_SIGNING_PRIVATE_KEY` and paste the public key into `desktop/src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.

## 3. GitHub Variables

| Variable | Purpose |
|----------|---------|
| `HOMEBREW_TAP_REPO` | Tap repo (e.g. `YOUR_USER/homebrew-career-ops`) |

## 4. Updater Public Key

Replace the placeholder in `desktop/src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "YOUR_ACTUAL_PUBLIC_KEY_HERE"
    }
  }
}
```

## 5. Updater Endpoint

Replace `{{FORK_OWNER}}` in the endpoint URL with your GitHub username:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/YOUR_USER/career-ops/releases/latest/download/latest.json"
      ]
    }
  }
}
```

## 6. Branch Protection

See [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md) for recommended settings.

## 7. Homebrew Tap

Create a repo `YOUR_USER/homebrew-career-ops` with a `Casks/` directory.
The release workflow updates the cask formula automatically when `HOMEBREW_TAP_REPO` and `HOMEBREW_TAP_TOKEN` are set.

## 8. Apple Signing (macOS)

Enroll in the Apple Developer Program. Export a Developer ID Application certificate as .p12, base64 encode it, and set as `APPLE_CERTIFICATE`. Without these secrets, builds produce unsigned DMGs that trigger Gatekeeper warnings.

## 9. Windows Signing

Optional. Without an Authenticode certificate, the NSIS installer triggers SmartScreen warnings. Set up an EV code signing certificate from a CA and configure it in the workflow as needed.

## 10. Auto-merge

Enable auto-merge in the fork's repository settings (Settings → General → Pull Requests → Allow auto-merge). The upstream maintenance workflow uses it for clean, zero-conflict syncs.

## 11. Dev Hooks

Run once after cloning:

```bash
node scripts/setup-dev-hooks.mjs
```

This sets `core.hooksPath` to `.githooks/` for pre-push release readiness checks.
