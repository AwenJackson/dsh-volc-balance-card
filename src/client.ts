/**
 * dsh-volc-balance-card — client half (browser bundle, served at
 * /plugins/dsh-volc-balance-card/client.js through the `dsh.client` manifest).
 *
 * Registers one `shell.overlay` slot entry rendering the quota widget with
 * React: a collapsed glanceable capsule by default
 * (`● ¥58.36 · ● 45%`), expanding on click into the full card
 * (header "模型额度" + per-provider rows + progress bars). Next to the
 * refresh button, a gear button (⚙) opens the settings panel:
 * per-provider visibility, refresh interval, and per-provider warn
 * thresholds — persisted to localStorage, never sent anywhere.
 *
 * Data arrives over the loopback Connection RPC channel `/dsh-volc-balance-card`
 * (endpoints `specs` / `fetch-all`) owned by the host half in lib/index.js;
 * API keys never reach the browser. `fetch-all` rows carry host-normalized
 * views (kind balance / usage / info) — upstream JSON schemas stay
 * host-side; threshold judgement and coloring happen here from spec hints
 * so the local settings overrides apply without a refetch.
 *
 * Styled with the Harness design tokens (`--dsw-alias-*`, `--dsw-static-*`,
 * `--dsw-shadow-*`, `--dsw-font-*`) with sensible fallbacks, so the widget
 * follows the product theme (light/dark) instead of carrying its own palette.
 */
(window as any).__ModuleLoader__.load({
	id: "dsh-volc-balance-card",
	factory: (require) => {
		var module = { exports: {} as any };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var React = require("react");

		// Connection's authenticated /api channel; the host half mounts one exact
		// Fetch route per endpoint under the dsh-volc-balance-card method namespace.
		var CHANNEL = "/api";
		var RPC_METHOD_PREFIX = "dsh-volc-balance-card";
		var STORAGE_KEY = "dsh-volc-balance-card:settings";
		/** 火山引擎控制台的账户总览页（余额卡片的外链入口）。 */
		var CONSOLE_BALANCE_URL = "https://console.volcengine.com/finance/account-overview";

		var REFRESH_CHOICES = [
			{ value: "" },
			{ value: "15000" },
			{ value: "30000" },
			{ value: "60000" },
			{ value: "120000" },
			{ value: "300000" }
		];

		/** i18n: namespace registered into the shell locale service (apply). */
		var NS = "volc-balance-card";
		var DICT = {
			zh: {
				title: "模型额度",
				tabOverview: "额度",
				tabSettings: "设置",
				capsuleBalance: "Volc余额",
				openConsole: "在火山引擎控制台查看",
				balanceAvailable: "可用余额",
				notConfiguredTitle: "未配置访问密钥",
				readFailed: "读取失败",
				loading: "同步中…",
				retry: "重试",
				moreProviders: "还有 {n} 个供应商",
				settingsCredentials: "凭证",
				settingsDisplay: "显示",
				settingsRefresh: "刷新",
				settingsCollapsed: "收起态",
				credChange: "更换",
				credHide: "收起",
				expand: "展开模型额度",
				collapse: "收起模型额度",
				refresh: "刷新模型额度",
				openSettings: "打开设置",
				closeSettings: "关闭设置",
				allHidden: "已全部隐藏",
				emptyHint: "所有供应商均已隐藏，可在设置中开启",
				updatedAt: "更新于 {time}",
				loadFailed: "无法读取配置",
				fetchFailed: "查询失败",
				usageUnavailable: "暂时无法获取用量",
				quotaUnavailable: "暂时无法获取配额",
				balanceUnavailable: "暂时无法获取余额",
				noticeAgentPlanAbsent: "未开通",
				noticeAgentPlanAbsentHint: "该账号未订阅方舟 Agent Plan，开通后自动显示用量",
				balanceAbnormal: "余额数据异常",
				winRolling: "滚", winWeekly: "周", winMonthly: "月", winSearch: "搜索",
				settingsCapsule: "胶囊显示",
				capsuleName: "收起态数值",
				capsuleAuto: "自动（最高）",
				capsuleRolling: "5h 窗口",
				capsuleWeekly: "周窗口",
				capsuleMax: "最高窗口",
				noWinData: "无数据",
				peakUsage: "当前已使用 {pct}%",
				peakUsageWaiting: "当前已使用 {pct}% 等待重置 {time}",
				nextReset: "下次重置 {time}",
				balanceCritical: "建议充值",
				balanceWarn: "余额紧张",
				balanceOk: "余额正常",
				balanceRich: "余额充足",
				settingsProviders: "显示供应商",
				settingsNoProviders: "（未配置供应商）",
				settingsInterval: "刷新间隔",
				settingsAutoRefresh: "自动刷新",
				followConfig: "跟随配置",
				secondsSuffix: "{n} 秒",
				minutesSuffix: "{n} 分钟",
				settingsProxy: "代理",
				proxyHint: "填写 http(s) 代理 URL，仅该供应商经此代理查询",
				proxyConfigured: "已配置代理：{name}（留空沿用）",
				proxyDirect: "http://127.0.0.1:7890（留空直连）",
				settingsThresholds: "预警阈值",
				warnPercentPH: "预警 %（默认 {n}）",
				warnBalancePH: "预警 {cur}（默认 {n}）",
				localOnly: "设置仅保存在本浏览器",
				resetDefaults: "恢复默认",
				credTitle: "火山引擎 AK/SK",
				credConfigured: "已配置：{masked}",
				credMissing: "未配置——卡片不会显示账户余额",
				credAkLabel: "Access Key ID",
				credSkLabel: "Secret Access Key",
				credAkPH: "AKLT…（留空则不修改）",
				credSkPH: "留空则不修改",
				credHint: "在火山引擎控制台「访问控制 → API 访问密钥」创建。AK/SK 只保存在本机 DSH 凭据库，不写入浏览器，也不会上传；浏览器端只显示 AK 掩码。",
				credSave: "保存并测试",
				credTesting: "测试中…",
				credTest: "测试连接",
				credClear: "清除",
				credSaved: "已保存并验证，当前可用余额 {cur}{amount}",
				credTestOk: "连接正常，当前可用余额 {cur}{amount}",
				credTestFail: "连接失败：{msg}",
				credSaveFail: "保存失败：{msg}",
				credCleared: "已清除本机保存的 AK/SK",
				credNeedBoth: "请把 AK 与 SK 都填写完整",
				credNeedAkFirst: "先填写 Access Key ID",
				credConfigure: "配置 AK/SK",
				credHintShort: "未配置火山引擎 AK/SK，无法显示账户余额"
			},
			en: {
				title: "Model quota",
				tabOverview: "Quota",
				tabSettings: "Settings",
				capsuleBalance: "Volc balance",
				openConsole: "Open in Volcengine console",
				balanceAvailable: "Available balance",
				notConfiguredTitle: "No access key",
				readFailed: "Read failed",
				loading: "Syncing…",
				retry: "Retry",
				moreProviders: "{n} more providers",
				settingsCredentials: "Credentials",
				settingsDisplay: "Display",
				settingsRefresh: "Refresh",
				settingsCollapsed: "Collapsed",
				credChange: "Change",
				credHide: "Hide",
				expand: "Expand model quota",
				collapse: "Collapse model quota",
				refresh: "Refresh model quota",
				openSettings: "Open settings",
				closeSettings: "Close settings",
				allHidden: "all hidden",
				emptyHint: "All providers are hidden — re-enable them in settings",
				updatedAt: "Updated {time}",
				loadFailed: "Failed to load config",
				fetchFailed: "Query failed",
				usageUnavailable: "Usage unavailable",
				quotaUnavailable: "Quota unavailable",
				balanceUnavailable: "Balance unavailable",
				noticeAgentPlanAbsent: "Not subscribed",
				noticeAgentPlanAbsentHint: "This account has no Ark Agent Plan — usage appears here once subscribed",
				balanceAbnormal: "Malformed balance data",
				winRolling: "Roll", winWeekly: "Wk", winMonthly: "Mo", winSearch: "Search",
				settingsCapsule: "Capsule display",
				capsuleName: "Collapsed value",
				capsuleAuto: "Auto (highest)",
				capsuleRolling: "5h window",
				capsuleWeekly: "Weekly window",
				capsuleMax: "Highest window",
				noWinData: "no data",
				peakUsage: "Used {pct}%",
				peakUsageWaiting: "Used {pct}% — awaiting reset {time}",
				nextReset: "Next reset {time}",
				balanceCritical: "Top-up suggested",
				balanceWarn: "Running low",
				balanceOk: "Healthy",
				balanceRich: "Plenty",
				settingsProviders: "Providers",
				settingsNoProviders: "(no providers configured)",
				settingsInterval: "Refresh interval",
				settingsAutoRefresh: "Auto refresh",
				followConfig: "Follow config",
				secondsSuffix: "{n}s",
				minutesSuffix: "{n} min",
				settingsProxy: "Proxy",
				proxyHint: "http(s) proxy URL — only this provider is queried through it",
				proxyConfigured: "Configured proxy: {name} (empty keeps it)",
				proxyDirect: "http://127.0.0.1:7890 (empty = direct)",
				settingsThresholds: "Warn thresholds",
				warnPercentPH: "Warn % (default {n})",
				warnBalancePH: "Warn {cur} (default {n})",
				localOnly: "Stored in this browser only",
				resetDefaults: "Reset defaults",
				credTitle: "Volcengine AK/SK",
				credConfigured: "Configured: {masked}",
				credMissing: "Not configured — the account balance row stays hidden",
				credAkLabel: "Access Key ID",
				credSkLabel: "Secret Access Key",
				credAkPH: "AKLT… (empty = keep current)",
				credSkPH: "empty = keep current",
				credHint: "Create the pair in the Volcengine console under Access Control → API Access Keys. It is stored only in this machine's DSH credential store — never in the browser and never uploaded; the browser only sees a masked AK.",
				credSave: "Save and test",
				credTesting: "Testing…",
				credTest: "Test connection",
				credClear: "Clear",
				credSaved: "Saved and verified — available balance {cur}{amount}",
				credTestOk: "Connection OK — available balance {cur}{amount}",
				credTestFail: "Connection failed: {msg}",
				credSaveFail: "Save failed: {msg}",
				credCleared: "Removed the AK/SK stored on this machine",
				credNeedBoth: "Fill in both the AK and the SK",
				credNeedAkFirst: "Enter the Access Key ID first",
				credConfigure: "Configure AK/SK",
				credHintShort: "No Volcengine AK/SK configured — account balance unavailable"
			}
		};

		var CSS = [
			"#dsh-volc-balance-card{--vbc-surface:var(--dsw-alias-bg-layer-2,#fff);--vbc-surface-soft:var(--dsw-alias-bg-layer-1,#f6f7f9);--vbc-line:var(--dsw-alias-border-l1,rgba(0,0,0,.07));--vbc-line-strong:var(--dsw-alias-border-l2,rgba(0,0,0,.13));--vbc-text:var(--dsw-alias-label-primary,#1b1b1c);--vbc-text-2:var(--dsw-alias-label-secondary,#61666b);--vbc-text-3:var(--dsw-alias-label-tertiary,#818590);--vbc-caption:var(--dsw-alias-label-caption,#9a9ea6);--vbc-accent:var(--dsw-alias-brand-primary,#4176e6);--vbc-success:var(--dsw-alias-state-success-primary,#22c55e);--vbc-warn:var(--dsw-alias-state-warn-primary,#f59e0b);--vbc-error:var(--dsw-alias-state-error-primary,#ef4444);position:static;width:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:stretch;pointer-events:auto;color:var(--vbc-text);font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,\"Segoe UI\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif);font-size:13px;line-height:1.45}",
			"#dsh-quota-capsule{position:relative;display:flex;flex:1 1 100%;min-width:0;align-items:center;gap:5px;height:34px;padding:0 8px;box-sizing:border-box;overflow:hidden;border:1px solid var(--vbc-line);border-radius:10px;background:var(--vbc-surface-soft);cursor:pointer;font:inherit;transition:background-color 120ms ease,border-color 120ms ease}",
			"#dsh-quota-capsule:hover{background:var(--vbc-surface);border-color:var(--vbc-line-strong)}",
			"#dsh-quota-capsule .dsh-capsule-hit{position:absolute;inset:0;z-index:0;width:100%;height:100%;padding:0;border:0;border-radius:inherit;background:transparent;cursor:pointer}",
			"#dsh-quota-capsule .dsh-capsule-hit:focus-visible{outline:2px solid var(--vbc-accent);outline-offset:2px}",
			"#dsh-quota-capsule .dsh-capsule-dot{position:relative;z-index:1;flex:none;width:7px;height:7px;border:2px solid var(--vbc-text-3);border-radius:50%;background:transparent;pointer-events:none}",
			"#dsh-quota-capsule .dsh-capsule-dot.state-ok{border-color:var(--vbc-success)}",
			"#dsh-quota-capsule .dsh-capsule-dot.state-warn{border-color:var(--vbc-warn)}",
			"#dsh-quota-capsule .dsh-capsule-dot.state-error{border-color:var(--vbc-error)}",
			"#dsh-quota-capsule .dsh-capsule-dot.state-loading{border-color:var(--vbc-text-3);animation:dsh-quota-breathe 1.4s ease-in-out infinite}",
			"#dsh-quota-capsule .dsh-capsule-dot.state-idle{border-color:var(--vbc-text-3)}",
			"#dsh-quota-capsule .dsh-capsule-label{position:relative;z-index:1;color:var(--vbc-text-2);font-size:11px;font-weight:500;line-height:1;white-space:nowrap;pointer-events:none}",
			"#dsh-quota-capsule .dsh-capsule-ext{position:relative;z-index:2;display:inline-grid;place-items:center;flex:none;width:20px;height:20px;margin:0 -1px;border-radius:6px;color:var(--vbc-text-3);text-decoration:none;transition:color 120ms ease,background-color 120ms ease}",
			"#dsh-quota-capsule .dsh-capsule-ext:hover{color:var(--vbc-accent);background:color-mix(in srgb,var(--vbc-accent) 10%,transparent)}",
			"#dsh-quota-capsule .dsh-capsule-ext:focus-visible{outline:2px solid var(--vbc-accent);outline-offset:1px}",
			"#dsh-quota-capsule .dsh-capsule-colon{position:relative;z-index:1;color:var(--vbc-text-3);font-size:11px;line-height:1;pointer-events:none}",
			"#dsh-quota-capsule .dsh-capsule-value{position:relative;z-index:1;min-width:0;overflow:hidden;color:var(--vbc-text);font-size:12px;font-weight:650;line-height:1;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap;pointer-events:none}",
			"#dsh-quota-capsule .dsh-capsule-value.state-warn{color:var(--vbc-warn)}",
			"#dsh-quota-capsule .dsh-capsule-value.state-error{color:var(--vbc-error)}",
			"#dsh-quota-capsule .dsh-capsule-more{position:relative;z-index:1;flex:none;display:inline-flex;align-items:center;height:16px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-overlay,#ebeef2);color:var(--vbc-text-3);font-size:10px;font-weight:500;line-height:1;pointer-events:none}",
			"#dsh-quota-capsule .dsh-capsule-chevron{position:relative;z-index:1;flex:none;margin-left:auto;color:var(--vbc-text-3);pointer-events:none}",
			"#dsh-quota-card{display:flex;flex-direction:column;width:100%;max-height:min(70vh,560px);margin-top:8px;overflow:hidden;border:1px solid var(--vbc-line);border-radius:14px;background:var(--vbc-surface);box-shadow:var(--dsw-shadow-lv2,0 4px 16px rgba(15,17,21,.05));box-sizing:border-box}",
			"#dsh-quota-card .dsh-quota-header{display:flex;align-items:center;justify-content:space-between;flex:none;min-height:32px;padding:10px 12px 0;box-sizing:border-box;user-select:none}",
			"#dsh-quota-card .dsh-quota-title{color:var(--vbc-text);font-size:13px;font-weight:600;line-height:20px}",
			"#dsh-quota-card .dsh-quota-actions{display:flex;gap:2px;margin:-3px -4px -3px 0}",
			"#dsh-quota-card .dsh-quota-icon{display:inline-grid;place-items:center;width:26px;height:26px;padding:0;border:0;border-radius:8px;color:var(--vbc-text-2);background:transparent;cursor:pointer;transition:background-color 120ms ease,color 120ms ease}",
			"#dsh-quota-card .dsh-quota-icon:hover{color:var(--vbc-text);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}",
			"#dsh-quota-card .dsh-quota-icon:focus-visible{outline:2px solid var(--vbc-accent);outline-offset:0}",
			"#dsh-quota-card .dsh-quota-icon:disabled{cursor:default;opacity:.55}",
			"#dsh-quota-card .dsh-quota-icon.is-loading{animation:dsh-quota-spin .7s linear infinite}",
			"#dsh-quota-card .dsh-tabs{display:flex;flex:none;gap:14px;padding:2px 12px 0;border-bottom:1px solid var(--vbc-line)}",
			"#dsh-quota-card .dsh-tab{position:relative;padding:5px 0 7px;border:0;background:transparent;color:var(--vbc-text-3);font:inherit;font-size:12px;font-weight:500;line-height:16px;cursor:pointer}",
			"#dsh-quota-card .dsh-tab:hover{color:var(--vbc-text-2)}",
			"#dsh-quota-card .dsh-tab.is-active{color:var(--vbc-text)}",
			"#dsh-quota-card .dsh-tab.is-active::after{content:\"\";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:1px;background:var(--vbc-accent)}",
			"#dsh-quota-card .dsh-tab:focus-visible{outline:2px solid var(--vbc-accent);outline-offset:2px;border-radius:4px}",
			"#dsh-quota-card .dsh-quota-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:12px 12px 10px}",
			"#dsh-quota-card .dsh-quota-body::-webkit-scrollbar{width:4px}",
			"#dsh-quota-card .dsh-quota-body::-webkit-scrollbar-thumb{border-radius:999px;background:var(--vbc-line-strong)}",
			"#dsh-quota-card .dsh-overview{display:flex;flex-direction:column;gap:10px}",
			"#dsh-quota-card .dsh-provider{width:100%;padding:2px 0}",
			"#dsh-quota-card .dsh-provider-main{display:flex;flex-direction:column;gap:4px;min-width:0}",
			"#dsh-quota-card .dsh-provider-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:20px}",
			"#dsh-quota-card .dsh-provider-name-wrap{display:flex;align-items:center;gap:2px;min-width:0}",
			"#dsh-quota-card .dsh-provider-name{overflow:hidden;color:var(--vbc-text);font-size:12px;font-weight:500;line-height:18px;text-overflow:ellipsis;white-space:nowrap}",
			"#dsh-quota-card .dsh-provider-ext{display:inline-grid;place-items:center;flex:none;width:18px;height:18px;border-radius:5px;color:var(--vbc-text-3);text-decoration:none;transition:color 120ms ease,background-color 120ms ease}",
			"#dsh-quota-card .dsh-provider-ext:hover{color:var(--vbc-accent);background:color-mix(in srgb,var(--vbc-accent) 10%,transparent)}",
			"#dsh-quota-card .dsh-provider-ext:focus-visible{outline:2px solid var(--vbc-accent);outline-offset:1px}",
			"#dsh-quota-card .dsh-provider-value{flex:none;color:var(--vbc-text);font-size:13px;font-weight:600;line-height:20px;font-variant-numeric:tabular-nums}",
			"#dsh-quota-card .state-warn .dsh-provider-value{color:var(--vbc-warn)}",
			"#dsh-quota-card .state-error .dsh-provider-value{color:var(--vbc-error)}",
			"#dsh-quota-card .dsh-status-chip{flex:none;display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;font-size:10px;font-weight:500;line-height:1;white-space:nowrap}",
			"#dsh-quota-card .state-ok .dsh-status-chip{color:var(--vbc-success);background:rgba(34,197,94,.12);background:color-mix(in srgb,var(--vbc-success) 13%,transparent)}",
			"#dsh-quota-card .state-warn .dsh-status-chip{color:var(--vbc-warn);background:rgba(245,158,11,.12);background:color-mix(in srgb,var(--vbc-warn) 14%,transparent)}",
			"#dsh-quota-card .state-error .dsh-status-chip{color:var(--vbc-error);background:rgba(239,68,68,.10);background:color-mix(in srgb,var(--vbc-error) 12%,transparent)}",
			"#dsh-quota-card .state-info .dsh-status-chip{color:var(--vbc-accent);background:rgba(65,118,230,.10);background:color-mix(in srgb,var(--vbc-accent) 12%,transparent)}",
			"#dsh-quota-card .state-idle .dsh-status-chip{color:var(--vbc-text-3);background:var(--dsw-alias-bg-overlay,#ebeef2);background:color-mix(in srgb,var(--vbc-text-3) 12%,transparent)}",
			"#dsh-quota-card .dsh-balance-amount{margin-top:1px;color:var(--vbc-text);font-size:26px;font-weight:650;line-height:1.15;letter-spacing:-.02em;font-variant-numeric:tabular-nums}",
			"#dsh-quota-card .dsh-balance-currency{margin-right:1px;font-size:.68em;font-weight:600;color:var(--vbc-text-2)}",
			"#dsh-quota-card .state-warn .dsh-balance-amount{color:var(--vbc-warn)}",
			"#dsh-quota-card .state-error .dsh-balance-amount{color:var(--vbc-error)}",
			"#dsh-quota-card .dsh-balance-caption{margin-top:0;color:var(--vbc-text-3);font-size:10.5px;line-height:15px}",
			"#dsh-quota-card .dsh-provider-sub{margin-top:3px;color:var(--vbc-text-2);font-size:11px;line-height:16px}",
			"#dsh-quota-card .dsh-progress{position:relative;width:100%;height:6px;margin-top:7px;overflow:hidden;border-radius:999px;background:var(--dsw-alias-bg-overlay,#ebeef2)}",
			"#dsh-quota-card .dsh-progress-fill{height:100%;width:0;border-radius:inherit;background:var(--vbc-accent);transition:width 300ms ease,background-color 160ms ease}",
			"#dsh-quota-card .state-warn .dsh-progress-fill{background:var(--vbc-warn)}",
			"#dsh-quota-card .state-error .dsh-progress-fill{background:var(--vbc-error)}",
			"#dsh-quota-card .dsh-window-grid{display:grid;gap:4px;margin-top:8px}",
			"#dsh-quota-card .dsh-window{min-width:0;padding:5px 7px;border-radius:8px;background:var(--vbc-surface-soft)}",
			"#dsh-quota-card .dsh-window-label{display:block;overflow:hidden;color:var(--vbc-text-3);font-size:10px;line-height:14px;text-overflow:ellipsis;white-space:nowrap}",
			"#dsh-quota-card .dsh-window-value{display:block;margin-top:1px;color:var(--vbc-text);font-size:12px;font-weight:600;line-height:16px;font-variant-numeric:tabular-nums}",
			"#dsh-quota-card .dsh-usage-caption{margin-top:7px;color:var(--vbc-text-3);font-size:10.5px;line-height:15px}",
			"#dsh-quota-card .dsh-quota-divider{height:1px;margin:12px 0;background:var(--vbc-line)}",
			"#dsh-quota-card .dsh-quota-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding-top:9px;border-top:1px solid var(--vbc-line);color:var(--vbc-text-3);font-size:10.5px;line-height:15px}",
			"#dsh-quota-card .dsh-quota-foot-time{font-variant-numeric:tabular-nums}",
			"#dsh-quota-card .dsh-error-banner{display:flex;align-items:flex-start;gap:7px;padding:8px 10px;border-radius:10px;background:rgba(239,68,68,.08);background:color-mix(in srgb,var(--vbc-error) 10%,transparent);color:var(--vbc-error);font-size:11px;line-height:16px;word-break:break-word}",
			"#dsh-quota-card .dsh-error-banner .dsh-icon{flex:none;margin-top:1px}",
			"#dsh-quota-card .dsh-error-text{flex:1;min-width:0}",
			"#dsh-quota-card .dsh-empty{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:12px;border:1px dashed var(--vbc-line-strong);border-radius:10px;background:var(--vbc-surface-soft);box-sizing:border-box}",
			"#dsh-quota-card .dsh-empty-icon{display:inline-grid;place-items:center;width:24px;height:24px;margin-bottom:3px;border-radius:7px;background:color-mix(in srgb,var(--vbc-accent) 10%,transparent);color:var(--vbc-accent)}",
			"#dsh-quota-card .dsh-empty-title{color:var(--vbc-text);font-size:12px;font-weight:600;line-height:17px}",
			"#dsh-quota-card .dsh-empty-body{color:var(--vbc-text-3);font-size:10.5px;line-height:15px}",
			"#dsh-quota-card .dsh-empty-action{margin-top:5px;height:26px;padding:0 10px;border:1px solid var(--vbc-accent);border-radius:7px;background:var(--vbc-accent);color:#fff;font:inherit;font-size:11px;line-height:24px;cursor:pointer}",
			"#dsh-volc-balance-card .dsh-rail{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:32px;height:32px;margin:0 auto;box-sizing:border-box;border:1px solid var(--vbc-line);border-radius:9px;background:var(--vbc-surface-soft);color:var(--vbc-text-2);text-decoration:none;transition:background-color 120ms ease,color 120ms ease}",
			"#dsh-volc-balance-card .dsh-rail:hover{background:var(--vbc-surface);color:var(--vbc-text)}",
			"#dsh-volc-balance-card .dsh-rail:focus-visible{outline:2px solid var(--vbc-accent);outline-offset:2px}",
			"#dsh-volc-balance-card .dsh-rail-mark{font-size:12px;font-weight:700;line-height:1}",
			"#dsh-volc-balance-card .dsh-rail-dot{width:6px;height:6px;border-radius:50%;background:var(--vbc-text-3)}",
			"#dsh-volc-balance-card .dsh-rail-dot.state-ok{background:var(--vbc-success)}",
			"#dsh-volc-balance-card .dsh-rail-dot.state-idle{background:var(--vbc-text-3)}",
			"#dsh-volc-balance-card .dsh-rail-dot.state-warn{background:var(--vbc-warn)}",
			"#dsh-volc-balance-card .dsh-rail-dot.state-error{background:var(--vbc-error)}",
			"#dsh-quota-card .dsh-loading{display:flex;align-items:center;gap:8px;padding:10px 0;color:var(--vbc-text-3);font-size:11px;line-height:16px}",
			"#dsh-quota-card .dsh-loading-dot{flex:none;width:8px;height:8px;box-sizing:border-box;border:1.5px solid var(--vbc-line-strong);border-top-color:var(--vbc-accent);border-radius:50%;animation:dsh-quota-spin .8s linear infinite}",
			"#dsh-quota-card .dsh-cred-callout{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding:8px 10px;border:1px solid var(--vbc-line);border-radius:10px;background:var(--vbc-surface-soft);box-sizing:border-box}",
			"#dsh-quota-card .dsh-cred-callout-text{min-width:0;color:var(--vbc-text-3);font-size:10.5px;line-height:15px}",
			"#dsh-quota-card .dsh-text-btn{flex:none;padding:3px 8px;border:0;border-radius:6px;background:transparent;color:var(--vbc-accent);font:inherit;font-size:11px;line-height:16px;cursor:pointer}",
			"#dsh-quota-card .dsh-text-btn:hover{background:color-mix(in srgb,var(--vbc-accent) 10%,transparent)}",
			"#dsh-quota-card .dsh-text-btn:focus-visible{outline:2px solid var(--vbc-accent);outline-offset:1px}",
			"#dsh-quota-card .dsh-settings{display:flex;flex-direction:column}",
			"#dsh-quota-card .dsh-settings-group{padding:9px 0;border-top:1px solid var(--vbc-line)}",
			"#dsh-quota-card .dsh-settings-group:first-child{padding-top:0;border-top:0}",
			"#dsh-quota-card .dsh-group-title{margin-bottom:3px;color:var(--vbc-text-3);font-size:10.5px;font-weight:600;line-height:16px;letter-spacing:.02em}",
			"#dsh-quota-card .dsh-setting-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:30px;color:var(--vbc-text);font-size:12px;line-height:18px}",
			"#dsh-quota-card .dsh-setting-name{overflow:hidden;color:var(--vbc-text-2);text-overflow:ellipsis;white-space:nowrap}",
			"#dsh-quota-card .dsh-setting-input,#dsh-quota-card .dsh-setting-select{height:30px;padding:0 8px;border:1px solid var(--vbc-line-strong);border-radius:8px;background:var(--vbc-surface-soft);color:var(--vbc-text);font:inherit;font-size:11.5px;line-height:28px;box-sizing:border-box}",
			"#dsh-quota-card .dsh-setting-input:focus,#dsh-quota-card .dsh-setting-select:focus{outline:none;border-color:var(--vbc-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--vbc-accent) 18%,transparent)}",
			"#dsh-quota-card .dsh-setting-select{width:112px;padding-right:24px;appearance:none;-webkit-appearance:none;background-image:none;cursor:pointer}",
			"#dsh-quota-card .dsh-select-wrap{position:relative;display:inline-flex;align-items:center;flex:none}",
			"#dsh-quota-card .dsh-select-wrap::after{content:\"\";position:absolute;right:9px;width:6px;height:6px;border-right:1.5px solid var(--vbc-text-3);border-bottom:1.5px solid var(--vbc-text-3);transform:translateY(-2px) rotate(45deg);pointer-events:none}",
			"#dsh-quota-card .dsh-number{width:64px;text-align:right;font-variant-numeric:tabular-nums}",
			"#dsh-quota-card .dsh-switch{position:relative;flex:none;width:30px;height:18px;padding:0;border:0;border-radius:999px;background:var(--vbc-line-strong);cursor:pointer;transition:background-color 150ms ease}",
			"#dsh-quota-card .dsh-switch.is-on{background:var(--vbc-accent)}",
			"#dsh-quota-card .dsh-switch-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform 150ms ease}",
			"#dsh-quota-card .dsh-switch.is-on .dsh-switch-thumb{transform:translateX(12px)}",
			"#dsh-quota-card .dsh-switch:focus-visible{outline:2px solid var(--vbc-accent);outline-offset:2px}",
			"#dsh-quota-card .dsh-cred-summary{display:flex;align-items:center;gap:6px;min-height:30px}",
			"#dsh-quota-card .dsh-cred-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--vbc-text-3)}",
			"#dsh-quota-card .dsh-cred-dot.is-on{background:var(--vbc-success)}",
			"#dsh-quota-card .dsh-cred-status{flex:1;min-width:0;overflow:hidden;color:var(--vbc-text-2);font-size:11px;line-height:16px;text-overflow:ellipsis;white-space:nowrap}",
			"#dsh-quota-card .dsh-cred-toggle{flex:none;padding:3px 6px;border:0;border-radius:6px;background:transparent;color:var(--vbc-accent);font:inherit;font-size:10.5px;line-height:16px;cursor:pointer}",
			"#dsh-quota-card .dsh-cred-toggle:hover{background:color-mix(in srgb,var(--vbc-accent) 10%,transparent)}",
			"#dsh-quota-card .dsh-cred-form{display:flex;flex-direction:column;gap:7px;margin-top:6px}",
			"#dsh-quota-card .dsh-field{display:flex;flex-direction:column;gap:3px}",
			"#dsh-quota-card .dsh-field-label{color:var(--vbc-text-3);font-size:10px;line-height:14px}",
			"#dsh-quota-card .dsh-cred-input{width:100%;height:30px;padding:0 8px;border:1px solid var(--vbc-line-strong);border-radius:8px;background:var(--vbc-surface-soft);color:var(--vbc-text);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:28px;box-sizing:border-box}",
			"#dsh-quota-card .dsh-cred-input:focus{outline:none;border-color:var(--vbc-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--vbc-accent) 18%,transparent)}",
			"#dsh-quota-card .dsh-cred-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:2px}",
			"#dsh-quota-card .dsh-cred-btn{height:28px;padding:0 10px;border:1px solid var(--vbc-accent);border-radius:7px;background:var(--vbc-accent);color:#fff;font:inherit;font-size:11px;line-height:26px;cursor:pointer}",
			"#dsh-quota-card .dsh-cred-btn:hover{opacity:.9}",
			"#dsh-quota-card .dsh-cred-btn:disabled{opacity:.5;cursor:default}",
			"#dsh-quota-card .dsh-cred-secondary{height:28px;padding:0 9px;border:1px solid var(--vbc-line-strong);border-radius:7px;background:transparent;color:var(--vbc-text-2);font:inherit;font-size:11px;line-height:26px;cursor:pointer}",
			"#dsh-quota-card .dsh-cred-secondary:hover{color:var(--vbc-text);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}",
			"#dsh-quota-card .dsh-cred-secondary:disabled{opacity:.5;cursor:default}",
			"#dsh-quota-card .dsh-cred-danger{height:28px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--vbc-error);font:inherit;font-size:10.5px;line-height:26px;cursor:pointer}",
			"#dsh-quota-card .dsh-cred-danger:hover{background:color-mix(in srgb,var(--vbc-error) 10%,transparent)}",
			"#dsh-quota-card .dsh-cred-msg{margin-top:1px;font-size:10.5px;line-height:15px;word-break:break-word}",
			"#dsh-quota-card .dsh-cred-msg.is-ok{color:var(--vbc-success)}",
			"#dsh-quota-card .dsh-cred-msg.is-error{color:var(--vbc-error)}",
			"#dsh-quota-card .dsh-cred-hint{color:var(--vbc-text-3);font-size:10px;line-height:15px}",
			"#dsh-quota-card .dsh-settings-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px;padding-top:9px;border-top:1px solid var(--vbc-line)}",
			"#dsh-quota-card .dsh-settings-footer .dsh-setting-hint{color:var(--vbc-text-3);font-size:10px;line-height:15px}",
			"#dsh-quota-card .dsh-setting-reset{padding:3px 8px;border:1px solid var(--vbc-line-strong);border-radius:6px;background:transparent;color:var(--vbc-text-2);font:inherit;font-size:10.5px;line-height:16px;cursor:pointer}",
			"#dsh-quota-card .dsh-setting-reset:hover{color:var(--vbc-text);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}",
			"#dsh-quota-card .dsh-icon{display:block;flex:none}",
			"@keyframes dsh-quota-spin{to{transform:rotate(360deg)}}",
			"@keyframes dsh-quota-breathe{0%,100%{opacity:.45}50%{opacity:1}}",
			"@media (prefers-reduced-motion:reduce){#dsh-volc-balance-card *{animation:none !important;transition:none !important}}",
		].join("\n");

		var CAPSULE_CHOICES = [
			{ value: "auto" },
			{ value: "rolling" },
			{ value: "weekly" },
			{ value: "max" }
		];
		var CAPSULE_MODES = { auto: true, rolling: true, weekly: true, max: true };

		function readSettings() {
			var base = { hidden: {}, refreshMs: null, warn: {}, proxy: {}, capsuleMode: null };
			try {
				var raw = globalThis.localStorage.getItem(STORAGE_KEY);
				if (raw === null) return base;
				var parsed = JSON.parse(raw);
				if (parsed && typeof parsed === "object") {
					if (parsed.hidden && typeof parsed.hidden === "object") base.hidden = parsed.hidden;
					if (typeof parsed.refreshMs === "number" && Number.isFinite(parsed.refreshMs) && parsed.refreshMs >= 5000) base.refreshMs = parsed.refreshMs;
					if (parsed.warn && typeof parsed.warn === "object") base.warn = parsed.warn;
					if (parsed.proxy && typeof parsed.proxy === "object") base.proxy = parsed.proxy;
					if (typeof parsed.capsuleMode === "string" && CAPSULE_MODES[parsed.capsuleMode]) base.capsuleMode = parsed.capsuleMode;
				}
			} catch (err) {}
			return base;
		}

		function writeSettings(settings) {
			try {
				globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
			} catch (err) {}
		}

		/** Absolute reset time in 24h local format: 2026-08-15 14:00. */
		function fmtNextReset(t, iso) {
			var d = new Date(iso);
			if (!isFinite(d.getTime())) return "";
			var pad = function (n) { return (n < 10 ? "0" : "") + n; };
			return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
		}

		/** Effective balance tiers with the local warn override applied. */
		function effectiveTiers(spec, warnOverride) {
			var tiers = spec.balanceTiers || { critical: 10, warn: 20, healthy: 50 };
			if (typeof warnOverride === "number" && Number.isFinite(warnOverride) && warnOverride >= 0) {
				return { critical: warnOverride / 2, warn: warnOverride, healthy: tiers.healthy };
			}
			return tiers;
		}

		/** Effective usage thresholds with the local warn override applied. */
		function effectivePercents(spec, warnOverride) {
			var warn = typeof warnOverride === "number" && Number.isFinite(warnOverride) && warnOverride >= 0 ? warnOverride : (spec.warnPercent || 70);
			var error = Math.max(spec.errorPercent || 90, warn + 1);
			return { warn: warn, error: Math.min(error, 100) };
		}

		/**
		 * Notice ids the host may attach to a view. A notice is a normal state
		 * ("this plan is not subscribed"), not a failure, so it renders with the
		 * neutral idle styling and a translated label instead of a red error.
		 */
		var NOTICE_TEXT = {
			"agent-plan-absent": "noticeAgentPlanAbsent"
		};

		/** Localized label for a host notice id, falling back to the host text. */
		function noticeCopy(t, id, fallback) {
			var key = NOTICE_TEXT[id];
			var text = key ? t(key) : "";
			return text && text !== key ? text : String(fallback || id || "—");
		}

		/**
		 * Row view model: status + texts for one provider spec + its
		 * host-normalized view (kind balance / usage / info). Threshold
		 * judgement stays client-side so local settings overrides apply
		 * without a refetch.
		 */
		function rowView(t, spec, entry, warnOverride, modeOverride) {
			var kind = spec.kind || "balance";
			var unavailable = kind === "usage" ? t("usageUnavailable") : kind === "info" ? t("quotaUnavailable") : t("balanceUnavailable");
			if (!entry || entry.error) {
				return {
					kind: kind, status: "error", summary: "—", value: "—",
					sub: unavailable, usageText: null, windows: [], reset: "", barPercent: 0, caption: "",
					title: entry && entry.error ? String(entry.error) : "no data"
				};
			}
			var view = entry.view || {};
			// A host "notice" (e.g. agent-plan-absent) carries the same `info`
			// shape as a plain info row but means "nothing is wrong, there is just
			// no subscription yet": drop the error styling and use a neutral chip.
			if (view.notice) {
				var noticeText = noticeCopy(t, view.notice, view.text);
				var noticeHint = view.notice === "agent-plan-absent" ? t("noticeAgentPlanAbsentHint") : "";
				return {
					kind: "info", status: "idle", notice: view.notice,
					summary: noticeText, value: null,
					sub: noticeHint || null, usageText: null, windows: [], reset: "",
					barPercent: 0, caption: "",
					title: view.title || noticeHint || noticeText
				};
			}
			if (view.kind === "usage") {
				var w = view.windows || {};
				var winPct = function (name) {
					var win = w[name];
					return win && typeof win.percent === "number" && Number.isFinite(win.percent) ? win.percent : null;
				};
				var rp = winPct("rolling");
				var wp = winPct("weekly");
				var mp = winPct("monthly");
				var present = [rp, wp, mp].filter(function (v) { return v !== null; });
				var high = present.length ? Math.max.apply(null, present) : 0;
				var localizeWin = function (label) {
					return label === "滚" ? t("winRolling") : label === "周" ? t("winWeekly") : label === "月" ? t("winMonthly") : label === "搜索" ? t("winSearch") : label;
				};
				var specLabels = spec.windowLabels || {};
				var labels = {
					rolling: localizeWin(specLabels.rolling || t("winRolling")),
					weekly: localizeWin(specLabels.weekly || t("winWeekly")),
					monthly: localizeWin(specLabels.monthly || t("winMonthly"))
				};
				var pcts = effectivePercents(spec, warnOverride);
				// Capsule display mode (issue #2 follow-up): which window the
				// collapsed capsule follows. auto/max keep the historical
				// highest-window glance; rolling/weekly pin it to one window and
				// the status dot / bar / caption align with the SHOWN value (a
				// 5h capsule no longer glows warn because the weekly pool is
				// high). A window the plan does not carry falls back to the
				// highest, so nothing regresses for single-window plans.
				var mode = modeOverride ?? spec.capsuleMode;
				if (mode !== "rolling" && mode !== "weekly") mode = "auto";
				var shownPct, shownWin;
				if (mode === "rolling" && rp !== null) { shownPct = rp; shownWin = w.rolling; }
				else if (mode === "weekly" && wp !== null) { shownPct = wp; shownWin = w.weekly; }
				else { shownPct = high; shownWin = null; }
				var status = shownPct >= pcts.error ? "error" : shownPct >= pcts.warn ? "warn" : "ok";
				// Weekly absent -> the segment is dropped entirely; the search/MCP
				// lane unknown (null) -> "-%" instead of a fabricated 0%.
				var fmtWin = function (label, v) { return label + " " + (v === null ? "—" : v + "%"); };
				var titleLine = function (label, v, win) {
					return label + ": " + (v === null ? t("noWinData") : v + "% · " + t("nextReset", { time: fmtNextReset(t, win && win.resetsAt) }));
				};
				// Weekly-only plan windows have no rolling or monthly quota
				// (e.g. a weekly-only subscription). Drop the empty 滚 / 月 noise and
				// surface the weekly reset time inline: it otherwise lives
				// only in the hover title.
				var weeklyOnly = rp === null && wp !== null && mp === null;
				var textSegs;
				if (weeklyOnly) {
					textSegs = [fmtWin(labels.weekly, wp)];
					if (w.weekly && w.weekly.resetsAt) {
						textSegs.push(t("nextReset", { time: fmtNextReset(t, w.weekly.resetsAt) }));
					}
				} else {
					textSegs = [fmtWin(labels.rolling, rp)];
					if (wp !== null) textSegs.push(fmtWin(labels.weekly, wp));
					textSegs.push(labels.monthly + " " + (mp === null ? "-%" : mp + "%"));
				}
				var titleLines = [titleLine(labels.rolling, rp, w.rolling)];
				if (wp !== null) titleLines.push(titleLine(labels.weekly, wp, w.weekly));
				titleLines.push(titleLine(labels.monthly, mp, w.monthly));
				// At 100% the caption appends the reset time of the exhausted
				// window — the SHOWN window first, then any exhausted one, then
				// any window's reset as fallback:
				//   当前已使用 100% 等待重置 2026-08-15 16:00
				var exhaustedReset = null;
				if (shownPct >= 100) {
					var cands = [];
					if (shownWin && shownWin.resetsAt) cands.push(shownWin.resetsAt);
					if (rp !== null && rp >= 100 && w.rolling && w.rolling.resetsAt) cands.push(w.rolling.resetsAt);
					if (wp !== null && wp >= 100 && w.weekly && w.weekly.resetsAt) cands.push(w.weekly.resetsAt);
					if (mp !== null && mp >= 100 && w.monthly && w.monthly.resetsAt) cands.push(w.monthly.resetsAt);
					if (cands.length === 0) {
						for (var wn = 0; wn < 3; wn++) {
							var wname = ["rolling", "weekly", "monthly"][wn];
							if (w[wname] && w[wname].resetsAt) { cands.push(w[wname].resetsAt); break; }
						}
					}
					exhaustedReset = cands.length > 0 ? cands[0] : null;
				}
				var windows = [];
				if (rp !== null) windows.push({ key: "rolling", label: labels.rolling, value: rp + "%" });
				if (wp !== null) windows.push({ key: "weekly", label: labels.weekly, value: wp + "%" });
				if (mp !== null) windows.push({ key: "monthly", label: labels.monthly, value: mp + "%" });
				return {
					kind: "usage", status: status, summary: shownPct + "%", value: null,
					usageText: textSegs.join(" · "),
					windows: windows,
					reset: weeklyOnly && w.weekly && w.weekly.resetsAt
						? t("nextReset", { time: fmtNextReset(t, w.weekly.resetsAt) })
						: "",
					barPercent: Math.min(Math.max(shownPct, 0), 100),
					caption: exhaustedReset !== null
						? t("peakUsageWaiting", { pct: shownPct, time: fmtNextReset(t, exhaustedReset) })
						: "",
					title: titleLines.join("\n")
				};
			}
			if (view.kind === "info") {
				var text = String(view.text || "—");
				return {
					kind: "info", status: "info",
					summary: text.length > 12 ? text.slice(0, 12) + "…" : text, value: null,
					sub: text, usageText: null, windows: [], reset: "", barPercent: 0, caption: "",
					title: view.title || ""
				};
			}
			var amount = Number(view.amount);
			if (!Number.isFinite(amount)) {
				return {
					kind: "balance", status: "error", summary: "—", value: "—",
					sub: t("balanceAbnormal"), usageText: null, windows: [], reset: "", barPercent: 0, caption: "",
					title: "non-numeric amount"
				};
			}
			var tiers = effectiveTiers(spec, warnOverride);
			var status2, sub;
			if (amount <= tiers.critical) { status2 = "error"; sub = t("balanceCritical"); }
			else if (amount <= tiers.warn) { status2 = "warn"; sub = t("balanceWarn"); }
			else if (amount <= tiers.healthy) { status2 = "ok"; sub = t("balanceOk"); }
			else { status2 = "ok"; sub = t("balanceRich"); }
			var shown = (spec.currency || "¥") + amount.toFixed(2);
			return {
				kind: "balance", status: status2, summary: shown,
				value: shown, currency: spec.currency || "¥", amountText: amount.toFixed(2),
				sub: sub, usageText: null, windows: [], reset: "", barPercent: 0, caption: "",
				title: view.title || ""
			};
		}

		var ICON_PATHS = {
			refresh: ["M21 12a9 9 0 1 1-2.64-6.36", "M21 3v6h-6"],
			"chevron-down": ["m6 9 6 6 6-6"],
			"chevron-up": ["m18 15-6-6-6 6"],
			"external-link": ["M14 3h7v7", "M21 3l-9 9", "M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"],
			key: ["M21 2l-2 2", "m15.5 7.5 3 3L22 7l-3-3", "m11 11 4.5-4.5", "M7.5 20.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z"],
			alert: ["M12 9v4", "M12 17h.01", "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"],
			check: ["M20 6 9 17l-5-5"]
		};

		function Icon(props) {
			var paths = ICON_PATHS[props.name] || [];
			return React.createElement("svg", {
				className: "dsh-icon" + (props.className ? " " + props.className : ""),
				width: props.size || 14,
				height: props.size || 14,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.7,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				focusable: "false"
			}, paths.map(function (d) {
				return React.createElement("path", { key: d, d: d });
			}));
		}

		/** 折叠态里把“方舟 Coding 套餐”压成“方舟”，完整名称留在 title / 展开态。 */
		function shortProviderName(label) {
			var text = String(label || "");
			var suffixes = [" Coding 套餐", " Agent 套餐", " 套餐", " 余额", " Balance", " Credits", " Coding Plan", " Plan"];
			for (var i = 0; i < suffixes.length; i++) {
				var suffix = suffixes[i];
				if (text.length > suffix.length && text.slice(-suffix.length) === suffix) {
					return text.slice(0, -suffix.length);
				}
			}
			return text;
		}

		function ConsoleLink(props) {
			return React.createElement("a", {
				className: props.className,
				href: CONSOLE_BALANCE_URL,
				target: "_blank",
				rel: "noopener noreferrer",
				title: props.label,
				"aria-label": props.label,
				onClick: function (event) { event.stopPropagation(); }
			}, React.createElement(Icon, { name: "external-link", size: props.size || 12 }));
		}

		function ProviderRow(props) {
			var spec = props.spec;
			var view = props.view;
			var t = props.t;
			var isBalance = view.kind === "balance";
			var nameChildren = [React.createElement("span", { key: "name", className: "dsh-provider-name" }, spec.label)];
			if (isBalance && spec.id === "volcengine-balance") {
				nameChildren.push(React.createElement(ConsoleLink, {
					key: "ext",
					className: "dsh-provider-ext",
					label: t("openConsole"),
					size: 11
				}));
			}
			var headChildren = [React.createElement("div", { key: "name", className: "dsh-provider-name-wrap" }, nameChildren)];
			if (isBalance) {
				if (view.sub) headChildren.push(React.createElement("span", { key: "chip", className: "dsh-status-chip" }, view.sub));
			} else if (view.notice) {
				// A notice is a state label, not a measurement: the muted chip keeps
				// it from reading like a value of its own.
				headChildren.push(React.createElement("span", { key: "chip", className: "dsh-status-chip" }, view.summary));
			} else {
				headChildren.push(React.createElement("span", { key: "value", className: "dsh-provider-value" }, view.summary));
			}
			var body = [React.createElement("div", { key: "head", className: "dsh-provider-head" }, headChildren)];
			if (isBalance) {
				if (view.amountText) {
					body.push(React.createElement("div", { key: "amount", className: "dsh-balance-amount" },
						React.createElement("span", { className: "dsh-balance-currency" }, view.currency),
						view.amountText));
					if (view.status !== "error") {
						body.push(React.createElement("div", { key: "cap", className: "dsh-balance-caption" }, t("balanceAvailable")));
					}
				} else {
					body.push(React.createElement("div", { key: "amount", className: "dsh-balance-amount" }, view.value));
				}
			} else if (view.kind === "usage") {
				body.push(React.createElement("div", { key: "track", className: "dsh-progress" },
					React.createElement("div", { className: "dsh-progress-fill", style: { width: view.barPercent + "%" } })));
				if (view.windows && view.windows.length > 0) {
					body.push(React.createElement("div", {
						key: "windows",
						className: "dsh-window-grid",
						style: { gridTemplateColumns: "repeat(" + view.windows.length + ",minmax(0,1fr))" }
					}, view.windows.map(function (win) {
						return React.createElement("div", { key: win.key, className: "dsh-window" },
							React.createElement("span", { className: "dsh-window-label" }, win.label),
							React.createElement("span", { className: "dsh-window-value" }, win.value));
					})));
				}
				if (view.caption) {
					body.push(React.createElement("div", { key: "cap", className: "dsh-usage-caption" }, view.caption));
				} else if (view.reset) {
					body.push(React.createElement("div", { key: "reset", className: "dsh-usage-caption" }, view.reset));
				}
			} else if (view.sub) {
				body.push(React.createElement("div", { key: "sub", className: "dsh-provider-sub" }, view.sub));
			}
			return React.createElement("div", { className: "dsh-provider state-" + view.status, title: view.title },
				React.createElement("div", { className: "dsh-provider-main" }, body));
		}

		function Switch(props) {
			return React.createElement("button", {
				className: "dsh-switch" + (props.checked ? " is-on" : ""),
				type: "button",
				role: "switch",
				"aria-checked": props.checked ? "true" : "false",
				"aria-label": props.label,
				onClick: props.onChange
			}, React.createElement("span", { className: "dsh-switch-thumb" }));
		}

		/**
		 * 火山引擎 AK/SK 配置区块。
		 *
		 * 凭据走 host 的 credentials 服务（写进 ~/.dsh/.credentials.yaml 的
		 * refs 段），所以 SK 既不会进 localStorage，也不会回到浏览器：本组件
		 * 只拿到掩码后的 AK 和配置来源。保存前 host 会先用这对凭据真调一次
		 * QueryBalanceAcct，验证通过才落盘，避免手误覆盖可用配置。
		 */
		function CredentialsSection(props) {
			var t = props.t;
			var call = props.call;
			var onSaved = props.onSaved;
			var statusState = React.useState(null);
			var status = statusState[0], setStatus = statusState[1];
			var akState = React.useState("");
			var ak = akState[0], setAk = akState[1];
			var skState = React.useState("");
			var sk = skState[0], setSk = skState[1];
			var busyState = React.useState("");
			var busy = busyState[0], setBusy = busyState[1];
			var msgState = React.useState(null);
			var msg = msgState[0], setMsg = msgState[1];
			var openState = React.useState(true);
			var open = openState[0], setOpen = openState[1];
			var initRef = React.useRef(false);

			function loadStatus() {
				return call("credential-status", null).then(function (r) {
					if (r && r.ok) setStatus(r.value);
				}).catch(function () { /* host may be mid-load */ });
			}
			React.useEffect(function () { loadStatus(); }, []);
			// 已配置时首屏收起表单；只自动执行一次，保存后的消息不被折叠掉。
			React.useEffect(function () {
				if (!status || initRef.current) return;
				initRef.current = true;
				setOpen(!status.configured);
			}, [status]);

			function money(probe) {
				return {
					cur: probe && probe.currency === "USD" ? "$" : "¥",
					amount: probe && Number.isFinite(Number(probe.amount)) ? Number(probe.amount).toFixed(2) : "—"
				};
			}
			function failText(r, key) {
				return t(key, { msg: (r && r.error && r.error.message) || "unknown" });
			}
			function save() {
				if (busy !== "") return;
				var akText = ak.trim();
				var skText = sk.trim();
				if (!akText && !(status && status.configured)) { setMsg({ kind: "error", text: t("credNeedAkFirst") }); return; }
				if (!akText || !skText) { setMsg({ kind: "error", text: t("credNeedBoth") }); return; }
				setBusy("save"); setMsg(null);
				call("set-credentials", { accessKey: akText, secretKey: skText }).then(function (r) {
					setBusy("");
					if (r && r.ok) {
						if (r.value.status) setStatus(r.value.status);
						setAk(""); setSk("");
						setMsg({ kind: "ok", text: t("credSaved", money(r.value.probe)) });
						if (onSaved) onSaved();
					} else {
						setMsg({ kind: "error", text: failText(r, "credSaveFail") });
					}
				}).catch(function (e) {
					setBusy("");
					setMsg({ kind: "error", text: t("credSaveFail", { msg: String((e && e.message) || e) }) });
				});
			}
			function test() {
				if (busy !== "") return;
				setBusy("test"); setMsg(null);
				call("test-credentials", null).then(function (r) {
					setBusy("");
					if (r && r.ok) {
						if (r.value.status) setStatus(r.value.status);
						setMsg({ kind: "ok", text: t("credTestOk", money(r.value.probe)) });
					} else {
						setMsg({ kind: "error", text: failText(r, "credTestFail") });
					}
				}).catch(function (e) {
					setBusy("");
					setMsg({ kind: "error", text: t("credTestFail", { msg: String((e && e.message) || e) }) });
				});
			}
			function clear() {
				if (busy !== "") return;
				setBusy("clear"); setMsg(null);
				call("clear-credentials", null).then(function (r) {
					setBusy("");
					if (r && r.ok) {
						if (r.value.status) setStatus(r.value.status);
						setAk(""); setSk(""); setOpen(true);
						setMsg({ kind: "ok", text: t("credCleared") });
						if (onSaved) onSaved();
					} else {
						setMsg({ kind: "error", text: (r && r.error && r.error.message) || "unknown" });
					}
				}).catch(function (e) {
					setBusy("");
					setMsg({ kind: "error", text: String((e && e.message) || e) });
				});
			}

			var configured = !!(status && status.configured);
			var summary = status
				? (configured ? t("credConfigured", { masked: status.accessKeyMasked || "AK****" }) : t("credMissing"))
				: t("loading");
			var toggleLabel = open ? t("credHide") : configured ? t("credChange") : t("credConfigure");
			var children = [
				React.createElement("div", { key: "title", className: "dsh-group-title" }, t("settingsCredentials")),
				React.createElement("div", { key: "summary", className: "dsh-cred-summary" },
					React.createElement("span", { className: "dsh-cred-dot" + (configured ? " is-on" : "") }),
					React.createElement("span", { key: "text", className: "dsh-cred-status", title: summary }, summary),
					React.createElement("button", {
						key: "toggle",
						className: "dsh-cred-toggle",
						type: "button",
						"aria-expanded": open ? "true" : "false",
						onClick: function () { setOpen(!open); }
					}, toggleLabel))
			];
			if (open) {
				var buttons = [
					React.createElement("button", { key: "save", className: "dsh-cred-btn", type: "button", disabled: busy !== "", onClick: save },
						busy === "save" ? t("credTesting") : t("credSave")),
					React.createElement("button", {
						key: "test", className: "dsh-cred-secondary", type: "button",
						disabled: busy !== "" || !configured, onClick: test
					}, busy === "test" ? t("credTesting") : t("credTest"))
				];
				if (configured) {
					buttons.push(React.createElement("button", {
						key: "clear", className: "dsh-cred-danger", type: "button", disabled: busy !== "", onClick: clear
					}, t("credClear")));
				}
				var formChildren = [
					React.createElement("div", { key: "ak", className: "dsh-field" },
						React.createElement("label", { className: "dsh-field-label" }, t("credAkLabel")),
						React.createElement("input", {
							className: "dsh-cred-input",
							type: "text",
							autoComplete: "off",
							spellCheck: false,
							value: ak,
							placeholder: t("credAkPH"),
							disabled: busy !== "",
							onChange: function (e) { setAk(e.target.value); }
						})),
					React.createElement("div", { key: "sk", className: "dsh-field" },
						React.createElement("label", { className: "dsh-field-label" }, t("credSkLabel")),
						React.createElement("input", {
							className: "dsh-cred-input",
							type: "password",
							autoComplete: "new-password",
							value: sk,
							placeholder: t("credSkPH"),
							disabled: busy !== "",
							onChange: function (e) { setSk(e.target.value); }
						})),
					React.createElement("div", { key: "actions", className: "dsh-cred-actions" }, buttons)
				];
				if (msg) {
					formChildren.push(React.createElement("div", {
						key: "msg",
						className: "dsh-cred-msg " + (msg.kind === "ok" ? "is-ok" : "is-error"),
						role: "status"
					}, msg.text));
				}
				formChildren.push(React.createElement("div", { key: "hint", className: "dsh-cred-hint" }, t("credHint")));
				children.push(React.createElement("div", { key: "form", className: "dsh-cred-form" }, formChildren));
			}
			return React.createElement("div", { className: "dsh-settings-group" }, children);
		}

		function SettingsPanel(props) {
			var specs = props.specs;
			var settings = props.settings;
			var onChange = props.onChange;
			var onReset = props.onReset;
			var t = props.t;
			var call = props.call;
			var onSaved = props.onSaved;
			var providerRows = specs && Array.isArray(specs.rows) ? specs.rows : [];

			var toggle = function (id) {
				var hidden = Object.assign({}, settings.hidden);
				if (hidden[id]) delete hidden[id];
				else hidden[id] = true;
				onChange(Object.assign({}, settings, { hidden: hidden }));
			};
			var setRefresh = function (value) {
				var ms = value === "" ? null : Number(value);
				if (ms !== null && !(Number.isFinite(ms) && ms >= 5000)) ms = null;
				onChange(Object.assign({}, settings, { refreshMs: ms }));
			};
			var setWarn = function (id, text) {
				var warn = Object.assign({}, settings.warn);
				var n = Number(text);
				if (text === "" || !Number.isFinite(n) || n < 0) delete warn[id];
				else warn[id] = n;
				onChange(Object.assign({}, settings, { warn: warn }));
			};
			var setCapsule = function (value) {
				onChange(Object.assign({}, settings, { capsuleMode: CAPSULE_MODES[value] ? value : null }));
			};

			var refreshValue = "";
			if (settings.refreshMs !== null && settings.refreshMs !== undefined) {
				var match = REFRESH_CHOICES.some(function (choice) { return Number(choice.value) === settings.refreshMs; });
				refreshValue = match ? String(settings.refreshMs) : "";
			}

			var visibilityRows = providerRows.map(function (spec) {
				return React.createElement("div", { key: spec.id, className: "dsh-setting-row" },
					React.createElement("span", { className: "dsh-setting-name" }, spec.label),
					React.createElement(Switch, {
						checked: !settings.hidden[spec.id],
						label: spec.label,
						onChange: function () { toggle(spec.id); }
					}));
			});

			var thresholdRows = providerRows.map(function (spec) {
				if (spec.kind === "info") return null;
				var isUsage = spec.kind === "usage";
				var placeholder = isUsage
					? t("warnPercentPH", { n: (spec.warnPercent || 70) })
					: t("warnBalancePH", { cur: (spec.currency || "¥"), n: ((spec.balanceTiers && spec.balanceTiers.warn) || 20) });
				var raw = settings.warn[spec.id];
				return React.createElement("div", { key: spec.id, className: "dsh-setting-row" },
					React.createElement("span", { className: "dsh-setting-name" }, spec.label + (isUsage ? "（%）" : "（" + (spec.currency || "¥") + "）")),
					React.createElement("input", {
						className: "dsh-setting-input dsh-number",
						type: "number",
						min: "0",
						placeholder: placeholder,
						value: raw === undefined || raw === null ? "" : String(raw),
						onChange: function (event) { setWarn(spec.id, event.target.value); }
					}));
			}).filter(Boolean);

			var followLabel = t("followConfig") + " (" + Math.round((specs ? specs.refreshMs : 60000) / 1000) + "s)";
			return React.createElement("div", { className: "dsh-settings" },
				React.createElement(CredentialsSection, { key: "cred", t: t, call: call, onSaved: onSaved }),
				React.createElement("div", { key: "display", className: "dsh-settings-group" },
					React.createElement("div", { className: "dsh-group-title" }, t("settingsDisplay")),
					visibilityRows.length ? visibilityRows : React.createElement("div", { className: "dsh-setting-hint" }, t("settingsNoProviders"))),
				React.createElement("div", { key: "refresh", className: "dsh-settings-group" },
					React.createElement("div", { className: "dsh-group-title" }, t("settingsRefresh")),
					React.createElement("div", { className: "dsh-setting-row" },
						React.createElement("span", { className: "dsh-setting-name" }, t("settingsAutoRefresh")),
						React.createElement("span", { className: "dsh-select-wrap" },
							React.createElement("select", {
								className: "dsh-setting-select",
								value: refreshValue,
								onChange: function (event) { setRefresh(event.target.value); }
							}, REFRESH_CHOICES.map(function (choice) {
								var label = choice.value === "" ? followLabel : t("secondsSuffix", { n: Number(choice.value) / 1000 });
								if (choice.value === "60000") label = t("minutesSuffix", { n: 1 });
								if (choice.value === "120000") label = t("minutesSuffix", { n: 2 });
								if (choice.value === "300000") label = t("minutesSuffix", { n: 5 });
								return React.createElement("option", { key: choice.value || "follow", value: choice.value }, label);
							}))))),
				React.createElement("div", { key: "capsule", className: "dsh-settings-group" },
					React.createElement("div", { className: "dsh-group-title" }, t("settingsCollapsed")),
					React.createElement("div", { className: "dsh-setting-row" },
						React.createElement("span", { className: "dsh-setting-name" }, t("capsuleName")),
						React.createElement("span", { className: "dsh-select-wrap" },
							React.createElement("select", {
								className: "dsh-setting-select",
								value: settings.capsuleMode || "auto",
								onChange: function (event) { setCapsule(event.target.value); }
							}, CAPSULE_CHOICES.map(function (choice) {
								var label = choice.value === "auto" ? t("capsuleAuto")
									: choice.value === "rolling" ? t("capsuleRolling")
									: choice.value === "weekly" ? t("capsuleWeekly")
									: t("capsuleMax");
								return React.createElement("option", { key: choice.value, value: choice.value }, label);
							}))))),
				React.createElement("div", { key: "thresholds", className: "dsh-settings-group" },
					React.createElement("div", { className: "dsh-group-title" }, t("settingsThresholds")),
					thresholdRows.length ? thresholdRows : React.createElement("div", { className: "dsh-setting-hint" }, t("settingsNoProviders"))),
				React.createElement("div", { key: "footer", className: "dsh-settings-footer" },
					React.createElement("span", { className: "dsh-setting-hint" }, t("localOnly")),
					React.createElement("button", { className: "dsh-setting-reset", type: "button", onClick: onReset }, t("resetDefaults"))));
		}

		const inject = ["slots", "timer", "connection", "locale"];

		function apply(ctx) {
			// Standard cordis effect: setup runs now, the RETURNED function is the
			// disposer. (Do NOT invoke the callback here — passing the disposer to
			// ctx.effect would run tag.remove() immediately and strip the CSS,
			// leaving the widget unstyled in the overlay layer's top-left corner.)
			ctx.effect(function () {
				var tag = document.createElement("style");
				tag.dataset.plugin = "dsh-volc-balance-card";
				tag.textContent = CSS;
				document.head.append(tag);
				return function () { tag.remove(); };
			});

			function QuotaPanel(props) {
			var t = props.t;
			var wide = props.wide !== false;
			var specsState = React.useState(null);
			var specs = specsState[0], setSpecs = specsState[1];
			var dataState = React.useState({});
			var dataById = dataState[0], setDataById = dataState[1];
			var errState = React.useState(null);
			var loadError = errState[0], setLoadError = errState[1];
			var atState = React.useState(null);
			var fetchedAt = atState[0], setFetchedAt = atState[1];
			var expState = React.useState(false);
			var expanded = expState[0], setExpanded = expState[1];
			var setOpen = React.useState(false);
			var settingsOpen = setOpen[0], setSettingsOpen = setOpen[1];
			var refreshState = React.useState(false);
			var refreshing = refreshState[0], setRefreshing = refreshState[1];
			var settingsState = React.useState(readSettings);
			var settings = settingsState[0];
			var updateSettings = function (next) {
				writeSettings(next);
				settingsState[1](next);
			};

			var call = function (endpoint, payload) {
				return ctx.connection.rpc.call(CHANNEL, RPC_METHOD_PREFIX + "/" + endpoint, payload);
			};

			var loadSpecs = function () {
				return call("specs", null).then(function (result) {
					if (result && result.ok === true && result.value && Array.isArray(result.value.rows)) {
						setSpecs(result.value);
					} else {
						setLoadError(result && result.error ? result.error.message : t("loadFailed"));
					}
				}).catch(function (error) {
					setLoadError(String((error && error.message) || error));
				});
			};

			var load = function () {
				var proxyPayload = {};
				if (settings.proxy && typeof settings.proxy === "object") {
					for (var key in settings.proxy) {
						var v = settings.proxy[key];
						if (typeof v === "string" && v.trim() !== "") proxyPayload[key] = v.trim();
					}
				}
				return call("fetch-all", { proxy: proxyPayload }).then(function (result) {
					if (result && result.ok === true && result.value && Array.isArray(result.value.rows)) {
						var map = {};
						for (var i = 0; i < result.value.rows.length; i++) {
							var row = result.value.rows[i];
							map[row.id] = row;
						}
						setDataById(map);
						setFetchedAt(result.value.fetchedAt || Date.now());
						setLoadError(null);
					} else {
						setLoadError(result && result.error ? result.error.message : t("fetchFailed"));
					}
				}).catch(function (error) {
					setLoadError(String((error && error.message) || error));
				});
			};

			var refreshAll = function () {
				if (refreshing) return Promise.resolve();
				setRefreshing(true);
				return (specs ? Promise.resolve() : loadSpecs()).then(load).then(function () {
					setRefreshing(false);
				});
			};

			React.useEffect(function () {
				loadSpecs().then(load);
			}, []);

			var effectiveMs = settings.refreshMs !== null && settings.refreshMs !== undefined
				? settings.refreshMs
				: (specs ? specs.refreshMs : 60000);
			var proxyKey = JSON.stringify(settings.proxy || {});

			React.useEffect(function () {
				return ctx.interval(function () {
					if (!document.hidden) load();
				}, effectiveMs);
			}, [effectiveMs, proxyKey]);

			React.useEffect(function () {
				var onVisible = function () {
					if (!document.hidden) load();
				};
				document.addEventListener("visibilitychange", onVisible);
				return function () { document.removeEventListener("visibilitychange", onVisible); };
			}, [proxyKey]);

			React.useEffect(function () {
				if (!expanded) return;
				var onKey = function (event) {
					if (event.key === "Escape") setExpanded(false);
				};
				globalThis.addEventListener("keydown", onKey);
				return function () { globalThis.removeEventListener("keydown", onKey); };
			}, [expanded]);

			var rows = [];
			var views = {};
			if (specs) {
				rows = specs.rows.filter(function (spec) { return !settings.hidden[spec.id]; });
				for (var i = 0; i < specs.rows.length; i++) {
					var spec = specs.rows[i];
					views[spec.id] = rowView(t, spec, dataById[spec.id], settings.warn[spec.id], settings.capsuleMode);
				}
			}

			var loading = fetchedAt === null && loadError === null;
			var noData = fetchedAt !== null && loadError === null && Object.keys(dataById).length === 0;
			var hasBalanceRow = rows.some(function (r) { return r.id === "volcengine-balance"; });
			var balanceHidden = !!(settings.hidden && settings.hidden["volcengine-balance"]);
			var allHidden = !!(specs && specs.rows.length > 0 && rows.length === 0);
			var noProviders = !!(specs && specs.rows.length === 0);
			var primary = null;
			for (var bi = 0; bi < rows.length; bi++) {
				if (views[rows[bi].id].kind === "balance") { primary = rows[bi]; break; }
			}
			if (!primary && rows.length > 0) primary = rows[0];

			var dotStatus = "loading";
			var capsuleLabel = t("title");
			var capsuleValue = "—";
			var capsuleBalance = false;
			if (specs === null) {
				if (loadError !== null) { capsuleValue = t("readFailed"); dotStatus = "error"; }
				else { capsuleValue = t("loading"); dotStatus = "loading"; }
			} else if (allHidden) {
				capsuleLabel = t("allHidden");
				capsuleValue = "";
				dotStatus = "loading";
			} else if (loading) {
				capsuleValue = t("loading");
				dotStatus = "loading";
			} else if (noData) {
				capsuleLabel = t("capsuleBalance");
				capsuleValue = "—";
				dotStatus = "idle";
			} else if (primary) {
				var primaryView = views[primary.id];
				dotStatus = primaryView.status;
				if (primaryView.kind === "balance") {
					capsuleLabel = t("capsuleBalance");
					capsuleValue = primaryView.value;
					capsuleBalance = true;
				} else {
					capsuleLabel = shortProviderName(primary.label);
					capsuleValue = primaryView.summary;
				}
			} else if (noProviders) {
				capsuleValue = "—";
				dotStatus = "loading";
			}

			var capsuleTitleParts = [];
			for (var ti = 0; ti < rows.length; ti++) {
				var titleView = views[rows[ti].id];
				capsuleTitleParts.push(rows[ti].label + ": " + (titleView.kind === "balance"
					? titleView.value + (titleView.sub ? " · " + titleView.sub : "")
					: titleView.summary));
			}
			if (fetchedAt !== null) {
				capsuleTitleParts.push(t("updatedAt", { time: new Date(fetchedAt).toLocaleTimeString() }));
			}
			var capsuleTitle = capsuleTitleParts.join(" · ");

			if (!wide) {
				return React.createElement("div", { id: "dsh-volc-balance-card" },
					React.createElement("a", {
						className: "dsh-rail",
						href: CONSOLE_BALANCE_URL,
						target: "_blank",
						rel: "noopener noreferrer",
						title: t("openConsole"),
						"aria-label": t("openConsole")
					},
						React.createElement("span", { className: "dsh-rail-mark" }, "¥"),
						React.createElement("span", { className: "dsh-rail-dot state-" + dotStatus })));
			}

			if (!expanded) {
				var capsuleChildren = [
					React.createElement("button", {
						key: "hit",
						className: "dsh-capsule-hit",
						type: "button",
						"aria-label": t("expand"),
						"aria-expanded": "false",
						onClick: function () { setExpanded(true); }
					}),
					React.createElement("span", { key: "dot", className: "dsh-capsule-dot state-" + dotStatus }),
					React.createElement("span", { key: "label", className: "dsh-capsule-label" }, capsuleLabel)
				];
				if (capsuleBalance) {
					if (primary && primary.id === "volcengine-balance") {
						capsuleChildren.push(React.createElement(ConsoleLink, {
							key: "ext",
							className: "dsh-capsule-ext",
							label: t("openConsole"),
							size: 12
						}));
					}
					capsuleChildren.push(React.createElement("span", { key: "colon", className: "dsh-capsule-colon" }, ":"));
				}
				if (capsuleValue !== "") {
					capsuleChildren.push(React.createElement("span", {
						key: "value",
						className: "dsh-capsule-value state-" + dotStatus
					}, capsuleValue));
				}
				if (rows.length > 1) {
					capsuleChildren.push(React.createElement("span", {
						key: "more",
						className: "dsh-capsule-more",
						title: t("moreProviders", { n: rows.length - 1 })
					}, "+" + (rows.length - 1)));
				}
				capsuleChildren.push(React.createElement(Icon, { key: "chevron", name: "chevron-down", className: "dsh-capsule-chevron", size: 12 }));
				return React.createElement("div", { id: "dsh-volc-balance-card" },
					React.createElement("div", { id: "dsh-quota-capsule", title: capsuleTitle }, capsuleChildren));
			}

			var overview = [];
			if (loadError !== null) {
				overview.push(React.createElement("div", { key: "err", className: "dsh-error-banner" },
					React.createElement(Icon, { name: "alert", size: 13 }),
					React.createElement("span", { className: "dsh-error-text" }, String(loadError)),
					React.createElement("button", {
						className: "dsh-text-btn",
						type: "button",
						onClick: function () { refreshAll(); }
					}, t("retry"))));
			}
			if (loading) {
				overview.push(React.createElement("div", { key: "loading", className: "dsh-loading" },
					React.createElement("span", { className: "dsh-loading-dot" }),
					React.createElement("span", null, t("loading"))));
			} else if (noProviders || noData) {
				overview.push(React.createElement("div", { key: "empty", className: "dsh-empty" },
					React.createElement("div", { className: "dsh-empty-icon" }, React.createElement(Icon, { name: "key", size: 14 })),
					React.createElement("div", { className: "dsh-empty-title" }, t("notConfiguredTitle")),
					React.createElement("div", { className: "dsh-empty-body" }, t("credHintShort")),
					React.createElement("button", {
						className: "dsh-empty-action",
						type: "button",
						onClick: function () { setSettingsOpen(true); }
					}, t("credConfigure"))));
			} else if (allHidden) {
				overview.push(React.createElement("div", { key: "empty", className: "dsh-provider-sub" }, t("emptyHint")));
			} else if (loadError !== null && Object.keys(dataById).length === 0) {
				/* error banner above already explains the failure; no empty provider rows */
			} else {
				for (var k = 0; k < rows.length; k++) {
					if (k > 0) overview.push(React.createElement("div", { key: rows[k].id + "-div", className: "dsh-quota-divider" }));
					overview.push(React.createElement(ProviderRow, {
						key: rows[k].id,
						spec: rows[k],
						view: views[rows[k].id],
						t: t
					}));
				}
				if (!hasBalanceRow && !balanceHidden) {
					overview.push(React.createElement("div", { key: "cred-callout", className: "dsh-cred-callout" },
						React.createElement("span", { className: "dsh-cred-callout-text" }, t("credHintShort")),
						React.createElement("button", {
							className: "dsh-text-btn",
							type: "button",
							onClick: function () { setSettingsOpen(true); }
						}, t("credConfigure"))));
				}
			}
			if (fetchedAt !== null) {
				overview.push(React.createElement("div", { key: "foot", className: "dsh-quota-foot" },
					React.createElement("span", { className: "dsh-quota-foot-time" }, t("updatedAt", { time: new Date(fetchedAt).toLocaleTimeString() })),
					React.createElement("span", null, t("settingsAutoRefresh") + " " + Math.round(effectiveMs / 1000) + "s")));
			}

			var body = settingsOpen
				? React.createElement(SettingsPanel, {
					key: "settings",
					t: t,
					call: call,
					specs: specs,
					settings: settings,
					onChange: updateSettings,
					onSaved: function () { loadSpecs().then(load); },
					onReset: function () { updateSettings({ hidden: {}, refreshMs: null, warn: {}, proxy: {}, capsuleMode: null }); }
				})
				: React.createElement("div", { key: "overview", className: "dsh-overview" }, overview);

			return React.createElement("div", { id: "dsh-volc-balance-card" },
				React.createElement("div", { id: "dsh-quota-card" },
					React.createElement("div", { className: "dsh-quota-header" },
						React.createElement("div", { className: "dsh-quota-title" }, t("title")),
						React.createElement("div", { className: "dsh-quota-actions" },
							React.createElement("button", {
								className: "dsh-quota-icon" + (refreshing ? " is-loading" : ""),
								type: "button",
								"aria-label": t("refresh"),
								disabled: refreshing,
								onClick: function () { refreshAll(); }
							}, React.createElement(Icon, { name: "refresh", size: 15 })),
							React.createElement("button", {
								className: "dsh-quota-icon",
								type: "button",
								"aria-label": t("collapse"),
								onClick: function () { setExpanded(false); }
							}, React.createElement(Icon, { name: "chevron-up", size: 15 })))),
					React.createElement("div", { className: "dsh-tabs", role: "tablist", "aria-label": t("title") },
						React.createElement("button", {
							className: "dsh-tab" + (!settingsOpen ? " is-active" : ""),
							type: "button",
							role: "tab",
							"aria-selected": !settingsOpen ? "true" : "false",
							onClick: function () { setSettingsOpen(false); }
						}, t("tabOverview")),
						React.createElement("button", {
							className: "dsh-tab" + (settingsOpen ? " is-active" : ""),
							type: "button",
							role: "tab",
							"aria-selected": settingsOpen ? "true" : "false",
							onClick: function () { setSettingsOpen(true); }
						}, t("tabSettings"))),
					React.createElement("div", { className: "dsh-quota-body" }, body)));
		}

			ctx.effect(function () {
				return ctx.locale.register(NS, DICT);
			}, "dsh-volc-balance-card: copy dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register(
				{ name: "sidebar.footer.action", id: "dsh-volc-balance-card", order: 20, label: () => t("title"), locale: NS },
				(props: any) => React.createElement(QuotaPanel, { t: props.t, wide: props.wide })
			));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
