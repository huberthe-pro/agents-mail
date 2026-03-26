# Agents Mail — 技术架构图集

> v0.2.2 · 2026-03-15

---

## 1. 系统总览

```mermaid
graph TB
    subgraph Clients["客户端"]
        CLI["CLI / AI Agent<br/>am_sk_xxx API Key"]
        Browser["Human Browser<br/>Magic Link + JWT"]
        ExternalSMTP["External Email Sender<br/>SMTP / MTA"]
    end

    subgraph CF["Cloudflare Edge"]
        ZT["Zero Trust<br/>(Admin only)"]
        EmailRouting["Email Routing<br/>*@agentsmail.org"]
        Worker["API Worker<br/>src/index.ts"]
        EmailWorker["Email Worker<br/>email-worker.ts"]
        Pages["Admin Panel<br/>admin/ (Pages)"]
    end

    subgraph Backend["后端服务"]
        D1["D1 Database<br/>SQLite"]
        Resend["Resend API<br/>outbound mail"]
    end

    CLI -->|"Bearer am_sk_*"| Worker
    Browser -->|"Bearer JWT"| Worker
    Browser -->|"/admin/*"| ZT --> Worker
    Worker -->|proxy| Pages
    Worker --> D1
    Worker -->|send| Resend

    ExternalSMTP -->|SMTP| EmailRouting --> EmailWorker
    EmailWorker --> D1
    EmailWorker -->|fire & forget| WebhookTargets["Webhook Endpoints"]
```

---

## 2. API Worker 请求路由

```mermaid
flowchart TD
    Req["Incoming Request"] --> PathCheck{pathname?}

    PathCheck -->|"/admin"| Redirect301["301 → /admin/"]
    PathCheck -->|"/admin/*"| AdminProxy["proxy → Cloudflare Pages"]
    PathCheck -->|"OPTIONS"| CORS["200 + CORS headers"]
    PathCheck -->|other| Router["routeRequest()"]

    Router --> Match{Route match?}
    Match -->|No| 404["404 Not Found"]
    Match -->|Yes| AuthCheck{requiresAuth?}

    AuthCheck -->|No| Handler["Handler()"]
    AuthCheck -->|Yes| Authenticate["authenticateAgent()"]

    Authenticate --> AuthMode{auth header?}
    AuthMode -->|"Bearer am_sk_*"| ApiKeyCheck["D1: match api_key_hash"]
    AuthMode -->|"Bearer JWT"| JwtCheck["verify JWT → owner_id check"]
    AuthMode -->|None| 401["401 Unauthorized"]

    ApiKeyCheck -->|Pass| Handler
    JwtCheck -->|Pass| Handler
    ApiKeyCheck -->|Fail| 403["403 Forbidden"]
    JwtCheck -->|Fail| 403

    Handler --> WithCors["withCors() → Response"]
```

---

## 3. 双认证模型

```mermaid
sequenceDiagram
    participant Agent as AI Agent / CLI
    participant Human as Human (Browser)
    participant Worker as API Worker
    participant D1

    rect rgb(20, 40, 70)
        Note over Agent, D1: 模式 A — API Key 认证（机器使用）
        Agent->>Worker: POST /api/agents (无认证)
        Worker->>D1: INSERT agents (api_key_hash)
        Worker-->>Agent: { id, email, api_key: "am_sk_xxx" }

        Agent->>Worker: GET /api/agents/:id/emails<br/>Authorization: Bearer am_sk_xxx
        Worker->>D1: SELECT WHERE api_key_hash = sha256(key)
        D1-->>Worker: agent row
        Worker-->>Agent: emails[]
    end

    rect rgb(40, 20, 60)
        Note over Human, D1: 模式 B — Magic Link + JWT 认证（人类使用）
        Human->>Worker: POST /api/auth/magic-link { email }
        Worker->>D1: INSERT magic_link_tokens (token_hash, expires_at+15min)
        Worker->>Resend: send sign-in email
        Human->>Worker: GET /api/auth/verify?token=mlk_xxx
        Worker->>D1: SELECT token, mark used_at
        Worker-->>Human: { token: JWT (7d), user }

        Human->>Worker: GET /api/agents<br/>Authorization: Bearer <JWT>
        Worker->>D1: SELECT WHERE owner_id = user.id
        Worker-->>Human: agents[]
    end
```

---

## 4. Agent 注册 & Owner 关联流程

```mermaid
flowchart TD
    CreateReq["POST /api/agents<br/>{ name, owner_email? }"]

    CreateReq --> JwtPresent{JWT in header?}

    JwtPresent -->|Yes| CreateWithOwner["INSERT agents<br/>owner_id = user.id"]
    JwtPresent -->|No| CreateNoOwner["INSERT agents<br/>owner_id = NULL"]

    CreateWithOwner --> ReturnKey["返回 { id, email, api_key }"]
    CreateNoOwner --> OwnerEmailCheck{owner_email?}

    OwnerEmailCheck -->|No| ReturnKey
    OwnerEmailCheck -->|Yes 方式A| ClaimFlow["INSERT agent_owner_claims<br/>verification_code (6位)"]
    ClaimFlow --> SendEmail["Resend: 发送确认邮件<br/>含 /auth/claim?code=xxx"]
    SendEmail --> ReturnKey

    ReturnKey --> UseAgent["Agent 使用 API Key 运行"]

    subgraph ClaimConfirm["Owner 确认（方式 A）"]
        HumanClick["Human 点击邮件链接"] --> Login["登录 / 已登录"]
        Login --> Confirm["GET /api/auth/claim/confirm<br/>?code=xxx&agent_id=yyy"]
        Confirm --> VerifyEmail{email 匹配?}
        VerifyEmail -->|Yes| LinkOwner["UPDATE agents SET owner_id"]
        VerifyEmail -->|No| Error403["403 邮箱不匹配"]
    end

    subgraph ClaimDirect["直接关联（方式 B）"]
        HumanDashboard["Human 在 Dashboard 输入<br/>agent_email + api_key"]
        HumanDashboard --> ClaimEndpoint["POST /api/agents/claim"]
        ClaimEndpoint --> VerifyKey{api_key_hash 匹配?}
        VerifyKey -->|Yes| LinkOwner
        VerifyKey -->|No| Error403b["403 Key 错误"]
    end
```

---

## 5. 邮件接收流程（Inbound）

```mermaid
sequenceDiagram
    participant Sender as External Sender
    participant CF as CF Email Routing
    participant EW as Email Worker
    participant D1
    participant WH as Webhook Endpoints

    Sender->>CF: SMTP → xxx@agentsmail.org
    CF->>EW: email(message, env)

    EW->>EW: 解析 from / to / subject
    EW->>EW: 提取 agentName from to address

    EW->>D1: SELECT agents WHERE name = agentName AND is_active = 1
    alt Agent 不存在
        EW-->>CF: setReject("Recipient not found")
    end

    EW->>D1: SELECT acl WHERE agent_id AND from_address
    alt Blacklisted
        EW-->>CF: setReject("Sender blocked")
    else Has whitelist, sender not in it
        EW-->>CF: setReject("Sender not in whitelist")
    end

    EW->>EW: sanitizeHtml()<br/>normalizeInboundText()<br/>sha256 fingerprint

    EW->>D1: 去重检查 (message_id OR content_fingerprint)
    alt Duplicate
        EW->>D1: writeEmailEvent("duplicate")
        Note over EW: 静默丢弃
    else New
        EW->>D1: INSERT emails
        EW->>D1: writeEmailEvent("received")
        EW->>WH: deliverWebhooks("email.received") [fire & forget]
    end
```

---

## 6. 邮件发送流程（Outbound）

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant Worker as API Worker
    participant D1
    participant Resend

    Agent->>Worker: POST /api/agents/:id/emails<br/>{ to, subject, content }
    Worker->>Worker: validateEmail(to)
    Worker->>D1: SELECT agents WHERE id
    Worker->>D1: reserveOutboundSendSlot()<br/>检查发送频率限制

    alt Rate Limited
        Worker->>D1: writeEmailEvent("rate_limited")
        Worker-->>Agent: 429 Rate Limited
    end

    Worker->>Resend: POST /emails<br/>from: agent@agentsmail.org
    alt Resend 失败
        Worker->>D1: releaseOutboundSendSlot()
        Worker-->>Agent: 500 Failed to send
    end

    Worker->>D1: INSERT sent_emails (resend_id, delivery_status='sent')
    Worker->>D1: writeEmailEvent("sent")
    Worker-->>Agent: 201 { id, resend_id }
```

---

## 7. 数据库 ER 图

```mermaid
erDiagram
    users {
        TEXT id PK
        TEXT email UK
        TEXT display_name
        INTEGER created_at
        INTEGER last_login_at
        INTEGER session_invalidated_at
    }

    agents {
        TEXT id PK
        TEXT email UK
        TEXT name UK
        TEXT api_key_hash
        TEXT owner_id FK
        INTEGER is_active
        INTEGER created_at
    }

    emails {
        TEXT id PK
        TEXT agent_id FK
        TEXT from_address
        TEXT from_name
        TEXT subject
        TEXT body_text
        TEXT body_html
        TEXT message_id
        TEXT content_fingerprint
        TEXT source
        INTEGER received_at
        INTEGER is_read
        TEXT metadata_json
    }

    sent_emails {
        TEXT id PK
        TEXT agent_id FK
        TEXT to_address
        TEXT subject
        TEXT body_text
        TEXT body_html
        TEXT resend_id
        TEXT delivery_status
        TEXT metadata_json
        INTEGER sent_at
    }

    acl {
        TEXT id PK
        TEXT agent_id FK
        TEXT email
        TEXT type
        INTEGER created_at
    }

    contacts {
        TEXT id PK
        TEXT agent_id FK
        TEXT email
        TEXT name
        INTEGER created_at
    }

    webhooks {
        TEXT id PK
        TEXT agent_id FK
        TEXT url
        TEXT event_types
        INTEGER is_active
        INTEGER created_at
    }

    magic_link_tokens {
        TEXT id PK
        TEXT user_id FK
        TEXT token_hash
        INTEGER expires_at
        INTEGER used_at
        INTEGER created_at
    }

    agent_owner_claims {
        TEXT id PK
        TEXT agent_id FK
        TEXT owner_email
        TEXT verification_code
        TEXT status
        INTEGER expires_at
        INTEGER confirmed_at
    }

    email_events {
        TEXT id PK
        TEXT agent_id FK
        TEXT email_id FK
        TEXT direction
        TEXT event_type
        TEXT metadata_json
        INTEGER created_at
    }

    admin_audit_log {
        TEXT id PK
        TEXT admin_email
        TEXT action
        TEXT target_type
        TEXT target_id
        TEXT details_json
        INTEGER created_at
    }

    users ||--o{ agents : "owns"
    agents ||--o{ emails : "receives"
    agents ||--o{ sent_emails : "sends"
    agents ||--o{ acl : "has"
    agents ||--o{ contacts : "has"
    agents ||--o{ webhooks : "has"
    agents ||--o{ email_events : "logs"
    agents ||--o{ agent_owner_claims : "claim"
    users ||--o{ magic_link_tokens : "authenticates"
    emails ||--o{ email_events : "events"
```

---

## 8. Admin 面板架构

```mermaid
graph LR
    subgraph Browser["管理员浏览器"]
        AdminUI["admin/index.html<br/>admin/agents.html<br/>admin/emails.html<br/>admin/users.html<br/>admin/audit.html"]
        JS["admin/js/<br/>api.js · app.js<br/>pages/* · components/*"]
    end

    subgraph CF_Edge["Cloudflare Edge"]
        ZT["Zero Trust Access<br/>身份验证门"]
        Worker["API Worker<br/>/admin/* proxy"]
        Pages["Cloudflare Pages<br/>静态文件托管"]
    end

    subgraph AdminAPI["Admin API 端点"]
        Stats["GET /api/admin/stats"]
        Agents["GET|PATCH|DELETE /api/admin/agents"]
        Users["GET|PATCH /api/admin/users"]
        Emails["GET /api/admin/emails"]
        Audit["GET /api/admin/audit"]
        Events["GET /api/admin/email-events"]
        Governance["GET /api/admin/email-governance/summary"]
    end

    Browser -->|HTTPS| ZT --> Worker
    Worker -->|proxy /admin/*| Pages
    Pages --> Browser
    JS -->|fetch /api/admin/*| Worker --> AdminAPI --> D1["D1 Database"]
```

---

## 9. 端点速查表

| Method | Path | 认证 | 说明 |
|--------|------|------|------|
| GET | `/` | - | 健康检查 |
| GET | `/.well-known/service` | - | 服务发现 |
| POST | `/api/agents` | - | 创建 Agent |
| GET | `/api/agents` | API Key / JWT | 列出 Agents |
| GET | `/api/agents/:id` | API Key / JWT | 获取 Agent |
| DELETE | `/api/agents/:id` | API Key / JWT | 停用 Agent |
| POST | `/api/auth/magic-link` | - | 发送登录链接 |
| GET | `/api/auth/verify` | - | 验证 Magic Link → JWT |
| POST | `/api/auth/logout` | JWT | 登出 |
| GET | `/api/auth/me` | JWT | 获取当前用户 |
| POST | `/api/agents/claim` | JWT | 通过 API Key 关联 Agent |
| GET | `/api/auth/claim/confirm` | JWT | 通过邮件确认关联 |
| DELETE | `/api/agents/:id/owner` | JWT | 取消关联 |
| GET | `/api/agents/:id/emails` | API Key / JWT | 收件箱（分页+过滤） |
| GET | `/api/agents/:id/emails/:eid` | API Key / JWT | 邮件详情 |
| POST | `/api/agents/:id/emails` | API Key / JWT | 发送邮件 |
| DELETE | `/api/agents/:id/emails/:eid` | API Key / JWT | 删除单封 |
| DELETE | `/api/agents/:id/emails` | API Key / JWT | 批量删除（?before=ts） |
| PUT | `/api/emails/:id/read` | API Key | 标记已读 |
| GET/POST/DELETE | `/api/agents/:id/acl` | API Key / JWT | ACL 管理 |
| GET/POST/DELETE | `/api/agents/:id/contacts` | API Key / JWT | 联系人管理 |
| GET/POST/DELETE | `/api/agents/:id/webhooks` | API Key / JWT | Webhook 管理 |
| POST | `/api/agents/:id/emails/:eid/interpret` | API Key / JWT | AI 解析邮件 |
| GET | `/api/admin/*` | Zero Trust | Admin 管理接口 |
