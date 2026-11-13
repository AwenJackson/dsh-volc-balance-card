# Changelog

## 0.2.1

Visual refresh of the sidebar card.

- Collapsed capsule now reads `● Volc余额: ¥75.65` with an external-link button next to the label that opens the Volcengine account overview in a new tab.
- Expanded card: underline tabs (额度 / 设置), large tabular balance amount, status chip, six-pixel progress bar, three-column quota-window grid, SVG icons, and a compact updated-at footer.
- Settings: grouped sections, credentials collapsed by default when already configured, switch controls, and a reserved-width select.
- Rail mode (`wide=false`) collapses to a 32px balance shortcut instead of rendering the full card.
- Removed the unused drag/overlay positioning code and the `position` setting.
- Added empty/unconfigured and retry states; no RPC or storage-key changes.

## 0.2.0

Market-ready release with in-card key management.

- Added the Volcengine **account balance** row (`billing.volcengineapi.com`, `QueryBalanceAcct`, cached for 30s) with balance tiers and a multi-line detail view (available / cash / arrears / frozen / account ID).
- Added in-card **AK/SK configuration**: `credential-status`, `set-credentials`, `test-credentials`, `clear-credentials` RPC endpoints. A key pair is verified with a real balance query before it is written; the secret key is never sent back to the browser and the access key is only shown masked.
- Added a setup hint in the card when no balance row is available, linking to the settings panel.
- Removed all remaining ChatGPT/Codex subscription code from the host and client bundles (catalog entry, RPC endpoints, fetch branch, settings block, translations, styles).
- Shortened the row labels to 方舟 Agent 套餐 / 方舟 Coding 套餐.
- Added `build.mjs` (TypeScript build + vendored runtime copy), `test-integration.mjs`, and `scripts/check-package.mjs` market/npm pre-flight checks.
- Added market metadata: `dsh.compatibility.dsh`, `engines.dsh`, `repository`/`homepage`/`bugs`, `dsh-plugin` keyword, and the release-tarball friendly `files` list.
- Added README (EN/ZH), NOTICE (upstream attribution), LICENSE update, `docs/PUBLISHING.md` and a ready `market/<owner>__<repo>.yml` entry for awesome-dsh-plugin.

## 0.1.2

- Removed the ChatGPT account block and the proxy section from the settings panel.
- Removed the ChatGPT row from the provider catalog.

## 0.1.1

- Reworked the collapsed capsule layout so it fills the sidebar footer width.

## 0.1.0

- First fork of dsh-quota-panel: sidebar-footer card with the Volcengine balance row plus the Ark Agent/Coding plan windows, per-row display toggles, refresh interval, capsule mode and warning thresholds.
