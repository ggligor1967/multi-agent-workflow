# API Documentation

This document describes the tRPC API endpoints available in the Multi-Agent AI Workflow Orchestrator.

## Overview

The API is built using [tRPC](https://trpc.io/) for end-to-end type safety. All endpoints are accessible via the `/trpc` route.

### Base URL

- **Docker**: `http://localhost:3005/trpc`
- **Local Dev**: `http://localhost:3000/trpc`

### Authentication

Most endpoints require authentication. The API uses session-based authentication with JWT cookies.

| Procedure Type | Description |
|---------------|-------------|
| `publicProcedure` | No authentication required |
| `protectedProcedure` | Requires authenticated user |
| `adminProcedure` | Requires admin role |

---

## Workflows Router

### `getModels`

Returns a list of available AI models from the configured LLM provider.

```typescript
// Query
trpc.getModels.useQuery()

// Response
string[]
// Example: ["llama3.2:latest", "mistral:latest", "deepseek-r1:7b"]
```

**Authentication**: Public

---

### `createConfig`

Creates a new workflow configuration.

```typescript
// Mutation Input
{
  name: string;           // Configuration name
  initialTask: string;    // Task description
  llmModel: string;       // Primary LLM model
  mistralModel?: string;  // Alternative model (optional)
}

// Response
{
  success: boolean;
  config?: WorkflowConfig;
  error?: string;
}
```

**Authentication**: Protected

---

### `getConfigs`

Retrieves all workflow configurations for the current user.

```typescript
// Query
trpc.getConfigs.useQuery()

// Response
WorkflowConfig[]
```

**Authentication**: Protected

---

### `updateConfig`

Updates an existing workflow configuration.

```typescript
// Mutation Input
{
  id: number;
  name?: string;
  initialTask?: string;
  llmModel?: string;
  mistralModel?: string;
}

// Response
{
  success: boolean;
  config?: WorkflowConfig;
  error?: string;
}
```

**Authentication**: Protected

---

### `deleteConfig`

Deletes a workflow configuration.

```typescript
// Mutation Input
{
  id: number;
}

// Response
{
  success: boolean;
  error?: string;
}
```

**Authentication**: Protected

---

### `startRun`

Starts a new workflow execution.

```typescript
// Mutation Input
{
  configId?: number;      // Use existing config
  // OR create ad-hoc run:
  name?: string;
  initialTask: string;
  llmModel: string;
  mistralModel?: string;
}

// Response
{
  success: boolean;
  run?: WorkflowRun;
  error?: string;
}
```

**Authentication**: Protected

---

### `getRuns`

Retrieves all workflow runs for the current user.

```typescript
// Query
trpc.getRuns.useQuery()

// Response
WorkflowRun[]
```

**Authentication**: Protected

---

### `getRun`

Retrieves a specific workflow run with its steps and artifacts.

```typescript
// Query Input
{
  id: number;
}

// Response
{
  run: WorkflowRun;
  steps: WorkflowStep[];
  artifacts: Artifact[];
} | null
```

**Authentication**: Protected

---

### `getSteps`

Retrieves steps for a specific workflow run.

```typescript
// Query Input
{
  runId: number;
}

// Response
WorkflowStep[]
```

**Authentication**: Protected

---

### `getArtifacts`

Retrieves artifacts for a specific workflow run.

```typescript
// Query Input
{
  runId: number;
}

// Response
Artifact[]
```

**Authentication**: Protected

---

### `getAgentConfigs`

Retrieves all agent configurations.

```typescript
// Query
trpc.getAgentConfigs.useQuery()

// Response
AgentConfig[]
```

**Authentication**: Protected

---

### `updateAgentConfig`

Updates an agent's configuration.

```typescript
// Mutation Input
{
  id: number;
  role?: string;
  goal?: string;
  backstory?: string;
  llmModel?: string;
}

// Response
{
  success: boolean;
  config?: AgentConfig;
  error?: string;
}
```

**Authentication**: Protected

---

## Data Types

### WorkflowConfig

```typescript
interface WorkflowConfig {
  id: number;
  userId: number;
  name: string;
  initialTask: string;
  llmModel: string;
  mistralModel: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### WorkflowRun

```typescript
interface WorkflowRun {
  id: number;
  configId: number | null;
  userId: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}
```

### WorkflowStep

```typescript
interface WorkflowStep {
  id: number;
  runId: number;
  stepName: string;
  agentType: 'context_provider' | 'nanoscript_generator' | 'critical_analyst';
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: string | null;
  output: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}
```

### Artifact

```typescript
interface Artifact {
  id: number;
  runId: number;
  stepId: number | null;
  type: 'nanoscript' | 'context' | 'analysis' | 'final_output';
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}
```

### AgentConfig

```typescript
interface AgentConfig {
  id: number;
  agentType: 'context_provider' | 'nanoscript_generator' | 'critical_analyst';
  role: string;
  goal: string;
  backstory: string;
  llmModel: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## WebSocket Subscriptions

The API supports real-time updates via WebSocket subscriptions.

### Connection

Connect to WebSocket at: `ws://localhost:3005/api/trpc` (Docker) or `ws://localhost:3000/api/trpc` (local)

### Available Subscriptions

#### `onRunUpdate`

Subscribe to updates for a specific workflow run.

```typescript
// Subscription Input
{
  runId: number;
}

// Emitted Events
{
  type: 'step_update' | 'run_complete' | 'run_failed';
  step?: WorkflowStep;
  run?: WorkflowRun;
  error?: string;
}
```

---

## Error Handling

All mutations return a consistent response format:

```typescript
interface MutationResponse<T> {
  success: boolean;
  data?: T;        // Present on success
  error?: string;  // Present on failure
}
```

### Common Error Codes

| Error | Description |
|-------|-------------|
| `UNAUTHORIZED` | Authentication required |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `BAD_REQUEST` | Invalid input data |
| `INTERNAL_SERVER_ERROR` | Server-side error |

---

## Rate Limiting

Currently, no rate limiting is implemented. For production deployments, consider adding rate limiting middleware.

---

## Examples

### JavaScript/TypeScript Client

```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server/routers';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3005/trpc',
      headers: () => ({
        // Include auth cookie if needed
      }),
    }),
  ],
});

// Get available models
const models = await client.getModels.query();

// Create and start a workflow
const result = await client.startRun.mutate({
  name: 'My Workflow',
  initialTask: 'Create a TypeScript utility function',
  llmModel: 'llama3.2:latest',
});

if (result.success) {
  console.log('Workflow started:', result.run.id);
}
```

### React Query Integration

```typescript
import { trpc } from '@/lib/trpc';

function WorkflowLauncher() {
  const models = trpc.getModels.useQuery();
  const startRun = trpc.startRun.useMutation();

  const handleLaunch = async () => {
    const result = await startRun.mutateAsync({
      name: 'My Workflow',
      initialTask: 'Build a REST API',
      llmModel: models.data?.[0] ?? 'llama3.2:latest',
    });
    
    if (result.success) {
      // Navigate to monitor page
    }
  };

  return (
    <button onClick={handleLaunch}>
      Launch Workflow
    </button>
  );
}
```

### cURL Examples

```bash
# Get available models (no auth required)
curl http://localhost:3005/trpc/getModels

# Start a workflow run (requires auth cookie)
curl -X POST http://localhost:3005/trpc/startRun \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your-session-cookie" \
  -d '{
    "json": {
      "name": "Test Workflow",
      "initialTask": "Create a hello world function",
      "llmModel": "llama3.2:latest"
    }
  }'
```

---

## OpenAPI Compatibility

While tRPC doesn't natively generate OpenAPI specs, you can use [trpc-openapi](https://github.com/jlalmes/trpc-openapi) to expose REST endpoints if needed.

---

## Further Reading

- [tRPC Documentation](https://trpc.io/docs)
- [React Query Integration](https://trpc.io/docs/client/react)
- [WebSocket Subscriptions](https://trpc.io/docs/subscriptions)
