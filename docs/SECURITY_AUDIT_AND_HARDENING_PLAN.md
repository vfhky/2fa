# 2FA 安全审计与加固方案（可执行版）

> 版本：v2（执行版）  
> 更新时间：2026-02-28  
> 审计范围：`src/` 全量（Worker 路由、认证、限流、备份恢复、前端脚本、PWA）  
> 核心目标：确保验证码与密钥不泄漏；在异常场景下保持安全策略“默认收紧”。

## 1. 审计结论

当前代码已具备基础安全改造（例如：默认禁用 `/otp/{secret}`、支持加密开关、移除明文缓存），但仍存在可被利用的关键薄弱点：

1. `P0` 日志泄漏认证信息风险（`Set-Cookie`）
2. `P0` 限流故障 fail-open（敏感接口可绕过）
3. `P0` 公开 OTP 接口无限流且无长度约束（DoS 风险）

本方案要求按“`P0 -> P1 -> P2`”顺序逐项实施，且每项必须满足验收条件再进入下一项。

## 2. 风险分级摘要

## P0（必须立即修复）

### P0-1 响应头日志未脱敏，可能泄漏 JWT

- 证据位置：`src/utils/logger.js:424`、`src/utils/logger.js:428`、`src/utils/auth.js:565`
- 风险：日志平台中出现 `Set-Cookie`，可导致会话劫持。

### P0-2 限流存储异常时默认放行（fail-open）

- 证据位置：`src/utils/rateLimit.js:136`、`src/utils/rateLimit.js:245`
- 风险：KV 抖动窗口可绕过敏感接口限流。

### P0-3 公开 OTP 接口可被 DoS 滥用

- 证据位置：`src/router/handler.js:227`、`src/api/secrets/otp.js:148`、`src/otp/generator.js:127`
- 风险：超长 `secret` + 高频请求导致 CPU/内存压力上升。

## P1（高优先级）

- P1-1 页面/兜底响应安全头不一致
- P1-2 favicon 代理防滥用不足
- P1-3 错误信息暴露内部细节
- P1-4 批量导入回包暴露完整密钥对象

## P2（中优先级）

- P2-1 refresh 接口缺独立限流
- P2-2 密码哈希比较非恒时
- P2-3 备份列表全量详情请求高开销

## P3（稳态安全与可运维性）

- P3-1 自动备份保留条数仍有硬编码路径（无法统一配置）
- P3-2 管理会话缺少绝对过期、空闲超时与显式登出

## 3. 实施总原则（必须遵守）

1. **先文档后代码**：每个任务先在本文档确认“改动点+验收标准”。
2. **安全默认收紧**：失败时优先拒绝（fail-closed），仅非敏感接口可降级。
3. **最小暴露原则**：API 回包、日志、监控均不回传密钥与凭据。
4. **兼容可控**：通过环境变量开关做灰度，不做一次性硬切。
5. **每步可回归**：每个任务必须有对应自动化测试和手工验证。

## 4. 详细修复任务清单（逐步执行）

## TASK-P0-01：日志脱敏（响应头 + URL）

- 目标：确保任何日志中不出现 `Set-Cookie`、Token、密钥。
- 代码改动点：
  1. `src/utils/logger.js`
  2. `tests/utils/logger.test.js`
- 具体实施：
  1. 新增响应头脱敏函数（屏蔽 `set-cookie`、`authorization`、`cookie`、`x-api-key`）。
  2. `createRequestLogger.logResponse()` 不再直接 `Object.fromEntries(response.headers)`。
  3. 保持 `sanitizeUrlForLog`，并确保调用链路统一使用脱敏 URL。
- 验收标准：
  1. 日志中 `set-cookie` 固定显示 `***REDACTED***`。
  2. 登录/刷新后日志不包含 JWT 明文。
- 自动化用例：
  1. 新增/更新 logger 单测：响应头脱敏断言。

## TASK-P0-02：限流 fail-open -> 可配置 fail-mode（敏感接口 fail-closed）

- 目标：敏感接口在限流存储故障时拒绝请求，不允许绕过。
- 代码改动点：
  1. `src/utils/rateLimit.js`
  2. `src/utils/auth.js`
  3. `src/api/secrets/{backup,batch,crud}.js`
  4. `tests/utils/rateLimit.test.js`
- 具体实施：
  1. 在 `checkRateLimitSlidingWindow/checkRateLimitFixedWindow/checkRateLimit` 增加 `failMode` 参数（`open|closed`，默认 `open` 兼容旧逻辑）。
  2. `failMode=closed` 时，KV 异常返回 `allowed=false`，并给出保守 `retryAfter`。
  3. 登录、首次设置、刷新 token、删除/批量/备份等敏感路径调用限流时强制 `failMode=closed`。
- 验收标准：
  1. 模拟 KV 异常时，敏感接口返回 429/503，不再放行。
  2. 普通接口保持兼容行为。
- 自动化用例：
  1. 增加 `failMode=closed` 单测。
  2. 保留原 `fail-open` 兼容单测。

## TASK-P0-03：OTP 公共接口滥用治理

- 目标：防止公开 OTP 端点被 DoS，确保参数上限明确。
- 代码改动点：
  1. `src/api/secrets/otp.js`
  2. `src/router/handler.js`
  3. `src/utils/validation.js`
  4. `tests/router/handler.test.js`、`tests/api/secrets.test.js`（按实际覆盖补）
- 具体实施：
  1. 对 `POST /api/otp/generate` 增加独立限流（建议 `RATE_LIMIT_PRESETS.otpPublic`）。
  2. 请求体大小限制（按 `Content-Length` 与实际字符串长度双重校验，默认 `4KB`）。
  3. `secret` 长度上限（建议 `<=256`），并在校验阶段快速失败。
  4. 增加可选开关 `REQUIRE_AUTH_FOR_OTP_API`（默认 `false`），供生产可逐步切换。
- 验收标准：
  1. 超长 `secret` 返回 400。
  2. 高频调用触发 429。
  3. 正常请求行为不变（兼容现有客户端）。
- 自动化用例：
  1. 新增 `secret` 超长测试。
  2. 新增公共 OTP 限流测试。

## TASK-P1-01：统一响应安全头注入

- 目标：所有 HTML/JSON/错误响应统一带安全头。
- 代码改动点：
  1. `src/ui/page.js`
  2. `src/ui/setupPage.js`
  3. `src/ui/quickOtp.js`
  4. `src/worker.js`
  5. `tests/utils/response.test.js`（如需）
- 具体实施：
  1. 页面响应改为使用 `createHtmlResponse` 或统一安全头构建器。
  2. worker 顶层 500 fallback 注入 `getSecurityHeaders(request)`。
- 验收标准：
  1. `/`、`/setup`、`/otp`、500 fallback 均有 `X-Frame-Options`、`CSP` 等头。

## TASK-P1-02：favicon 代理防滥用

- 目标：降低 SSRF/代理滥用与资源消耗风险。
- 代码改动点：
  1. `src/api/favicon.js`
  2. `src/router/handler.js`（如需）
  3. `tests/router/handler.test.js`（如需）
- 具体实施：
  1. 为 `/api/favicon/*` 增加独立限流（按 IP + domain）。
  2. 增加目标解析后私网网段拦截（保守策略）。
  3. 默认禁用 `Direct-HTTP` 回源或改为可配置开关。
- 验收标准：
  1. 压测下不会无限制透传。
  2. 私网/本地目标无法请求。

## TASK-P1-03：错误信息收敛（去内部细节）

- 目标：客户端错误消息不泄漏内部实现信息。
- 代码改动点：
  1. `src/api/secrets/{backup,restore,batch,crud,otp,stats}.js`
  2. `src/router/handler.js`
  3. `src/utils/errors.js`（必要时）
- 具体实施：
  1. 客户端返回统一文案（例如“内部错误，请稍后重试”）。
  2. 详细原因仅记日志，并附 `errorId`（可选）。
- 验收标准：
  1. 生产路径响应不出现底层异常消息。

## TASK-P1-04：批量导入回包最小化

- 目标：避免 API 回包再次泄漏密钥。
- 代码改动点：
  1. `src/api/secrets/batch.js`
  2. `tests/api/batch.test.js`
- 具体实施：
  1. 成功项只返回 `id/name/account/type`，不返回 `secret`。
- 验收标准：
  1. 回包中无明文密钥字段。

## TASK-P2-01：refresh 接口独立限流

- 代码改动点：`src/utils/auth.js`、`src/utils/rateLimit.js`、`tests/utils/auth.integration.test.js`
- 目标：避免刷新接口被洪泛。
- 已实施：
  1. 新增 `RATE_LIMIT_PRESETS.refreshToken`（默认 `20/60s`）。
  2. `handleRefreshToken` 使用独立 key：`refresh:${clientIP}`，并强制 `failMode=closed`。
  3. 增加集成测试：验证 refresh 限流触发，以及 refresh 与 login 限流计数隔离。

## TASK-P2-02：密码哈希恒时比较

- 代码改动点：`src/utils/auth.js`、`tests/utils/auth.test.js`
- 目标：降低时序侧信道风险。
- 已实施：
  1. 新增 `timingSafeEqual(Uint8Array, Uint8Array)`，避免 `===` 短路比较。
  2. `verifyPassword` 改为字节级恒时比较（固定遍历长度，长度差异也纳入比较）。
  3. 补充测试：异常长度哈希场景返回安全失败。

## TASK-P2-03：备份列表性能治理

- 代码改动点：`src/api/secrets/backup.js`、相关 API 测试
- 目标：避免 `limit=all&details=true` 导致的高开销请求。
- 已实施：
  1. 新增备份 metadata（`created/count/encrypted/size/reason`），备份写入时同步保存，列表优先走 metadata，不再默认读取备份内容。
  2. `limit=all` 场景默认关闭 `details`（可用 `ALLOW_ALL_BACKUP_DETAILS=true` 显式开启）。
  3. 详情模式加入阈值与并发保护：
     - `BACKUP_DETAILS_MAX_ITEMS`（默认 `200`）
     - `BACKUP_DETAILS_CONCURRENCY`（默认 `8`）
       超出阈值的条目标记 `detailSkipped=true` 并降级摘要返回。
  4. 前端备份列表请求调整为 `limit=all&details=false`，避免默认高开销路径。

## TASK-P3-01：备份保留条数环境化与统一治理

- 目标：消除“100 条”硬编码，支持生产按策略配置（如 20 条）。
- 风险背景：
  1. 当前 `src/utils/backup.js` 与 `src/worker.js` 各自维护保留上限，存在配置漂移风险。
  2. 无法通过 `wrangler.toml` 精确控制不同环境的保留条数。
- 代码改动点：
  1. `src/utils/backup.js`
  2. `src/worker.js`
  3. `wrangler.toml`
  4. `tests/utils/backup.test.js`（必要）
- 具体实施：
  1. 在备份工具中新增统一解析函数（例如 `getBackupRetentionConfig(env)`），解析 `BACKUP_MAX_BACKUPS`。
  2. 解析规则：
     - 未配置或非法值：回退默认 `100`
     - `0`：表示不限制（禁用清理）
     - `>=1`：按配置值清理
  3. `BackupManager._cleanupOldBackupsAsync()` 与 `worker.cleanupOldBackups()` 统一使用该配置，不再保留硬编码 `100`。
  4. 在 `wrangler.toml` 增加生产/开发示例配置，确保可显式设置为 `20`。
- 验收标准：
  1. 设置 `BACKUP_MAX_BACKUPS=20` 时，清理后最多保留 20 条备份。
  2. 设置 `BACKUP_MAX_BACKUPS=0` 时，不触发自动清理。
  3. `backup.js` 与 `worker.js` 清理行为一致。

## TASK-P3-02：会话生命周期安全策略（绝对过期 + 空闲超时）

- 目标：避免“长期管理员态”风险，阻断无限续期会话。
- 风险背景：
  1. 现有模型可通过自动 refresh 长期续期，缺少绝对过期边界。
  2. 缺少空闲超时，设备遗失或共享终端风险偏高。
- 代码改动点：
  1. `src/utils/auth.js`
  2. `src/router/handler.js`
  3. `wrangler.toml`
  4. `tests/utils/auth.integration.test.js`
  5. `tests/utils/auth.test.js`（必要）
- 新增配置项（环境变量）：
  1. `AUTH_SESSION_TTL_DAYS`：单个 JWT 有效期（默认 `30`）
  2. `AUTH_AUTO_REFRESH_THRESHOLD_DAYS`：触发续期阈值（默认 `7`）
  3. `AUTH_ABSOLUTE_TTL_DAYS`：首次登录起绝对会话上限（默认 `30`）
  4. `AUTH_IDLE_TIMEOUT_MINUTES`：空闲超时（默认 `120`）
- 具体实施：
  1. 登录/首次设置签发 token 时写入：
     - `origIat`：首次认证时间（秒级时间戳）
     - `lastActiveAt`：最近活跃时间（秒级时间戳）
  2. 在认证验证阶段新增策略校验：
     - `now - origIat > AUTH_ABSOLUTE_TTL_DAYS` -> 认证失败
     - `now - lastActiveAt > AUTH_IDLE_TIMEOUT_MINUTES` -> 认证失败
  3. refresh 成功后：
     - 保留 `origIat`（不可重置绝对会话起点）
     - 更新 `lastActiveAt` 与 `refreshedAt`
  4. `needsRefresh` 使用可配置阈值 `AUTH_AUTO_REFRESH_THRESHOLD_DAYS`。
- 验收标准：
  1. refresh 不得突破绝对会话上限。
  2. 超过空闲超时后必须重新登录。
  3. 策略通过环境变量可调，不破坏默认兼容性。

## TASK-P3-03：显式登出链路（后端 + 前端）

- 目标：提供可审计、可预期的主动退出机制，快速终止当前会话。
- 代码改动点：
  1. `src/utils/auth.js`
  2. `src/router/handler.js`
  3. `src/ui/scripts/auth.js`
  4. `src/ui/page.js`
  5. `tests/router/handler.test.js`
  6. `tests/utils/auth.integration.test.js`
- 具体实施：
  1. 新增 `POST /api/logout`：
     - 需要已认证（受保护路由）
     - 返回过期 `Set-Cookie` 清除 `auth_token`
     - 同步提升服务端会话版本号（`auth_session_version`），使历史 JWT 立即失效
  2. 前端增加 `logout()`，请求 `/api/logout` 后清理本地缓存并弹出登录框。
  3. 在主界面操作菜单新增“退出登录”入口，便于人工执行安全退出。
- 验收标准：
  1. 调用 logout 后 Cookie 被清除，后续受保护接口返回 401。
  2. 前端退出后可稳定回到登录态，不出现脏状态残留。
  3. logout 后历史 token（即使仍被持有）必须无法通过 `verifyAuth/refresh` 校验。

## 5. 执行顺序与里程碑

### M1（立即）

- 完成 `TASK-P0-01 ~ TASK-P0-03`
- 通过对应单测后再进入 M2

### M2（高优）

- 完成 `TASK-P1-01 ~ TASK-P1-04`
- 完成后做一次全量回归

### M3（稳态优化）

- 完成 `TASK-P2-01 ~ TASK-P2-03`

### M4（会话与运维收敛）

- 完成 `TASK-P3-01 ~ TASK-P3-03`
- 重点验证“会话不可无限续期 + 备份数量可配置可审计”

## 6. 回归测试矩阵

### 自动化

1. `npm test -- --run tests/utils/logger.test.js`
2. `npm test -- --run tests/utils/rateLimit.test.js`
3. `npm test -- --run tests/router/handler.test.js`
4. `npm test -- --run tests/api/*.test.js`
5. `npm run lint`
6. `npm test -- --run tests/utils/backup.test.js`
7. `npm test -- --run tests/utils/auth.integration.test.js`
8. `npm test -- --run tests/router/handler.test.js`

### 人工

1. 登录/刷新后检查日志与响应，确认无 token 泄漏。
2. 压测 `/api/otp/generate` 与 `/api/favicon/*`，观察限流生效。
3. 检查关键页面响应头与 CSP。

## 7. 灰度与回滚策略

1. 新增安全开关默认“安全优先”，并在 `development` 允许兼容。
2. 每个任务单独提交，支持按 commit 回滚。
3. 回滚原则：只回滚对应任务，不回滚已验证通过的先前任务。

## 8. 本轮执行记录（动态维护）

- [x] TASK-P0-01 日志脱敏
- [x] TASK-P0-02 限流 fail-mode
- [x] TASK-P0-03 OTP 滥用治理
- [x] TASK-P1-01 统一安全头
- [x] TASK-P1-02 favicon 防滥用
- [x] TASK-P1-03 错误信息收敛
- [x] TASK-P1-04 批量回包最小化
- [x] TASK-P2-01 refresh 限流
- [x] TASK-P2-02 恒时比较
- [x] TASK-P2-03 备份性能治理
- [x] TASK-P3-01 备份保留条数环境化
- [x] TASK-P3-02 会话生命周期安全策略
- [x] TASK-P3-03 显式登出链路

## 9. 本轮验证结果（P3）

1. `npm test -- --run tests/utils/backup.test.js` 通过
2. `npm test -- --run tests/utils/auth.integration.test.js` 通过
3. `npm test -- --run tests/router/handler.test.js` 通过
4. `npm test -- --run tests/utils/auth.test.js tests/utils/auth.integration.test.js tests/utils/backup.test.js tests/router/handler.test.js` 通过
5. `npm run lint` 通过
6. 登出吊销验证通过（旧 token 在 `verifyAuth/refresh` 路径均被拒绝）

---

该文档为当前分支的执行基线。后续代码修复必须严格对照任务编号逐项落地并勾选。
