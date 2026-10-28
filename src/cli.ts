import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { Cache } from './cache.ts';
import { invalid, WclError } from './errors.ts';
import { createService } from './service.ts';
import { renderCharacter, renderZones } from './render.ts';
import { difficultyIDs } from './types.ts';
import type { CharacterOptions, CharacterResult, Difficulty } from './types.ts';
import type { WclService } from './service.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
export const HELP = `WCL 角色公开战绩查询（正式服）

用法：
  pnpm wcl zones [--format json] [--no-cache]
  pnpm wcl character --realm 无尽之海 --name 寰球旅行 --zone 53 --difficulty mythic

character 必填：
  --realm        服务器显示名或官方 slug
  --name         角色名
  --zone         WCL 区域 ID（先用 zones 查询；区域列表也包含非团本）
  --difficulty   lfr | normal | heroic | mythic

可选：
  --region       cn | us | eu | kr | tw，默认 cn
  --metric       dps | hps，默认 dps
  --spec         WCL 专精名称（如 Frost），默认全部专精
  --partition    default | all | 分区 ID，默认 default
  --timeframe    historical | today，默认 historical
  --format       table | json，默认 table
  --raw          输出原始排名 GraphQL 响应（仅 character，不转换字段）
  --no-cache     跳过缓存读取与写入
  --help, -h     显示帮助

配置：在项目 .env 设置 WCL_CLIENT_ID 和 WCL_CLIENT_SECRET。
查询者不需要登录，公开接口不读取私密报告。
JSON 的诊断信息写入 stderr；也可用 pnpm --silent wcl ... 确保调用方静默运行。
`;

export interface Parsed {
  command: 'zones' | 'character' | 'help';
  format: 'table' | 'json';
  raw: boolean;
  noCache: boolean;
  character?: CharacterOptions;
}

function integer(value: string | undefined, label: string, minimum = 1): number {
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > 2_147_483_647) {
    invalid(`${label} 必须是 ${minimum} 至 2147483647 的整数。`);
  }
  return Number(value);
}

export function parseCLI(argv: string[]): Parsed {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      help: { type: 'boolean', short: 'h' }, format: { type: 'string' }, raw: { type: 'boolean' },
      'no-cache': { type: 'boolean' }, region: { type: 'string' }, realm: { type: 'string' }, name: { type: 'string' },
      zone: { type: 'string' }, difficulty: { type: 'string' }, metric: { type: 'string' }, spec: { type: 'string' },
      partition: { type: 'string' }, timeframe: { type: 'string' },
    } });
  } catch { invalid('无法识别命令或参数，请运行 pnpm wcl --help。'); }
  const { values: v, positionals } = parsed;
  if (v.help || positionals.length === 0) return { command: 'help', format: 'table', raw: false, noCache: false };
  const command = positionals[0];
  if (positionals.length !== 1 || (command !== 'zones' && command !== 'character')) invalid('命令必须是 zones 或 character。');
  const format = v.format ?? 'table';
  if (format !== 'table' && format !== 'json') invalid('--format 必须是 table 或 json。');
  const result: Parsed = { command, format, raw: v.raw ?? false, noCache: v['no-cache'] ?? false };
  if (command === 'zones') {
    if (['region', 'realm', 'name', 'zone', 'difficulty', 'metric', 'spec', 'partition', 'timeframe', 'raw'].some(k => k in v)) {
      invalid('zones 只接受 --format、--no-cache 和 --help。');
    }
    return result;
  }
  const realm = v.realm?.trim().normalize('NFC');
  const name = v.name?.trim().normalize('NFC');
  if (!realm || !name || /\p{Cc}/u.test(realm + name)) invalid('请提供有效的 --realm 和 --name。');
  const region = (v.region ?? 'cn').toLowerCase();
  if (!['cn', 'us', 'eu', 'kr', 'tw'].includes(region)) invalid('--region 必须是 cn/us/eu/kr/tw。');
  if (!v.difficulty || !Object.hasOwn(difficultyIDs, v.difficulty)) invalid('--difficulty 必须是 lfr/normal/heroic/mythic。');
  const metric = v.metric ?? 'dps';
  if (metric !== 'dps' && metric !== 'hps') invalid('--metric 必须是 dps 或 hps。');
  const timeframe = v.timeframe ?? 'historical';
  if (timeframe !== 'historical' && timeframe !== 'today') invalid('--timeframe 必须是 historical 或 today。');
  const partition = v.partition ?? 'default';
  if (v.spec !== undefined && (!v.spec.trim() || /\p{Cc}/u.test(v.spec))) invalid('--spec 不能为空或包含控制字符。');
  result.character = { region, realm, name, zone: integer(v.zone, '--zone'), difficulty: v.difficulty as Difficulty,
    metric, timeframe, spec: v.spec?.trim() ?? null,
    partition: partition === 'default' || partition === 'all' ? partition : integer(partition, '--partition', 0) };
  return result;
}

export interface CLIOptions {
  env?: NodeJS.ProcessEnv;
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
  create?: (noCache: boolean, warn: (message: string) => void) => Pick<WclService, 'zones' | 'character'>;
}

export async function runCLI(argv: string[], options: CLIOptions = {}): Promise<number> {
  const stdout = options.stdout ?? (value => process.stdout.write(value + '\n'));
  const stderr = options.stderr ?? (value => process.stderr.write(value + '\n'));
  try {
    const args = parseCLI(argv);
    if (args.command === 'help') { stdout(HELP); return 0; }
    const warn = (message: string) => stderr(`提示：${message}`);
    const service = options.create?.(args.noCache, warn) ?? createService(options.env ?? process.env,
      new Cache(join(root, '.cache/wcl-analyze'), { warn }), args.noCache);
    if (args.command === 'zones') {
      const zones = await service.zones();
      stdout(args.format === 'json' ? JSON.stringify({ zones: zones.value, fetchedAt: zones.info.fetchedAt, cache: { hit: zones.info.hit } }, null, 2)
        : renderZones(zones.value));
    } else {
      const value = await service.character(args.character!, args.raw);
      if (args.raw) stdout(JSON.stringify(value, null, 2));
      else {
        const result = value as CharacterResult;
        for (const warning of result.warnings) warn(warning);
        stdout(args.format === 'json' ? JSON.stringify(result, null, 2) : renderCharacter(result));
      }
    }
    return 0;
  } catch (error) {
    const known = error instanceof WclError;
    stderr(JSON.stringify({ error: { code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : '程序发生未预期错误，请检查版本和本地配置。' } }));
    return known ? error.exitCode : 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const envFile = join(root, '.env');
    if (existsSync(envFile)) loadEnvFile(envFile);
    process.exitCode = await runCLI(process.argv.slice(2));
  } catch {
    process.stderr.write('{"error":{"code":"CONFIG_ERROR","message":"无法读取项目 .env，请检查文件权限与格式。"}}\n');
    process.exitCode = 1;
  }
}
