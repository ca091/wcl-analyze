import type { CharacterResult, Zone } from './types.ts';

const clean = (value: string) => value.replace(/\p{Cc}/gu, ' ');
function width(value: string): number {
  return [...value].reduce((n, c) => n + (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|[\uFF01-\uFF60]/u.test(c) ? 2 : 1), 0);
}
export function table(headers: string[], rows: string[][]): string {
  const safeRows = [headers, ...rows].map(row => row.map(clean));
  const widths = headers.map((_, i) => Math.max(...safeRows.map(r => width(r[i] ?? ''))));
  return safeRows.map(row => row.map((c, i) => c + ' '.repeat(widths[i]! - width(c))).join('  ').trimEnd()).join('\n');
}
function num(value: number | null, decimals = 1): string {
  return value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: decimals });
}
function duration(ms: number | null): string {
  if (ms === null) return '—';
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function renderCharacter(r: CharacterResult): string {
  const f = r.filters;
  const lines = [
    clean(`${r.character.name} · ${r.character.realm} (${r.character.region.toUpperCase()}) · ${r.character.className ?? '未知职业'} · WCL ID ${r.character.id}`),
    clean(`${f.zoneName} (${f.zoneID}) · ${f.difficulty} · ${f.metric.toUpperCase()} · ${f.spec ?? '全部专精'}`),
    clean(`分区：${f.partitionName} · 排名口径：${f.timeframe === 'historical' ? '历史分位' : '当前分位'}`),
    `最佳表现平均：${num(r.summary.bestPerformanceAverage)}  中位表现平均：${num(r.summary.medianPerformanceAverage)}  日志击杀数：${num(r.summary.totalKills, 0)}`,
    `采集时间：${r.fetchedAt}  成绩缓存：${r.cache.hit ? '命中' : '未命中'}`,
    r.status === 'no_public_rankings' ? '状态：所选条件下无公开成绩' : '状态：查询成功', '',
    table(['Boss', '专精', 'Best %', 'Median %', `最佳记录 ${f.metric.toUpperCase()}`, '击杀', '最快', 'AS 分数', 'AS 排名'],
      r.bosses.map(b => [b.name, b.spec ?? '—', num(b.bestPercent), num(b.medianPercent), num(b.bestAmount),
        num(b.kills, 0), duration(b.fastestKillMs), num(b.allStars?.points ?? null, 2), num(b.allStars?.rank ?? null, 0)])),
  ];
  if (r.summary.allStars.length) {
    lines.push('', '团本 All Stars（分别保留专精与分区，不相加）：', table(['专精', '分区', '积分', '排名'],
      r.summary.allStars.map(s => [s.spec ?? '—', s.partition === null ? '—' : String(s.partition), num(s.points, 2), num(s.rank, 0)])));
  }
  lines.push('', `来源：${r.character.url}`);
  return lines.join('\n');
}

export function renderZones(zones: Zone[]): string {
  return table(['ID', '区域', '资料片', '支持难度', '分区（* 为默认）'], zones.map(z => [
    String(z.id), z.name, z.expansion.name,
    z.difficulties.map(d => `${d.id}:${d.name}`).join(', '),
    z.partitions.map(p => `${p.id}:${p.name}${p.default ? '*' : ''}`).join(', ') || '—',
  ]));
}
