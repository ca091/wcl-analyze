import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCharacter, parseIdentity, parseRankings, resolveRealm } from '../src/normalize.ts';
import { identity, options, zone, realm, rankings } from './fixtures.ts';
import { renderCharacter } from '../src/render.ts';

const normalize = (value: unknown = rankings) => normalizeCharacter(identity, value, options, zone, realm, 2, '2026-10-28T00:00:00Z', 'Synthetic Mage');

test('maps known fields, keeps multiple all-star specs and preserves absent values', () => {
  const result = normalize();
  assert.equal(result.status, 'ok');
  assert.equal(result.summary.totalKills, 7); // never replace with sum of boss kills (4)
  assert.equal(result.summary.allStars.length, 2);
  assert.equal(result.summary.allStars[1]!.partition, 1);
  assert.equal(result.bosses[0]!.bestAmount, 123456.7);
  assert.equal(result.bosses[0]!.fastestKillMs, 386000);
  assert.equal(result.bosses[1]!.kills, null);
  assert.equal(result.bosses[1]!.bestPercent, null);
  assert.equal(result.character.className, 'Synthetic Mage');
  assert.equal(result.filters.partition, 2);
  assert.equal(result.character.url, 'https://www.warcraftlogs.com/character/cn/synthetic-realm-slug/' + encodeURIComponent('测试法师'));
  const text = renderCharacter(result);
  assert.match(text, /6:26/); assert.match(text, /—/); assert.match(text, /Synthetic Boss 一/);
});

test('empty and null rankings are successful no-public-rankings results', () => {
  for (const value of [null, { rankings: [] }, { rankings: [], totalKills: 0 }]) {
    const result = normalize(value);
    assert.equal(result.status, 'no_public_rankings');
    assert.equal(result.bosses[0]!.kills, null);
  }
});

test('missing summary and boss fields stay null; zero is retained', () => {
  const result = normalize({ rankings: [{ encounter: zone.encounters[0], totalKills: 0, rankPercent: 0 }] });
  assert.equal(result.bosses[0]!.bestPercent, 0);
  assert.equal(result.bosses[0]!.kills, 0);
  assert.equal(result.summary.totalKills, null);
  assert.equal(result.summary.bestPerformanceAverage, null);
});

test('unknown schema, type drift, duplicate bosses and wrong zone fail explicitly', () => {
  assert.throws(() => parseRankings({ renamedRows: [] }), { code: 'INVALID_RESPONSE' });
  assert.throws(() => normalize({ rankings: [{ encounter: zone.encounters[0], renamedScore: 1 }] }), { code: 'INVALID_RESPONSE' });
  assert.throws(() => normalize({ rankings: [{ encounter: zone.encounters[0], totalKills: '4' }] }), { code: 'INVALID_RESPONSE' });
  assert.throws(() => normalize({ rankings: [...rankings.rankings, ...rankings.rankings] }), { code: 'INVALID_RESPONSE' });
  assert.throws(() => normalize({ rankings: [{ encounter: { id: 999, name: 'wrong' }, totalKills: 1 }] }), { code: 'INVALID_RESPONSE' });
});

test('hidden, missing and malformed identities are distinct', () => {
  assert.throws(() => parseIdentity(null), { code: 'CHARACTER_NOT_FOUND' });
  assert.throws(() => parseIdentity({ ...identity, hidden: true }), { code: 'RANKINGS_HIDDEN' });
  assert.throws(() => parseIdentity(identity), { code: 'INVALID_RESPONSE' });
});

test('Chinese display name resolves official slug, normalized names and case work', () => {
  assert.equal(resolveRealm([realm], ' 无尽之海 ').slug, 'synthetic-realm-slug');
  assert.equal(resolveRealm([realm], 'SYNTHETIC-REALM-SLUG').id, 697);
  assert.throws(() => resolveRealm([realm], 'missing'), { code: 'REALM_NOT_FOUND' });
  assert.throws(() => resolveRealm([realm, { ...realm, id: 698 }], '无尽之海'), { code: 'AMBIGUOUS_REALM' });
});
