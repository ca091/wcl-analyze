# Warcraft Logs 角色页面实测记录

调研时间：2026-10-28（Asia/Shanghai）  
目标角色：寰球旅行，CN / 无尽之海  
来源：[角色页](https://www.warcraftlogs.com/character/cn/%E6%97%A0%E5%B0%BD%E4%B9%8B%E6%B5%B7/%e5%af%b0%e7%90%83%e6%97%85%e8%a1%8c)

本记录来自 Chrome 中已打开的目标页面的可见 DOM/无障碍树读取。页面显示 `Sign Up` / `Log In`，角色数据可直接读取；本次没有登录、刷新角色资料、解决 CAPTCHA 或规避访问控制。既有浏览器能够读取页面，不等于全新浏览器、命令行或大规模采集一定可以访问。

## 1. 默认页面能读取的数据

| 数据类别 | 已观察到的字段与具体值 |
|---|---|
| 角色标识 | 寰球旅行；无尽之海 (CN)；服务器链接 `/server/id/697` |
| 种族、职业 | `Undead Mage`（亡灵法师） |
| 更新时间 | `Last Update: 2 months ago`（页面相对时间，非精确时间戳） |
| 当前团本摘要 | `The Venomous Abyss Mythic`；`4 / 8`；Frost；Rank `1360` |
| 大秘境赛季摘要 | `Mythic+ Season 2`：Arcane，Rank `19430`；`Mythic+ Season 1`：Frost，Rank `136524` |
| 团本整体表现 | MYTHIC；Best Perf. Avg `44.4`；Median Perf. Avg `37.6`；Kills Logged `21` |
| All Star Points | Frost `140.08`、Rank `1360`、分区 `12.1.5`；Arcane `367.39`、Rank `8957`、分区 `12.1` |
| 每个首领 | 首领名称、Best %、对应专精、Highest DPS、Kills、Fastest、Median、All Stars Points、All Stars Rank |
| 装备 | Gear 区域存在，但当前明确显示 `No items found.` |
| 天赋 | Talents 区域存在，但当前明确显示 `No talents found.` |
| Raid Progression 区域 | 三个区域均显示 `0 / 0 Normal`，与战斗日志排行摘要并非同一个信息来源，不能把这些值当作角色真实无进度的证据 |

上述全部观察均来自[目标角色页](https://www.warcraftlogs.com/character/cn/%E6%97%A0%E5%B0%BD%E4%B9%8B%E6%B5%B7/%e5%af%b0%e7%90%83%e6%97%85%e8%a1%8c)。

页面明确提示：`Due to restrictions from the Blizzard API, Chinese characters have limited support.` 这能够解释本页面部分角色基础资料能力受限；不能仅凭该提示断定每个空字段的确切原因。[来源：角色页](https://www.warcraftlogs.com/character/cn/%E6%97%A0%E5%B0%BD%E4%B9%8B%E6%B5%B7/%e5%af%b0%e7%90%83%e6%97%85%e8%a1%8c)

### 当前首领表现明细

当前筛选为 Midnight / The Venomous Abyss / Damage / All Bosses / All Specs / Highest Difficulty；页面表格标为 MYTHIC。这些值应当连同筛选条件一起保存，避免把某一版本、某一难度的值误认为角色全历史统计。

| 首领 | Best % | 专精 | Highest DPS | Kills | Fastest | Median | All Stars Points | Rank |
|---|---:|---|---:|---:|---|---:|---:|---:|
| Nek'zali the Soulcoiler | 72 | Arcane | 217,561.7 | 6 | 6:26 | 60 | 88.45 | 4011 |
| Entombed Sentinels | 31 | Frost | 181,803.7 | 3 | 6:43 | 23 | 70.83 | 785 |
| Vashnik the Malignant | 98 | Arcane | 366,027.2 | 3 | 6:08 | 79 | 115.62 | 144 |
| The Lost Explorers | 29 | Arcane | 208,673.1 | 4 | 6:03 | 29 | 72.14 | 14726 |
| Nymrissa Wavecaller | 83 | Arcane | 237,795.2 | 5 | 6:37 | 57 | 93.89 | 3412 |

Sszorak、The Twin Fangs、The Coiled Altar、Ula'tek、Kith'ix 的行存在，Kills 为 0，其余表现字段为 `-`。这表示当前页面筛选下无对应表现值，不能推导其从未参与这些战斗。[来源：角色页](https://www.warcraftlogs.com/character/cn/%E6%97%A0%E5%B0%BD%E4%B9%8B%E6%B5%B7/%e5%af%b0%e7%90%83%e6%97%85%e8%a1%8c)

## 2. 页面提供的筛选维度

页面 DOM 中存在下列公开导航入口；本次确认了入口和部分实际 href，未逐一加载所有组合。

- 资料片：Midnight、The War Within、Dragonflight、Shadowlands、Battle for Azeroth、Legion、Warlords of Draenor、Mists of Pandaria。
- 当前资料片的区域：The Venomous Abyss、Sporefall、VS / DR / MQD、Mythic+ Season 2、Mythic+ Season 1。
- 指标：Speed、Damage、Healing、Damage To Bosses。
- 首领：All Bosses、各首领、Complete Raids。
- 专精：All Specs、Arcane、Fire、Frost、Ranged。
- 难度：Highest Difficulty、Mythic、Heroic、Normal、LFR。
- 分区/补丁：All、12.1、12.1.5。
- 其他开关：按 ilvl 或 key 分组排行；包含私密日志（存在 UI 入口不代表未认证调用有权限）。

来源：[角色页](https://www.warcraftlogs.com/character/cn/%E6%97%A0%E5%B0%BD%E4%B9%8B%E6%B5%B7/%e5%af%b0%e7%90%83%e6%97%85%e8%a1%8c)。

## 3. 已确认的公开链接参数

从页面中实际存在的 `<a href>` 读取，而不是猜测路径：

| 入口 | 实际 href | 可打开链接 |
|---|---|---|
| The War Within | `?zone=44` | [该资料片入口](https://www.warcraftlogs.com/character/cn/%E6%97%A0%E5%B0%BD%E4%B9%8B%E6%B5%B7/%e5%af%b0%e7%90%83%e6%97%85%e8%a1%8c?zone=44) |
| Mythic+ Season 2 | `?zone=55` | [赛季入口](https://www.warcraftlogs.com/character/cn/%E6%97%A0%E5%B0%BD%E4%B9%8B%E6%B5%B7/%e5%af%b0%e7%90%83%e6%97%85%e8%a1%8c?zone=55) |
| Vashnik the Malignant | 角色路径 + `?boss=3455` | [该首领入口](https://www.warcraftlogs.com/character/cn/%E6%97%A0%E5%B0%BD%E4%B9%8B%E6%B5%B7/%e5%af%b0%e7%90%83%e6%97%85%e8%a1%8c?boss=3455) |
| Update | `#` | JavaScript 交互入口，不是一个可直接抓取的数据 URL；本次未触发 |

这些是 HTML 页面导航参数，不是承诺稳定的数据 API。公开存在的入口也不能替代站点条款、API 认证和访问限额。

## 4. 页面中的官方解释与隐私入口

- 页面解释了排行背景颜色，并链接至[官方排行说明](https://www.archon.gg/wow/articles/help/rankings-and-parses)。
- 页面明确说明：角色所有者可请求隐藏涉及该角色的 parses，并链接至[官方角色帮助](https://www.archon.gg/wow/articles/help/characters)。因此“网页可见角色”不意味着能够获取所有日志；应保留“隐藏/不可用/无数据”等不同状态。

## 5. 数据模型与采集建议

建议保存 `region + server + characterName`，同时保存 `zoneID + encounterID + difficulty + metric + spec + partition + timeframe + retrievedAt`。角色可能有同名、转服、改名及资料滞后问题，仅以中文名作主键不足。

一个可行的最小目标是：角色标识、职业、页面更新时间、各首领的 Best/Median、DPS/HPS、击杀次数、最快时间、All Stars 积分及排行，以及大秘境赛季摘要。装备、天赋和完整真实团本进度在本 CN 样本中没有得到有效资料，不能承诺这三类字段的覆盖率。

以上为页面观察；官方 API 的认证、字段和请求限额应以另一份 API 调研为准。
