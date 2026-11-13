# dsh-volc-balance-card

[中文说明](./README.zh.md) · [Changelog](./CHANGELOG.md)

A DeepSeek Harness (DSH) plugin that puts **your Volcengine (火山引擎) money** in the sidebar footer: the account recharge balance plus the Ark **Coding Plan / Agent Plan** quota windows, refreshed in the background.

Unlike the other Volcano Ark widgets, this one reads the real account balance from the Billing OpenAPI (`QueryBalanceAcct`) — the same number you see on the console's 费用中心 page — not the plan-only quota.

```
┌ sidebar ───────────────┐
│ …                      │
│ ┌────────────────────┐ │
│ │ 火山引擎 · ¥80.10   │ │  ← collapsed capsule, click to expand
│ └────────────────────┘ │
└────────────────────────┘
```

Expanded card:

| Row | Source | What it shows |
| --- | --- | --- |
| 火山引擎余额 | `billing.volcengineapi.com` · `QueryBalanceAcct` | available balance, cash balance, arrears, freeze, account ID |
| 方舟 Coding 套餐 | `open.volcengineapi.com` · `GetCodingPlanUsage` | rolling / weekly / monthly windows with reset times |
| 方舟 Agent 套餐 | `open.volcengineapi.com` · `GetAFPUsage` | Agent Plan windows (only when the account has a plan) |

Rows are colour-coded from the balance thresholds (default: < ¥10 critical, < ¥20 warning, ≥ ¥50 healthy) and from the plan usage percentages (default: ≥70% warning, ≥90% critical).

## Install

### From the DSH plugin market (recommended)

In the DSH desktop app, open the plugin market and search for `dsh-volc-balance-card`, then install. The entry is published in the [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) curated list; the market installs only from that list.

### From a release

Download `dsh-volc-balance-card.tgz` from the latest GitHub release and install that tarball through your DSH profile's plugin installer (a `file:` bundle spec). The release asset name carries no version number on purpose, so the curated list's `tarball:` URL keeps resolving after every release.

After installing, the card appears at the bottom of the sidebar. No restart is needed on a live profile.

## Configure AK/SK

The card does not read your browser session, and it does not need your console password. It signs requests with an API key pair.

1. In the Volcengine console, create an access key (访问密钥 / AK·SK). Grant it read access to Billing — the `BillingReadOnlyAccess` policy is enough; nothing else is required.
2. In DSH, click the card's ⚙ (or the **配置 AK/SK** button shown in the card when no key is configured).
3. Fill in **Access Key ID** and **Secret Access Key**, then **保存并测试**.

On save, the host immediately calls `QueryBalanceAcct` to verify the pair. A wrong key, a missing Billing permission, or a network failure is reported right there, and nothing is written. If the key works, both values are stored and the balance row appears without a page reload.

Useful details:

- Only the AK is ever shown back to the browser, masked (`AKLT****mMTE`). The SK never leaves the host process.
- Credentials are stored in the standard DSH credential store (`~/.dsh/.credentials.yaml`) as `VOLC_ACCESS_KEY` / `VOLC_SECRET_KEY`, so the card also works with a key you already configured through another DSH plugin.
- **清除** removes both values; the balance row then disappears and the card shows the setup hint again.

## Settings

Open the card's ⚙ panel:

| Setting | Behaviour |
| --- | --- |
| AK/SK | configure, test or clear the Volcengine key pair |
| 显示供应商 | hide/show each row (balance, Coding plan, Agent plan) — front-end only |
| 刷新间隔 | 15s / 30s / 60s / 120s / 300s, or follow the bundle default (60s) |
| 胶囊显示 | which window the collapsed capsule highlights (`auto` / `rolling` / `weekly` / `max`) |
| 预警阈值 | override the warning threshold (balance in ¥, usage in %) |
| 恢复默认 | reset the local display settings |

The balance response is cached for 30s per credential, so a 15s refresh does not hammer the Billing API.

Bundle defaults live in `cordis.patch.yml`: refresh interval, hidden rows, and balance tiers. The patch ships with `hide: [volcengine-agent]`, because an account without an Agent Plan subscription would otherwise always show one error row — delete that line after subscribing.

## Network and privacy

The plugin talks only to these endpoints, and only from the host process:

| Method | Host | Action |
| --- | --- | --- |
| GET | `billing.volcengineapi.com` | `QueryBalanceAcct` (version `2022-01-01`, region `cn-north-1`) |
| POST | `open.volcengineapi.com` | `GetCodingPlanUsage`, `GetAFPUsage` (service `ark`, version `2024-01-01`) |

No telemetry, no analytics, no third-party endpoints. The browser side receives only a normalized view (amounts, percentages, reset times, masked AK).

## Compatibility

- DSH `>=0.2.0-rc.1 <0.3.0-0` (declared in `dsh.compatibility.dsh` and `engines.dsh`).
- Node.js `>=20`.
- Desktop and web profiles; the card registers into the `sidebar.footer.action` slot.

## This is a fork

`dsh-volc-balance-card` is a fork of [dsh-quota-panel](https://github.com/wenzetan/dsh-quota-panel) (MIT). It keeps the quota-panel skeleton — signing, catalog, RPC channel, settings UI — and changes the product:

- **Added** the Volcengine account balance row (`QueryBalanceAcct`) with balance tiers — upstream only showed plan quotas.
- **Added** an in-card AK/SK setup flow with host-side verification, instead of editing the credential file by hand.
- **Removed** the ChatGPT/Codex account block and the proxy section, which produced an error row in unsupported regions and had nothing to do with this card.
- **Changed** the surface from a draggable floating overlay to a fixed card in the sidebar footer, plus a compact capsule mode.

## Development

```bash
npm install          # TypeScript only
npm run build        # src/*.ts -> lib/*.js, copies src/vendor -> lib/vendor
npm test             # integration test against the host RPC surface
npm run check        # market/npm pre-flight checks
npm run set-repo -- <owner>/<repo>   # fill in repository URLs + market entry
```

`build` does not bundle: `src/client.ts` already carries the `window.__ModuleLoader__.load({ id, factory })` envelope the DSH client runner expects, so the compiler output is the shipped artifact. `lib/vendor/schemastery.mjs` is vendored (upstream `schemastery`, MIT) because DSH does not expose it to plugins at runtime.

Releasing is described in [docs/PUBLISHING.md](./docs/PUBLISHING.md).

## License

MIT — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for the upstream attribution.
