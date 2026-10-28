export const difficultyIDs = { lfr: 1, normal: 3, heroic: 4, mythic: 5 } as const;
export type Difficulty = keyof typeof difficultyIDs;
export type Metric = 'dps' | 'hps';
export type PartitionChoice = 'default' | 'all' | number;
export interface CharacterOptions {
  region: string;
  realm: string;
  name: string;
  zone: number;
  difficulty: Difficulty;
  metric: Metric;
  spec: string | null;
  partition: PartitionChoice;
  timeframe: 'historical' | 'today';
}
export interface Zone {
  id: number;
  name: string;
  expansion: { id: number; name: string };
  difficulties: { id: number; name: string }[];
  partitions: { id: number; name: string; default: boolean }[];
  encounters: { id: number; name: string }[];
}
export interface Realm { id: number; name: string; slug: string; normalizedName: string }
export interface CacheInfo { hit: boolean; fetchedAt: string }
export interface Cached<T> { value: T; info: CacheInfo }
export interface AllStar {
  spec: string | null;
  partition: number | null;
  points: number | null;
  rank: number | null;
}
export interface BossResult {
  id: number;
  name: string;
  spec: string | null;
  bestPercent: number | null;
  medianPercent: number | null;
  bestAmount: number | null;
  kills: number | null;
  fastestKillMs: number | null;
  allStars: AllStar | null;
}
export interface CharacterResult {
  schemaVersion: 1;
  status: 'ok' | 'no_public_rankings';
  character: { id: number; canonicalID: number | null; name: string; classID: number | null;
    className: string | null; realm: string; realmSlug: string; region: string; url: string };
  filters: { zoneID: number; zoneName: string; difficulty: Difficulty; difficultyID: number;
    metric: Metric; spec: string | null; partition: number | null; partitionName: string;
    timeframe: 'historical' | 'today' };
  summary: { bestPerformanceAverage: number | null; medianPerformanceAverage: number | null;
    totalKills: number | null; allStars: AllStar[] };
  bosses: BossResult[];
  warnings: string[];
  fetchedAt: string;
  cache: { hit: boolean; metadataHit: boolean };
}
