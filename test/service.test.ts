import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Cache } from '../src/cache.ts';
import { WclService } from '../src/service.ts';
import { CHARACTER_QUERY, CLASSES_QUERY, RANKINGS_QUERY, REALMS_QUERY, ZONES_QUERY } from '../src/queries.ts';
import { zone, realm, identity, options, rawRankings } from './fixtures.ts';
import type { QueryClient } from '../src/service.ts';
import type { TestContext } from 'node:test';

async function directory(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'wcl-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

export function fixtureClient(calls: { query: string; variables: Record<string, unknown> }[],
  overrides: Partial<Record<'zone' | 'lookup' | 'rankings' | 'servers', unknown>> = {}): QueryClient {
  return { async query(query, variables = {}) {
    calls.push({ query, variables });
    if (query === ZONES_QUERY) return { data: { worldData: { zones: overrides.zone ?? [zone] } } };
    if (query === REALMS_QUERY) return { data: { worldData: { region: { servers: overrides.servers ?? { data: [realm], has_more_pages: false } } } } };
    if (query === CHARACTER_QUERY) return { data: { characterData: { character: Object.hasOwn(overrides, 'lookup') ? overrides.lookup : { ...identity, hidden: false } } } };
    if (query === CLASSES_QUERY) return { data: { gameData: { classes: [{ id: identity.classID, name: 'Synthetic Mage' }] } } };
    if (query === RANKINGS_QUERY) return (overrides.rankings ?? rawRankings()) as Record<string, unknown>;
    throw Error('Unexpected synthetic query');
  } };
}

test('service uses metadata slug, explicit difficulty, Historical and default partition; caches successes', async t => {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const service = new WclService(fixtureClient(calls), new Cache(await directory(t)));
  const first = await service.character(options);
  assert.equal('status' in first && first.status, 'ok');
  assert.equal(calls.length, 5);
  assert.equal(calls[1]!.variables.region, 'CN');
  assert.equal(calls[2]!.variables.realm, 'synthetic-realm-slug');
  assert.deepEqual(calls[3]!.variables, { id: 123, zone: 53, difficulty: 5, metric: 'dps', spec: null, timeframe: 'Historical', partition: 2 });
  const second = await service.character(options);
  assert.equal(calls.length, 5);
  assert.equal((second.character as { className: string }).className, 'Synthetic Mage');
  assert.equal((second.cache as { hit: boolean }).hit, true);
});

test('partition all, explicit partition, hps/spec/today are separate queries', async t => {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const service = new WclService(fixtureClient(calls), new Cache(await directory(t)));
  await service.character({ ...options, partition: 'all', metric: 'hps', spec: 'Frost', timeframe: 'today' });
  const firstRanking = calls.find(c => c.query === RANKINGS_QUERY)!;
  assert.equal(firstRanking.variables.partition, -1);
  assert.equal(firstRanking.variables.metric, 'hps');
  assert.equal(firstRanking.variables.timeframe, 'Today');
  await service.character({ ...options, partition: 1 });
  assert.equal(calls.at(-1)!.variables.partition, 1);
});

test('missing default ID omits partition variable rather than guessing max ID', async t => {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const service = new WclService(fixtureClient(calls, { zone: [{ ...zone, partitions: [] }] }), new Cache(await directory(t)));
  const result = await service.character(options);
  assert.ok(!Object.hasOwn(calls.find(c => c.query === RANKINGS_QUERY)!.variables, 'partition'));
  assert.equal((result.filters as { partition: unknown }).partition, null);
});

test('rejects missing zone, unsupported difficulty and invalid partition before character lookup', async t => {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const service = new WclService(fixtureClient(calls), new Cache(await directory(t)));
  await assert.rejects(service.character({ ...options, zone: 999 }), { code: 'ZONE_NOT_FOUND' });
  await assert.rejects(service.character({ ...options, difficulty: 'normal' }), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(service.character({ ...options, partition: 999 }), { code: 'INVALID_ARGUMENT' });
  assert.equal(calls.length, 1);
});

test('hidden and missing characters fail before ranking query and are not cached', async t => {
  for (const [lookup, code] of [[null, 'CHARACTER_NOT_FOUND'], [{ ...identity, hidden: true }, 'RANKINGS_HIDDEN']] as const) {
    const calls: { query: string; variables: Record<string, unknown> }[] = [];
    const service = new WclService(fixtureClient(calls, { lookup }), new Cache(await directory(t)));
    await assert.rejects(service.character(options), { code });
    await assert.rejects(service.character(options), { code });
    assert.equal(calls.filter(c => c.query === CHARACTER_QUERY).length, 2);
    assert.equal(calls.filter(c => c.query === RANKINGS_QUERY).length, 0);
  }
});

test('raw works for changed ranking JSON; failed conversion is never cached', async t => {
  const dir = await directory(t);
  const raw = rawRankings();
  (raw.data.characterData.character as unknown as Record<string, unknown>).zoneRankings = { newShape: true };
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const service = new WclService(fixtureClient(calls, { rankings: raw }), new Cache(dir));
  await assert.rejects(service.character(options), { code: 'INVALID_RESPONSE' });
  await assert.rejects(service.character(options), { code: 'INVALID_RESPONSE' });
  assert.deepEqual(await service.character(options, true), raw);
  assert.equal(calls.filter(c => c.query === RANKINGS_QUERY).length, 3);
  assert.equal((await readdir(dir)).length, 2); // metadata only
});

test('cache TTL expiry, corruption and bypass all reload; fetchedAt survives hits', async t => {
  const dir = await directory(t);
  let now = 1000, loads = 0;
  const cache = new Cache(dir, { now: () => now });
  const validate = (v: unknown) => { assert.equal(typeof v, 'number'); return v as number; };
  const load = () => cache.load('key', 100, false, async () => ++loads, validate);
  const first = await load();
  now = 1050;
  assert.equal((await load()).info.fetchedAt, first.info.fetchedAt);
  assert.equal(loads, 1);
  now = 1100;
  assert.equal((await load()).value, 2);
  const file = (await readdir(dir))[0]!;
  await writeFile(join(dir, file), 'corrupted');
  assert.equal((await load()).value, 3);
  const result = await cache.load('bypass', 100, true, async () => ++loads, validate);
  assert.equal(result.info.hit, false);
  assert.equal((await readdir(dir)).length, 1);
});

test('service --no-cache bypasses metadata and results and writes no files', async t => {
  const dir = await directory(t);
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const service = new WclService(fixtureClient(calls), new Cache(dir), true);
  await service.character(options); await service.character(options);
  assert.equal(calls.length, 10);
  assert.deepEqual(await readdir(dir), []);
});

test('realm pagination follows pages; repeated or malformed pages fail', async t => {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const base = fixtureClient(calls);
  const pages: number[] = [];
  const client: QueryClient = { async query(query, variables = {}) {
    if (query !== REALMS_QUERY) return base.query(query, variables);
    pages.push(variables.page as number);
    return { data: { worldData: { region: { servers: {
      data: variables.page === 1 ? [{ ...realm, id: 123, name: 'other', slug: 'other', normalizedName: 'other' }] : [realm],
      has_more_pages: variables.page === 1,
    } } } } };
  } };
  await new WclService(client, new Cache(await directory(t))).character(options);
  assert.deepEqual(pages, [1, 2]);
  const repeated = new WclService(fixtureClient([], { servers: { data: [realm], has_more_pages: true } }), new Cache(await directory(t)));
  await assert.rejects(repeated.character(options), { code: 'INVALID_RESPONSE' });
});
