# Agents Mail - 运维手册

> 版本：v1.0 | 最后更新：2026-03-13

---

## 一、分支模型

采用三分支模型：`dev` → `preview` → `production`，分别对应 开发 → 测试 → 生产。

```
feature/*  ──PR──▶  dev  ──PR──▶  preview  ──PR──▶  production
fix/*      ──PR──▶  dev                                │
hotfix/*   ──────────────────────────────────PR────────▶│
                     │          │              │
                  开发环境    灰度/公测环境     生产环境
               (wrangler dev) (Workers + Vercel灰度) (Workers prod + Vercel prod)
```

### 1.1 分支职责

| 分支 | 角色 | 保护规则 | 部署目标 |
|------|------|---------|---------|
| `production` | 生产分支 | 禁止直接 push；仅 preview→production 的 PR 可合并；需 CI 全部通过 | Cloudflare Workers (prod) + Vercel (prod) |
| `preview` | 灰度/公测 | 禁止直接 push；仅 dev→preview 的 PR 可合并；需 CI + 集成测试通过 | Workers 部署 + Vercel 灰度服务器（公测） |
| `dev` | 开发集成 | 禁止直接 push；所有 feature/fix PR 先合入 dev；需 CI 通过 | 本地 wrangler dev |
| `feature/*` | 功能开发 | 从 dev 切出，完成后 PR 到 dev | — |
| `fix/*` | Bug 修复 | 从 dev 切出，完成后 PR 到 dev | — |
| `hotfix/*` | 紧急修复 | 从 production 切出，完成后 PR 到 production **和** dev | Workers prod 直接部署 |

### 1.2 分支命名规范

```
feature/<issue-number>-<short-description>   # 新功能
fix/<issue-number>-<short-description>        # Bug 修复
hotfix/<issue-number>-<short-description>     # 生产紧急修复
```

示例：
```
feature/22-rate-limiting
fix/45-email-parse-error
hotfix/50-jwt-secret-leak
```

### 1.3 工作流程

#### 日常开发
```bash
# 1. 从 dev 切出 feature 分支
git checkout dev && git pull
git checkout -b feature/22-rate-limiting

# 2. 开发 + 本地测试
npm run test:workers && npm run test:cli

# 3. 推送并创建 PR → dev
git push -u origin feature/22-rate-limiting
gh pr create --base dev --title "feat: add rate limiting (#22)"

# 4. CI 通过 + Review 后合并到 dev
```

#### 提测发布
```bash
# 1. 从 dev 创建 PR → preview
gh pr create --base preview --head dev --title "release: v0.2.0 预发布测试"

# 2. Vercel Preview 部署自动触发，在预览环境执行 LAUNCH_CHECKLIST.md
# 3. 发现问题 → 在 dev 修复 → 重新合并到 preview
# 4. 测试通过后合并
```

#### 正式上线
```bash
# 1. 从 preview 创建 PR → production
gh pr create --base production --head preview --title "release: v0.2.0"

# 2. CI 通过后合并
# 3. Workers 自动部署到生产
# 4. 打版本标签
git checkout production && git pull
git tag -a v0.2.0 -m "Release v0.2.0: rate limiting, webhook notifications"
git push origin v0.2.0
```

#### 生产热修复
```bash
# 1. 从 production 切出 hotfix
git checkout production && git pull
git checkout -b hotfix/50-critical-fix

# 2. 修复 + 测试
# 3. PR → production（紧急上线）
gh pr create --base production --title "hotfix: fix critical issue (#50)"

# 4. 合并后同步到 dev
gh pr create --base dev --head production --title "sync: hotfix #50 back to dev"
```

---

## 二、CI/CD 流水线

### 2.1 流水线矩阵

| 事件 | 触发分支 | 执行内容 |
|------|---------|---------|
| PR / Push | `dev` | Build → 单元测试 → 覆盖率报告 |
| PR / Push | `preview` | Build → 单元测试 → 集成测试 → Workers 部署 → Vercel 灰度部署（公测） |
| PR / Push | `production` | Build → 全部测试 → Workers 生产部署 → Vercel 生产部署 |
| Tag `v*` | — | 生成 Release Notes → GitHub Release |

### 2.2 GitHub Actions 配置

详见：
- `.github/workflows/ci.yml` — 测试流水线（dev / preview / production）
- `.github/workflows/deploy.yml` — 生产部署（仅 production）
- `.github/workflows/release.yml` — 版本发布（tag v*）

---

## 三、环境配置

### 3.1 环境矩阵

| 环境 | 分支 | API URL | Web URL | D1 数据库 |
|------|------|---------|---------|----------|
| 开发 | `dev` | `http://localhost:8787` | `http://localhost:3000` | 本地 D1 (wrangler dev) |
| 预览 | `preview` | Vercel Preview 自动分配 | Vercel Preview URL | staging D1（未来） |
| 生产 | `production` | `https://agentsmail.org` | `https://web-rho-sand-88.vercel.app` | 生产 D1 |

### 3.2 Secrets 管理

| Secret | 存储位置 | 用途 |
|--------|---------|------|
| `CLOUDFLARE_API_TOKEN` | GitHub Secrets | Workers 部署 |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets | Workers 部署 |
| `RESEND_API_KEY` | Cloudflare Workers Secrets | 邮件发送 |
| `JWT_SECRET` | Cloudflare Workers Secrets | Session 签名 |

#### 查看/设置 Workers Secret

```bash
# 查看已配置的 secrets
cd workers && npx wrangler secret list

# 设置 secret
npx wrangler secret put JWT_SECRET
npx wrangler secret put RESEND_API_KEY
```

#### 查看 GitHub Secrets

```bash
gh secret list
```

---

## 四、数据库运维

### 4.1 迁移管理

```bash
# 查看本地迁移状态
cd workers && npx wrangler d1 migrations list agent-mailbox --local

# 查看远程（生产）迁移状态
cd workers && npx wrangler d1 migrations list agent-mailbox --remote

# 应用迁移到生产
cd workers && npx wrangler d1 migrations apply agent-mailbox --remote
```

### 4.2 迁移规范

- 文件命名：`NNN_description.sql`（NNN 三位数递增）
- 每个迁移文件只做一件事
- 所有 DDL 使用 `IF NOT EXISTS` / `IF EXISTS` 保护
- 禁止在迁移中 DROP TABLE（使用新迁移添加替代表）
- 涉及数据变更的迁移需先备份

### 4.3 数据库备份

```bash
# 导出生产数据库
npx wrangler d1 export agent-mailbox --remote --output=backup_$(date +%Y%m%d).sql
```

### 4.4 紧急查询

```bash
# 在生产 D1 上执行只读查询
npx wrangler d1 execute agent-mailbox --remote --command "SELECT COUNT(*) FROM agents"

# 查看最近的邮件
npx wrangler d1 execute agent-mailbox --remote --command \
  "SELECT id, agent_id, subject, created_at FROM emails ORDER BY created_at DESC LIMIT 10"
```

---

## 五、部署操作

### 5.1 Workers 部署

```bash
# 生产部署（通常通过 CI 自动执行，push 到 production 触发）
cd workers && npx wrangler deploy

# Email Worker 部署（独立配置）
cd workers && npx wrangler deploy --config email-wrangler.toml

# 回滚到上一个版本
npx wrangler rollback
```

### 5.2 Vercel 部署

```bash
# 生产部署
cd web && vercel deploy --prod

# 查看部署列表
vercel ls

# 回滚到上一个部署
vercel rollback
```

### 5.3 部署后验证

每次生产部署后执行：

```bash
# 1. 健康检查
curl -s https://agentsmail.org/ | jq .

# 2. 服务发现
curl -s https://agentsmail.org/.well-known/agent-mailbox | jq .

# 3. Web Dashboard
curl -s -o /dev/null -w "%{http_code}" https://web-rho-sand-88.vercel.app

# 4. 数据库迁移状态
cd workers && npx wrangler d1 migrations list agent-mailbox --remote
```

---

## 六、监控与告警

### 6.1 Cloudflare Workers 监控

- **Dashboard**: https://dash.cloudflare.com → Workers & Pages → agent-mailbox
- 关注指标：请求数、错误率、CPU 时间、延迟 P50/P99

### 6.2 Vercel 监控

- **Dashboard**: https://vercel.com/dashboard
- 关注指标：部署状态、构建时间、函数执行错误

### 6.3 手动健康检查

```bash
# 快速健康检查脚本
echo "=== API Health ===" && \
curl -s -o /dev/null -w "HTTP %{http_code} - %{time_total}s\n" \
  https://agentsmail.org/ && \
echo "=== Web Health ===" && \
curl -s -o /dev/null -w "HTTP %{http_code} - %{time_total}s\n" \
  https://web-rho-sand-88.vercel.app && \
echo "=== Service Discovery ===" && \
curl -s https://agentsmail.org/.well-known/agent-mailbox \
  | jq -r '.service // "ERROR"'
```

---

## 七、版本发布流程

### 7.1 语义化版本

格式：`v<major>.<minor>.<patch>`

| 变更类型 | 版本递增 | 示例 |
|---------|---------|------|
| 破坏性变更（API 不兼容） | major | v1.0.0 → v2.0.0 |
| 新功能（向后兼容） | minor | v0.1.0 → v0.2.0 |
| Bug 修复 | patch | v0.1.0 → v0.1.1 |

### 7.2 完整发布步骤

```bash
# 1. dev 功能冻结，创建 PR → preview
gh pr create --base preview --head dev --title "release: v0.2.0 预发布"

# 2. preview 环境验证（执行 LAUNCH_CHECKLIST.md）

# 3. 验证通过，创建 PR → production
gh pr create --base production --head preview --title "release: v0.2.0"

# 4. 合并后打标签
git checkout production && git pull
git tag -a v0.2.0 -m "Release v0.2.0: rate limiting, webhook notifications"
git push origin v0.2.0

# 5. GitHub Release 自动生成（通过 release.yml）
# 或手动创建：
gh release create v0.2.0 --generate-notes
```

---

## 八、故障响应

### 8.1 严重级别

| 级别 | 定义 | 响应时间 |
|------|------|---------|
| P0 | 服务完全不可用 | 立即响应 |
| P1 | 核心功能异常（邮件收发失败） | 1 小时内 |
| P2 | 非核心功能异常（Dashboard 页面错误） | 4 小时内 |
| P3 | 体验问题（样式错乱、文案错误） | 下个迭代 |

### 8.2 故障处理流程

```
发现故障 → 确认级别 → 通知相关人 → 定位原因 → 修复/回滚 → 验证恢复 → 编写复盘
```

### 8.3 快速回滚

```bash
# Workers 回滚
cd workers && npx wrangler rollback

# Vercel 回滚
vercel rollback

# 数据库回滚（需要提前有备份）
npx wrangler d1 execute agent-mailbox --remote --file=backup_YYYYMMDD.sql
```

---

## 九、日常运维任务

### 每日

- [ ] 检查 GitHub Actions 是否有失败的 workflow
- [ ] 检查 Cloudflare Workers 错误率

### 每周

- [ ] 审查 open issues 和 PR
- [ ] 清理已合并的 feature 分支
- [ ] 检查依赖安全更新（`npm audit`）

### 每次发布

- [ ] 执行 `docs/LAUNCH_CHECKLIST.md` 测试清单
- [ ] 确认数据库迁移已同步到生产
- [ ] 打版本标签
- [ ] 更新 CHANGELOG（如有）

### 分支清理

```bash
# 清理已合并到 dev 的本地分支
git branch --merged dev | grep -v "dev\|preview\|production" | xargs git branch -d

# 清理远程已删除的追踪分支
git fetch --prune
```

---

## 十、GitHub 分支保护规则设置

在 GitHub repo Settings → Branches → Branch protection rules 中配置：

### `production` 分支
- [x] Require a pull request before merging
- [x] Require status checks to pass (CI)
- [x] Require branches to be up to date
- [x] Do not allow bypassing the above settings

### `preview` 分支
- [x] Require a pull request before merging
- [x] Require status checks to pass (CI)

### `dev` 分支
- [x] Require a pull request before merging
- [x] Require status checks to pass (CI)
