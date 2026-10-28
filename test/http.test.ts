import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transport, WclClient } from '../src/http.ts';
import type { Fetch } from '../src/http.ts';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const token = () => json({ access_token: 'synthetic-token', expires_in: 3600 });
const credentials = { id: 'synthetic-id', secret: 'synthetic-secret' };
const noSleep = async () => {};

test('OAuth client credentials, bearer reuse, public endpoint only', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = new WclClient(credentials, { fetch: async (url, init) => {
    calls.push({ url, init });
    return url.endsWith('/token') ? token() : json({ data: { ok: true } });
  } });
  await client.query('query Test { ok }', { test: '中文' });
  await client.query('query Test { ok }');
  assert.equal(calls.length, 3);
  assert.equal(calls[0]!.init.body, 'grant_type=client_credentials');
  assert.equal(new Headers(calls[0]!.init.headers).get('authorization'), 'Basic ' + Buffer.from('synthetic-id:synthetic-secret').toString('base64'));
  assert.equal(calls[1]!.url, 'https://www.warcraftlogs.com/api/v2/client');
  assert.equal(new Headers(calls[1]!.init.headers).get('authorization'), 'Bearer synthetic-token');
  assert.equal(JSON.parse(calls[1]!.init.body as string).variables.test, '中文');
});

test('token expires and refreshes without a disk token cache', async () => {
  let now = 0, tokens = 0;
  const client = new WclClient(credentials, { now: () => now, fetch: async url => {
    if (url.endsWith('/token')) { tokens++; return token(); }
    return json({ data: {} });
  } });
  await client.query('q'); now = 3600_000; await client.query('q');
  assert.equal(tokens, 2);
});

test('401 refreshes once; persistent 401 fails', async () => {
  for (const persistent of [false, true]) {
    let calls = 0, tokens = 0;
    const client = new WclClient(credentials, { fetch: async url => {
      if (url.endsWith('/token')) { tokens++; return token(); }
      calls++;
      return persistent || calls === 1 ? json({}, 401) : json({ data: {} });
    } });
    if (persistent) await assert.rejects(client.query('q'), { code: 'AUTH_FAILED' });
    else await client.query('q');
    assert.equal(calls, 2); assert.equal(tokens, 2);
  }
});

test('missing or rejected credentials do not expose secrets', async () => {
  assert.throws(() => new WclClient({ id: '', secret: '' }), { code: 'MISSING_CREDENTIALS' });
  const client = new WclClient(credentials, { fetch: async () => json({ error: credentials.secret }, 400) });
  await assert.rejects(client.query('q'), error => {
    assert.equal((error as { code: string }).code, 'AUTH_FAILED');
    assert.ok(!String(error).includes(credentials.secret)); return true;
  });
});

test('HTTP 200 GraphQL errors (including partial data) fail without echoing upstream text', async () => {
  const client = new WclClient(credentials, { fetch: async url => url.endsWith('/token') ? token()
    : json({ data: { partial: true }, errors: [{ message: credentials.secret }] }) });
  await assert.rejects(client.query('q'), error => {
    assert.equal((error as { code: string }).code, 'GRAPHQL_ERROR');
    assert.ok(!String(error).includes(credentials.secret)); return true;
  });
});

test('403 challenge, HTML, malformed JSON and missing data are distinct errors', async () => {
  const cases: [() => Response, string][] = [
    [() => new Response('<html>challenge</html>', { status: 403 }), 'ACCESS_BLOCKED'],
    [() => new Response('<html>challenge</html>', { headers: { 'content-type': 'text/html' } }), 'INVALID_RESPONSE'],
    [() => new Response('{bad', { headers: { 'content-type': 'application/json' } }), 'INVALID_RESPONSE'],
    [() => json({}), 'INVALID_RESPONSE'],
  ];
  for (const [response, code] of cases) {
    const client = new WclClient(credentials, { fetch: async url => url.endsWith('/token') ? token() : response() });
    await assert.rejects(client.query('q'), { code });
  }
});

test('429 reports Retry-After and is not automatically retried', async () => {
  let calls = 0;
  const transport = new Transport({ fetch: async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '42' } }); } });
  await assert.rejects(transport.json('https://example.invalid', {}), error => {
    assert.match(String(error), /42/); return (error as { code: string }).code === 'RATE_LIMITED';
  });
  assert.equal(calls, 1);
});

test('GraphQL quota errors are classified as rate limits without echoing messages', async () => {
  const client = new WclClient(credentials, { fetch: async url => url.endsWith('/token') ? token()
    : json({ errors: [{ message: 'synthetic-secret quota exceeded', extensions: { code: 'RATE_LIMITED' } }] }) });
  await assert.rejects(client.query('q'), error => {
    assert.ok(!String(error).includes('synthetic-secret'));
    return (error as { code: string }).code === 'RATE_LIMITED';
  });
});

test('network failures and 5xx retry twice, then return classified errors', async () => {
  for (const code of ['NETWORK_ERROR', 'UPSTREAM_ERROR']) {
    let count = 0;
    const transport = new Transport({ sleep: noSleep, fetch: async () => {
      count++; if (code === 'NETWORK_ERROR') throw new TypeError('secret upstream detail');
      return json({}, 503);
    } });
    await assert.rejects(transport.json('https://example.invalid', {}), { code });
    assert.equal(count, 3);
  }
});

test('20-second default is overridable in tests; timeout retries twice', async () => {
  let calls = 0;
  const fetcher: Fetch = async (_url, init) => {
    calls++;
    await new Promise<void>((_resolve, reject) => {
      const signal = init.signal!;
      const timer = setTimeout(() => {}, 100);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
    return json({});
  };
  const transport = new Transport({ fetch: fetcher, sleep: noSleep, timeoutMs: 5 });
  await assert.rejects(transport.json('https://example.invalid', {}), { code: 'TIMEOUT' });
  assert.equal(calls, 3);
});

test('interrupted response body retries as a network failure, not a JSON syntax error', async () => {
  let calls = 0;
  const transport = new Transport({ sleep: noSleep, fetch: async () => {
    calls++;
    return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('connection reset')); } }),
      { headers: { 'content-type': 'application/json' } });
  } });
  await assert.rejects(transport.json('https://example.invalid', {}), { code: 'NETWORK_ERROR' });
  assert.equal(calls, 3);
});
