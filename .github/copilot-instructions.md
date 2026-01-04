# Multi-Agent AI Workflow - Copilot Instructions

## Architecture Overview

This is a **full-stack TypeScript application** for orchestrating multi-agent AI workflows. The architecture follows a monorepo structure:

```
client/          → React SPA (Vite + React 19)
server/          → Express + tRPC API
drizzle/         → Database schema (MySQL via Drizzle ORM)
shared/          → Shared types and constants
```

**Data Flow**: Client → tRPC React Query → Express tRPC adapter → Drizzle ORM → MySQL

## Key Patterns

### tRPC Type-Safe API
- Routers defined in [server/routers.ts](server/routers.ts), composed from feature routers
- Three procedure types in [server/_core/trpc.ts](server/_core/trpc.ts):
  - `publicProcedure` - No auth required
  - `protectedProcedure` - Requires authenticated user
  - `adminProcedure` - Requires admin role
- Client types auto-inferred via `export type AppRouter = typeof appRouter`
- Access API in React: `import { trpc } from "@/lib/trpc"`

### Database (Drizzle + MySQL)
- Schema in [drizzle/schema.ts](drizzle/schema.ts) - exports tables AND inferred types
- Utility functions in [server/db.utils.ts](server/db.utils.ts) - **always use these**, not raw queries
- Migrations: `pnpm db:push` (generates + migrates)
- Lazy DB connection via `getDb()` - handles missing DATABASE_URL gracefully

### UI Components (shadcn/ui)
- Components in [client/src/components/ui/](client/src/components/ui/) - **new-york** style variant
- Config in [components.json](components.json) - add new components with shadcn CLI
- Path aliases: `@/` → client/src, `@shared/` → shared/, `@assets/` → attached_assets/

### Authentication
- OAuth flow via [server/_core/oauth.ts](server/_core/oauth.ts) + Manus SDK
- Session cookie: `COOKIE_NAME` from shared/const.ts
- Check auth in React: `useAuth()` hook from `@/_core/hooks/useAuth`
- Context creation in [server/_core/context.ts](server/_core/context.ts)

## Developer Commands

```bash
pnpm dev          # Start dev server (tsx watch + Vite HMR)
pnpm build        # Production build (Vite + esbuild)
pnpm test         # Run tests (Vitest)
pnpm check        # TypeScript type check
pnpm db:push      # Generate + run migrations
```

## Testing Conventions

- Test files: `*.test.ts` or `*.spec.ts` in `server/` directory
- Use `appRouter.createCaller(ctx)` for tRPC integration tests
- Mock context pattern in [server/workflows.router.test.ts](server/workflows.router.test.ts):
```typescript
const ctx: TrpcContext = {
  user: { id: 1, openId: "user-1", role: "user", ... },
  req: { protocol: "https", headers: {} },
  res: {},
};
const caller = appRouter.createCaller(ctx);
```

## Workflow Domain Model

Core entities in [drizzle/schema.ts](drizzle/schema.ts):
- `workflowConfigs` - Saved workflow templates (userId, name, initialTask, llmModel)
- `workflowRuns` - Execution instances (status: pending/running/completed/failed)
- `workflowSteps` - Progress tracking per run step
- `artifacts` - Generated outputs (nanoscript, reports, analysis)
- `agentConfigs` - Agent definitions (nanoscript_generator, context_provider, critical_analyst)

## Important Conventions

1. **Error handling in tRPC**: Return `{ success: boolean, data?, error? }` pattern
2. **User ownership**: Always filter by `userId` in db.utils functions
3. **Zod validation**: All tRPC inputs validated with Zod schemas
4. **Type exports**: Import types from `@shared/types` (re-exports schema types)
5. **Route protection**: Use `protectedProcedure` for authenticated routes
6. **Wouter routing**: Use `wouter` (not react-router) - see [client/src/App.tsx](client/src/App.tsx)

## Environment Variables

Required configuration in `.env`:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | MySQL connection string (required for db operations) |
| `BUILT_IN_FORGE_API_KEY` | API key for LLM provider (OpenAI-compatible) |
| `BUILT_IN_FORGE_API_URL` | LLM API base URL (defaults to Manus Forge) |
| `JWT_SECRET` | Cookie encryption secret |
| `OAUTH_SERVER_URL` | Manus OAuth server URL |
| `OWNER_OPEN_ID` | Admin user's OpenID (auto-assigned admin role) |
| `VITE_APP_ID` | Application identifier |

Environment config is centralized in [server/_core/env.ts](server/_core/env.ts).

## LLM Integration

The LLM subsystem in [server/_core/llm.ts](server/_core/llm.ts) provides a type-safe, OpenAI-compatible interface for AI interactions.

### Core Types

```typescript
// Message construction
type Message = { role: Role; content: MessageContent | MessageContent[]; };
type Role = "system" | "user" | "assistant" | "tool" | "function";
type MessageContent = string | TextContent | ImageContent | FileContent;

// Tool calling
type Tool = { type: "function"; function: { name: string; parameters?: Record<string, unknown>; }; };
type ToolCall = { id: string; function: { name: string; arguments: string; }; };
```

### Invoking LLMs

Use `invokeLLM(params)` for all LLM calls:

```typescript
import { invokeLLM, Message, Tool } from "./_core/llm";

const result = await invokeLLM({
  messages: [
    { role: "system", content: "You are a code generator." },
    { role: "user", content: task.initialTask }
  ],
  tools: [{ type: "function", function: { name: "generate_code", parameters: {...} }}],
  toolChoice: "auto",  // or "required", "none", { name: "specific_tool" }
});

// Access response
const content = result.choices[0].message.content;
const toolCalls = result.choices[0].message.tool_calls;
```

### Tool Calling Pattern

1. Define tools with JSON Schema parameters
2. Pass `toolChoice`: `"auto"` (model decides), `"required"` (must call), `{ name: "fn" }` (force specific)
3. Parse `tool_calls` from response, execute, then continue conversation with tool results

### Structured Output (JSON Schema)

Force structured responses using `outputSchema`:

```typescript
const result = await invokeLLM({
  messages,
  outputSchema: {
    name: "code_output",
    schema: { type: "object", properties: { code: { type: "string" }, language: { type: "string" } } },
    strict: true
  }
});
```

### Key Patterns for Workflow Engine

- **Multi-modal support**: `ImageContent` and `FileContent` for vision/document processing
- **Token tracking**: `result.usage` provides prompt/completion token counts
- **Error handling**: Catch and retry on rate limits or transient failures
- **Model selection**: Workflow configs store `llmModel` and `mistralModel` per-workflow

## Agent Workflow Architecture

The system orchestrates three specialized AI agents in a collaborative workflow:

### Agent Roles

| Agent | Type | Responsibility |
|-------|------|----------------|
| **Nanoscript Generator** | `nanoscript_generator` | Produces initial code/script based on user task |
| **Context Provider** | `context_provider` | Enriches generation with domain knowledge, examples, constraints |
| **Critical Analyst** | `critical_analyst` | Reviews output for errors, security issues, improvements |

### Intended Data Flow

```
┌─────────────────┐
│   User Task     │
└────────┬────────┘
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Context Provider│────▶│   Nanoscript    │
│ (gathers domain │     │   Generator     │
│  context/RAG)   │     │ (initial code)  │
└─────────────────┘     └────────┬────────┘
                                 ▼
                        ┌─────────────────┐
                        │ Critical Analyst│
                        │ (review/refine) │
                        └────────┬────────┘
                                 ▼
                        ┌─────────────────┐
                        │   Artifacts     │
                        │ (final output)  │
                        └─────────────────┘
```

### Workflow Execution Steps

Tracked in `workflowSteps` table with status progression:
1. **setup** - Initialize run, load agent configs
2. **initialization** - Context Provider gathers domain context
3. **orchestration** - Nanoscript Generator produces code with context
4. **synchronization** - Critical Analyst reviews and refines

### Implementation Guidelines

- Each agent has its own config (`agentConfigs` table) with role, goal, backstory, LLM model
- Agents communicate via artifacts stored in `artifacts` table
- Maintain separation of concerns: agents should not directly call each other
- Workflow engine (to be built) coordinates handoffs and manages state in `workflowRuns`

## Real-Time Updates (Future)

The architecture should support real-time progress updates for workflow monitoring:

- **Planned approach**: tRPC subscriptions or dedicated WebSocket server
- **Use case**: Push step status changes to [WorkflowMonitor.tsx](client/src/pages/WorkflowMonitor.tsx)
- **Pattern**: Server emits events on step transitions, client subscribes by `runId`

*Note: Implementation pending. Do not lock into specific patterns until requirements are finalized.*
