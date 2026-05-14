# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-Agent AI Workflow Orchestrator - a full-stack TypeScript application that coordinates three specialized AI agents (Context Provider, Nanoscript Generator, Critical Analyst) to collaboratively accomplish software development tasks.

## Development Commands

```bash
pnpm install              # Install dependencies
pnpm dev                  # Start server with hot-reload (tsx watch)
pnpm build                # Production build (Vite + esbuild)
pnpm start                # Run production build from dist/
pnpm check                # TypeScript type check
pnpm test                 # Run Vitest test suite
pnpm test -- --watch      # Tests in watch mode
pnpm test -- path/to/file.test.ts   # Run single test file
pnpm db:push              # Generate and apply Drizzle migrations
pnpm db:seed              # Seed sample data
pnpm test:llm             # Verify LLM provider connectivity
pnpm format               # Prettier formatting
```

## Architecture

### Monorepo Structure
- `client/` - React 19 SPA (Vite, TailwindCSS, shadcn/ui, wouter routing)
- `server/` - Express + tRPC API with WebSocket support
- `shared/` - Cross-cutting types and constants
- `drizzle/` - MySQL schema and migrations (Drizzle ORM)

### Path Aliases
- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `attached_assets/`

### Data Flow
```
Client → tRPC React Query → Express tRPC adapter → Drizzle ORM → MySQL
             ↑
         WebSocket ←── Real-time workflow events
```

## Agent Workflow Pipeline

Three agents execute in sequence:
1. **Context Provider** (`initialization` step) - Gathers domain knowledge and constraints
2. **Nanoscript Generator** (`orchestration` step) - Produces code based on enriched context
3. **Critical Analyst** (`synchronization` step) - Reviews for errors, security issues, improvements

Workflow steps tracked in `workflowSteps` table: `setup` → `initialization` → `orchestration` → `synchronization`

### Core Workflow Files
- `server/services/workflow.engine.ts` - Orchestrates agent execution
- `server/agents/` - Agent implementations (base.agent.ts, context-provider.agent.ts, nanoscript-generator.agent.ts, critical-analyst.agent.ts)
- `server/_core/ws.ts` - WebSocket event emitter for real-time updates

## Database Schema (drizzle/schema.ts)

| Table | Purpose |
|-------|---------|
| `users` | OAuth-backed user accounts |
| `workflowConfigs` | Saved workflow templates |
| `workflowRuns` | Execution instances (status: pending/running/completed/failed) |
| `workflowSteps` | Per-step progress tracking |
| `artifacts` | Generated outputs (nanoscript, context_data, analysis, final_code) |
| `agentConfigs` | Agent role/goal/backstory/model configuration |

## tRPC API Patterns

Three procedure types in `server/_core/trpc.ts`:
- `publicProcedure` - No auth required
- `protectedProcedure` - Requires authenticated user
- `adminProcedure` - Requires admin role

Access from React: `import { trpc } from "@/lib/trpc"`

Database operations: Always use `server/db.utils.ts` functions, not raw queries.

## LLM Integration (server/_core/llm.ts)

```typescript
import { invokeLLM, Message, Tool } from "./_core/llm";

const result = await invokeLLM({
  messages: [
    { role: "system", content: "..." },
    { role: "user", content: task }
  ],
  tools: [{ type: "function", function: { name: "...", parameters: {...} }}],
  toolChoice: "auto",  // or "required", "none", { name: "tool_name" }
  outputSchema: { name: "...", schema: {...}, strict: true }  // For structured output
});
```

Supports multi-modal content (ImageContent, FileContent), tool calling, and structured JSON output.

## Testing

- Framework: Vitest (Node environment)
- Test files: `server/**/*.test.ts` or `server/**/*.spec.ts`
- Mock context pattern in `server/workflows.router.test.ts`:

```typescript
const ctx: TrpcContext = {
  user: { id: 1, openId: "user-1", role: "user", ... },
  req: { protocol: "https", headers: {} },
  res: {},
};
const caller = appRouter.createCaller(ctx);
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes* | MySQL connection string |
| `BUILT_IN_FORGE_API_KEY` | Yes | LLM API key (use `ollama` for local) |
| `BUILT_IN_FORGE_API_URL` | No | LLM endpoint (default: localhost:11434/v1) |
| `JWT_SECRET` | Yes | Session encryption secret |
| `OAUTH_SERVER_URL` | No | OAuth server (omit for dev login) |
| `OWNER_OPEN_ID` | No | Admin user's OpenID |

*Auto-configured in Docker

## Key Conventions

- TypeScript strict mode; prefer type imports
- Prettier: 2-space indent, semicolons, single quotes
- React components: PascalCase files in `components/` and `pages/`
- tRPC procedures: verb-first naming (create, list, update, delete)
- User ownership: Always filter by `userId` in db.utils functions
- Wouter for client routing (not react-router)
- Zod validation on all tRPC inputs
