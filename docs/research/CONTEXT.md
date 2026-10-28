# wcl-analyze：对话上下文交接

> 后续进展（2026-10-28）：用户已确定并授权实现 TypeScript / Node.js 24 / pnpm 本地 CLI，范围为指定团本＋指定难度的公开战绩。代码及离线测试已加入仓库，当前使用方式见根目录 README.md。尚无 API 凭据，真实联调仍待完成，状态见 ../acceptance.md。以下保留迁移时的历史调研上下文。

更新日期：2026-10-28，Asia/Shanghai。
目标项目目录：`/Users/caoqi/Documents/github/wcl-analyze`。

## 用户目标

用户希望技术调研 Warcraft Logs（WCL）角色页可获取的数据及其防爬机制，并讨论如何通过官方 API 获取公开角色战绩。当前完成调研，尚未要求实现应用。

目标角色：[寰球旅行 / CN / 无尽之海](https://www.warcraftlogs.com/character/cn/%E6%97%A0%E5%B0%BD%E4%B9%8B%E6%B5%B7/%e5%af%b0%e7%90%83%e6%97%85%e8%a1%8c)。

用户现已指定将对话上下文迁移到本项目。本文是上下文摘要；完整原始聊天仍保存在 Codex 当前聊天中，复制此文件不等于更改聊天的项目归属或工作目录。

## 已完成的调研与证据

- 既有 Chrome 会话可以读取公开角色页，页面显示 Sign Up / Log In，无需本次登录或解决验证码。
- 普通 curl 请求角色页返回 HTTP 403，响应头含 `server: cloudflare`、`cf-mitigated: challenge`，正文为挑战页。
- 因此已证明普通浏览器读取可行、当前直接 HTTP 抓取失败，尚未证明全新浏览器、无头浏览器或无人值守采集可稳定访问。
- 正常浏览器读取到 robots.txt：通用规则禁止 `/reports/`、`/zone/reports`、`/blizzard/`，未列出 `/character/`；这不代表对任意方式和频率采集的全面授权。
- 当前角色页可读取角色/服务器、亡灵法师、更新时间、团本和大秘境摘要、Boss Best%、最高 DPS、击杀数、最快时间、Median、All Stars 积分与排名。
- 样本摘要：Mythic 4/8，最佳表现平均 44.4，中位表现平均 37.6，日志击杀 21 次，页面资料更新时间为两个月前。以上仅代表本次页面筛选下的观测值。
- 装备与天赋均为空，页面提示中国角色受 Blizzard API 限制，不能保证基础资料覆盖率。
- 4/8 摘要与五个有表现值的 Boss 行、跨补丁排名数据存在不同口径，应保留原始筛选与来源，不用简单求和推导真实进度。

## 已向用户解释的 API 方案

推荐官方 OAuth 2.0 + v2 GraphQL API，持续战绩查询优先于抓取 HTML。推荐方案尚未实现，也尚未获得目标角色的认证 API 响应。

公开战绩查询：

1. 开发者登录 WCL，创建 API client，获得 client_id / client_secret。
2. 后端通过 Client Credentials flow 自动获取 access token。
3. 调用公开 GraphQL endpoint，查询角色公开数据。
4. 查询者不需要登录 WCL，也不需要角色本人授权。

私密报告：需要有权访问的用户授权，使用 Authorization Code 或 PKCE 流程及 user endpoint。公开 client token 无法读取私密报告。

官方端点：

- 认证说明：<https://www.warcraftlogs.com/api/docs>
- OAuth client 管理：<https://www.warcraftlogs.com/api/clients/>
- 获取 token：`https://www.warcraftlogs.com/oauth/token`
- 公开 GraphQL：`https://www.warcraftlogs.com/api/v2/client`
- 用户授权 GraphQL：`https://www.warcraftlogs.com/api/v2/user`

官方 Schema 支持：`characterData.character`、`Character.zoneRankings`、`encounterRankings`、`recentReports`、报告的 `fights / playerDetails / tables / graph / events / masterData`，以及 `rateLimitData` 配额查询。

## 未完成与待验证

- 没有创建 OAuth client，没有 API 凭据，没有执行认证 API 请求。
- 未带 token 对公开 endpoint 的测试返回 HTTP 404 HTML，不能据此推断 API 不可用；官方文档仍给出该 endpoint。
- 需要验证 CN 服务器 slug、目标角色定位与各字段覆盖率、JSON 响应结构和配额消耗。
- GraphQL 文件为依据 Schema 编写的草稿，未经认证执行。
- 装备/天赋若从日志读取，属于战斗发生时的快照，不能冒充角色当前配置。
- 没有实现爬虫、前后端应用、定时任务、数据库或部署；也没有代理轮换、指纹伪装、验证码代解或导出 Cookie。

## 本目录文件

- `warcraftlogs-research.md`：完整调研结论、访问证据、官方 API 说明、来源和建议架构。
- `warcraftlogs-character-observations.md`：角色页面的详细实测数值与筛选入口。
- `warcraftlogs-api-query.graphql`：未认证执行的角色排名查询草稿。
- `CONTEXT.md`：当前文件，可供新聊天或其他代理接续。

## 用户提供的工作约束

- 若仓库根有 `.codegraph/`，理解或定位代码时先用 CodeGraph；没有就跳过，不自动索引。
- 查询库、框架、SDK、API、CLI 或云服务的当前文档时使用 Context7：先 resolve-library-id，再按单一概念 query-docs；一般业务逻辑、代码审查或一般编程概念不强制使用。
- 用户习惯用中文沟通。

## 接续建议

若用户开始要求实现，先读取本项目的 AGENTS.md 与现有结构，再做最小官方 API 连通性验证。公开查询采用后端 Client Credentials，密钥置于后端配置中，不写入源码、文档、日志或聊天。验证成功后再决定公开战绩的字段模型与 UI。
