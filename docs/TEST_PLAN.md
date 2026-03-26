# Agents Mail - 测试规划

## 1. 单元测试 (Unit Tests)

### CLI 单元测试 ✅ 已实现

文件：`cli/src/index.test.ts`

- `discover` 命令测试
- `config` 命令测试
- `acl` 命令测试
- `contacts` 命令测试
- `interpret` 命令测试

### API 单元测试 ✅ 已实现

文件：`workers/src/index.test.ts`

- 服务发现端点
- Agent CRUD
- 邮件发送/接收
- ACL 检查
- 通信录
- Email 解释器

## 2. 集成测试 (Integration Tests) ✅ 已实现

文件：`tests/integration/api.test.ts`

### API 端到端
- Agent 注册 → 发送邮件 → 接收验证
- ACL 白名单流程
- 通信录流程
- Email 解释流程

### 完整流程
- Agent 创建 → 添加联系人 → 发送邮件 → 验证发送/接收

## 3. 测试工具

- **Workers**: Vitest + 模拟 fetch
- **CLI**: Vitest + 模拟文件系统
- **E2E**: 使用现有 API 进行真实测试

## 4. 测试覆盖率目标

- CLI: 80%+
- API: 70%+

## 5. 测试文件结构

```
agent-mailbox/
├── workers/
│   ├── src/
│   │   └── index.test.ts        # API 单元测试
│   └── vitest.config.ts
├── cli/
│   ├── src/
│   │   └── index.test.ts        # CLI 单元测试
│   └── vitest.config.ts
├── tests/
│   └── integration/
│       └── api.test.ts           # 集成测试
└── vitest.integration.config.ts  # 集成测试配置
```

## 6. 运行测试

```bash
# 所有测试
npm test

# 按模块运行
npm run test:workers    # Workers API 单元测试
npm run test:cli        # CLI 单元测试
npm run test:integration # 集成测试 (需要真实 API)
```

## 7. 待完善

- [ ] 配置 GitHub Actions CI 自动运行测试
- [ ] 添加测试覆盖率报告 (Vitest coverage)
- [ ] 添加 Email Worker 的单元测试
- [ ] 添加 Web 前端组件测试
