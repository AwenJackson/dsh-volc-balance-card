# Changelog

## 0.2.3

Agent Plan row is now always visible, and an unsubscribed account reads as a state instead of a failure.

- The host half returns a neutral `notice: 'agent-plan-absent'` view when `GetAFPUsage` succeeds but every 5h / weekly / monthly window reports `Quota=0` (verified against a real account: `PlanType: ""`, all quotas 0). Previously that case returned an error string, so the row rendered as a red failure.
- Genuine failures are unchanged: a bad signature, a missing permission or an HTTP error is still thrown by `volcengineCall` and still surfaces as an error row.
- The client renders notices with a muted `state-idle` chip and localized copy (`未开通` / `Not subscribed`, plus a one-line hint) instead of a measurement value.
- The bundle patch no longer ships `hide: [volcengine-agent]`, so all three rows are enabled by default; buying the plan turns the row into live windows with no config change.
- `test-integration.mjs` asserts the notice shape in both offline and live modes (`npm test` passes against the real account).
- README (EN/ZH) updated: the Agent Plan row documents the not-subscribed state, and the "hidden by default" note is gone.

## 0.2.2

Manifest-only release: declare the DSH packages the card binds to, and let registries see the supported range.

- `peerDependencies` now lists `@deepseek-ai/dsh-credentials` and the four client modules from `dsh.client.inject` (`dsh-client-connection`, `dsh-client-locale`, `dsh-client-ui-renderer`, `dsh-cordis-client-runner`) with the `">=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-0 <0.3.0-0 || >=0.2.2-0 <0.3.0-0"` range, all marked `optional` because the DSH runtime supplies them. Registries that read the manifest (dsh.so, npm) can now report the author-declared range instead of "not declared".
- `dsh.compatibility.dsh` now carries the same `||` branches, and `dsh.compatibility.dshReleases` records the releases this card was actually exercised on (`0.2.2-rc.1`, `0.2.2-rc.2`, `0.2.2-rc.3`).
- README (both languages) shows the dsh.so risk badge and documents the peer declaration.
- No runtime code change: `lib/` output is byte-identical to 0.2.1.

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
