// End-to-end integration test for the host half.
//
// Drives the real RPC routes with a fake ctx, so the assertions cover exactly
// what the sidebar card calls: credential-status / set-credentials /
// test-credentials / clear-credentials / specs / fetch-all.
//
// Two modes:
//   VOLC_AK=... VOLC_SK=... node test-integration.mjs   -> hits the real APIs
//   node test-integration.mjs                           -> offline: fetch is
//     stubbed with canned Billing/Ark responses, so CI needs no credentials.
import { apply, RPC_METHOD_PREFIX } from './lib/index.js';

const liveAk = process.env.VOLC_AK;
const liveSk = process.env.VOLC_SK;
const live = Boolean(liveAk && liveSk);

const DUMMY_AK = 'AKLTtesttesttesttesttesttest01';
const DUMMY_SK = 'dGVzdC1zZWNyZXQta2V5LWZvci1vZmZsaW5lLXRlc3Rz';

if (!live) {
	const reset = Math.floor(Date.now() / 1000) + 3600;
	const canned = {
		balance: {
			ResponseMetadata: { RequestId: 'offline', Action: 'QueryBalanceAcct', Version: '2022-01-01', Service: 'billing', Region: 'cn-north-1' },
			Result: {
				AccountID: 2102720225,
				ArrearsBalance: '0.17',
				AvailableBalance: '80.10',
				CashBalance: '80.27',
				CreditLimit: '0',
				Currency: 'CNY',
				FreezeAmount: '0'
			}
		},
		coding: {
			ResponseMetadata: { RequestId: 'offline', Action: 'GetCodingPlanUsage', Version: '2024-01-01', Service: 'ark', Region: 'cn-north-1' },
			Result: {
				QuotaUsage: [
					{ Level: 'session', Percent: 0, ResetTimestamp: reset },
					{ Level: 'weekly', Percent: 0, ResetTimestamp: reset },
					{ Level: 'monthly', Percent: 12, ResetTimestamp: reset }
				]
			}
		},
		agent: { ResponseMetadata: { RequestId: 'offline' }, Result: {} }
	};
	globalThis.fetch = async (url) => {
		const href = String(url);
		let body = canned.agent;
		if (href.includes('billing.volcengineapi.com')) body = canned.balance;
		else if (href.includes('Action=GetCodingPlanUsage')) body = canned.coding;
		return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
	};
}

const store = new Map();
const routes = new Map();
const ctx = {
	credentials: {
		resolve: async (ref) => (store.has(ref) ? { value: store.get(ref), source: 'file' } : undefined),
		describe: async (ref) => ({ configured: store.has(ref), source: store.has(ref) ? 'file' : undefined, writable: true }),
		set: async (ref, value) => {
			if (!value) throw new Error('empty value');
			store.set(ref, value);
		},
		unset: async (ref) => { store.delete(ref); }
	},
	connection: {
		fetch: {
			register: (reg) => { routes.set(reg.path, reg); return () => {}; }
		}
	},
	effect: () => {}
};

apply(ctx, { refreshMs: 60000, auto: true, providers: [] });

async function call(endpoint, payload) {
	const path = `/api/${RPC_METHOD_PREFIX}/${endpoint}`;
	const route = routes.get(path);
	if (!route) throw new Error(`route not registered: ${path} (have ${[...routes.keys()].join(', ')})`);
	const response = await route.fetch(new Request('http://127.0.0.1' + path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ type: 'client-request', rpcId: 'test-1', method: `${RPC_METHOD_PREFIX}/${endpoint}`, payload })
	}));
	const envelope = await response.json();
	return envelope.result ?? envelope;
}

const failures = [];
const check = (label, condition, detail) => {
	if (!condition) failures.push(`${label}${detail === undefined ? '' : `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};

const AK = liveAk ?? DUMMY_AK;
const SK = liveSk ?? DUMMY_SK;
const report = {};

report['status.empty'] = await call('credential-status', null);
check('credential-status before setup', report['status.empty'].ok === true && report['status.empty'].value.configured === false, report['status.empty']);

report['set.badAk'] = await call('set-credentials', { accessKey: 'nope', secretKey: SK });
check('invalid AK is rejected', report['set.badAk'].ok === false && report['set.badAk'].error?.code === 'invalid-ak', report['set.badAk']);

report['set.good'] = await call('set-credentials', { accessKey: AK, secretKey: SK });
check('valid AK/SK is accepted', report['set.good'].ok === true, report['set.good']);
if (report['set.good'].ok) {
	const status = report['set.good'].value.status;
	check('access key is masked', /^AK.{2}\*{4}/.test(status.accessKeyMasked), status.accessKeyMasked);
	check('secret key is never returned', !JSON.stringify(report['set.good'].value).includes(SK), 'SK leaked to the client payload');
	check('probe returned an amount', Number.isFinite(report['set.good'].value.probe?.amount), report['set.good'].value.probe);
}

report['status.after'] = await call('credential-status', null);
check('status reports configured after save', report['status.after'].value?.configured === true, report['status.after']);

report['test'] = await call('test-credentials', null);
check('test-credentials succeeds with stored keys', report['test'].ok === true, report['test']);

const specs = await call('specs', null);
report['specs'] = {
	ok: specs.ok,
	rows: specs.ok ? specs.value.rows.map((r) => `${r.id}:${r.kind}`) : specs.error
};
check('specs lists the three rows', specs.ok && report['specs'].rows.join(',') === 'volcengine-agent:usage,volcengine-coding:usage,volcengine-balance:balance', report['specs']);

const all = await call('fetch-all', { proxy: {} });
report['fetch'] = all.ok
	? all.value.rows.map((r) => ({ id: r.id, amount: r.view?.amount, windows: r.view?.windows ?? undefined, title: r.view?.title, error: r.error }))
	: all.error;

if (all.ok) {
	const byId = new Map(all.value.rows.map((r) => [r.id, r]));
	const balance = byId.get('volcengine-balance');
	const coding = byId.get('volcengine-coding');
	const agent = byId.get('volcengine-agent');
	check('balance row has a numeric amount', Number.isFinite(balance?.view?.amount), balance);
	check('balance row is a balance view', balance?.view?.kind === 'balance', balance?.view);
	check('balance detail mentions arrears', typeof balance?.view?.title === 'string' && balance.view.title.includes('欠费'), balance?.view?.title);
	if (!live) check('balance amount matches the canned response', balance?.view?.amount === 80.1, balance?.view?.amount);
	check('coding row reports windows', coding?.view?.kind === 'usage' && Object.keys(coding.view.windows ?? {}).length > 0, coding);
	if (!live) check('coding monthly percent is 12', coding?.view?.windows?.monthly?.percent === 12, coding?.view?.windows);
	check('agent row reports the missing subscription as a notice, not an error', agent?.view?.notice === 'agent-plan-absent' && agent?.error === undefined, agent);
} else {
	check('fetch-all succeeded', false, all.error);
}

report['clear'] = await call('clear-credentials', null);
check('clear removes the key pair', report['clear'].ok === true && report['clear'].value.status.configured === false, report['clear']);

report['status.cleared'] = await call('credential-status', null);
check('status is empty after clear', report['status.cleared'].value?.configured === false, report['status.cleared']);

const after = await call('fetch-all', { proxy: {} });
report['fetch.afterClear'] = after.ok ? after.value.rows.map((r) => r.id) : after.error;
check('no rows without credentials', after.ok && after.value.rows.length === 0, report['fetch.afterClear']);

console.log(JSON.stringify({ mode: live ? 'live' : 'offline', report }, null, 2));

if (failures.length > 0) {
	console.error(`\n[test] ${failures.length} failed check(s):`);
	for (const failure of failures) console.error(` - ${failure}`);
	process.exit(1);
}
console.log('\n[test] ok');
