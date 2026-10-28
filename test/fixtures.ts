import type { CharacterOptions, Realm, Zone } from '../src/types.ts';

// Synthetic contract fixtures, NOT captured WCL data and NOT a live acceptance result.
export const zone: Zone = { id: 53, name: 'Synthetic Raid', expansion: { id: 99, name: 'Synthetic Expansion' },
  difficulties: [{ id: 4, name: 'Heroic' }, { id: 5, name: 'Mythic' }],
  partitions: [{ id: 1, name: '旧分区', default: false }, { id: 2, name: '当前分区', default: true }],
  encounters: [{ id: 1001, name: 'Synthetic Boss 一' }, { id: 1002, name: 'Synthetic Boss 二' }] };
export const realm: Realm = { id: 697, name: '无尽之海', normalizedName: '无尽之海', slug: 'synthetic-realm-slug' };
export const identity = { id: 123, canonicalID: 123, name: '测试法师', classID: 8 };
export const options: CharacterOptions = { region: 'cn', realm: '无尽之海', name: '测试法师',
  zone: 53, difficulty: 'mythic', metric: 'dps', spec: null, partition: 'default', timeframe: 'historical' };
export const rankings = {
  bestPerformanceAverage: 65.5, medianPerformanceAverage: 45.5, totalKills: 7,
  allStars: [{ spec: 'Frost', partition: 2, points: 111.1, rank: 8 },
    { spec: 'Arcane', partition: 1, points: 222.2, rank: 9 }],
  rankings: [{ encounter: { id: 1001, name: 'Synthetic Boss 一' }, bestSpec: 'Frost', rankPercent: 81.2,
    medianPercent: 56.3, bestAmount: 123456.7, totalKills: 4, fastestKill: 386000,
    allStars: { points: 88.8, rank: 42 } }],
};
export const rawRankings = () => ({ data: { characterData: {
  character: { id: identity.id, hidden: false, zoneRankings: structuredClone(rankings) },
}, rateLimitData: { limitPerHour: 3600, pointsSpentThisHour: 1, pointsResetIn: 1800 } } });
