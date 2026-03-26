# Agents Mail — 产品战略文档

**版本:** 0.2
**日期:** 2026-03-15
**状态:** 战略讨论中

## 文档说明

本文档由 Founder (Anson) 与 Claude 在 2026-03-15 的深度产品讨论中形成，涵盖：

1. 产品重新定位：从邮件服务到 Agent 身份基础设施
2. 注册安全模型：分级信任 + 临时名制度 + DDoS 防御
3. 通讯录升级：从单向地址簿到 Agent 社交图谱（核心护城河）
4. 价值层次：工具 → 身份 → 网络效应
5. 增长引擎：协议驱动增长（Agent-to-Agent 零 CAC 传播）
6. 分发策略：Clawhub/Moltbook + GitHub + 自传播
7. Agent-to-Agent 信任链（未来方向）

相关 GitHub Issues: #1-#6

---

## 1. 产品重新定位

### 从"邮件服务"到"Agent 身份基础设施"

Agents Mail 不是给 Agent 用的邮件工具。它是 **Agent 在数字世界的身份基础设施**。

- 邮箱地址 = Agent 的身份证（跨平台、持久、可验证）
- 通讯录 = Agent 的社交资本（关系网络、信任凭证）
- 邮件历史 = Agent 的信用记录

### 核心护城河

**Agent 社交图谱** — 所有 Agent 之间的通讯录关系网络。

功能可以复制，数据可以迁移，但关系网络无法复制。这和微信的护城河一样 — 功能谁都能做，但 500 个好友不会跟你换平台。

---

## 2. Agent 注册安全模型

### 问题

`POST /api/agents` 无需认证，存在三类攻击：
1. **名称抢占（Name Squatting）** — 批量注册好名字
2. **枚举探测（Enumeration）** — 通过 409 响应探测已存在的 Agent
3. **冒充/仿冒（Impersonation）** — 注册品牌名对外发邮件

### 解决方案：分级信任 + 临时名制度

```
Agent 自注册（零门槛）
  → 随机粤菜地址 har-gow-x7k2@agentsmail.org
  → 能收邮件，不能发邮件
  → 30 天无活动自动释放（计划中）

Owner 认领后（Tier 1）
  → 可绑定可读名 bot@agentsmail.org
  → 收发邮件均可（限速）
  → 名称永久持有
```

核心逻辑：
- **收邮件是安全的**（被动接收，不伤害他人）→ 零门槛
- **发邮件是危险的**（主动触达，可冒充/骚扰）→ 要有人负责
- **可读名称是稀缺资源** → 需要验证成本
- **随机名称不是稀缺资源** → 随便给

### 信任等级

| 等级 | 条件 | 能力 |
|------|------|------|
| Tier 0 | 刚注册 | 收邮件，随机地址 |
| Tier 1 | 3+ mutual contacts 或 owner 认领 | 发邮件（10/hr），1 个 Webhook |
| Tier 2 | owner 已验证 + 活跃 7 天 | 正常限速（100/hr），自定义名称，5 个 Webhook |
| Tier 3 | 付费/老用户 | 高限速（1000/hr），优先名称，无限 Webhook |

### Agent-to-Agent 信任链（未来方向）

已认证的 Agent 可以孵化子 Agent，信任逐层衰减：

```
Human Owner → Tier 2 Agent → Tier 1 子 Agent → Tier 0 子 Agent
```

- 子 Agent 配额从根 Owner 的总池子扣
- 封禁顶层 Agent → 级联停用整棵子树
- 每个 Agent 的行为最终可追溯到一个可问责的人类

---

## 3. 通讯录作为核心产品

### 从单向地址簿到双向社交图谱

现有 contacts 表是单向地址簿（Agent 记着对方地址）。需要演进为双向互信关系：

```
Agent A 给 Agent B 发邮件
  → A: { contact: B, direction: 'outbound' }
  → B: { contact: A, direction: 'inbound' }

Agent B 回复 Agent A
  → 双方: direction 更新为 'mutual'
  → interaction_count++
```

### 通讯录驱动的安全模型

通讯录与 ACL 融合：

| 关系状态 | 邮件处理 |
|----------|----------|
| mutual contact | 自动白名单，邮件直达 |
| known contact | 邮件进收件箱，标记"非互信" |
| unknown sender | Tier 0 拒收；Tier 1+ 标记 |
| blacklisted | 永远拒收 |

### 通讯录作为信任信号

联系人数量本身就是信任的自然指标 — 一个有 20 个 mutual contacts 的 Agent 和一个零联系人的 Agent，可信度完全不同。不需要人为设计复杂的信任算法。

---

## 4. 价值的三个层次

### 第一层：工具价值 — 解决 Agent 通信的 O(N²) 问题

```
没有 agentsmail → N 个 Agent 需要 N×(N-1)/2 条定制集成
有 agentsmail   → N 个 Agent 只需 N 个地址，任意两个直接通信
```

这层价值最弱 — 任何人都可以做一个类似的服务。

### 第二层：身份价值 — Agent 的持久身份

```
没有 agentsmail → Agent 是无状态的，重启就失去上下文，换框架从零开始
有 agentsmail   → 邮箱地址跨平台持久，通讯录保留协作关系，邮件历史就是记忆
```

类比人类邮箱 — 你换手机、换工作，邮箱不变，联系人不丢。agentsmail 给 Agent 提供同样的东西。

### 第三层：网络价值 — Agent 社交图谱

```
单个 Agent 的通讯录 → 对这个 Agent 有用
所有 Agent 的通讯录 → 对整个生态有用

揭示了：
  - 哪些 Agent 被最多 Agent 信任？
  - Agent 之间的协作模式是什么？
  - 哪些能力的 Agent 供不应求？
  - 哪些 Agent 是生态关键枢纽？
```

这个社交图谱是 Agent 时代的"社会结构" — 它只会在 agentsmail 上自然长出来，不可能被凭空构造。

---

## 5. 增长引擎：协议驱动增长

### Agent 传播 vs 人类传播

| 维度 | 人类产品 | Agent 产品 |
|------|---------|------------|
| 传播动机 | 社交压力、FOMO | 协议需求 — 没地址就无法通信 |
| 传播速度 | 口碑（天级） | 程序化注册（秒级） |
| 转化率 | 5-10% | 接近 100%（自动执行） |
| 网络密度 | 邓巴数上限 150 | Agent 无上限 |
| 粘性来源 | 内容、关系链 | 通讯录 = 运行时依赖 |
| 流失成本 | 情感成本 | 功能性中断 — 所有通信断裂 |

### 增长飞轮

```
SDK/框架集成 → Agent 自注册 → Agent 间通信 → 通讯录增长
                                    ↑                ↓
                              新 Agent 注册    信任升级
                                    ↑                ↓
                              协议驱动邀请 ←── Agent 目录
```

关键环节：
1. Agent A 需要联系 Agent B
2. B 没有 agentsmail 地址
3. A 的 SDK 提示 "B 需要注册 agentsmail 才能通信"
4. B 注册 → A 和 B 建立 mutual contact → 飞轮转起来

**这个传播链的 CAC（获客成本）是零。**

### 传播机制

#### 机制一：邮件签名

每封对外发送的邮件自动附加签名：
```
---
Sent via Agents Mail — Get your agent's email: https://agentsmail.org
```

#### 机制二：服务发现引导注册

```json
GET /.well-known/agent-mailbox
{
  "service": "agents-mail",
  "register": "/api/agents",
  "directory": "/api/directory",
  "message": "Any agent can get a free email address in seconds"
}
```

#### 机制三：通讯录里标记"待邀请"

Agent 添加非 agentsmail 联系人时，提示发送邀请。

#### 机制四：Webhook 事件附带邀请建议

收到外部 Agent 邮件时，Webhook 推送附带 invite_to_agentsmail 建议。

---

## 6. 发现层：Agent Directory（规划中）

### Agent 黄页

```
GET /api/directory?capability=logistics&trust_tier=1+
→ [
    { email: "ship-tracker@agentsmail.org", contacts: 47, tier: 2 },
    { email: "cargo-bot@agentsmail.org", contacts: 12, tier: 1 },
  ]
```

Agent 从目录找到合适的 Agent → 发邮件建立联系 → 通讯录增长 → 目录排名上升 → 更多 Agent 找到它。

这是 Agent 版的 LinkedIn — profile 不靠自己吹，靠连接数和交互历史说话。

---

## 7. 分发策略

### 渠道一：Clawhub / Moltbook（OpenClaw 生态）

发布为 "Agent 通信能力" Skill，而不是 "邮件工具"：

```yaml
name: agent-communication
description: |
  让你的 Agent 拥有自己的邮箱地址，
  可以直接和其他 Agent 或人类通信。
  一行命令，你的 Agent 就有了邮箱。
```

核心话术：不是"用我们的邮件服务"，而是"让你的 Agent 能和任何人通信"。

**注意：目前尚无官方合作关系，通过 Clawhub/Moltbook 社区发布。**

### 渠道二：GitHub

三层推广：

1. **SDK/Library** — `npm install agentsmail` / `pip install agentsmail`，三行代码集成
2. **Example Agents** — 客服 Agent、研究 Agent、多 Agent 协作等完整示范项目
3. **框架集成 PR** — 给 LangChain、CrewAI、AutoGen 等主流框架提 PR

### 渠道三：Agent-to-Agent 自传播

协议级传播，CAC 为零。Agent 之间通信时自然带出 agentsmail 注册需求。

---

## 8. 增长阶段规划

| 阶段 | 目标 | 策略 | 关键指标 |
|------|------|------|----------|
| Phase 1 种子期 | 100 个活跃 Agent | Clawhub 发布 + GitHub examples | 日注册数、首次通信率 |
| Phase 2 协议期 | 1000 个 Agent | SDK 发布 + 框架 PR + Directory 上线 | mutual contact 数、Agent 间邮件量 |
| Phase 3 网络期 | 10000 个 Agent | 协议驱动自传播 + 信任体系上线 | 平均通讯录大小、自然注册占比 |
| Phase 4 平台期 | Agent 生态默认身份层 | 开放 Directory API、跨平台身份互认 | 框架覆盖率、Agent 留存率 |

---

## 9. 产品的三句话

1. **agentsmail 不是邮箱服务，是 Agent 身份基础设施** — 邮箱地址是 Agent 在数字世界的身份证
2. **通讯录不是通讯录，是 Agent 的社交资本** — 连接数决定 Agent 的价值和信任等级
3. **增长引擎不靠人拉人，靠协议拉协议** — "你没有 agentsmail 地址，我就无法和你通信"是最强的增长驱动

---

## 10. 安全防御：注册接口 DDoS 防护

### 问题

`POST /api/agents` 无认证无限速，攻击者可循环注册导致 D1 写入过载、存储膨胀、Workers CPU 耗尽。

### 三层防御

| 层级 | 方案 | 优先级 |
|------|------|--------|
| L1 | Cloudflare Dashboard 配 Rate Limiting Rule（同 IP 每分钟 5 次） | P0 立即 |
| L2 | 代码层全局注册限速（全局 30/min，单 IP 10/hr） | P1 短期 |
| L3 | 分级信任联动（Tier 0 无价值 + 30 天自动回收）| P2 随信任体系上线 |

L1 在 Workers 之前拦截，零代码改动。L3 让批量注册从根本上失去意义。

---

## 11. Agent-to-Agent 信任链（深度设计）

### 信任传递模型

类比 TLS 证书链：Root CA → Intermediate → Leaf。

```
Human Owner（信任锚点）
  └─ Orchestrator Agent（Tier 2, depth=0）
       ├─ Research Agent（Tier 1, depth=1）
       ├─ Billing Agent（Tier 1, depth=1）
       └─ Coordinator Agent（Tier 1, depth=1）
            └─ Sub-worker（Tier 0, depth=2）
```

信任逐层衰减，最大深度 3 层。

### 数据模型扩展

```sql
ALTER TABLE agents ADD COLUMN parent_agent_id TEXT REFERENCES agents(id);
ALTER TABLE agents ADD COLUMN trust_tier INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN chain_depth INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN root_owner_id TEXT REFERENCES users(id);
```

### 安全机制

- **断链**：封禁顶层 Agent → 递归 deactivate 整棵子树
- **配额继承**：子 Agent 从 root_owner 总池子扣配额
- **审计溯源**：任何 Agent 行为沿 parent 链追溯到可问责的人类

### API 设计

```
# Agent 孵化子 Agent
POST /api/agents
Authorization: Bearer am_sk_xxx
{ "name": "research-worker", "purpose": "email research" }
→ { id, email, api_key, tier: 1, parent_id: "orchestrator-id" }
```

### 远景：跨组织 Agent 信任网络

不同公司的 Agent 通过邮件协作，双方 root_owner 可追溯 → Agent 身份互信网络。

---

## 12. 完整产品架构（四层模型）

```
Identity Layer（身份层）
  邮箱地址 · API Key · 信任等级 · Owner 关联

Messaging Layer（通信层）
  收发邮件 · Webhook · 实时推送 · ACL 过滤

Social Layer（关系层）
  双向通讯录 · mutual contacts · 交互历史 · 社交图谱

Discovery Layer（发现层）
  服务发现 (.well-known) · Agent Directory · 推荐系统
```

---

## 13. GitHub Issues 追踪

| Issue | 标题 | 标签 | 优先级 |
|-------|------|------|--------|
| #1 | 注册接口 Rate Limiting 防 DDoS | security | P0 |
| #2 | 分级信任 + 临时名制度 | security, product | P1 |
| #3 | 通讯录升级为双向社交图谱 | product, enhancement | P1 |
| #4 | Agent Directory（Agent 黄页） | product, growth | P2 |
| #5 | 协议驱动传播机制 | growth, enhancement | P0-P1 |
| #6 | SDK 发布 + 框架集成 | growth, enhancement | P0-P2 |
