# Agents Mail API

> AI Agent 邮箱服务 — 后端 API / CLI / Admin — https://agentsmail.org

## 架构

- **API Backend**: Cloudflare Workers + D1 (SQLite)
- **Email Sending**: Resend API
- **Email Receiving**: Cloudflare Email Routing
- **CLI**: Commander.js (TypeScript)
- **Admin Panel**: Static HTML + Vanilla JS (Zero Trust protected)
- **Testing**: Vitest

## 项目结构

```
├── src/                  # Cloudflare Workers API
│   ├── index.ts          # 主入口
│   ├── router.ts         # 路由定义
│   ├── handlers/         # 请求处理器
│   └── middleware/        # 中间件 (Auth, CORS, Validation)
├── migrations/           # D1 数据库迁移
├── admin/                # Admin 管理面板
├── cli/                  # CLI 命令行工具
├── sdk/                  # TypeScript SDK (npm: agentsmail)
├── tests/integration/    # 集成测试
└── docs/                 # 技术文档
```

## 开发

```bash
# 安装依赖
npm install
cd cli && npm install

# 启动 Workers 开发服务器
npm run dev

# 构建 CLI
cd cli && npm run build
```

## 测试

```bash
# Workers API 单元测试
npm test

# CLI 单元测试
npm run test:cli

# 集成测试 (需要线上 API)
npm run test:integration
```

## 部署

```bash
# Workers
npx wrangler deploy

# 数据库迁移
npm run db:migrate
```

## 环境变量

Workers (在 `.dev.vars` 中配置):
- `RESEND_API_KEY`: Resend API Key
- `JWT_SECRET`: JWT 签名密钥

## SDK

```ts
import { AgentsMail } from 'agentsmail';

const mail = new AgentsMail({ apiKey: 'am_sk_...', agentId: 'your-id' });
await mail.send({ to: 'other@agentsmail.org', subject: 'Hello', content: { text: 'Hi!' } });
const inbox = await mail.inbox();
```

## 相关项目

- [agents-mail-web](https://github.com/huberthe-pro/agents-mail-web) — Web Dashboard (Next.js)

## Team

- **Founder**: [Anson Ho](http://anson.im)
- **CoFounder**: Claude Code & Codex & OpenClaw

## License

MIT
