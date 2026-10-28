# wcl-analyze

通过 Warcraft Logs 官方 OAuth 2.0 + GraphQL API 查询角色公开团本战绩的本地 CLI。查询者无需登录 WCL；开发者需要创建 API 客户端并配置凭据。

**当前状态：CLI 与离线测试已实现，真实 API 联调待完成。** 本项目尚未获得真实 token 或目标角色响应；测试数据全部为合成样本，不能视为国服 API 可用性或字段覆盖率的证明。

## 准备环境与凭据

要求 Node.js **24.12 及以上的 24.x**、pnpm **10.x**。运行时使用 Node 内置 TypeScript 类型擦除，不需要打包服务或业务数据库。

```bash
pnpm install --frozen-lockfile
cp .env.example .env
```

1. 登录 [WCL 客户端管理页](https://www.warcraftlogs.com/api/clients/)，选择 Create Client。
2. 创建用于本地脚本的客户端，按页面要求填写名称及必要信息。此处使用 Client Credentials，不需要角色所有者授权，也不运行 OAuth 回调服务。
3. 将 Client ID / Client Secret 填入项目根目录 `.env`：

```dotenv
WCL_CLIENT_ID=你的客户端ID
WCL_CLIENT_SECRET=你的客户端密钥
```

本地进程环境变量优先于 `.env`；不通过命令参数传密钥。真实 `.env` 已被忽略，勿提交或粘贴到聊天、截图和日志。程序只向 WCL 官方 token / public API 端点发送认证请求，token 只在单次进程内复用，不写入缓存。

## 查询

### 查看区域 ID 与支持的难度

```bash
pnpm wcl zones
pnpm wcl zones --format json
```

输出区域 ID、名称、资料片、支持的难度和分区，`*` 表示 WCL 标记的默认分区。列表来自 `worldData.zones`，**也包含非团本区域**；首版针对正式服团本查询，不按“最大的 ID”猜测最新团本。

### 查询角色

```bash
pnpm wcl character \
  --region cn \
  --realm 无尽之海 \
  --name 寰球旅行 \
  --zone 53 \
  --difficulty mythic
```

`53` 仅为已有调研中的示例 ID，不是工具默认值；使用前通过 `zones` 核对。服务器可以填写显示名或 WCL 官方 slug，程序会按所选地区解析服务器元数据。职业名称同样从 WCL `gameData.classes` 解析，不假定 WCL classID 等同于游戏内的职业编号。

| 参数 | 规则 |
|---|---|
| `--realm`、`--name`、`--zone`、`--difficulty` | 必填 |
| `--region` | `cn / us / eu / kr / tw`，默认 `cn` |
| `--difficulty` | `lfr / normal / heroic / mythic`，对应 WCL ID `1 / 3 / 4 / 5`；核对区域元数据是否支持 |
| `--metric` | `dps / hps`，默认 `dps` |
| `--spec` | WCL 专精名，例如 `Frost`；省略表示全部专精 |
| `--partition` | `default / all / 分区ID`；默认 `default`，`all` 对应 API 的 `-1` |
| `--timeframe` | `historical / today`，默认 `historical`，分别对应历史／当前排名分位 |
| `--format` | `table / json`，默认 `table` |
| `--raw` | 直接输出排名 GraphQL 响应，跳过成绩转换及成绩缓存，便于核对字段；仅限 `character` |
| `--no-cache` | 跳过所有缓存读写 |
| `--help` / `-h` | 不需要凭据即可查看帮助 |

### JSON 与原始响应

```bash
pnpm wcl character --realm 无尽之海 --name 寰球旅行 \
  --zone 53 --difficulty mythic --format json > result.json

pnpm wcl character --realm 无尽之海 --name 寰球旅行 \
  --zone 53 --difficulty mythic --raw --no-cache > raw.json

# 调用方如果覆盖了本仓库 pnpm reporter 设置，可显式使用静默模式
pnpm --silent wcl character --realm 无尽之海 --name 寰球旅行 \
  --zone 53 --difficulty mythic --format json
```

`.npmrc` 设置静默 reporter，避免 pnpm 启动横幅污染 JSON。程序的 stdout 只包含结果；提示与错误写到 stderr。原始响应只包含公开排名 GraphQL 结果，不含 token 响应或请求头。`--raw` 仍会校验 HTTP、GraphQL errors、角色标识与隐藏状态，不能用于绕过授权。

JSON 结果结构：

```text
schemaVersion: 1
status: ok | no_public_rankings
character: id / canonicalID / name / classID / className / realm / realmSlug / region / url
filters: zoneID / zoneName / difficulty / difficultyID / metric / spec / partition / partitionName / timeframe
summary: bestPerformanceAverage / medianPerformanceAverage / totalKills / allStars[]
bosses[]: id / name / spec / bestPercent / medianPercent / bestAmount / kills / fastestKillMs / allStars
warnings[]
fetchedAt
cache: hit / metadataHit
```

## 数据口径与限制

- 结果只是所选区域、难度、专精、指标、分区与排名口径下的公开日志成绩，不是实时游戏状态或角色完整历史。
- 默认分区使用该团本元数据里的 `default` 标记；没有标记时委托 WCL 使用默认值，并明确显示分区 ID 未知，不选取最大 ID。全部分区不会将不同专精的 All Stars 相加。
- 缺失字段为表格 `—`／JSON `null`；上游明确返回的零保留为零。没有成绩的 Boss 行仍保留在表格中，缺失的击杀数不补成零。
- 团本摘要仅采用接口的对应摘要字段，不对 Boss 行求和，也不根据均分重算最佳表现平均值。
- `bestAmount` 显示为“最佳记录 DPS/HPS”，不承诺等于网页在不同筛选下的最高数值；`fastestKill` 暂按毫秒映射至 `fastestKillMs`。这些 JSON 字段缺乏稳定的正式字段契约，**当前映射及单位需要真实响应进一步核实**，输出中也会提示。
- 国服角色资料可能受上游支持限制；装备、天赋、私密报告、大秘境、逐场技能分析不在首版范围内。
- `zoneRankings` 返回 `null` 或空排名时给出 `no_public_rankings`；隐藏排行、角色不存在、接口结构异常分别报错，不作为空成绩吞掉。
- 未识别的排名结构会返回 `INVALID_RESPONSE`，请使用 `--raw --no-cache` 核对。不会自动切换到抓网页或扫描历史报告。

## 缓存、超时与失败

缓存保存在项目 `.cache/wcl-analyze/`，已加入 Git 忽略。服务器、区域、职业元数据保存 24 小时，成功解析的公开成绩保存 10 分钟。缓存键包括地区、服务器 slug、角色、团本、难度、指标、专精、分区和排名口径。认证失败和解析失败不写入成绩缓存；合法空成绩可缓存。缓存命中时的 `fetchedAt` 保留原采集时间；角色新近隐藏等变更最多可能受 10 分钟缓存影响，可用 `--no-cache` 重新查询。

每次 HTTP 请求超时 20 秒，网络错误和 5xx 最多重试两次；一次命令可能进行多次请求。401 清除进程内 token 后只重试一次。429 提示等待时间，不自动循环；GraphQL 配额错误也会分类为 `RATE_LIMITED`。

退出码：`0` 为成功（包括无公开成绩），`2` 为命令参数错误，`1` 为配置、认证、网络或数据异常。错误采用 stderr JSON 格式，例如：

```json
{"error":{"code":"MISSING_CREDENTIALS","message":"请在本地 .env 配置 WCL_CLIENT_ID 和 WCL_CLIENT_SECRET；参见 .env.example。"}}
```

错误代码包括 `INVALID_ARGUMENT`、`MISSING_CREDENTIALS`、`CONFIG_ERROR`、`AUTH_FAILED`、`REALM_NOT_FOUND`、`AMBIGUOUS_REALM`、`ZONE_NOT_FOUND`、`CHARACTER_NOT_FOUND`、`RANKINGS_HIDDEN`、`RATE_LIMITED`、`ACCESS_BLOCKED`、`TIMEOUT`、`NETWORK_ERROR`、`UPSTREAM_ERROR`、`GRAPHQL_ERROR`、`INVALID_RESPONSE`、`INTERNAL_ERROR`。

## 开发与验收

```bash
pnpm typecheck
pnpm test
pnpm check
```

运行时不依赖第三方库，开发依赖仅为 TypeScript 和 Node 类型定义。代码按 CLI、HTTP/OAuth、GraphQL 查询、服务编排、响应转换、缓存、展示分层。测试注入 HTTP 或服务；子进程测试显式加载 `test/process-fixture.ts`，实际程序不会加载该合成数据入口，也不会自动返回模拟战绩。

真实验收流程及状态见 [验收记录](docs/acceptance.md)。配置凭据后，先运行 `zones`，再用 `--raw --no-cache` 查询目标角色，核对默认分区、中文服务器解析、`bestAmount` / `fastestKill` 等字段和单位，最后验证表格、JSON、一个不存在的角色，并保存脱敏响应作为真实契约样本。

## 参考

- [WCL OAuth 与 GraphQL](https://www.warcraftlogs.com/api/docs)
- [Character Schema](https://www.warcraftlogs.com/v2-api-docs/warcraft/character.doc.html)
- [WorldData Schema](https://www.warcraftlogs.com/v2-api-docs/warcraft/worlddata.doc.html)
- [Server Schema](https://www.warcraftlogs.com/v2-api-docs/warcraft/server.doc.html)
- [GameData Schema](https://www.warcraftlogs.com/v2-api-docs/warcraft/gamedata.doc.html)
- [Node.js 24 TypeScript 支持](https://nodejs.org/docs/latest-v24.x/api/typescript.html)
- [已有技术调研](docs/research/warcraftlogs-research.md)
