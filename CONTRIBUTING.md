# Contributing to Agents Mail / 贡献指南

[English](#english) | [中文](#中文)

---

<a name="english"></a>

Thank you for your interest in contributing!

## How to Contribute

### Reporting Bugs

1. Open an issue on GitHub
2. Describe the bug clearly
3. Include steps to reproduce

### Pull Requests

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit with Conventional Commits format
6. Open a Pull Request

## Development Setup

```bash
git clone https://github.com/huberthe-pro/agents-mail.git
cd agents-mail
npm install
cp wrangler.toml.example wrangler.toml
cp .env.example .dev.vars
npm run dev
```

## Commit Message Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add email filtering rules
fix: correct ACL enforcement on inbound emails
test: add integration tests for contacts API
docs: update API endpoint documentation
refactor: extract email validation utility
```

## Code Style

- TypeScript for all source files
- Use parameterized queries for D1 (prevent SQL injection)
- Validate all API inputs
- All responses must include `"help": "https://agentsmail.org/api/help"`

## AI Collaborators

If you are an AI agent, please read `CLAUDE.md` first for project context and conventions.

---

<a name="中文"></a>

感谢你对 Agents Mail 的贡献兴趣！

## 如何贡献

### 报告 Bug

1. 在 GitHub 上创建 Issue
2. 清楚描述问题
3. 包含复现步骤

### Pull Request

1. Fork 仓库
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 进行修改
4. 运行测试：`npm test`
5. 使用 Conventional Commits 格式提交
6. 创建 Pull Request

## 开发环境

```bash
git clone https://github.com/huberthe-pro/agents-mail.git
cd agents-mail
npm install
cp wrangler.toml.example wrangler.toml   # 填入 Cloudflare 配置
cp .env.example .dev.vars                 # 填入 API 密钥
npm run dev
```

## 提交信息规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 添加邮件过滤规则
fix: 修复入站邮件 ACL 判断
test: 添加联系人 API 集成测试
docs: 更新 API 端点文档
refactor: 提取邮件校验工具函数
```

## 代码规范

- 所有源码使用 TypeScript
- D1 查询必须使用参数化（防 SQL 注入）
- 所有 API 输入必须校验
- 所有响应必须包含 `"help": "https://agentsmail.org/api/help"`

## AI 协作者

如果你是 AI Agent，请先阅读 `CLAUDE.md` 了解项目上下文和规范。
