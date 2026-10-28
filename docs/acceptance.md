# 首版验收记录

日期：2026-10-28（Asia/Shanghai）。

## 已完成

- 已实现命令行公开战绩查询、配置示例、元数据解析、OAuth、缓存、表格与 JSON 输出。
- 已通过 Node.js 24.20.0 / pnpm 10.29.3 的类型检查及全部 33 项离线自动化测试（`pnpm check`）。
- 已验证缺少凭据时返回 `MISSING_CREDENTIALS`，不进行网络请求，不输出模拟战绩。
- 已通过子进程运行 pnpm 命令，使用显式注入的合成 HTTP 响应覆盖 token → GraphQL → 结果输出；stdout 可直接 JSON.parse，诊断走 stderr。
- 已覆盖参数、中文服务器名、分区选择、缓存、隐藏排行、空数据、结构变化、401、403 HTML、429、超时及重试等情况。

测试样本为合成数据，并非 WCL 真实响应。当前测试验证程序行为，不证明目标角色实际数据覆盖率。

## 真实 API 验收：待完成

本地环境未设置 WCL_CLIENT_ID / WCL_CLIENT_SECRET，也没有 `.env`。因此未获取真实 token、未对目标角色执行认证查询，不能将离线测试记为真实联调成功。

直接请求官方静态文档时仍出现 Cloudflare 挑战，接口说明以 Context7 提供的官方 Schema 为参考；这是文档访问结果，不是持有 token 的 API 可用性测试。

凭据准备后按以下顺序验收：

1. 用户在 WCL 创建客户端，并将凭据写入本地 `.env`，不通过聊天传递。
2. `pnpm wcl zones --no-cache`：验证 token 与区域／难度／默认分区元数据查询。
3. 使用目标角色“寰球旅行 / 无尽之海 / CN”和从 zones 核对的团本 ID、mythic 难度执行 `--raw --no-cache` 查询。
4. 核对 region.servers 的真实分页和服务器 slug，确认定位到的 WCL character ID。
5. 核对 zoneRankings 的 rankings、摘要、All Stars、bestAmount 语义以及 fastestKill 的单位；必要时调整响应适配器和测试样本。
6. 保存不含凭据的真实响应作为新契约样本，补对应测试，确认表格和 JSON 与相同筛选口径一致。
7. 查询一个确认不存在的角色，验证 `CHARACTER_NOT_FOUND`、非零退出码及空 stdout。
8. 再运行 `pnpm check`，记录真实联调日期和结论；确认后才移除“字段映射待联调”的提示。

在步骤 3–6 完成前，不能保证国服中文服务器匹配和排名 JSON 字段映射已适用于真实数据。
