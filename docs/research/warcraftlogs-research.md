# Warcraft Logs 角色数据获取技术调研

日期：2026-10-28，Asia/Shanghai。对象：CN / 无尽之海 / 寰球旅行。

## 结论

目标角色页的数据可以读取：本次通过已有 Chrome 会话成功读取公开页面，页面显示 `Sign Up / Log In`；没有登录或解决验证码。普通 curl 请求则收到 Cloudflare 挑战页，不能直接获取角色 HTML。**已证明“正常浏览器读取可行”；没有证明“无人值守爬虫可以稳定绕过 Cloudflare”。**

用于开发持续查询角色战绩的服务，建议优先使用官方 v2 GraphQL API。公开 API 也需要开发者创建 OAuth 客户端和获取 token；私密报告需要相应用户授权。官方 Schema 支持角色排名、近期报告及报告中的战斗详情，但本次没有 OAuth 凭据，因此没有完成目标角色的认证 API 查询，覆盖率和实际响应结构仍须验证。[S2][S3][S4]

## 1. 实际能获取什么

以下为目标角色当前页面的观测值，**不是角色全历史或实时游戏状态**。默认页面选择为 Midnight / The Venomous Abyss / Damage / All Bosses / All Specs / Highest Difficulty，表现表标注 MYTHIC。[S1]

| 数据 | 读取结果 |
|---|---|
| 角色标识 | 寰球旅行；无尽之海 (CN)；服务器链接 ID 697 |
| 种族与职业 | Undead Mage（亡灵法师） |
| 页面资料更新时间 | `2 months ago`，没有从该文本得到精确时间戳 |
| 团本摘要 | The Venomous Abyss Mythic，4/8，Frost 排名 1360 |
| 大秘境摘要 | Mythic+ Season 2：Arcane 排名 19430；Season 1：Frost 排名 136524 |
| 整体表现 | Best Perf. Avg 44.4；Median Perf. Avg 37.6；Kills Logged 21 |
| All Stars | Frost 140.08 分 / 排名 1360 / 12.1.5；Arcane 367.39 分 / 排名 8957 / 12.1 |
| 各 Boss 表格 | 名称、专精、Best %、最高 DPS、击杀次数、最快时间、中位表现、All Stars 分数与排名 |
| 装备与天赋 | 分别显示 `No items found.`、`No talents found.`，本样本无法获取有效值 |
| Raid Progression 侧栏 | 出现 `0 / 0 Normal`，不能据此断定角色真实进度为零 |

示例：Vashnik the Malignant 一行显示 Best 98、最高 DPS 366,027.2、3 次击杀、最快 6:08、中位表现 79、All Stars 115.62 分 / 排名 144。[S1]

页面提供资料片、区域/赛季、Boss、专精、难度、补丁分区、伤害/治疗/速度、按装等或钥石等级比较等筛选入口。本次读取了入口及实际链接，未遍历全部组合，也不能因为有 Healing 选项就承诺本角色存在治疗战绩。完整 Boss 表与入口见同目录 `warcraftlogs-character-observations.md`。[S1]

需要注意两个数据口径问题：

- 页面明确提示：`Due to restrictions from the Blizzard API, Chinese characters have limited support.` 国服基础资料支持有限，不能承诺装备、天赋、基础进度始终可用；也不能仅凭这一提示确定每一个空字段的确切原因。[S1]
- 顶部 4/8 摘要、表格中五个有值的 Boss 行、不同补丁的 All Stars 不能直接合并为同一个进度统计。应保留原始筛选和来源，避免用简单求和重算页面平均值或真实进度。[S1]

## 2. 反爬实测

| 访问方式 | 本次结果 | 可以得出的结论 |
|---|---|---|
| 既有 Chrome 中的目标角色页 | 正常角色页面，可读 DOM | 当前浏览器会话可访问；不保证全新或无头浏览器同样成功 |
| 普通 curl GET 角色 URL | HTTP 403；`server: cloudflare`；`cf-mitigated: challenge`；标题 `Just a moment...` | 当前 HTTP 客户端触发 Cloudflare 挑战，收到的是挑战 HTML |
| curl GET `/api/docs` 和 Character Schema | 同样 403 challenge | 静态文档路径也可能受挑战保护 |
| 正常 Chrome 打开 `/api/docs` | 成功，读到 OAuth 与 GraphQL 官方说明 | 文档可以通过正常浏览器访问 |
| curl GET `/robots.txt` | 挑战 HTML | 不能把这份 HTML 当作 robots 规则 |
| 正常 Chrome 打开 `/robots.txt` | 成功，读到规则正文 | robots 规则与挑战页应区分 |
| 未带 token 的 GET/POST `/api/v2/client` | HTTP 404 HTML | 未取得有效 API 数据；不能据此断定官方 API 已停用，也不能将它当作认证成功的测试 |

curl 角色页响应日期为 `2026-10-28 07:58:28 UTC`（北京时间 15:58:28）。关键响应片段：

```text
HTTP/2 403
content-type: text/html; charset=UTF-8
cf-mitigated: challenge
server: cloudflare
```

本次没有测出访问频率阈值，没有进行压力测试、代理轮换、浏览器指纹伪装或 CAPTCHA 代解。也没有读取或导出浏览器 Cookie。已有浏览器成功可能与浏览器环境、会话、网络等因素有关；本次没有隔离实验，不能指定某一个因素为原因。

### “能否绕过”的具体回答

如果目的是拿到公开角色数据，**本次已通过正常浏览器实现读取，不需要攻破防护**。如果目的是让独立脚本长期自动抓取，普通 HTTP 方式在本次环境中失败；浏览器自动化的长期稳定性未验证。不能把“读到一次页面”当成可持续绕过的证据。

从工程上建议把正常浏览器读取用于人工核对或少量补充，将持续数据查询放在官方 API 上。遇到挑战时应明确记录访问失败，避免把挑战页解析成“角色不存在”。

## 3. robots 规则

正常浏览器读到的通用 `User-agent: *` 规则包含：

```text
Disallow: /reports/
Disallow: /zone/reports
Disallow: /blizzard/
```

另有区域排行榜参数的 Allow/Disallow 规则，以及针对 Baiduspider、Baiduspider-render、Yandex 的 `Disallow: *`。通用规则未列出 `/character/`；robots 不等于 API 授权、站点条款或对任意频率采集的许可。本报告不据此宣称页面批量采集已获站点许可。[S6]

## 4. 官方 API 覆盖范围

| 需求 | 官方入口 | 本次验证程度 |
|---|---|---|
| 按角色名定位 | `characterData.character(name, serverSlug, serverRegion)`，或按 `id` | 官方当前 Schema 已核对；目标角色 API 返回未验证 |
| 基础信息 | `Character` 的 `id`、`canonicalID`、`classID`、`level`、`faction`、`guilds`、`hidden` 等 | 文档支持，不保证每个国服字段有效 |
| 整个区域/团本/赛季表现 | `Character.zoneRankings(...)` | 支持 zone、difficulty、metric、spec、partition、timeframe 等筛选 |
| 单 Boss 历次表现 | `Character.encounterRankings(...)` | 支持 encounter、difficulty、metric 等；可选战斗人员资料与历史图 |
| 近期相关报告 | `Character.recentReports(...)` | 仅应视为近期报告入口，不能承诺列出该角色所有历史上传 |
| 报告战斗列表 | `reportData.report(code).fights(...)` | 文档支持筛选 Boss、战斗、难度及击杀状态 |
| 技能、伤害、治疗与时间线分析 | `Report.tables`、`graph`、`events`、`masterData` | 需要先获得报告 code，定位角色在报告内的 actor/source ID，并处理时间范围和事件分页 |
| 日志发生时的装备/天赋 | `Report.playerDetails(includeCombatantInfo: true)` 或排名中的 combatant info | 文档支持；依赖日志内容，不等于角色现在穿戴的装备，本角色未验证 |
| 请求配额 | 根查询 `rateLimitData` | 返回 `limitPerHour`、`pointsSpentThisHour`、`pointsResetIn`；按返回值控制预算，不写死统一限额 |

来源：[CharacterData][S3]、[Character][S4]、[Report][S5]、[RateLimitData][S7]。排名、部分 JSON 报告结果在文档中明确提示结构可能变化，接入时需保留原始响应、版本信息及容错处理。[S4][S5]

### 认证与调用链

1. 用户登录 WCL，在官方客户端管理页创建 OAuth client，获得 `client_id` / `client_secret`。[S2][S8]
2. 后端向 `https://www.warcraftlogs.com/oauth/token` 以 Basic Auth 提交 `grant_type=client_credentials`，获取访问 token。[S2]
3. 使用 `Authorization: Bearer <token>` 调用 `https://www.warcraftlogs.com/api/v2/client`，提交 GraphQL 查询。[S2]
4. 私密报告走 `/api/v2/user`，使用用户同意的授权流程；公开 client token 不提供私密报告访问权。`includePrivateLogs` 选项不是绕过权限的开关。[S2][S4]

客户端密钥建议仅放在后端。针对本角色的查询草稿见 `warcraftlogs-api-query.graphql`：它根据 Schema 编写，尚未进行认证执行，`serverSlug` 应先通过官方服务器数据确认。页面的中文服务器路径可作为候选，不能替代实测。

## 5. 推荐落地方式

```text
输入 region / realm / name
  → OAuth token 管理
  → Character 定位并保存 WCL ID
  → zoneRankings / encounterRankings
  → 按需获取报告 code 与 fights / playerDetails / events
  → 统一字段、缓存、保留来源与采集时间
```

第一阶段可做“公开战绩查询”：角色标识、职业、团本/赛季表现、各 Boss Best/Median、DPS/HPS、日志击杀数、最快时间、All Stars。第二阶段再做公开报告内的技能与时间线分析。国服装备和天赋应作为可能为空的字段，日志快照与当前角色资料分开存储。

建议每条统计附带 `characterID / region / realm / name / zoneID / encounterID / difficulty / metric / spec / partition / timeframe / retrievedAt`，区分 `无数据 / 被隐藏 / 无权限 / 请求受挑战 / 上游错误`。缓存有效期应由时效要求和实际配额决定；事件级查询只在需要时调用。

尚待验证：真实 OAuth 认证调用、国服中文 slug、目标角色各 API 字段覆盖率、JSON 响应字段映射、事件分页与实际配额成本。当前没有用户 API 凭据，未创建客户端、未更改账号权限。

## 来源

- [S1 目标角色页](https://www.warcraftlogs.com/character/cn/%E6%97%A0%E5%B0%BD%E4%B9%8B%E6%B5%B7/%e5%af%b0%e7%90%83%e6%97%85%e8%a1%8c)：Chrome 可见 DOM/无障碍树实测。
- [S2 官方 API 认证与调用说明](https://www.warcraftlogs.com/api/docs)：正常 Chrome 实际读取。
- [S3 CharacterData Schema](https://www.warcraftlogs.com/v2-api-docs/warcraft/characterdata.doc.html)：正常 Chrome 实际读取。
- [S4 Character Schema](https://www.warcraftlogs.com/v2-api-docs/warcraft/character.doc.html)：通过 Context7 读取官方文档索引；recentReports 由并行调研核对。
- [S5 Report Schema](https://www.warcraftlogs.com/v2-api-docs/warcraft/report.doc.html)：通过 Context7 读取官方文档索引。
- [S6 robots.txt](https://www.warcraftlogs.com/robots.txt)：正常 Chrome 实际读取。
- [S7 RateLimitData Schema](https://www.warcraftlogs.com/v2-api-docs/warcraft/ratelimitdata.doc.html)：通过 Context7 读取官方文档索引。
- [S8 OAuth 客户端管理](https://www.warcraftlogs.com/api/clients/)：官方文档中的创建入口，本次未登录或创建。

[S1]: https://www.warcraftlogs.com/character/cn/%E6%97%A0%E5%B0%BD%E4%B9%8B%E6%B5%B7/%e5%af%b0%e7%90%83%e6%97%85%e8%a1%8c
[S2]: https://www.warcraftlogs.com/api/docs
[S3]: https://www.warcraftlogs.com/v2-api-docs/warcraft/characterdata.doc.html
[S4]: https://www.warcraftlogs.com/v2-api-docs/warcraft/character.doc.html
[S5]: https://www.warcraftlogs.com/v2-api-docs/warcraft/report.doc.html
[S6]: https://www.warcraftlogs.com/robots.txt
[S7]: https://www.warcraftlogs.com/v2-api-docs/warcraft/ratelimitdata.doc.html
[S8]: https://www.warcraftlogs.com/api/clients/
