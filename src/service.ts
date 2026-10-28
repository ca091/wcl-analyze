import { Cache } from './cache.ts';
import { WclClient } from './http.ts';
import { WclError, record } from './errors.ts';
import { parseIdentity, parseRankings, parseRealms, parseZones, parseClasses, resolveRealm, normalizeCharacter } from './normalize.ts';
import { CHARACTER_QUERY, CLASSES_QUERY, RANKINGS_QUERY, REALMS_QUERY, ZONES_QUERY } from './queries.ts';
import { difficultyIDs } from './types.ts';
import type { CharacterOptions, Realm } from './types.ts';

const DAY = 24 * 60 * 60 * 1000;
export interface QueryClient { query(query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> }

function data(result: unknown): Record<string, unknown> { return record(record(result, 'response').data, 'data'); }

function character(result: unknown): unknown {
  return record(data(result).characterData, 'characterData').character;
}

function validateBundle(value: unknown): { identity: ReturnType<typeof parseIdentity>; raw: Record<string, unknown> } {
  const bundle = record(value, '缓存成绩');
  const c = record(character(bundle.raw), 'rankings character');
  if (c.hidden === true) throw new WclError('RANKINGS_HIDDEN', '该角色已隐藏排行。');
  if (c.hidden !== false) throw new WclError('INVALID_RESPONSE', '排名角色缺少 hidden 标记。');
  parseRankings(c.zoneRankings);
  const identity = parseIdentity({ ...record(bundle.identity, 'identity'), hidden: false });
  if (identity.id !== c.id) throw new WclError('INVALID_RESPONSE', '排名角色 ID 与定位结果不一致。');
  return { identity, raw: record(bundle.raw, '排名响应') };
}

export class WclService {
  private client: QueryClient;
  private cache: Cache;
  private bypass: boolean;
  constructor(client: QueryClient, cache: Cache, bypass = false) { this.client = client; this.cache = cache; this.bypass = bypass; }

  async zones() {
    return this.cache.load('zones-v1', DAY, this.bypass, async () => {
      const result = await this.client.query(ZONES_QUERY);
      return parseZones(record(data(result).worldData, 'worldData').zones);
    }, parseZones);
  }

  private async realms(region: string) {
    return this.cache.load(`realms-v1:${region}`, DAY, this.bypass, async () => {
      const realms: Realm[] = [];
      const seen = new Set<number>();
      for (let page = 1; page <= 100; page++) {
        const result = await this.client.query(REALMS_QUERY, { region: region.toUpperCase(), page });
        const regionData = record(record(data(result).worldData, 'worldData').region, 'region');
        const pagination = record(regionData.servers, 'servers');
        const batch = parseRealms(pagination.data);
        for (const realm of batch) {
          if (seen.has(realm.id)) throw new WclError('INVALID_RESPONSE', '服务器分页返回重复 ID。');
          seen.add(realm.id); realms.push(realm);
        }
        if (pagination.has_more_pages === false) return realms;
        if (pagination.has_more_pages !== true || batch.length === 0) {
          throw new WclError('INVALID_RESPONSE', '服务器分页响应异常。');
        }
      }
      throw new WclError('INVALID_RESPONSE', '服务器分页超出安全上限。');
    }, parseRealms);
  }

  async character(options: CharacterOptions, raw = false) {
    const zones = await this.zones();
    const zone = zones.value.find(z => z.id === options.zone);
    if (!zone) throw new WclError('ZONE_NOT_FOUND', '找不到所选区域 ID，请先运行 zones。');
    if (!zone.difficulties.some(d => d.id === difficultyIDs[options.difficulty])) {
      throw new WclError('INVALID_ARGUMENT', '所选区域不支持该难度，请使用 zones 查看。', 2);
    }
    const partition = options.partition === 'all' ? -1 : options.partition === 'default'
      ? zone.partitions.find(p => p.default)?.id ?? null : options.partition;
    if (typeof options.partition === 'number' && !zone.partitions.some(p => p.id === options.partition)) {
      throw new WclError('INVALID_ARGUMENT', '所选分区不属于该团本，请使用 zones 查看可用分区。', 2);
    }
    const realms = await this.realms(options.region);
    const realm = resolveRealm(realms.value, options.realm);
    const key = 'character-v1:' + JSON.stringify({ ...options, realm: realm.slug, partition });
    // Raw mode bypasses the rankings cache/normalizer so it remains useful if the JSON schema changes.
    const load = async () => {
      const lookup = await this.client.query(CHARACTER_QUERY, { name: options.name, realm: realm.slug, region: options.region.toUpperCase() });
      const identity = parseIdentity(character(lookup));
      const variables: Record<string, unknown> = { id: identity.id, zone: zone.id,
        difficulty: difficultyIDs[options.difficulty], metric: options.metric,
        spec: options.spec, timeframe: options.timeframe === 'historical' ? 'Historical' : 'Today' };
      // Omit the variable, rather than sending null, when delegating the default to WCL.
      if (partition !== null) variables.partition = partition;
      const response = await this.client.query(RANKINGS_QUERY, variables);
      const c = character(response);
      if (c === null) throw new WclError('CHARACTER_NOT_FOUND', 'WCL 未找到已定位的角色。');
      const row = record(c, 'rankings character');
      if (row.hidden === true) throw new WclError('RANKINGS_HIDDEN', '该角色已隐藏排行。');
      if (row.hidden !== false || row.id !== identity.id) throw new WclError('INVALID_RESPONSE', '排名角色标识异常。');
      return { identity, raw: response };
    };
    if (raw) return (await load()).raw;
    const response = await this.cache.load(key, 10 * 60 * 1000, this.bypass, async () => {
      const value = validateBundle(await load());
      // Validate the full public result before persisting a successful response.
      normalizeCharacter(value.identity, record(character(value.raw), 'character').zoneRankings,
        options, zone, realm, partition, new Date().toISOString());
      return value;
    }, validateBundle);
    const classes = await this.cache.load('classes-v1', DAY, this.bypass, async () => {
      const result = await this.client.query(CLASSES_QUERY);
      return parseClasses(record(data(result).gameData, 'gameData').classes);
    }, parseClasses);
    const className = classes.value.find(c => c.id === response.value.identity.classID)?.name ?? null;
    const result = normalizeCharacter(response.value.identity,
      record(character(response.value.raw), 'character').zoneRankings,
      options, zone, realm, partition, response.info.fetchedAt, className);
    result.cache = { hit: response.info.hit, metadataHit: zones.info.hit && realms.info.hit && classes.info.hit };
    return result;
  }
}

export function createService(env: NodeJS.ProcessEnv, cache: Cache, bypass: boolean): WclService {
  return new WclService(new WclClient({ id: env.WCL_CLIENT_ID ?? '', secret: env.WCL_CLIENT_SECRET ?? '' }), cache, bypass);
}
