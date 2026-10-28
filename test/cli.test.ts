import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCLI, runCLI } from '../src/cli.ts';
import { normalizeCharacter } from '../src/normalize.ts';
import { identity, options, rankings, realm, zone } from './fixtures.ts';

const args = ['character', '--realm', '无尽之海', '--name', '测试法师', '--zone', '53', '--difficulty', 'mythic'];
const root = fileURLToPath(new URL('../', import.meta.url));

test('CLI parses defaults and explicit filters, preserves Unicode', () => {
  const parsed = parseCLI(args);
  assert.deepEqual(parsed.character, options);
  const modified = parseCLI([...args, '--region', 'EU', '--partition', 'all', '--metric', 'hps', '--timeframe', 'today', '--spec', 'Frost', '--no-cache']);
  assert.equal(modified.character!.region, 'eu');
  assert.equal(modified.character!.partition, 'all'); assert.equal(modified.noCache, true);
});

test('CLI rejects missing, invalid, unknown and command-inappropriate options', () => {
  const bad = [
    ['character'], [...args, '--zone', '-1'], [...args, '--zone', '1.2'], [...args, '--zone', '2147483648'],
    [...args, '--difficulty', 'bad'], [...args, '--region', 'bad'], [...args, '--metric', 'bad'],
    [...args, '--partition', '-1'], [...args, '--timeframe', 'bad'], [...args, '--format', 'xml'],
    [...args, '--unknown'], [...args, '--spec', ''], ['zones', '--raw'], ['zones', '--realm', 'x'], ['oops'],
  ];
  for (const value of bad) assert.throws(() => parseCLI(value), { code: 'INVALID_ARGUMENT' });
});

test('JSON stdout stays parseable; diagnostics go to stderr', async () => {
  const stdout: string[] = [], stderr: string[] = [];
  const value = normalizeCharacter(identity, rankings, options, zone, realm, 2, '2026-10-28T00:00:00Z');
  const status = await runCLI([...args, '--format', 'json'], { stdout: s => { stdout.push(s); }, stderr: s => { stderr.push(s); },
    create: () => ({ character: async () => value, zones: async () => ({ value: [zone], info: { hit: false, fetchedAt: value.fetchedAt } }) }) });
  assert.equal(status, 0);
  assert.equal(JSON.parse(stdout.join('')).character.name, identity.name);
  assert.ok(stderr.length > 0);
});

test('missing credentials and invalid arguments use nonzero exit codes and empty stdout', async () => {
  for (const [input, expected] of [[args, 'MISSING_CREDENTIALS'], [['character'], 'INVALID_ARGUMENT']] as const) {
    const stdout: string[] = [], stderr: string[] = [];
    const status = await runCLI([...input], { env: {}, stdout: s => { stdout.push(s); }, stderr: s => { stderr.push(s); } });
    assert.notEqual(status, 0); assert.equal(stdout.length, 0);
    assert.equal(JSON.parse(stderr[0]!).error.code, expected);
  }
});

test('help does not require credentials or HTTP', async () => {
  let text = '';
  assert.equal(await runCLI(['--help'], { env: {}, stdout: s => { text = s; } }), 0);
  assert.match(text, /WCL/);
});

test('subprocess runs the entire synthetic OAuth → GraphQL → JSON chain through pnpm without stdout banners', () => {
  const child = spawnSync('pnpm', ['wcl', ...args, '--format', 'json', '--no-cache'], {
    cwd: root, encoding: 'utf8', env: { ...process.env,
      NODE_OPTIONS: `--import=${fileURLToPath(new URL('./process-fixture.ts', import.meta.url))}` },
  });
  assert.equal(child.status, 0, child.stderr);
  const value = JSON.parse(child.stdout);
  assert.equal(value.character.name, identity.name);
  assert.equal(value.cache.hit, false);
  assert.equal(value.summary.totalKills, 7);
  assert.match(child.stderr, /国服/);
  assert.ok(!child.stdout.includes('synthetic-token'));
});

test('subprocess zones JSON and raw ranking mode are usable', () => {
  for (const command of [['zones', '--format', 'json', '--no-cache'], [...args, '--raw', '--no-cache']]) {
    const child = spawnSync(process.execPath, ['--import', fileURLToPath(new URL('./process-fixture.ts', import.meta.url)), 'src/cli.ts', ...command],
      { cwd: root, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    const value = JSON.parse(child.stdout);
    if (command[0] === 'zones') assert.equal(value.zones[0].id, 53);
    else assert.equal(value.data.characterData.character.zoneRankings.totalKills, 7);
  }
});
