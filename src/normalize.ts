import { WclError, numberOrNull, record, stringOrNull } from './errors.ts';
import type { AllStar, BossResult, CharacterOptions, CharacterResult, Realm, Zone } from './types.ts';
import { difficultyIDs } from './types.ts';

function array(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new WclError('INVALID_RESPONSE', `${context} 应为数组。`);
  return value;
}

function named(value: unknown): { id: number; name: string } {
  const item = record(value, '元数据条目');
  if (!Number.isInteger(item.id) || typeof item.name !== 'string') {
    throw new WclError('INVALID_RESPONSE', '元数据缺少有效 id/name。');
  }
  return { id: item.id as number, name: item.name };
}

export function parseZones(value: unknown): Zone[] {
  return array(value, 'zones').map(item => {
    const z = record(item, 'zone');
    return { ...named(z), expansion: named(z.expansion),
      difficulties: array(z.difficulties, 'difficulties').map(named),
      encounters: array(z.encounters, 'encounters').map(named),
      partitions: array(z.partitions ?? [], 'partitions').map(value => {
        const p = record(value, 'partition');
        if (typeof p.default !== 'boolean') throw new WclError('INVALID_RESPONSE', '分区缺少 default 标记。');
        return { ...named(p), default: p.default };
      }),
    };
  });
}

export function parseRealms(value: unknown): Realm[] {
  return array(value, 'servers').map(value => {
    const item = record(value, 'server');
    if (typeof item.slug !== 'string' || typeof item.normalizedName !== 'string') {
      throw new WclError('INVALID_RESPONSE', '服务器元数据缺少 slug/normalizedName。');
    }
    return { ...named(item), slug: item.slug, normalizedName: item.normalizedName };
  });
}

export function parseClasses(value: unknown): { id: number; name: string }[] {
  return array(value, 'classes').map(named);
}

export function resolveRealm(realms: Realm[], input: string): Realm {
  const normalize = (value: string) => value.normalize('NFC').replace(/[\s’']/gu, '').toLowerCase();
  const key = normalize(input);
  const matches = realms.filter(r => [r.name, r.slug, r.normalizedName].some(value => normalize(value) === key));
  if (matches.length === 0) throw new WclError('REALM_NOT_FOUND', '在所选地区找不到该服务器，请检查地区、名称或官方 slug。');
  if (matches.length !== 1) throw new WclError('AMBIGUOUS_REALM', '服务器名称匹配多项，请使用准确的官方 slug。');
  return matches[0]!;
}

export interface Identity { id: number; canonicalID: number | null; name: string; classID: number | null }
export function parseIdentity(value: unknown): Identity {
  if (value === null) throw new WclError('CHARACTER_NOT_FOUND', 'WCL 未找到该角色；请核对角色名和服务器。');
  const c = record(value, 'character');
  if (typeof c.hidden !== 'boolean' || !Number.isInteger(c.id) || typeof c.name !== 'string') {
    throw new WclError('INVALID_RESPONSE', '角色响应缺少 id/name/hidden。');
  }
  if (c.hidden) throw new WclError('RANKINGS_HIDDEN', '该角色已隐藏排行，无法查询其公开战绩。');
  return { id: c.id as number, canonicalID: numberOrNull(c.canonicalID), name: c.name, classID: numberOrNull(c.classID) };
}

function optionalNumber(item: Record<string, unknown>, key: string, context: string): number | null {
  const value = item[key];
  if (value === null || value === undefined) return null;
  const result = numberOrNull(value);
  if (result === null) throw new WclError('INVALID_RESPONSE', `${context}.${key} 类型变化，无法安全解析。`);
  return result;
}

function allStar(value: unknown): AllStar {
  const s = record(value, 'allStars');
  const partition = typeof s.partition === 'object' && s.partition !== null
    ? numberOrNull(record(s.partition, 'allStars.partition').id) : numberOrNull(s.partition);
  return { spec: stringOrNull(s.spec), partition,
    points: optionalNumber(s, 'points', 'allStars'), rank: optionalNumber(s, 'rank', 'allStars') };
}

export function parseRankings(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  const result = record(value, 'zoneRankings');
  array(result.rankings, 'zoneRankings.rankings');
  return result;
}

export function normalizeCharacter(identity: Identity, rankingsValue: unknown, options: CharacterOptions,
  zone: Zone, realm: Realm, partition: number | null, fetchedAt: string, className: string | null = null): CharacterResult {
  const rankings = parseRankings(rankingsValue);
  const warnings: string[] = [];
  if (options.region === 'cn') warnings.push('国服角色资料受上游支持限制；本结果仅反映所选范围内的公开日志成绩。');
  const rows = (rankings?.rankings ?? []) as unknown[];
  const byEncounter = new Map<number, BossResult>();
  for (const value of rows) {
    const r = record(value, 'ranking');
    if (!['rankPercent', 'medianPercent', 'bestAmount', 'totalKills', 'fastestKill'].some(k => k in r)) {
      throw new WclError('INVALID_RESPONSE', 'Boss 排名缺少已知成绩字段；请用 --raw 核对接口结构。');
    }
    const encounter = named(r.encounter);
    if (byEncounter.has(encounter.id)) throw new WclError('INVALID_RESPONSE', '同一 Boss 返回多行，无法确定聚合口径；请使用 --raw 检查。');
    if (!zone.encounters.some(e => e.id === encounter.id)) {
      throw new WclError('INVALID_RESPONSE', '排名中的 Boss 不属于所选区域。');
    }
    byEncounter.set(encounter.id, { ...encounter,
      spec: stringOrNull(r.bestSpec) ?? stringOrNull(r.spec),
      bestPercent: optionalNumber(r, 'rankPercent', 'ranking'),
      medianPercent: optionalNumber(r, 'medianPercent', 'ranking'),
      bestAmount: optionalNumber(r, 'bestAmount', 'ranking'),
      kills: optionalNumber(r, 'totalKills', 'ranking'),
      fastestKillMs: optionalNumber(r, 'fastestKill', 'ranking'),
      allStars: r.allStars == null ? null : allStar(r.allStars),
    });
  }
  const bosses = zone.encounters.map(e => byEncounter.get(e.id) ?? {
    ...e, spec: null, bestPercent: null, medianPercent: null, bestAmount: null,
    kills: null, fastestKillMs: null, allStars: null,
  });
  const summary = rankings ?? {};
  const rawStars = summary.allStars;
  const stars = rawStars == null ? [] : array(rawStars, 'zoneRankings.allStars').map(allStar);
  const totalKills = optionalNumber(summary, 'totalKills', 'zoneRankings');
  const hasScores = bosses.some(b => (b.kills ?? 0) > 0 || b.bestPercent !== null || b.bestAmount !== null) ||
    (totalKills ?? 0) > 0 || stars.length > 0 || numberOrNull(summary.bestPerformanceAverage) !== null;
  if (!hasScores) warnings.push('所选查询条件下没有可展示的公开成绩；不代表角色未参与过该团本。');
  if (bosses.some(b => b.fastestKillMs === null || b.bestAmount === null) || totalKills === null) {
    warnings.push('排名接口未提供的字段保留为空；未扫描历史报告补齐，也未用 Boss 行求和重算团本摘要。');
  }
  warnings.push('bestAmount/fastestKill 等 JSON 字段映射尚待真实 API 联调核实；最佳记录数值不承诺等于网页跨分区的最高值。');
  const partitionName = partition === -1 ? '全部分区' : partition === null ? 'WCL 默认（元数据未给出 ID）'
    : zone.partitions.find(p => p.id === partition)?.name ?? String(partition);
  return {
    schemaVersion: 1, status: hasScores ? 'ok' : 'no_public_rankings',
    character: { ...identity, className,
      realm: realm.name, realmSlug: realm.slug, region: options.region,
      url: `https://www.warcraftlogs.com/character/${options.region}/${encodeURIComponent(realm.slug)}/${encodeURIComponent(identity.name)}` },
    filters: { zoneID: zone.id, zoneName: zone.name, difficulty: options.difficulty,
      difficultyID: difficultyIDs[options.difficulty], metric: options.metric, spec: options.spec,
      partition, partitionName, timeframe: options.timeframe },
    summary: { bestPerformanceAverage: optionalNumber(summary, 'bestPerformanceAverage', 'zoneRankings'),
      medianPerformanceAverage: optionalNumber(summary, 'medianPerformanceAverage', 'zoneRankings'),
      totalKills, allStars: stars },
    bosses, warnings, fetchedAt, cache: { hit: false, metadataHit: false },
  };
}
