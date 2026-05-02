# API Documentation

This document describes the currently implemented application-facing API for the Multi-Agent AI Workflow Orchestrator.

## Overview

The backend is built with [tRPC](https://trpc.io/) on top of Express. The client talks to the server through:

- HTTP tRPC requests at `/api/trpc`
- WebSocket subscriptions at `/api/trpc`
- two plain Express auth routes for dev login and OAuth callback

### Default local URLs

- Docker web app: `http://localhost:3005`
- Local development web app: `http://localhost:3000` by default
- tRPC HTTP endpoint: `http://localhost:<port>/api/trpc`
- tRPC WebSocket endpoint: `ws://localhost:<port>/api/trpc`

## Authentication model

The app uses a session cookie. The router has three procedure types:

| Procedure type | Meaning |
| --- | --- |
| `publicProcedure` | No authenticated user is required. |
| `protectedProcedure` | Requires an authenticated user. |
| `adminProcedure` | Requires an authenticated user with the `admin` role. |

### HTTP auth routes

These are plain Express routes, not tRPC procedures.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/dev-login` | Development-only login when `OAUTH_SERVER_URL` is not configured. |
| `GET` | `/api/oauth/callback` | OAuth callback that exchanges the authorization code and sets the session cookie. |

The tRPC `auth` router also exposes:

| Procedure | Auth | Purpose |
| --- | --- | --- |
| `auth.me` | Public | Returns the current user or `null`. |
| `auth.logout` | Public | Clears the session cookie. |

## Response envelope

Most workflow procedures return the same envelope shape:

```ts
type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};
```

If a procedure throws a `TRPCError`, tRPC will return a standard error response instead of this envelope.

## Router map

The top-level routers are:

- `system`
- `auth`
- `workflow`

### `system`

| Procedure | Auth | Input | Output |
| --- | --- | --- | --- |
| `system.health` | Public | `{ timestamp: number }` | `{ ok: true }` |
| `system.notifyOwner` | Admin | `{ title: string; content: string }` | `{ success: boolean }` |

## `workflow` router

### `workflow.getAvailableModels`

Returns the list of models discovered from the configured provider.

- **Auth:** Protected
- **Input:** none
- **Output:** `ApiResult<string[]>`

```ts
const models = trpc.workflow.getAvailableModels.useQuery();
```

### `workflow.configs`

#### `workflow.configs.list`

- **Auth:** Protected
- **Input:** none
- **Output:** `ApiResult<WorkflowConfig[]>`

#### `workflow.configs.get`

- **Auth:** Protected
- **Input:** `{ id: number }`
- **Output:** `ApiResult<WorkflowConfig>`

#### `workflow.configs.create`

- **Auth:** Protected
- **Input:**

```ts
{
  name: string;
  description?: string;
  initialTask: string;        // 1..20_000 chars after trim
  llmModel?: string;          // defaults to "llama3.2"
  mistralModel?: string;      // defaults to "mistral"
}
```

- **Output:** `ApiResult<WorkflowConfig[]>`

#### `workflow.configs.update`

- **Auth:** Protected
- **Input:**

```ts
{
  id: number;
  name?: string;
  description?: string;
  initialTask?: string;
  llmModel?: string;
  mistralModel?: string;
}
```

- **Output:** `ApiResult<unknown>`

#### `workflow.configs.delete`

- **Auth:** Protected
- **Input:** `{ id: number }`
- **Output:** `ApiResult<unknown>`

### `workflow.runs`

#### `workflow.runs.list`

- **Auth:** Protected
- **Input:**

```ts
{
  limit?: number;   // default 50
  offset?: number;  // default 0
}
```

- **Output:** `ApiResult<WorkflowRun[]>`

#### `workflow.runs.get`

Returns the full run snapshot used by the monitor page.

- **Auth:** Protected
- **Input:** `{ id: number }`
- **Output:**

```ts
ApiResult<{
  run: WorkflowRun;
  steps: WorkflowStep[];
  artifacts: Artifact[];
  events: WorkflowRunEventView[];
  metrics: WorkflowRunMetrics;
}>
```

`events` contains parsed lifecycle event metadata. `metrics` contains derived timing and count information, such as queue latency and artifact timing.

#### `workflow.runs.create`

Queues a workflow run. It does **not** execute inline in the web request.

- **Auth:** Protected
- **Input:**

```ts
{
  configId?: number;
  initialTask: string;  // 1..20_000 chars after trim
  modelId?: string;     // optional override, max 100 chars
}
```

- **Output:** `ApiResult<WorkflowRun>`

##### Guard rails on run creation

Before creating a run, the server enforces:

1. config ownership validation when `configId` is provided
2. selected-model validation against `fetchAvailableModels()`
3. active-run quota per user
4. sliding-window burst limit per user

Default limits are controlled through environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `WORKFLOW_RUN_CREATE_WINDOW_MS` | `900000` | Sliding window for burst limiting. |
| `WORKFLOW_RUN_CREATE_MAX_PER_WINDOW` | `30` | Maximum runs allowed inside that window. |
| `WORKFLOW_RUN_ACTIVE_LIMIT` | `25` | Maximum combined `pending` + `running` runs per user. |

If a guard rail blocks run creation, the procedure returns `success: false` with a descriptive `error` string.

#### `workflow.runs.updateStatus`

- **Auth:** Protected
- **Input:**

```ts
{
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  errorMessage?: string;
}
```

- **Output:** `ApiResult<unknown>`

### `workflow.steps`

#### `workflow.steps.list`

- **Auth:** Protected
- **Input:** `{ runId: number }`
- **Output:** `ApiResult<WorkflowStep[]>`

#### `workflow.steps.create`

- **Auth:** Protected
- **Input:**

```ts
{
  runId: number;
  stepName: "setup" | "initialization" | "orchestration" | "synchronization";
}
```

- **Output:** `ApiResult<WorkflowStep>`

#### `workflow.steps.updateStatus`

- **Auth:** Protected
- **Input:**

```ts
{
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  errorMessage?: string;
}
```

- **Output:** `ApiResult<WorkflowStep>`

### `workflow.artifacts`

All artifact operations enforce run ownership.

#### `workflow.artifacts.list`

- **Auth:** Protected
- **Input:** `{ runId: number }`
- **Output:** `ApiResult<Artifact[]>`

#### `workflow.artifacts.getByType`

- **Auth:** Protected
- **Input:**

```ts
{
  runId: number;
  artifactType: string;
}
```

- **Output:** `ApiResult<Artifact[]>`

#### `workflow.artifacts.create`

- **Auth:** Protected
- **Input:**

```ts
{
  runId: number;
  artifactType: "nanoscript" | "context_data" | "analysis" | "final_code" | "report";
  content: string;
  mimeType?: string; // defaults to "text/plain"
}
```

- **Output:** `ApiResult<Artifact>`

### `workflow.agents`

#### `workflow.agents.list`

- **Auth:** Protected
- **Input:** none
- **Output:** `ApiResult<AgentConfig[]>`

#### `workflow.agents.get`

- **Auth:** Protected
- **Input:** `{ id: number }`
- **Output:** `ApiResult<AgentConfig>`

#### `workflow.agents.create`

- **Auth:** Protected
- **Input:**

```ts
{
  agentType: "nanoscript_generator" | "context_provider" | "critical_analyst";
  role: string;
  goal: string;
  backstory: string;
  llmModel: string;
}
```

- **Output:** `ApiResult<AgentConfig[]>`

#### `workflow.agents.update`

- **Auth:** Protected
- **Input:**

```ts
{
  id: number;
  role?: string;
  goal?: string;
  backstory?: string;
  llmModel?: string;
}
```

- **Output:** `ApiResult<unknown>`

## Data types

These shapes reflect the current Drizzle schema.

### `WorkflowConfig`

```ts
type WorkflowConfig = {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  initialTask: string;
  llmModel: string;
  mistralModel: string;
  isActive: number;
  createdAt: Date;
  updatedAt: Date;
};
```

### `WorkflowRun`

```ts
type WorkflowRun = {
  id: number;
  userId: number;
  configId: number | null;
  status: "pending" | "running" | "completed" | "failed";
  initialTask: string;
  selectedModel: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};
```

### `WorkflowStep`

```ts
type WorkflowStep = {
  id: number;
  runId: number;
  stepName: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: Date | null;
  completedAt: Date | null;
  output: string | null;
  errorMessage: string | null;
  createdAt: Date;
};
```

### `WorkflowRunEvent`

```ts
type WorkflowRunEvent = {
  id: number;
  runId: number;
  level: "info" | "warn" | "error";
  source: string;
  eventType: string;
  message: string;
  metadata: string | null;
  createdAt: Date;
};
```

### `Artifact`

```ts
type Artifact = {
  id: number;
  runId: number;
  artifactType: string;
  content: string;
  mimeType: string;
  createdAt: Date;
};
```

### `AgentConfig`

```ts
type AgentConfig = {
  id: number;
  userId: number;
  agentType: string;
  role: string;
  goal: string;
  backstory: string;
  llmModel: string;
  isActive: number;
  createdAt: Date;
  updatedAt: Date;
};
```

## Real-time subscriptions

The workflow monitor subscribes to `workflow.runs.onUpdate`.

### `workflow.runs.onUpdate`

- **Auth:** Protected
- **Input:** `{ runId: number }`
- **Transport:** WebSocket on `/api/trpc`

The server emits the following event types:

```ts
type WorkflowEventType =
  | "step_update"
  | "artifact_created"
  | "lifecycle_event"
  | "run_status_changed"
  | "run_completed"
  | "run_failed";
```

Payload shape:

```ts
type WorkflowEvent = {
  type: WorkflowEventType;
  runId: number;
  data: {
    stepName?: string;
    stepStatus?: string;
    artifactType?: string;
    artifactId?: number;
    status?: string;
    errorMessage?: string;
    lifecycleEventType?: string;
    lifecycleEventLevel?: string;
    message?: string;
    timestamp: string;
  };
};
```

The subscription uses both in-process events and periodic snapshot polling to keep cross-process worker updates visible to the client.

## Error handling notes

- Procedures in the workflow router usually return `success: false` with a human-readable `error` field for recoverable failures.
- Authorization failures in the subscription path throw `TRPCError` with `FORBIDDEN`.
- `auth.logout` and `system.health` return plain success payloads instead of the `ApiResult<T>` envelope.

## Client example

```ts
import { trpc } from "@/lib/trpc";

function WorkflowLauncher() {
  const models = trpc.workflow.getAvailableModels.useQuery();
  const createRun = trpc.workflow.runs.create.useMutation();

  async function launch() {
    const result = await createRun.mutateAsync({
      initialTask: "Generate a TypeScript utility function",
      modelId: models.data?.data?.[0],
    });

    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Failed to queue workflow run");
    }

    return result.data.id;
  }

  return <button onClick={() => void launch()}>Launch</button>;
}
```

## References

- [tRPC documentation](https://trpc.io/docs)
- [React Query integration](https://trpc.io/docs/client/react)
- [WebSocket subscriptions](https://trpc.io/docs/subscriptions)
