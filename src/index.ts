/**
 * dsh-volc-balance-card — provider quota card for the dsh web surface.
 *
 * Dual-face plugin:
 *
 *  - Host half (compiled from src/index.ts into lib/index.js; zero runtime
 *    dependencies — the schema library is vendored under src/vendor/):
 *    registers one loopback-only Connection RPC channel `/dsh-volc-balance-card`
 *    with two endpoints. API keys are resolved through `ctx.credentials`
 *    and never reach the browser; upstream quota endpoints are called host-side
 *    with `Authorization: Bearer <key>`, optionally through a configured
 *    HTTP proxy (CONNECT tunnel for https targets, absolute-URI forward for
 *    http targets).
 *      - `specs`     → provider row specs + default refreshMs (render hints)
 *      - `fetch-all` → per-provider normalized row view (or per-row error);
 *                       payload `{ proxy?: { [id]: url } }` overrides each
 *                       row's proxy from the browser settings panel
 *                       (validated http/https; wins over profile config)
 *
 *    v0.5: `fetch-all` no longer passes upstream JSON through — every known
 *    format is normalized host-side into one of three view models
 *    (`balance` / `usage` / `info`), so the browser half renders generic
 *    rows and upstream schema details stay host-side like the credentials.
 *
 *  - Built-in provider catalog + auto discovery: catalog entries name the
 *    standard credential references of well-known providers; entries whose
 *    key resolves through `ctx.credentials` appear automatically. Explicit
 *    `providers` config entries still work (same-id entries replace the
 *    catalog row wholesale) and gain formats the catalog cannot guess
 *    (`openai-billing` for one-api/new-api compatible aggregators).
 *
 *  - Client half (`lib/client.js`, served at /plugins/dsh-volc-balance-card/client.js
 *    through the `dsh.client` manifest): a `shell.overlay` slot entry that
 *    renders the collapsed capsule / expanded card / settings panel with
 *    React, talking to this half over `ctx.connection.rpc`.
 *
 * Providers are config-driven (validated by the exported `Config` schema,
 * so the profile patch may omit every defaulted field). Config keys:
 *
 *   refreshMs:  auto-refresh interval, default 60000 (>= 5000)
 *   auto:       probe the built-in catalog for configured keys, default true
 *   hide:       row ids to drop from the panel (catalog and explicit alike)
 *   proxies:    { <name>: "http://user:pass@host:port" } proxy definitions;
 *               HTTP/HTTPS proxies only (CONNECT tunnel for https targets)
 *   catalog:    { <catalog-id>: { label?, endpoint?, format?, proxy?, refs?,
 *               balanceTiers?, warnPercent?, errorPercent?, windowLabels? } }
 *               partial overrides applied to auto-discovered rows
 *   providers:  explicit rows; an entry whose id matches a catalog entry
 *               replaces it. Fields per entry:
 *
 *   id:          row key; ^[a-z0-9-]+$ (unique)
 *   label:       provider name, e.g. "DeepSeek"
 *   credential:  credential reference, e.g. "DEEPSEEK_API_KEY"
 *   endpoint:    quota/balance JSON endpoint (GET, Bearer auth), http(s) URL;
 *                for format "openai-billing" this is the aggregator base URL
 *   format:      row adapter, see FORMATS below, default "deepseek-balance"
 *   proxy:       name of an entry in `proxies`; omit for direct connection
 *   currency:    (balance kinds) currency symbol override, e.g. "$" for a
 *                format that defaults to ¥ (catalog rows set it per site:
 *                siliconflow = $, siliconflow-cn = ¥)
 *   balanceTiers: (balance kinds) { critical, warn, healthy }, defaults
 *                { 10, 20, 50 }; must satisfy critical <= warn <= healthy
 *   lowBalance:  legacy alias for balanceTiers.warn
 *   windowLabels: (opencode-usage) { rolling, weekly, monthly } labels,
 *                defaults { 滚, 周, 月 }
 *   warnPercent / errorPercent: (usage kinds) thresholds, defaults 70 / 90
 *
 * Schema library is vendored under src/vendor/ (schemastery 3.18.1 +
 * cosmokit, both MIT; zero further runtime dependencies) and imported by
 * relative path, so the package resolves with or without node_modules —
 * required because `dsh plugin add link:` installs resolve imports from the
 * repo's real path, which cannot walk up to dsh's bundled packages.
 */
import crypto from 'node:crypto';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import z from './vendor/schemastery.mjs';

export const name = 'volc-balance-card';

export const inject = ['connection', 'credentials'];

/**
 * Connection channel that carries this plugin's RPC methods.
 *
 * DSH mounts every plugin HTTP surface inside the authenticated `/api`
 * channel, whose own route applies the trusted-host + browser-session fence
 * before dispatching. The dedicated prefix `/dsh-volc-balance-card` this plugin used
 * before DSH 0.1.5 is no longer reachable: `connection.rpc.handle` mounts its
 * route from the *Connection plugin's* fiber, which never holds `webServer`,
 * so `owner.webServer.register` throws and the channel silently disappears.
 */
export const RPC_CHANNEL = '/api';

/** Method namespace owned by this plugin under {@link RPC_CHANNEL}. */
export const RPC_METHOD_PREFIX = 'dsh-volc-balance-card';

/** RPC endpoints served by the host half. */
export const RPC_ENDPOINTS = [
	'specs',
	'fetch-all',
	'credential-status',
	'set-credentials',
	'clear-credentials',
	'test-credentials'
] as const;

/** Method name the browser half sends for one endpoint. */
export function rpcMethod(endpoint: string): string {
	return `${RPC_METHOD_PREFIX}/${endpoint}`;
}

/** Exact Fetch route path Connection serves one endpoint on. */
export function rpcRoutePath(endpoint: string): string {
	return `${RPC_CHANNEL}/${rpcMethod(endpoint)}`;
}

/** Upstream fetch timeout per provider row. */
const UPSTREAM_TIMEOUT_MS = 15000;

/** Upper bound on one upstream response body kept in memory (bytes). */
const MAX_BODY_BYTES = 1024 * 1024;

const PROVIDER_ID_PATTERN = /^[a-z0-9-]+$/;
const CREDENTIAL_REF_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const HTTP_URL_PATTERN = /^https?:\/\//;

// ── Volcengine Ark (火山方舟) OpenAPI signing ───────────────
//
// Volcengine's OpenAPI (open.volcengineapi.com) authenticates with an
// AccessKey ID / SecretAccessKey pair using an AWS-SigV4-variant HMAC
// signature rather than a Bearer token. The two deltas from standard
// SigV4 that bite naive ports:
//   1. SignedHeaders use a FIXED order `host;x-date;x-content-sha256;
//      content-type` (NOT alphabetical);
//   2. Algorithm string is bare `HMAC-SHA256` (no `AWS4` prefix),
//      credential scope ends in `/request` (not `/aws4_request`), and
//      the first signing key is HMAC(SK, date) with the raw SK (no
//      `AWS4` prefix).
// Algorithm cross-checked against the official volc-openapi demos and
// the cc-switch implementation (src-tauri/src/services/coding_plan.rs).
const VOLCENGINE_HOST = 'open.volcengineapi.com';
const VOLCENGINE_SERVICE = 'ark';
const VOLCENGINE_VERSION = '2024-01-01';
const VOLCENGINE_CONTENT_TYPE = 'application/json; charset=utf-8';
const VOLCENGINE_SIGNED_HEADERS = 'host;x-date;x-content-sha256;content-type';

function volcHmac(key: Buffer, data: string): Buffer {
	return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function volcSha256Hex(data: string | Buffer): string {
	return crypto.createHash('sha256').update(data).digest('hex');
}

/** RFC 3986 unreserved-only percent encoding over UTF-8 bytes (used for canonical query). */
function volcUriEncode(input: string): string {
	let out = '';
	for (const b of Buffer.from(input, 'utf8')) {
		if ((b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || (b >= 0x30 && b <= 0x39) || b === 0x2d || b === 0x5f || b === 0x2e || b === 0x7e) {
			out += String.fromCharCode(b);
		} else {
			out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
		}
	}
	return out;
}

/** Canonical query string, sorted by key (the same string is used for signing and for the request URL). */
function volcCanonicalQuery(action: string, region: string): string {
	const pairs: Array<[string, string]> = [
		['Action', action],
		['Region', region],
		['Version', VOLCENGINE_VERSION]
	];
	pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
	return pairs.map(([k, v]) => `${volcUriEncode(k)}=${volcUriEncode(v)}`).join('&');
}

/** Build the signed headers for a Volcengine OpenAPI POST (empty body). */
function volcengineSignedHeaders(ak: string, sk: string, region: string, action: string, now: Date): Record<string, string> {
	const xDate = now.toISOString().replace(/[:-]/g, '').slice(0, 15) + 'Z';
	const shortDate = xDate.slice(0, 8);
	const body = '';
	const payloadHash = volcSha256Hex(body);
	const canonicalQuery = volcCanonicalQuery(action, region);
	// Canonical headers in fixed (non-alphabetical) order.
	const canonicalHeaders =
		`host:${VOLCENGINE_HOST}\n` +
		`x-date:${xDate}\n` +
		`x-content-sha256:${payloadHash}\n` +
		`content-type:${VOLCENGINE_CONTENT_TYPE}\n`;
	const canonicalRequest = [
		'POST',
		'/',
		canonicalQuery,
		canonicalHeaders,
		VOLCENGINE_SIGNED_HEADERS,
		payloadHash
	].join('\n');
	const credentialScope = `${shortDate}/${region}/${VOLCENGINE_SERVICE}/request`;
	const stringToSign = [
		'HMAC-SHA256',
		xDate,
		credentialScope,
		volcSha256Hex(canonicalRequest)
	].join('\n');
	const kDate = volcHmac(Buffer.from(sk, 'utf8'), shortDate);
	const kRegion = volcHmac(kDate, region);
	const kService = volcHmac(kRegion, VOLCENGINE_SERVICE);
	const kSigning = volcHmac(kService, 'request');
	const signature = volcHmac(kSigning, stringToSign).toString('hex');
	return {
		'Host': VOLCENGINE_HOST,
		'X-Date': xDate,
		'X-Content-Sha256': payloadHash,
		'Content-Type': VOLCENGINE_CONTENT_TYPE,
		'Authorization': `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${VOLCENGINE_SIGNED_HEADERS}, Signature=${signature}`
	};
}

/** Call one 方舟 (Ark) OpenAPI action with AK/SK V4 signing (POST, empty body). */
async function volcengineCall(action: string, region: string, ak: string, sk: string, timeoutMs: number): Promise<any> {
	const canonicalQuery = volcCanonicalQuery(action, region);
	const url = `https://${VOLCENGINE_HOST}/?${canonicalQuery}`;
	const headers = volcengineSignedHeaders(ak, sk, region, action, new Date());
	const res = await fetch(url, { method: 'POST', headers, body: '', signal: AbortSignal.timeout(timeoutMs) });
	// Same response-size ceiling as the streaming providers: buffer the raw
	// bytes first and refuse oversized bodies before parsing.
	const raw = await res.arrayBuffer();
	if (raw.byteLength > MAX_BODY_BYTES) throw new Error(`upstream body exceeds ${MAX_BODY_BYTES} bytes`);
	let body: any = null;
	try {
		body = JSON.parse(new TextDecoder().decode(raw));
	} catch {
		body = null;
	}
	if (body === null) throw new Error(`HTTP ${res.status}: non-JSON response`);
	const err = body?.ResponseMetadata?.Error;
	if (err) {
		const code = err.Code || 'Unknown';
		const msg = err.Message || 'unknown error';
		throw new Error(`volcengine ${code}: ${msg}`);
	}
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return body;
}

// ── 火山引擎 Billing（账户余额）────────────────────────────
//
// 与方舟的 open.volcengineapi.com 不同，账户余额在 billing 服务下，
// 用同族 V4 签名但走 GET：Action/Version 放在 query 里，region 用
// cn-north-1（与控制台一致），签名头只含 host/x-content-sha256/x-date
// （不带 content-type，空 body）。已对真实账号验证：
//   GET https://billing.volcengineapi.com/?Action=QueryBalanceAcct&Version=2022-01-01
//   -> Result.{AvailableBalance, CashBalance, ArrearsBalance, FreezeAmount, Currency}
const VOLC_BILLING_HOST = 'billing.volcengineapi.com';
const VOLC_BILLING_SERVICE = 'billing';
const VOLC_BILLING_VERSION = '2022-01-01';
const VOLC_BILLING_REGION = 'cn-north-1';

/** 凭据库（DSH credentials）里保存火山引擎 AK/SK 的引用名。 */
export const VOLC_ACCESS_KEY_REF = 'VOLC_ACCESS_KEY';
export const VOLC_SECRET_KEY_REF = 'VOLC_SECRET_KEY';

/** 火山引擎 AK 形态：AK + 字母数字（子账号 AK 同理）。 */
const VOLC_AK_PATTERN = /^AK[A-Za-z0-9]{8,64}$/;

/** 余额查询结果缓存：AK+region -> { at, view }，TTL 30s。 */
const VOLC_BALANCE_TTL_MS = 30_000;
const volcBalanceCache = new Map<string, { at: number; view: any }>();

/** Build the signed headers + canonical query for a Volcengine Billing GET. */
function volcBillingSign(ak: string, sk: string, region: string, action: string, version: string, now: Date): { query: string; headers: Record<string, string> } {
	const xDate = now.toISOString().replace(/[:-]/g, '').slice(0, 15) + 'Z';
	const shortDate = xDate.slice(0, 8);
	const payloadHash = volcSha256Hex('');
	const pairs: Array<[string, string]> = [
		['Action', action],
		['Version', version]
	];
	pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
	const canonicalQuery = pairs.map(([k, v]) => `${volcUriEncode(k)}=${volcUriEncode(v)}`).join('&');
	const canonicalHeaders =
		`host:${VOLC_BILLING_HOST}\n` +
		`x-content-sha256:${payloadHash}\n` +
		`x-date:${xDate}\n`;
	const signedHeaders = 'host;x-content-sha256;x-date';
	const canonicalRequest = ['GET', '/', canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
	const credentialScope = `${shortDate}/${region}/${VOLC_BILLING_SERVICE}/request`;
	const stringToSign = ['HMAC-SHA256', xDate, credentialScope, volcSha256Hex(canonicalRequest)].join('\n');
	const kDate = volcHmac(Buffer.from(sk, 'utf8'), shortDate);
	const kRegion = volcHmac(kDate, region);
	const kService = volcHmac(kRegion, VOLC_BILLING_SERVICE);
	const kSigning = volcHmac(kService, 'request');
	const signature = volcHmac(kSigning, stringToSign).toString('hex');
	return {
		query: canonicalQuery,
		headers: {
			'Host': VOLC_BILLING_HOST,
			'X-Date': xDate,
			'X-Content-Sha256': payloadHash,
			'Authorization': `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
		}
	};
}

/**
 * Query the billing balance with EXPLICIT credentials. The settings panel
 * uses this to validate an AK/SK pair before saving it, so a typo never
 * overwrites working credentials. Throws with a human-readable message.
 */
async function probeVolcBalance(ak: string, sk: string, region: string): Promise<{ amount: number; currency: string; accountId?: string }> {
	const signed = volcBillingSign(ak, sk, region, 'QueryBalanceAcct', VOLC_BILLING_VERSION, new Date());
	const upstream = await getJson(`https://${VOLC_BILLING_HOST}/?${signed.query}`, signed.headers, undefined, UPSTREAM_TIMEOUT_MS);
	const body: any = await upstream.json().catch(() => null);
	if (body === null) throw new Error(`HTTP ${upstream.status}: non-JSON response`);
	const upstreamError = body?.ResponseMetadata?.Error;
	if (upstreamError) {
		throw new Error(`${upstreamError.Code ?? 'error'}: ${upstreamError.Message ?? ''}`.trim());
	}
	const outcome = adaptRow('volcengine-billing-balance', body);
	if (!outcome.view) throw new Error('QueryBalanceAcct returned no balance');
	return {
		amount: outcome.view.amount,
		currency: body?.Result?.Currency ?? 'CNY',
		accountId: body?.Result?.AccountID
	};
}

/**
 * Current AK/SK state for the settings panel. The secret value never leaves
 * the host: the response carries only a masked tail plus per-ref source.
 */
async function credentialStatus(ctx): Promise<Record<string, any>> {
	const ak = await ctx.credentials.resolve(VOLC_ACCESS_KEY_REF);
	const sk = await ctx.credentials.resolve(VOLC_SECRET_KEY_REF);
	const akValue = typeof ak?.value === 'string' ? ak.value : '';
	const skValue = typeof sk?.value === 'string' ? sk.value : '';
	return {
		configured: akValue.length > 0 && skValue.length > 0,
		accessKeyMasked: akValue.length > 4 ? `${akValue.slice(0, 4)}****${akValue.slice(-4)}` : '',
		accessKeySource: ak?.source ?? null,
		secretKeySource: sk?.source ?? null,
		region: VOLC_BILLING_REGION
	};
}

/**
 * Normalized row views an adapter may produce. The browser half renders
 * these generically; upstream response schema details never leave the host.
 * @typedef {object} RowView
 * @property {'balance'} kind - monetary balance row
 * @property {number} amount - remaining balance in the row's currency
 * @property {'usage'} [kind] - usage-percentage row
 * @property {object} [windows] - { rolling, weekly, monthly } each
 *           { percent: number, resetsAt?: string }
 * @property {'info'} [kind] - plain text row (providers without a balance API)
 * @property {string} [text] - info row content
 * @property {string} [title] - hover text, newlines allowed
 */

/** View kind and currency each adapter's rows render as. */
const FORMAT_META = {
	'volcengine-billing-balance': { kind: 'balance', currency: '¥' },
	'deepseek-balance': { kind: 'balance', currency: '¥' },
	'openrouter-credits': { kind: 'balance', currency: '$' },
	'siliconflow-balance': { kind: 'balance', currency: '¥' },
	'moonshot-balance': { kind: 'balance', currency: '¥' },
	'minimax-remains': { kind: 'usage' },
	'stepfun-accounts': { kind: 'balance', currency: '¥' },
	'xai-credits': { kind: 'balance', currency: '$' },
	'openai-billing': { kind: 'balance', currency: '$' },
	'zhipu-quota': { kind: 'info' },
	'opencode-usage': { kind: 'usage' },
	'zai-coding-quota': { kind: 'usage' },
	'kimi-coding-usage': { kind: 'usage' },
	'volcengine-agent-usage': { kind: 'usage' },
	'volcengine-coding-usage': { kind: 'usage' }
};

/**
 * Built-in provider catalog probed by auto discovery. `refs` lists the
 * credential references tried in order; the first one that resolves wins.
 * Endpoints verified against provider docs (see README "内置供应商目录").
 */
const CATALOG = [
	{ id: 'deepseek', label: 'DeepSeek', refs: ['DEEPSEEK_API_KEY'], endpoint: 'https://api.deepseek.com/user/balance', format: 'deepseek-balance' },
	{ id: 'openrouter', label: 'OpenRouter', refs: ['OPENROUTER_API_KEY'], endpoint: 'https://openrouter.ai/api/v1/credits', format: 'openrouter-credits' },
	{ id: 'siliconflow', label: 'SiliconFlow', refs: ['SILICONFLOW_API_KEY'], endpoint: 'https://api.siliconflow.com/v1/user/info', format: 'siliconflow-balance', currency: '$' },
	{ id: 'siliconflow-cn', label: 'SiliconFlow CN', refs: ['SILICONFLOW_CN_API_KEY'], endpoint: 'https://api.siliconflow.cn/v1/user/info', format: 'siliconflow-balance' },
	{ id: 'moonshot', label: 'Moonshot', refs: ['MOONSHOT_API_KEY'], endpoint: 'https://api.moonshot.cn/v1/users/me/balance', format: 'moonshot-balance' },
	{ id: 'minimax', label: 'MiniMax Coding', refs: ['MINIMAX_API_KEY'], endpoint: 'https://www.minimax.io/v1/token_plan/remains', format: 'minimax-remains', windowLabels: { rolling: '5h' } },
	{ id: 'minimax-cn', label: 'MiniMax Coding CN', refs: ['MINIMAX_CN_API_KEY'], endpoint: 'https://api.minimaxi.com/v1/token_plan/remains', format: 'minimax-remains', windowLabels: { rolling: '5h' } },
	{ id: 'stepfun', label: 'StepFun', refs: ['STEP_API_KEY', 'STEPFUN_API_KEY'], endpoint: 'https://api.stepfun.com/v1/accounts', format: 'stepfun-accounts' },
	{ id: 'xai', label: 'xAI', refs: ['XAI_API_KEY'], endpoint: 'https://api.x.ai/v1/billing/credits', format: 'xai-credits' },
	{ id: 'zhipu', label: 'ZhiPu GLM', refs: ['ZHIPU_API_KEY', 'GLM_API_KEY'], endpoint: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit', format: 'zhipu-quota' },
	{ id: 'zai-coding-cn', label: 'ZhiPu GLM Coding', refs: ['ZAI_CODING_CN_API_KEY'], endpoint: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit', format: 'zai-coding-quota', windowLabels: { rolling: '5h', weekly: '周', monthly: '月' } },
	{ id: 'zai', label: 'Z.AI GLM Coding', refs: ['ZAI_API_KEY'], endpoint: 'https://api.z.ai/api/monitor/usage/quota/limit', format: 'zai-coding-quota', windowLabels: { rolling: '5h', weekly: '周', monthly: '月' } },
	{ id: 'kimi-coding', label: 'Kimi Coding', refs: ['KIMI_API_KEY'], endpoint: 'https://api.kimi.com/coding/v1/usages', format: 'kimi-coding-usage', windowLabels: { rolling: '5h', weekly: '周' } },
	{ id: 'opencode-go', label: 'OpenCode Go', refs: ['OPENCODE_GO_API_KEY'], endpoint: 'https://opencode.ai/zen/go/v1/usage', format: 'opencode-usage' },
	// Volcengine Ark (火山方舟) has two SEPARATE subscriptions, shown as two
	// independent rows (like two providers) that share the same AK/SK pair.
	// Unlike Bearer-key rows these authenticate with a signed AK/SK —
	// `secretRefs` is the second credential and fetchRow signs the request.
	//  • Agent Plan  -> GetAFPUsage      (5h rolling / weekly / monthly windows)
	//  • Coding Plan -> GetCodingPlanUsage (session / weekly / monthly windows)
	// Each row queries ONLY its own action; a plan the account has not
	// subscribed to reports an inline "not subscribed" message instead of
	// silently falling back to the other plan.
	{ id: 'volcengine-agent', label: '方舟 Agent 套餐', refs: ['VOLC_ACCESS_KEY'], secretRefs: ['VOLC_SECRET_KEY'], endpoint: 'https://open.volcengineapi.com', format: 'volcengine-agent-usage', windowLabels: { rolling: '5h', weekly: '周', monthly: '月' } },
	{ id: 'volcengine-coding', label: '方舟 Coding 套餐', refs: ['VOLC_ACCESS_KEY'], secretRefs: ['VOLC_SECRET_KEY'], endpoint: 'https://open.volcengineapi.com', format: 'volcengine-coding-usage', windowLabels: { rolling: '会话', weekly: '周', monthly: '月' } },
	// 火山引擎账户余额（充值余额）：Billing QueryBalanceAcct，与上面两个
	// 套餐行共用 AK/SK。默认 cn-north-1；可用 catalog.volcengine-balance.region 覆盖。
	{ id: 'volcengine-balance', label: '火山引擎余额', refs: ['VOLC_ACCESS_KEY'], secretRefs: ['VOLC_SECRET_KEY'], endpoint: 'https://billing.volcengineapi.com/', format: 'volcengine-billing-balance', currency: '¥', balanceTiers: { critical: 10, warn: 20, healthy: 50 } }
];


/** Keys a `catalog` override may set on an auto-discovered row. */
const CATALOG_OVERRIDE_KEYS = ['label', 'endpoint', 'format', 'proxy', 'region', 'refs', 'secretRefs', 'currency', 'balanceTiers', 'warnPercent', 'errorPercent', 'windowLabels', 'localAuth'];

/**
 * Format adapters: upstream JSON → RowView. Each returns a view or throws
 * with a message prefixed by the format id; callers capture per row.
 * @type {Record<string, (body: any) => RowView>}
 */
const FORMATS = {
	// 火山引擎账户余额（Billing QueryBalanceAcct）。这是「充值余额」本身，
	// 与方舟的套餐额度窗口是两个不同接口：AvailableBalance 可用于推理的
	// 余额（现金 + 赠金 - 冻结），CashBalance 为真金余额。
	'volcengine-billing-balance': (body) => {
		const result = body?.Result ?? body;
		const amount = Number(result?.AvailableBalance ?? result?.CashBalance);
		if (!Number.isFinite(amount)) throw new Error('missing Result.AvailableBalance (QueryBalanceAcct)');
		const cash = Number(result?.CashBalance);
		const arrears = Number(result?.ArrearsBalance);
		const freeze = Number(result?.FreezeAmount);
		const money = (n) => (Number.isFinite(n) ? n.toFixed(2) : '?');
		const currency = typeof result?.Currency === 'string' ? result.Currency : 'CNY';
		return {
			kind: 'balance',
			amount,
			title: [
				`可用余额: ${money(amount)} ${currency}`,
				`现金余额: ${money(cash)} ${currency}`,
				Number.isFinite(freeze) && freeze > 0 ? `冻结: ${money(freeze)}` : null,
				`欠费: ${money(arrears)}`,
				result?.AccountID !== undefined ? `账号: ${result.AccountID}` : null
			].filter(Boolean).join('\n')
		};
	},
	'deepseek-balance': (body) => {
		const info = body?.balance_infos?.[0];
		const amount = Number(info?.total_balance);
		if (!Number.isFinite(amount)) throw new Error('missing balance_infos[0].total_balance');
		return { kind: 'balance', amount, title: `currency: ${info.currency}\ngranted: ¥${info.granted_balance}\ntopped-up: ¥${info.topped_up_balance}` };
	},
	'openrouter-credits': (body) => {
		const credits = Number(body?.data?.total_credits);
		const usage = Number(body?.data?.total_usage);
		if (!Number.isFinite(credits) || !Number.isFinite(usage)) throw new Error('missing data.total_credits / data.total_usage');
		return { kind: 'balance', amount: credits - usage, title: `purchased: $${credits.toFixed(2)}\nused: $${usage.toFixed(2)}` };
	},
	'siliconflow-balance': (body) => {
		const amount = Number(body?.data?.balance);
		if (!Number.isFinite(amount)) throw new Error('missing data.balance');
		return { kind: 'balance', amount, title: `charge: ¥${body.data.chargeBalance ?? '?'}\ntotal usage: ¥${body.data.totalUsage ?? '?'}` };
	},
	'moonshot-balance': (body) => {
		const amount = Number(body?.data?.total_balance);
		if (!Number.isFinite(amount)) throw new Error('missing data.total_balance');
		return { kind: 'balance', amount };
	},
	'minimax-remains': (body) => {
		const status = Number(body?.base_resp?.status_code);
		if (Number.isFinite(status) && status !== 0) throw new Error(`upstream status ${status}: ${body?.base_resp?.status_msg ?? 'unknown'}`);
		const remains = Array.isArray(body?.model_remains) ? body.model_remains : [];
		if (remains.length === 0) throw new Error('model_remains is empty');
		const num = (v) => {
			const n = Number(v);
			return Number.isFinite(n) ? n : NaN;
		};
		// Prefer the coding model row (MiniMax-M*, glm-plan-usage2 filter);
		// other rows (abab*, embedding…) carry different quota semantics.
		const name = (m) => String(m?.model_name ?? m?.model ?? '');
		const coding = remains.find((m) => name(m).startsWith('MiniMax-M')) ?? remains[0];
		// The remains endpoint family reports REMAINING counts: usage_count is
		// remaining, used = total - usage_count (documented OpenTokenUsage quirk,
		// confirmed by glm-plan-usage2).
		const toIso = (v) => {
			const n = Number(v);
			if (Number.isFinite(n)) return new Date(n > 1e12 ? n : n * 1000).toISOString();
			return typeof v === 'string' && v ? v : undefined;
		};
		const pick = (m) => {
			const total = num(m.current_interval_total_count);
			const resetsAt = toIso(m.end_time ?? m.remains_time);
			const pctRemaining = num(m.current_interval_remaining_percent);
			if (Number.isFinite(pctRemaining)) return { percent: Math.min(100, Math.max(0, Math.round(100 - pctRemaining))), resetsAt };
			const remaining = num(m.current_interval_remaining_count ?? m.current_interval_remains_count ?? m.current_interval_usage_count);
			if (total > 0 && Number.isFinite(remaining)) return { percent: Math.min(100, Math.round(((total - remaining) / total) * 100)), resetsAt };
			return null;
		};
		const first = pick(coding) ?? remains.map(pick).find((w) => w !== null);
		if (!first) throw new Error('no usable current_interval fields in model_remains');
		const windows: Record<string, any> = { rolling: first };
		// Weekly lane (glm-plan-usage2): old plans report weekly_total_count=0 —
		// no weekly window then, never a fabricated one.
		const weeklyTotal = num(coding.current_weekly_total_count);
		const weeklyRemaining = num(coding.current_weekly_usage_count);
		if (weeklyTotal > 0 && Number.isFinite(weeklyRemaining)) {
			windows.weekly = {
				percent: Math.min(100, Math.round(((weeklyTotal - weeklyRemaining) / weeklyTotal) * 100)),
				resetsAt: toIso(coding.weekly_end_time)
			};
		}
		const plan = body?.current_subscribe_title ?? body?.plan_name ?? body?.plan;
		const title = [
			plan ? `plan: ${plan}` : null,
			`model: ${name(coding) || '?'}`,
			`5h prompts: ${first.percent}% used`,
			windows.weekly ? `weekly prompts: ${windows.weekly.percent}% used` : null
		].filter(Boolean).join('\n');
		return { kind: 'usage', windows, title };
	},
	'stepfun-accounts': (body) => {
		const amount = Number(body?.balance);
		if (!Number.isFinite(amount)) throw new Error('missing balance');
		return { kind: 'balance', amount, title: `现金: ¥${body.total_cash_balance ?? '?'}\n赠金: ¥${body.total_voucher_balance ?? '?'}` };
	},
	'xai-credits': (body) => {
		const cents = Number(body?.total?.val);
		if (!Number.isFinite(cents)) throw new Error('missing total.val');
		return { kind: 'balance', amount: Math.abs(cents) / 100 };
	},
	'zhipu-quota': (body) => {
		if (body?.code !== 200) throw new Error(`upstream code ${body?.code}: ${body?.msg ?? 'unknown'}`);
		const limits = Array.isArray(body?.data?.limits) ? body.data.limits : [];
		if (limits.length === 0) throw new Error('data.limits is empty');
		const text = limits.map((l) => {
			if (l.remaining != null) return `${l.remaining}/${l.number ?? '?'}`;
			if (l.percentage != null) return `${l.percentage}%`;
			return '?';
		}).join(' · ');
		return { kind: 'info', text, title: '配额剩余/总数（智谱无公开余额接口）' };
	},
	'opencode-usage': (body) => {
		const u = body?.usage;
		const pick = (key) => {
			const percent = Number(u?.[key]?.percent);
			if (!Number.isFinite(percent)) throw new Error(`missing usage.${key}.percent`);
			return { percent, resetsAt: u[key].resetsAt };
		};
		return { kind: 'usage', windows: { rolling: pick('rolling'), weekly: pick('weekly'), monthly: pick('monthly') } };
	},
	'zai-coding-quota': (body) => {
		if (body?.code !== 200) throw new Error(`upstream code ${body?.code}: ${body?.msg ?? 'unknown'}`);
		const limits = Array.isArray(body?.data?.limits) ? body.data.limits : [];
		if (limits.length === 0) throw new Error('data.limits is empty');
		// Semantic window mapping, cross-checked against the official console
		// (issue #2), glm-plan-usage2 and CodexBar's z.ai fixtures: `unit` is a
		// window time-unit code, so unit=3 is the 5h window, unit=6 the weekly
		// window and TIME_LIMIT the MCP monthly lane. The former size heuristic
		// (sort by unit×number, smallest=5h) swaps 5h/weekly on plans that
		// return both rows.
		//
		// Credit-package plans (issue #7) answer with CREDIT_LIMIT rows that
		// carry the very same unit/number vocabulary — unit=3/number=5 is the 5h
		// credit window (e.g. 2000 credits), unit=6/number=1 the weekly pool
		// (e.g. 10000 credits); verified against CodexBar's zai credit fixture.
		// Those rows used to be placed by nextResetTime order alone, which
		// inverts the two lanes whenever the weekly pool happens to reset before
		// the 5h window does (the "GLM 5h/weekly swapped" report). Token and
		// credit rows therefore share one unit match, and either kind may fill
		// the lane its sibling left empty.
		const pct = (l) => {
			const n = Number(l?.percentage);
			return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
		};
		// Fallback percentage from raw counts; null when unparseable so the
		// client renders "-%" instead of a fabricated 0%.
		const countPct = (l) => {
			const used = Number(l?.currentValue);
			const total = Number(l?.usage);
			if (Number.isFinite(used) && Number.isFinite(total) && total > 0) return Math.round((used / total) * 100);
			return null;
		};
		const resets = (l) => (Number.isFinite(Number(l?.nextResetTime)) ? new Date(Number(l.nextResetTime)).toISOString() : undefined);
		const tokens = limits.filter((l) => l.type === 'TOKENS_LIMIT');
		const credits = limits.filter((l) => l.type === 'CREDIT_LIMIT');
		const time = limits.find((l) => l.type === 'TIME_LIMIT');
		// Token rows win when both kinds declare the same unit; a credit row only
		// steps in for a lane no token row claimed.
		const byUnit = (unit) => tokens.find((l) => Number(l.unit) === unit) ?? credits.find((l) => Number(l.unit) === unit);
		let rolling = byUnit(3);
		let weekly = byUnit(6);
		if (!rolling && !weekly) {
			// Unknown unit codes: the 5h window always resets before the weekly
			// one, so order by nextResetTime instead of guessing by size. Token
			// rows win over credit rows when both kinds are present.
			const pool = tokens.length > 0 ? tokens : credits;
			const sorted = [...pool].sort((a, b) => Number(a.nextResetTime ?? Infinity) - Number(b.nextResetTime ?? Infinity));
			rolling = sorted[0];
			weekly = sorted.length > 1 ? sorted[sorted.length - 1] : undefined;
		}
		const mkWin = (l) => {
			if (!l) return undefined;
			const p = pct(l) ?? countPct(l);
			return { percent: p === null ? null : p, resetsAt: resets(l) };
		};
		const windows: Record<string, any> = {};
		if (rolling) windows.rolling = mkWin(rolling);
		if (weekly && weekly !== rolling) windows.weekly = mkWin(weekly);
		if (time) windows.monthly = mkWin(time);
		if (Object.keys(windows).length === 0) throw new Error('no TOKENS_LIMIT / TIME_LIMIT / CREDIT_LIMIT entries');
		const plan = body?.data?.planName ?? body?.data?.plan ?? body?.data?.plan_type ?? body?.data?.packageName ?? body?.data?.level;
		// Credit rows carry the raw window declaration (unit/number) plus the
		// credit counts token rows lack; tag credit-sourced lanes in the hover
		// title so a credit pool is not mistaken for a token window (issue #7),
		// and so a response that omits `unit` — the one case still placed by
		// nextResetTime order — is visible on hover instead of silent.
		const laneTitle = (label: string, l: any, win: any) => {
			if (!win) return null;
			if (l?.type === 'CREDIT_LIMIT') {
				const rem = Number(l?.remaining);
				const total = Number(l?.usage);
				const num = Number(l?.number);
				const quota = Number.isFinite(total) ? total : num;
				const left = Number.isFinite(rem) ? ` left ${rem}${Number.isFinite(quota) ? `/${quota}` : ''}` : '';
				const winTag = Number.isFinite(Number(l?.unit)) ? ` u${Number(l.unit)}n${l?.number}` : ' no unit';
				return `${label} [CREDIT_LIMIT${winTag}${left}]: ${win.percent}%`;
			}
			return `${label} tokens: ${win.percent}%`;
		};
		const title = [
			plan ? `plan: ${plan}` : null,
			laneTitle('5h', rolling, windows.rolling),
			laneTitle('weekly', weekly, windows.weekly),
			time ? `MCP monthly: ${Number.isFinite(Number(time.currentValue)) && Number.isFinite(Number(time.usage)) ? `${time.currentValue}/${time.usage} (${windows.monthly.percent}%)` : `${windows.monthly.percent}%`}` : null
		].filter(Boolean).join('\n');
		return { kind: 'usage', windows, title };
	},
	'kimi-coding-usage': (body) => {
		const num = (v) => {
			const n = Number(v);
			return Number.isFinite(n) ? n : NaN;
		};
		// Window semantics per glm-plan-usage2: limits[] carries both windows,
		// identified by window.duration (300 = 5h, 10080 = weekly) — never by
		// array position. Counts are remaining-side: used = limit - remaining
		// (a `used` field is honored when a build provides it directly).
		const limits = Array.isArray(body?.limits) ? body.limits : [];
		const byDuration = (d) => limits.find((l) => Number(l?.window?.duration) === d
			&& (l?.window?.timeUnit ?? 'TIME_UNIT_MINUTE') === 'TIME_UNIT_MINUTE');
		const winFromDetail = (detail) => {
			if (!detail) return null;
			const limit = num(detail.limit);
			let used = num(detail.used);
			if (!Number.isFinite(used)) {
				const remaining = num(detail.remaining);
				if (Number.isFinite(remaining) && Number.isFinite(limit)) used = limit - remaining;
			}
			if (!(limit > 0) || !Number.isFinite(used)) return null;
			return { percent: Math.min(100, Math.round((used / limit) * 100)), resetsAt: detail.resetTime };
		};
		const windows: Record<string, any> = {};
		const rolling = winFromDetail(byDuration(300)?.detail);
		if (rolling) windows.rolling = rolling;
		let weekly = winFromDetail(byDuration(10080)?.detail);
		if (!weekly && body?.usage) {
			// Older shapes only carry the top-level usage aggregate (weekly).
			const usage = body.usage;
			const limit = num(usage.limit);
			let used = num(usage.used);
			if (!Number.isFinite(used)) {
				const remaining = num(usage.remaining);
				if (Number.isFinite(remaining) && Number.isFinite(limit)) used = limit - remaining;
			}
			if (limit > 0 && Number.isFinite(used)) weekly = { percent: Math.min(100, Math.round((used / limit) * 100)), resetsAt: usage.resetTime };
		}
		if (weekly) windows.weekly = weekly;
		if (Object.keys(windows).length === 0) throw new Error('no usable windows: limits[].window.duration=300/10080 or usage.limit needed');
		const title = [
			windows.rolling ? `5h requests: ${windows.rolling.percent}% used` : null,
			windows.weekly ? `weekly requests: ${windows.weekly.percent}% used` : null
		].filter(Boolean).join('\n');
		return { kind: 'usage', windows, title };
	},
	// `volcengine-agent-usage` / `volcengine-coding-usage` are not dispatched
	// through adaptRow: fetchRow handles each inline because the Volcengine
	// auth path (signed AK/SK, not Bearer) and response envelopes differ from
	// every other provider. Each adapter exists only so the format is
	// registered in FORMATS/FORMAT_META for config validation.
	'volcengine-agent-usage': () => {
		throw new Error('volcengine-agent-usage is handled inline by fetchRow');
	},
	'volcengine-coding-usage': () => {
		throw new Error('volcengine-coding-usage is handled inline by fetchRow');
	}
};

/**
 * Plugin config schema: structure and defaults live here so profile patches
 * can stay minimal; cross-field semantics (id uniqueness, tier ordering,
 * proxy references, catalog override keys) are checked in {@link apply}.
 */
export const Config = z.object({
	refreshMs: z.number().min(5000).default(60000),
	auto: z.boolean().default(true),
	hide: z.array(z.string()).default([]),
	proxies: z.dict(z.string()).default({}),
	catalog: z.dict(z.any()).default({}),
	providers: z.array(z.object({
		id: z.string().pattern(PROVIDER_ID_PATTERN).required(),
		label: z.string().required(),
		credential: z.string().role('credential-ref').required(),
		secretCredential: z.string().role('credential-ref'),
		region: z.string(),
		endpoint: z.string().pattern(HTTP_URL_PATTERN).required(),
		format: z.union([
			z.const('deepseek-balance'), z.const('openrouter-credits'), z.const('siliconflow-balance'),
			z.const('moonshot-balance'), z.const('minimax-remains'), z.const('stepfun-accounts'),
			z.const('xai-credits'), z.const('openai-billing'), z.const('zhipu-quota'),
			z.const('opencode-usage'), z.const('zai-coding-quota'), z.const('kimi-coding-usage'),
			z.const('volcengine-agent-usage'), z.const('volcengine-coding-usage'),
			z.const('volcengine-billing-balance')
		]).default('deepseek-balance'),
		proxy: z.string(),
		currency: z.string(),
		balanceTiers: z.object({
			critical: z.number().default(10),
			warn: z.number().default(20),
			healthy: z.number().default(50)
		}),
		lowBalance: z.number(),
		windowLabels: z.object({
			rolling: z.string(),
			weekly: z.string(),
			monthly: z.string()
		}),
		warnPercent: z.number().default(70),
		errorPercent: z.number().default(90)
	})).default([])
});

/** Numeric field with fallback; guards NaN. */
function numOf(value, fallback) {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Default balance tiers after the legacy lowBalance alias. */
function resolveTiers(entry, at) {
	const explicit = entry.balanceTiers && typeof entry.balanceTiers === 'object';
	const tiers = explicit
		? {
			critical: numOf(entry.balanceTiers.critical, 10),
			warn: numOf(entry.balanceTiers.warn, 20),
			healthy: numOf(entry.balanceTiers.healthy, 50)
		}
		: typeof entry.lowBalance === 'number' && Number.isFinite(entry.lowBalance)
			? { critical: entry.lowBalance / 2, warn: entry.lowBalance, healthy: 50 }
			: { critical: 10, warn: 20, healthy: 50 };
	if (!(tiers.critical <= tiers.warn && tiers.warn <= tiers.healthy)) {
		throw new Error(`${at}.balanceTiers must satisfy critical <= warn <= healthy`);
	}
	return tiers;
}

/**
 * Cross-field validation the schema cannot express: unique ids, tier
 * ordering, proxy references, and catalog override keys. Also derives the
 * render kind/currency from each row's format.
 * @param {object} raw - schema-processed config.
 * @returns {object[]} the normalized explicit provider list.
 */
function validateProviders(raw) {
	const seen = new Set();
	return raw.providers.map((entry, index) => {
		const at = `volc-balance-card: config.providers[${index}]`;
		if (!entry || typeof entry !== 'object') throw new Error(`${at} must be an object`);
		if (seen.has(entry.id)) throw new Error(`${at}.id duplicates "${entry.id}"`);
		seen.add(entry.id);
		const format = entry.format ?? 'deepseek-balance';
		const meta = FORMAT_META[format];
		if (!meta) throw new Error(`${at}.format "${format}" is unknown`);
		if (entry.proxy !== undefined && !(entry.proxy in raw.proxies)) {
			throw new Error(`${at}.proxy "${entry.proxy}" is not defined in config.proxies`);
		}
		return {
			id: entry.id,
			label: entry.label,
			credential: entry.credential,
			secretCredential: entry.secretCredential,
			region: entry.region,
			endpoint: entry.endpoint,
			format: format,
			proxy: entry.proxy,
			currency: typeof entry.currency === 'string' && entry.currency ? entry.currency : undefined,
			balanceTiers: resolveTiers(entry, at),
			windowLabels: {
				rolling: '滚',
				weekly: '周',
				monthly: '月',
				...(entry.windowLabels && typeof entry.windowLabels === 'object' ? entry.windowLabels : {})
			},
			warnPercent: numOf(entry.warnPercent, 70),
			errorPercent: numOf(entry.errorPercent, 90)
		};
	});
}

/** Parse an HTTP(S) proxy URL; throws a plain message on anything else. */
function parseHttpProxyUrl(url) {
	const parsed = new URL(url);
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('must be http:// or https:// (socks is unsupported)');
	}
	return parsed;
}

/** Validate the proxies map: HTTP(S) proxy URLs only. */
function validateProxies(proxies) {
	const out = {};
	for (const [name, url] of Object.entries(proxies || {})) {
		if (typeof url !== 'string') throw new Error(`volc-balance-card: config.proxies.${name} must be a URL string`);
		try {
			parseHttpProxyUrl(url);
		} catch (error) {
			throw new Error(`volc-balance-card: config.proxies.${name} "${url}" ${error instanceof Error ? error.message : 'is not a valid URL'}`);
		}
		out[name] = url;
	}
	return out;
}

/**
 * Validate catalog overrides: only known keys, ids must match the catalog,
 * and proxy references must name a configured proxy. Self-contained
 * misconfiguration fails loud here at load time.
 */
function validateCatalog(catalog: Record<string, any>, proxies: Record<string, string>) {
	const out: Record<string, any> = {};
	const known = new Set(CATALOG.map((entry) => entry.id));
	for (const [id, override] of Object.entries(catalog || {}) as [string, any][]) {
		if (!known.has(id)) throw new Error(`volc-balance-card: config.catalog.${id} matches no catalog entry (known: ${[...known].join(', ')})`);
		if (!override || typeof override !== 'object') throw new Error(`volc-balance-card: config.catalog.${id} must be an object`);
		for (const key of Object.keys(override)) {
			if (!CATALOG_OVERRIDE_KEYS.includes(key)) {
				throw new Error(`volc-balance-card: config.catalog.${id}.${key} is not a known override key (${CATALOG_OVERRIDE_KEYS.join(', ')})`);
			}
		}
		if (override.refs !== undefined && (!Array.isArray(override.refs) || !override.refs.every((ref: any) => CREDENTIAL_REF_PATTERN.test(ref)))) {
			throw new Error(`volc-balance-card: config.catalog.${id}.refs must be an array of UPPER_SNAKE credential references`);
		}
		if (override.secretRefs !== undefined && (!Array.isArray(override.secretRefs) || !override.secretRefs.every((ref: any) => CREDENTIAL_REF_PATTERN.test(ref)))) {
			throw new Error(`volc-balance-card: config.catalog.${id}.secretRefs must be an array of UPPER_SNAKE credential references`);
		}
		if (override.format !== undefined && !FORMAT_META[override.format]) {
			throw new Error(`volc-balance-card: config.catalog.${id}.format "${override.format}" is unknown`);
		}
		if (override.proxy !== undefined && !(override.proxy in proxies)) {
			throw new Error(`volc-balance-card: config.catalog.${id}.proxy "${override.proxy}" is not defined in config.proxies`);
		}
		out[id] = override;
	}
	return out;
}

/** JSON-safe row spec sent to the client half (render hints only, no secrets). */
function rowSpec(provider) {
	const meta = FORMAT_META[provider.format];
	const spec: Record<string, any> = { id: provider.id, label: provider.label, kind: meta.kind, proxy: provider.proxy ?? null };
	if (meta.kind === 'balance') {
		spec.currency = typeof provider.currency === 'string' && provider.currency ? provider.currency : meta.currency;
		spec.balanceTiers = provider.balanceTiers;
	} else if (meta.kind === 'usage') {
		spec.windowLabels = provider.windowLabels;
		spec.warnPercent = provider.warnPercent;
		spec.errorPercent = provider.errorPercent;
	}
	return spec;
}

/**
 * Request one URL as JSON through an HTTP(S) proxy without external
 * dependencies. https targets go through a CONNECT tunnel (TLS over the
 * tunnel socket); http targets are requested with their absolute URI.
 * Redirects are not followed; quota endpoints answer directly.
 * @param {string} targetUrl - absolute http(s) URL to request.
 * @param {string} proxyUrl - http(s) proxy URL, may carry user:pass.
 * @param {object} headers - request headers (authorization, ...).
 * @param {number} timeoutMs - whole-operation timeout.
 * @param {string} [method] - HTTP method (default GET).
 * @param {string} [body] - request body (JSON or form string).
 * @returns {Promise<{ok: boolean, status: number, json(): Promise<any>}>}
 */
function proxiedGetJson(targetUrl: string, proxyUrl: string, headers: Record<string, string>, timeoutMs: number, method: string = 'GET', body?: string): Promise<any> {
	const reqHeaders = body !== undefined
		? { ...headers, 'content-length': String(Buffer.byteLength(body, 'utf8')) }
		: { ...headers };
	return new Promise((resolve, reject) => {
		const target = new URL(targetUrl);
		const proxy = new URL(proxyUrl);
		const proxyTls = proxy.protocol === 'https:';
		const proxyPort = Number(proxy.port) || (proxyTls ? 443 : 80);
		const proxyHeaders = { ...headers };
		if (proxy.username || proxy.password) {
			const auth = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
			proxyHeaders['proxy-authorization'] = `Basic ${Buffer.from(auth).toString('base64')}`;
		}
		let settled = false;
		const timer = setTimeout(() => {
			settled = true;
			sock.destroy();
			reject(new Error(`proxy fetch timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		const finish = (fn) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			fn();
		};
		const fail = (error) => finish(() => reject(error));
		const sock = proxyTls
			? tls.connect({ host: proxy.hostname, port: proxyPort, servername: proxy.hostname })
			: net.connect({ host: proxy.hostname, port: proxyPort });
		// Persistent handlers, not `once`: the same failure reaches several
		// emitters (the socket AND the request Node re-emits it on), and a lone
		// unhandled 'error' on any ClientRequest/socket kills the host process.
		// `fail` is idempotent, so extra calls are no-ops.
		sock.on('error', fail);
		const readResponse = (req) => {
			req.once('response', (res) => {
				const chunks = [];
				let size = 0;
				res.on('data', (chunk) => {
					size += chunk.length;
					if (size > MAX_BODY_BYTES) {
						res.destroy();
						fail(new Error(`upstream body exceeds ${MAX_BODY_BYTES} bytes`));
						return;
					}
					chunks.push(chunk);
				});
				res.once('end', () => finish(() => resolve({
					ok: res.statusCode >= 200 && res.statusCode < 300,
					status: res.statusCode,
					json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8'))
				})));
				res.on('error', fail);
			});
			req.on('error', fail);
			req.end(body);
		};
		if (target.protocol === 'https:') {
			const connect = http.request({
				createConnection: () => sock,
				method: 'CONNECT',
				host: proxy.hostname,
				port: proxyPort,
				path: `${target.hostname}:${target.port || 443}`,
				headers: { ...proxyHeaders, host: `${target.hostname}:${target.port || 443}` },
				setHost: false
			});
			connect.once('connect', (res, tunnel) => {
				if (res.statusCode !== 200) {
					tunnel.destroy();
					fail(new Error(`proxy CONNECT failed: HTTP ${res.statusCode}`));
					return;
				}
				const secure = tls.connect({ socket: tunnel, servername: target.hostname });
				secure.on('error', fail);
				readResponse(https.request({
					createConnection: () => secure,
					method,
					host: target.hostname,
					port: target.port || 443,
					path: `${target.pathname}${target.search}`,
					headers: reqHeaders
				}));
			});
			// A refused proxy (ECONNREFUSED, the usual "proxy is not running")
			// arrives here as a socket error that ClientRequest re-emits: without
			// this listener Node reports an unhandled 'error' and exits.
			connect.on('error', fail);
			connect.end();
		} else {
			readResponse(http.request({
				createConnection: () => sock,
				method,
				host: target.hostname,
				port: proxyPort,
				path: targetUrl,
				headers: reqHeaders
			}));
		}
	});
}

/**
 * Request one provider URL as JSON, direct or through the row's proxy.
 * @param {string} [method] - HTTP method (default GET).
 * @param {string} [body] - request body (JSON or form string).
 * @returns {Promise<{ok: boolean, status: number, json(): Promise<any>}>}
 */
async function getJson(url, headers, proxyUrl, timeoutMs, method: string = 'GET', body?: string) {
	if (proxyUrl === undefined) {
		const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
		return { ok: res.ok, status: res.status, json: () => res.json() };
	}
	return proxiedGetJson(url, proxyUrl, headers, timeoutMs, method, body);
}

/**
 * First catalog credential reference that resolves, or null. Probing runs
 * per fetch cycle so environment changes apply without a restart.
 */
async function firstResolvedRef(ctx, refs) {
	for (const ref of refs) {
		const hit = await ctx.credentials.resolve(ref);
		if (hit && typeof hit.value === 'string' && hit.value.length > 0) return { ref, value: hit.value };
	}
	return null;
}

/**
 * Resolve the active provider rows: auto-discovered catalog entries (unless
 * hidden or replaced by an explicit same-id entry) plus explicit entries.
 * @returns {Promise<object[]>} rows with credential resolved for fetching.
 */
async function resolveRows(ctx, raw) {
	const rows = [];
	const explicitIds = new Set(raw.providers.map((entry) => entry.id));
	if (raw.auto) {
		for (const entry of CATALOG) {
			if (raw.hide.includes(entry.id) || explicitIds.has(entry.id)) continue;
			const override = raw.catalog[entry.id] || {};
			const merged = { ...entry, ...override };

			let credentialRef: string | undefined;
			let secretCredential: string | undefined;

			// Bearer/key rows: the primary ref must resolve. Two-credential
			// rows (e.g. Volcengine AK/SK) require BOTH refs; the resolved
			// ref NAME is stored (not the value); fetchRow re-resolves per
			// cycle.
			const hit = await firstResolvedRef(ctx, merged.refs);
			if (!hit) continue;
			credentialRef = hit.ref;
			if (Array.isArray(merged.secretRefs) && merged.secretRefs.length > 0) {
				const secretHit = await firstResolvedRef(ctx, merged.secretRefs);
				if (!secretHit) continue;
				secretCredential = secretHit.ref;
			}

			const at = `volc-balance-card: config.catalog.${entry.id}`;
			rows.push({
				id: merged.id,
				label: merged.label,
				credential: credentialRef,
				secretCredential,
				region: merged.region,
				endpoint: merged.endpoint,
				format: merged.format,
				proxy: merged.proxy,
				currency: typeof merged.currency === 'string' && merged.currency ? merged.currency : undefined,
				balanceTiers: resolveTiers({ ...entry, ...override }, at),
				windowLabels: {
					rolling: '滚',
					weekly: '周',
					monthly: '月',
					...(merged.windowLabels && typeof merged.windowLabels === 'object' ? merged.windowLabels : {})
				},
				warnPercent: numOf(merged.warnPercent, 70),
				errorPercent: numOf(merged.errorPercent, 90)
			});
		}
	}
	for (const entry of raw.providers) {
		if (raw.hide.includes(entry.id)) continue;
		rows.push(entry);
	}
	return rows;
}

/** Convert a Volcengine epoch value (ms or seconds, or -1 sentinel) to an ISO string or undefined. */
function volcEpochToIso(v: unknown): string | undefined {
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return undefined;
	return new Date(n > 1e12 ? n : n * 1000).toISOString();
}

/**
 * Parse a GetAFPUsage `Result` into rolling/weekly/monthly usage windows.
 * AFPDaily is intentionally skipped (hidden in the official console — its
 * quota is the legacy default, not an enforced limit). Quota<=0 marks an
 * unbound/unsubscribed window and is dropped, so a null result means "no
 * active Agent Plan" for the Agent row (it reports not-subscribed; the
 * Coding Plan is a separate row queried independently, no fallback).
 */
function parseVolcengineAFP(result: any): { kind: 'usage'; windows: Record<string, any>; title: string } | null {
	const parseWin = (key: string) => {
		const w = result?.[key];
		if (!w) return null;
		const quota = Number(w.Quota);
		if (!Number.isFinite(quota) || quota <= 0) return null;
		const used = Number(w.Used);
		const percent = Math.min(100, Math.max(0, Math.round((Number.isFinite(used) ? used : 0) / quota * 100)));
		return { percent, resetsAt: volcEpochToIso(w.ResetTime) };
	};
	const rolling = parseWin('AFPFiveHour');
	const weekly = parseWin('AFPWeekly');
	const monthly = parseWin('AFPMonthly');
	const windows: Record<string, any> = {};
	if (rolling) windows.rolling = rolling;
	if (weekly) windows.weekly = weekly;
	if (monthly) windows.monthly = monthly;
	if (Object.keys(windows).length === 0) return null;
	const title = [
		`5h: ${rolling?.percent ?? '—'}%`,
		`weekly: ${weekly?.percent ?? '—'}%`,
		`monthly: ${monthly?.percent ?? '—'}%`
	].join('\n');
	return { kind: 'usage', windows, title };
}

/**
 * Parse a GetCodingPlanUsage `Result` into rolling/weekly/monthly windows.
 * The API only reports percentages (no absolute counts); reset times are
 * in seconds. Field names verified against real responses (2026-06):
 * QuotaUsage[].Level in {session, weekly, monthly}, Percent in [0,100],
 * ResetTimestamp in seconds (or -1 when no reset is scheduled).
 */
function parseVolcengineCodingPlan(result: any): { kind: 'usage'; windows: Record<string, any>; title: string } | null {
	const arr = result?.QuotaUsage ?? result?.Usages ?? result?.Details;
	if (!Array.isArray(arr) || arr.length === 0) return null;
	const slotFor = (label: string): string | null => {
		switch (label.toLowerCase()) {
			case 'session': case '5h': case 'fivehour': case 'five_hour': case 'rolling_5h': return 'rolling';
			case 'weekly': case 'week': case '7d': return 'weekly';
			case 'monthly': case 'month': return 'monthly';
			default: return null;
		}
	};
	const windows: Record<string, any> = {};
	for (const item of arr) {
		const label = String(item?.Level ?? item?.Type ?? item?.Period ?? item?.Label ?? item?.Window ?? '');
		const slot = slotFor(label);
		if (!slot) continue;
		const percent = Number(item?.Percent ?? item?.UsedPercent ?? item?.UsagePercent);
		if (!Number.isFinite(percent)) continue;
		windows[slot] = {
			percent: Math.min(100, Math.max(0, Math.round(percent))),
			resetsAt: volcEpochToIso(item?.ResetTime ?? item?.ResetTimestamp)
		};
	}
	if (Object.keys(windows).length === 0) return null;
	const title = [
		`session: ${windows.rolling?.percent ?? '—'}%`,
		`weekly: ${windows.weekly?.percent ?? '—'}%`,
		`monthly: ${windows.monthly?.percent ?? '—'}%`
	].join('\n');
	return { kind: 'usage', windows, title };
}

/** Normalize one upstream body through its format adapter. */
function adaptRow(format, body) {
	const adapter = FORMATS[format] ?? FORMATS['deepseek-balance'];
	try {
		return { view: adapter(body) };
	} catch (error) {
		return { error: `${format}: ${String((error && error.message) || error)}` };
	}
}

/**
 * Fetch one provider row: resolve its credential, call the upstream
 * endpoint(s), normalize through the format adapter. openai-billing issues
 * two dashboard requests against the configured base URL. A client-supplied
 * proxy URL (settings panel) wins over the row's profile-configured proxy.
 */
async function fetchRow(ctx, provider, proxies, clientProxyUrl) {
	try {
		const hit = await ctx.credentials.resolve(provider.credential);
		if (!hit || typeof hit.value !== 'string' || hit.value.length === 0) {
			return { id: provider.id, error: `${provider.credential} is not configured` };
		}
		// ── Volcengine Ark: AK/SK signed OpenAPI, not Bearer ──────
		//
		// Two independent subscription rows share the same AK/SK:
		//   volcengine-agent  -> GetAFPUsage      (Agent Plan)
		//   volcengine-coding -> GetCodingPlanUsage (Coding Plan)
		// Each row queries ONLY its own action — no fallback between the
		// two, so a plan the account has not subscribed to reports an
		// inline "not subscribed" message rather than showing the other
		// plan's numbers. Auth failures carry the upstream code.
		if (provider.format === 'volcengine-agent-usage' || provider.format === 'volcengine-coding-usage') {
			if (!provider.secretCredential) {
				return { id: provider.id, error: `${provider.format} requires both VOLC_ACCESS_KEY and VOLC_SECRET_KEY (only the AK was resolved)` };
			}
			const skHit = await ctx.credentials.resolve(provider.secretCredential);
			if (!skHit || typeof skHit.value !== 'string' || skHit.value.length === 0) {
				return { id: provider.id, error: `${provider.secretCredential} is not configured` };
			}
			const ak = hit.value;
			const sk = skHit.value;
			// Region from the explicit provider.region override, else
			// derived from a volces.com data-plane host in `endpoint`,
			// else the Volcengine Beijing default.
			let region = 'cn-beijing';
			if (typeof provider.region === 'string' && provider.region) {
				region = provider.region;
			} else {
				const m = /ark\.([a-z0-9-]+)\.volces\.com/.exec(provider.endpoint || '');
				if (m) region = m[1];
			}
			const isAgent = provider.format === 'volcengine-agent-usage';
			try {
				if (isAgent) {
					const body = await volcengineCall('GetAFPUsage', region, ak, sk, UPSTREAM_TIMEOUT_MS);
					const result = body?.Result ?? body;
					const view = parseVolcengineAFP(result);
					if (view) {
						const plan = result?.PlanType ? `Agent Plan ${result.PlanType}` : 'Agent Plan';
						view.title = `plan: ${plan}\n` + view.title;
						return { id: provider.id, view };
					}
					return { id: provider.id, error: 'No active Volcengine Ark Agent Plan subscription (GetAFPUsage returned no quota windows)' };
				}
				const body = await volcengineCall('GetCodingPlanUsage', region, ak, sk, UPSTREAM_TIMEOUT_MS);
				const result = body?.Result ?? body;
				const view = parseVolcengineCodingPlan(result);
				if (view) {
					view.title = 'plan: Coding Plan\n' + view.title;
					return { id: provider.id, view };
				}
				return { id: provider.id, error: 'No active Volcengine Ark Coding Plan subscription (GetCodingPlanUsage returned no quota windows)' };
			} catch (ve) {
				return { id: provider.id, error: String((ve && (ve as Error).message) || ve) };
			}
		}
		// ── 火山引擎账户余额（Billing QueryBalanceAcct）──────────
		//
		// 与上面两个套餐用量行共用同一对 AK/SK，但走 billing 服务的
		// GET 接口，返回值是账户充值余额（现金/可用/欠费/冻结）。
		// 结果按 AK 缓存 30s，避免多个客户端同时刷新时重复计费调用。
		if (provider.format === 'volcengine-billing-balance') {
			if (!provider.secretCredential) {
				return { id: provider.id, error: 'volcengine-billing-balance requires both VOLC_ACCESS_KEY and VOLC_SECRET_KEY (only the AK was resolved)' };
			}
			const skHit = await ctx.credentials.resolve(provider.secretCredential);
			if (!skHit || typeof skHit.value !== 'string' || skHit.value.length === 0) {
				return { id: provider.id, error: `${provider.secretCredential} is not configured` };
			}
			const ak = hit.value;
			const sk = skHit.value;
			const region = typeof provider.region === 'string' && provider.region ? provider.region : VOLC_BILLING_REGION;
			const cacheKey = `${ak}:${region}`;
			const cached = volcBalanceCache.get(cacheKey);
			if (cached && Date.now() - cached.at < VOLC_BALANCE_TTL_MS) {
				return { id: provider.id, view: cached.view };
			}
			try {
				const now = new Date();
				const signed = volcBillingSign(ak, sk, region, 'QueryBalanceAcct', VOLC_BILLING_VERSION, now);
				const url = `https://${VOLC_BILLING_HOST}/?${signed.query}`;
				const upstream = await getJson(url, signed.headers, undefined, UPSTREAM_TIMEOUT_MS);
				const body = await upstream.json().catch(() => null);
				if (body === null) return { id: provider.id, error: `HTTP ${upstream.status}: non-JSON response` };
				const upstreamError = body?.ResponseMetadata?.Error;
				if (upstreamError) {
					return { id: provider.id, error: `QueryBalanceAcct: ${upstreamError.Code ?? 'error'} ${upstreamError.Message ?? ''}`.trim() };
				}
				const outcome = adaptRow(provider.format, body);
				if (outcome.view) volcBalanceCache.set(cacheKey, { at: Date.now(), view: outcome.view });
				return { id: provider.id, ...outcome };
			} catch (be) {
				return { id: provider.id, error: String((be && (be as Error).message) || be) };
			}
		}
		const headers = { authorization: `Bearer ${hit.value}` };
		const proxyUrl = clientProxyUrl !== undefined
			? clientProxyUrl
			: (provider.proxy !== undefined ? proxies[provider.proxy] : undefined);
		if (provider.format === 'openai-billing') {
			const base = provider.endpoint.replace(/\/+$/, '');
			const sub = await getJson(`${base}/v1/dashboard/billing/subscription`, headers, proxyUrl, UPSTREAM_TIMEOUT_MS);
			const usage = await getJson(`${base}/v1/dashboard/billing/usage`, headers, proxyUrl, UPSTREAM_TIMEOUT_MS);
			const limit = Number((await sub.json())?.hard_limit_usd);
			const used = Number((await usage.json())?.total_usage);
			if (!Number.isFinite(limit) || !Number.isFinite(used)) {
				return { id: provider.id, error: 'openai-billing: missing hard_limit_usd / total_usage' };
			}
			return { id: provider.id, view: { kind: 'balance', amount: limit - used, title: `额度上限: $${limit.toFixed(2)}\n已用: $${used.toFixed(2)}` } };
		}
		const upstream = await getJson(provider.endpoint, headers, proxyUrl, UPSTREAM_TIMEOUT_MS);
		const body = await upstream.json().catch(() => null);
		if (body === null) return { id: provider.id, error: `HTTP ${upstream.status}: non-JSON response` };
		const outcome = adaptRow(provider.format, body);
		if (!upstream.ok && outcome.error === undefined) {
			return { id: provider.id, error: `HTTP ${upstream.status}`, view: outcome.view };
		}
		return { id: provider.id, ...outcome };
	} catch (error) {
		return { id: provider.id, error: String((error && error.message) || error) };
	}
}

/** rpcId Connection substitutes for an envelope it cannot parse. */
const INVALID_RPC_ID = 'invalid-request';

/** Compose one `server-response` envelope Connection's client RPC helper accepts. */
function rpcEnvelope(rpcId: string, result: Record<string, any>, status = 200): Response {
	return new Response(JSON.stringify({ type: 'server-response', rpcId, result }), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
}

/** Failure result shape Connection's client validates (`details` must be an object). */
function rpcError(code: string, message: string, details: Record<string, any> = {}): Record<string, any> {
	return { ok: false, error: { code, message, details } };
}

/**
 * Serve one endpoint inside Connection's `/api` fence.
 *
 * The browser half calls Connection's client RPC helper, which posts
 * `{type:'client-request', rpcId, method, payload}` and requires a
 * `{type:'server-response', rpcId, result}` reply. Connection owns the
 * trusted-host + browser-session check on the `/api` route that dispatches
 * here, so this function only owns the envelope and the endpoint value.
 * @param endpoint - endpoint this route serves.
 * @param request - inbound POST request.
 * @param handle - endpoint dispatcher from {@link apply}.
 * @returns the JSON response Connection's client validates.
 */
async function rpcResponse(
	endpoint: string,
	request: Request,
	handle: (endpoint: string, payload: any, signal?: AbortSignal) => Promise<Record<string, any>>
): Promise<Response> {
	const contentType = (request.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
	if (contentType !== 'application/json') {
		return rpcEnvelope(INVALID_RPC_ID, rpcError('gateway/bad-request', 'content type must be application/json'), 415);
	}
	let message: any;
	try {
		message = await request.json();
	} catch {
		return rpcEnvelope(INVALID_RPC_ID, rpcError('gateway/bad-request', 'body is not JSON'));
	}
	if (!message || typeof message !== 'object' || Array.isArray(message) || message.type !== 'client-request' || typeof message.rpcId !== 'string') {
		return rpcEnvelope(INVALID_RPC_ID, rpcError('gateway/bad-request', 'invalid client-request message'));
	}
	const expected = rpcMethod(endpoint);
	if (message.method !== expected) {
		return rpcEnvelope(message.rpcId, rpcError('gateway/bad-request', `method ${JSON.stringify(String(message.method))} does not match endpoint ${JSON.stringify(expected)}`));
	}
	try {
		return rpcEnvelope(message.rpcId, await handle(endpoint, message.payload, request.signal));
	} catch (error) {
		return rpcEnvelope(message.rpcId, rpcError('internal', String((error && (error as any).message) || error)));
	}
}

/**
 * Apply the plugin: normalize config and mount the RPC routes.
 *
 * Route registrations belong to the caller fiber (disposed with it). They ride
 * Connection's exact Fetch registry rather than `connection.rpc.handle`: in DSH
 * 0.1.5+ that channel's disposer resolves `owner.webServer` against the
 * Connection plugin's own fiber, which never holds `webServer`, so a
 * third-party channel throws inside a child fiber and vanishes without a boot
 * error. The Fetch registry needs only `owner.effect`, and the `/api` route that
 * dispatches it already enforces the trusted-host + browser fence.
 * @param ctx - plugin context with connection and credentials services.
 * @param config - raw plugin config (schema-processed by the loader).
 */
export function apply(ctx, config: Record<string, any> = {}) {
	const raw: Record<string, any> = config && typeof config === 'object' ? config : {};
	const refreshMs = numOf(raw.refreshMs, 60000);
	if (!(refreshMs >= 5000)) throw new Error('volc-balance-card: config.refreshMs must be >= 5000');
	const proxies = validateProxies(raw.proxies);
	const catalog = validateCatalog(raw.catalog, proxies);
	const providers = validateProviders({ providers: Array.isArray(raw.providers) ? raw.providers : [], proxies });

	const handleRpc = async (endpoint: string, payload: any, _signal?: AbortSignal) => {
		try {
			// ── AK/SK 配置（设置面板）─────────────────────────────
			// 凭据写进 DSH 凭据库（~/.dsh/.credentials.yaml 的 refs 段），
			// 不进浏览器 localStorage；SK 永不回传，只回掩码与来源。
			if (endpoint === 'credential-status') {
				return { ok: true, value: await credentialStatus(ctx) };
			}
			if (endpoint === 'set-credentials') {
				const ak = payload && typeof payload.accessKey === 'string' ? payload.accessKey.trim() : '';
				const sk = payload && typeof payload.secretKey === 'string' ? payload.secretKey.trim() : '';
				const regionInput = payload && typeof payload.region === 'string' ? payload.region.trim() : '';
				const region = regionInput || VOLC_BILLING_REGION;
				if (!VOLC_AK_PATTERN.test(ak)) {
					return { ok: false, error: { code: 'invalid-ak', message: 'Access Key ID 形如 AKLT…（AK + 字母数字）', details: {} } };
				}
				if (sk.length < 16) {
					return { ok: false, error: { code: 'invalid-sk', message: 'Secret Access Key 至少 16 个字符', details: {} } };
				}
				// 先用这对凭据真调一次余额接口：错了不覆盖已有配置。
				let probe;
				try {
					probe = await probeVolcBalance(ak, sk, region);
				} catch (error) {
					return { ok: false, error: { code: 'probe-failed', message: `验证失败：${(error as Error).message}`, details: {} } };
				}
				await ctx.credentials.set(VOLC_ACCESS_KEY_REF, ak);
				await ctx.credentials.set(VOLC_SECRET_KEY_REF, sk);
				volcBalanceCache.clear();
				return { ok: true, value: { status: await credentialStatus(ctx), probe } };
			}
			if (endpoint === 'test-credentials') {
				const akHit = await ctx.credentials.resolve(VOLC_ACCESS_KEY_REF);
				const skHit = await ctx.credentials.resolve(VOLC_SECRET_KEY_REF);
				const ak = String(akHit?.value ?? '');
				const sk = String(skHit?.value ?? '');
				if (!ak || !sk) {
					return { ok: false, error: { code: 'missing', message: '尚未配置 AK/SK', details: {} } };
				}
				try {
					const probe = await probeVolcBalance(ak, sk, VOLC_BILLING_REGION);
					return { ok: true, value: { status: await credentialStatus(ctx), probe } };
				} catch (error) {
					return { ok: false, error: { code: 'probe-failed', message: String((error as Error).message), details: {} } };
				}
			}
			if (endpoint === 'clear-credentials') {
				await ctx.credentials.unset(VOLC_ACCESS_KEY_REF).catch(() => {});
				await ctx.credentials.unset(VOLC_SECRET_KEY_REF).catch(() => {});
				volcBalanceCache.clear();
				return { ok: true, value: { status: await credentialStatus(ctx) } };
			}
			const rows = await resolveRows(ctx, {
				auto: raw.auto !== false,
				hide: Array.isArray(raw.hide) ? raw.hide : [],
				providers,
				proxies,
				catalog
			});
			if (endpoint === 'specs') {
				return { ok: true, value: { rows: rows.map(rowSpec), refreshMs } };
			}
			if (endpoint === 'fetch-all') {
				const overrides = {};
				const overrideErrors = {};
				const rawOverrides = payload && typeof payload === 'object' && payload.proxy && typeof payload.proxy === 'object' ? payload.proxy : {};
				for (const [id, url] of Object.entries(rawOverrides)) {
					if (url === null || url === undefined || url === '') continue;
					try {
						parseHttpProxyUrl(url);
						overrides[id] = url;
					} catch (error) {
						overrideErrors[id] = `client proxy "${url}": ${error instanceof Error ? error.message : 'is not a valid URL'}`;
					}
				}
				const fetched = await Promise.all(rows.map(async (provider) => {
					if (overrideErrors[provider.id] !== undefined) {
						return { id: provider.id, error: overrideErrors[provider.id] };
					}
					return fetchRow(ctx, provider, proxies, overrides[provider.id]);
				}));
				return { ok: true, value: { rows: fetched, fetchedAt: Date.now() } };
			}
			return { ok: false, error: { code: 'internal', message: `unknown endpoint: ${String(endpoint)}`, details: {} } };
		} catch (error) {
			return { ok: false, error: { code: 'internal', message: String((error && error.message) || error), details: {} } };
		}
	};

	for (const endpoint of RPC_ENDPOINTS) {
		ctx.connection.fetch.register({
			path: rpcRoutePath(endpoint),
			methods: ['POST'],
			requestBody: 'buffered',
			fetch: (request: Request) => rpcResponse(endpoint, request, handleRpc)
		});
	}
}
