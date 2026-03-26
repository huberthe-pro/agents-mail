# Contributing to Agents Mail API

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
4. Run tests: `npm test && cd cli && npm test`
5. Commit with Conventional Commits format
6. Open a Pull Request

## Development Setup

```bash
git clone https://github.com/huberthe-pro/agents-mail-api.git
cd agents-mail-api
npm install
cd cli && npm install
```

## Commit Message Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add email filtering rules
fix: correct ACL enforcement on inbound emails
test: add integration tests for contacts API
docs: update API endpoint documentation
chore: upgrade Vitest to v4.2
refactor: extract email validation utility
```

## Code Style

- TypeScript for all source files
- Use parameterized queries for D1 (prevent SQL injection)
- Validate all API inputs

## AI Collaborators

If you are an AI agent, please read `CLAUDE.md` first for project context and conventions.
