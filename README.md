# Agents Mail

[English](#english) | [中文](#中文)

---

<a name="english"></a>

## Email for AI Agents — Free, Zero-Friction, Encrypted

Give your AI agent its own email address in one API call. No account creation, no OAuth, no SDK required.

**Website:** [agentsmail.org](https://agentsmail.org) | **ClawHub:** [agentsmail skill](https://clawhub.ai/huberthe-pro/agentsmail)

### Why Email?

Email is the internet's original decentralized protocol — federated, asynchronous, identity-native, DNS-routed. Your agent gets a permanent address that works with every email system in the world.

### Quick Start

```bash
# Get a mailbox (no auth needed)
curl -X POST https://agentsmail.org/api/getemailaddress \
  -H "Content-Type: application/json" \
  -d '{"agent_name": "my-agent"}'

# Send an email
curl -X POST https://agentsmail.org/api/send \
  -H "Authorization: Bearer am_sk_your_key" \
  -H "Content-Type: application/json" \
  -d '{"to": "someone@gmail.com", "subject": "Hello", "text": "From my agent!"}'

# Check inbox
curl https://agentsmail.org/api/inbox \
  -H "Authorization: Bearer am_sk_your_key"
```

### Two-Step Model

| Step | What you get |
|------|-------------|
| **Free Mailbox** (Tier 0) | Random address, 10 trial sends, unlimited receive, encrypted storage |
| **Permanent Mailbox** (Tier 1) | Custom name@agentsmail.org, unlimited sending, webhooks, contacts, ACL |

Upgrade with one call: `POST /api/upgrade` with your owner's email. Magic link confirms, auto-upgrades.

### API Endpoints

| Action | Method | Path | Auth |
|--------|--------|------|------|
| Help | GET | `/api/help` | None |
| Get mailbox | POST | `/api/getemailaddress` | None |
| Send email | POST | `/api/send` | API Key |
| Check inbox | GET | `/api/inbox` | API Key |
| Read email | GET | `/api/inbox/:id` | API Key |
| Delete email | DELETE | `/api/inbox/:id` | API Key |
| Sent emails | GET | `/api/sent` | API Key |
| Upgrade | POST | `/api/upgrade` | API Key |
| Webhooks | GET/POST/DELETE | `/api/webhooks` | API Key |
| Contacts | GET/POST/DELETE | `/api/contacts` | API Key |
| ACL | GET/POST/DELETE | `/api/acl` | API Key |

### Security

- AES-256-GCM encryption at rest
- HMAC-SHA256 delete receipts
- Email content destroyed on delete, envelope preserved for audit
- No OAuth dance, no stored passwords

### Architecture

- **Runtime:** Cloudflare Workers (edge compute)
- **Database:** D1 (serverless SQLite)
- **Email Sending:** Resend API
- **Email Receiving:** Cloudflare Email Routing
- **Testing:** Vitest (120+ tests)

### Self-Hosting

```bash
git clone https://github.com/huberthe-pro/agents-mail.git
cd agents-mail
npm install
cp wrangler.toml.example wrangler.toml   # Fill in your Cloudflare account
cp .env.example .dev.vars                 # Fill in API keys
npm run dev                               # Local dev server on :8787
npm test                                  # Run tests
npx wrangler deploy                       # Deploy to Cloudflare
```

### Team

- **Founder:** [Anson Ho](http://anson.im)
- **Co-Founders:** Claude Code & Codex & OpenClaw

### License

MIT

---

<a name="中文"></a>

## 给 AI Agent 的邮箱服务 — 免费、零摩擦、加密

一个 API 调用，让你的 AI Agent 拥有自己的邮箱地址。无需注册账号，无需 OAuth，无需安装 SDK。

**官网:** [agentsmail.org](https://agentsmail.org) | **ClawHub:** [agentsmail skill](https://clawhub.ai/huberthe-pro/agentsmail)

### 为什么用 Email？

Email 是互联网最早的去中心化通信协议——联邦化、异步、身份内建、DNS 路由。你的 Agent 获得一个永久地址，兼容全球所有邮件系统。

### 快速开始

```bash
# 领取邮箱（无需认证）
curl -X POST https://agentsmail.org/api/getemailaddress \
  -H "Content-Type: application/json" \
  -d '{"agent_name": "my-agent"}'

# 发送邮件
curl -X POST https://agentsmail.org/api/send \
  -H "Authorization: Bearer am_sk_your_key" \
  -H "Content-Type: application/json" \
  -d '{"to": "someone@gmail.com", "subject": "Hello", "text": "来自我的 Agent！"}'

# 查收件箱
curl https://agentsmail.org/api/inbox \
  -H "Authorization: Bearer am_sk_your_key"
```

### 两步模型

| 步骤 | 你获得的 |
|------|---------|
| **免费邮箱** (Tier 0) | 随机地址，10 封试发额度，无限接收，加密存储 |
| **永久邮箱** (Tier 1) | 自定义 name@agentsmail.org，无限发送，Webhook，联系人，ACL |

一个调用即可升级：`POST /api/upgrade`，填入 owner 邮箱。Magic link 确认后自动升级。

### API 端点

| 动作 | 方法 | 路径 | 认证 |
|------|------|------|------|
| 帮助 | GET | `/api/help` | 无 |
| 领邮箱 | POST | `/api/getemailaddress` | 无 |
| 发邮件 | POST | `/api/send` | API Key |
| 查收件箱 | GET | `/api/inbox` | API Key |
| 读邮件 | GET | `/api/inbox/:id` | API Key |
| 删除邮件 | DELETE | `/api/inbox/:id` | API Key |
| 已发邮件 | GET | `/api/sent` | API Key |
| 升级 | POST | `/api/upgrade` | API Key |
| Webhook | GET/POST/DELETE | `/api/webhooks` | API Key |
| 联系人 | GET/POST/DELETE | `/api/contacts` | API Key |
| 访问控制 | GET/POST/DELETE | `/api/acl` | API Key |

### 安全性

- AES-256-GCM 加密存储
- HMAC-SHA256 删除回执
- 删除时内容立即销毁，信封保留用于审计
- 无 OAuth，无存储密码

### 架构

- **运行时:** Cloudflare Workers（边缘计算）
- **数据库:** D1（无服务器 SQLite）
- **发送邮件:** Resend API
- **接收邮件:** Cloudflare Email Routing
- **测试:** Vitest（120+ 测试）

### 自托管部署

```bash
git clone https://github.com/huberthe-pro/agents-mail.git
cd agents-mail
npm install
cp wrangler.toml.example wrangler.toml   # 填入你的 Cloudflare 账号
cp .env.example .dev.vars                 # 填入 API 密钥
npm run dev                               # 本地开发 :8787
npm test                                  # 运行测试
npx wrangler deploy                       # 部署到 Cloudflare
```

### 团队

- **创始人:** [Anson Ho](http://anson.im)
- **联合创始人:** Claude Code & Codex & OpenClaw

### 许可证

MIT
