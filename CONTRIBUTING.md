# Contributing to Multi-Agent AI Workflow Orchestrator

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

---

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build something great together.

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for integration testing)
- MySQL 8.0 (or use Docker)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/multi-agent-workflow.git
cd multi-agent-workflow

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env
# Edit .env with your configuration

# Start database (using Docker)
docker-compose up -d db

# Run migrations
pnpm db:push

# Start development server
pnpm dev
```

---

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

| Prefix | Purpose |
|--------|---------|
| `feature/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation changes |
| `refactor/` | Code refactoring |
| `test/` | Adding or updating tests |
| `chore/` | Maintenance tasks |

**Examples:**
- `feature/add-workflow-templates`
- `fix/websocket-reconnection`
- `docs/update-api-docs`

### Workflow

1. Create a branch from `main`
2. Make your changes
3. Write/update tests
4. Ensure all checks pass
5. Submit a pull request

---

## Coding Standards

### TypeScript

- Use strict TypeScript (`strict: true`)
- Prefer type imports: `import type { Foo } from './foo'`
- Define explicit return types for functions
- Use `unknown` over `any` when possible

### Formatting

We use Prettier for formatting:

```bash
# Format all files
pnpm format

# Check formatting
pnpm format:check
```

Configuration is in `.prettierrc`:
- 2 space indentation
- Single quotes
- Semicolons
- 100 character line width

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (components) | PascalCase | `WorkflowLauncher.tsx` |
| Files (utilities) | camelCase | `trpc.ts` |
| React components | PascalCase | `WorkflowCard` |
| Hooks | camelCase with `use` prefix | `useWorkflows` |
| Functions | camelCase | `createWorkflowRun` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Types/Interfaces | PascalCase | `WorkflowConfig` |

### File Organization

```
client/
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/          # Route pages
│   ├── hooks/          # Custom React hooks
│   ├── contexts/       # React contexts
│   └── lib/            # Utilities

server/
├── _core/              # Core infrastructure
├── agents/             # AI agent implementations
├── services/           # Business logic
└── *.router.ts         # tRPC routers
```

---

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Formatting (no code change) |
| `refactor` | Code refactoring |
| `test` | Adding/updating tests |
| `chore` | Maintenance tasks |
| `perf` | Performance improvements |

### Examples

```bash
feat(agents): add support for custom agent prompts

fix(websocket): handle reconnection on network failure

docs(api): add examples for workflow endpoints

refactor(db): simplify query utilities

test(workflows): add integration tests for run execution
```

### Breaking Changes

Add `BREAKING CHANGE:` in the commit footer:

```
feat(api): change workflow response format

BREAKING CHANGE: The `startRun` endpoint now returns `run` instead of `data`
```

---

## Pull Request Process

### Before Submitting

1. **Run all checks locally:**
   ```bash
   pnpm check    # TypeScript
   pnpm test     # Tests
   pnpm format   # Formatting
   ```

2. **Update documentation** if needed

3. **Add tests** for new functionality

4. **Keep PRs focused** - one feature/fix per PR

### PR Template

When creating a PR, include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested the changes

## Checklist
- [ ] Code follows project style
- [ ] Self-reviewed the code
- [ ] Added/updated tests
- [ ] Updated documentation
- [ ] All checks pass
```

### Review Process

1. At least one approval required
2. All CI checks must pass
3. No unresolved conversations
4. Branch must be up-to-date with `main`

---

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Run specific test file
pnpm test -- workflows.router.test.ts

# Run with coverage
pnpm test -- --coverage
```

### Writing Tests

- Use Vitest for testing
- Place test files alongside source: `foo.ts` → `foo.test.ts`
- Use descriptive test names
- Follow Arrange-Act-Assert pattern

**Example:**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createWorkflowRun } from './db.utils';

describe('createWorkflowRun', () => {
  it('should create a new workflow run with pending status', async () => {
    // Arrange
    const input = { userId: 1, configId: 1 };
    
    // Act
    const result = await createWorkflowRun(input);
    
    // Assert
    expect(result.status).toBe('pending');
    expect(result.userId).toBe(1);
  });
});
```

### Test Categories

| Category | Location | Description |
|----------|----------|-------------|
| Unit | `server/*.test.ts` | Isolated function tests |
| Integration | `server/__tests__/` | Cross-module tests |
| E2E | `e2e/` | Full application tests |

---

## Documentation

### When to Update Docs

- Adding new features
- Changing API endpoints
- Modifying configuration options
- Updating dependencies with breaking changes

### Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Project overview and quick start |
| `docs/USER_GUIDE.md` | Detailed usage instructions |
| `docs/API.md` | API reference |
| `CONTRIBUTING.md` | This file |
| `CHANGELOG.md` | Version history |

### Code Comments

- Use JSDoc for public functions
- Explain "why" not "what"
- Keep comments up-to-date with code

```typescript
/**
 * Creates a new workflow run and starts execution.
 * 
 * @param config - Workflow configuration
 * @returns The created run with initial pending status
 * @throws {Error} If the user doesn't have permission
 */
export async function createAndStartRun(config: WorkflowConfig): Promise<WorkflowRun> {
  // ...
}
```

---

## Questions?

- Open a [Discussion](https://github.com/your-username/multi-agent-workflow/discussions)
- Check existing [Issues](https://github.com/your-username/multi-agent-workflow/issues)

Thank you for contributing! 🎉
