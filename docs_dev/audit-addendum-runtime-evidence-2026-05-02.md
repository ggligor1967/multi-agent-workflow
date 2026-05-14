# Audit Addendum: runtime evidence closure

Date: 2026-05-02  
Scope: repo-level P0/P1 remediation evidence for `docs_dev/audit-aplicatie-2026-05-01.md`  
Primary evidence directory: `.omx/evidence/manual-runtime-followup/`  
Historical blocked-attempt evidence directory: `.omx/evidence/audit-first-runtime-evidence-20260501T205000Z/`

## Summary verdict

Repo-level P0/P1 runtime closure is **PASS** for the evidence gates requested in this follow-up:

- Docker Compose YAML/config validation: **PASS**.
- Docker Compose runtime gate: **PASS** for local repository runtime (`db`, `app`, and `worker` healthy).
- App/worker separation: **PASS** (`WORKFLOW_EMBEDDED_WORKER=false` verified in both containers; worker has its own process-level healthcheck).
- Real Docker MySQL schema introspection: **PASS** for expected tables, foreign keys, and runtime indexes.
- Workflow lifecycle smoke: **PASS** for worker-path proof (`pending -> run_claimed -> run_started/running -> terminal failed`). The terminal failure is expected in this environment because local Ollama does not have `gemini-2.5-flash`.
- Final regression gate: **PASS** (`pnpm audit`, `pnpm check`, `pnpm test`, `pnpm build`).

This is **not production verification**. It is repository-level runtime evidence from the local Docker Compose environment. Public/staging launch still requires repeating the runtime and security gates with real secrets, real OAuth configuration, and an available production/staging LLM model.

## Follow-up evidence matrix

| Gate | Status | Evidence |
| --- | --- | --- |
| Docker Compose normalized config | PASS | `.omx/evidence/manual-runtime-followup/docker-compose-config-final.txt` |
| Docker Compose service health | PASS | `.omx/evidence/manual-runtime-followup/docker-compose-ps-final.txt` |
| Worker healthcheck | PASS | `.omx/evidence/manual-runtime-followup/worker-health-final.json` |
| App embedded-worker flag | PASS | `.omx/evidence/manual-runtime-followup/app-embedded-worker-flag.txt` (`false`) |
| Worker embedded-worker flag | PASS | `.omx/evidence/manual-runtime-followup/worker-embedded-worker-flag.txt` (`false`) |
| Docker app logs | PASS evidence captured | `.omx/evidence/manual-runtime-followup/app-logs-final.txt` |
| Docker worker logs | PASS evidence captured | `.omx/evidence/manual-runtime-followup/worker-logs-final.txt` |
| DB table introspection | PASS | `.omx/evidence/manual-runtime-followup/db-show-tables.txt` |
| DB foreign-key introspection | PASS | `.omx/evidence/manual-runtime-followup/db-fk-introspection.txt` |
| DB index introspection | PASS | `.omx/evidence/manual-runtime-followup/db-index-introspection.txt` |
| Workflow smoke pending run creation | PASS | `.omx/evidence/manual-runtime-followup/workflow-smoke-pending-created.txt` |
| Workflow smoke worker restart/wait | PASS | `.omx/evidence/manual-runtime-followup/workflow-smoke-worker-restart.txt`, `.omx/evidence/manual-runtime-followup/workflow-smoke-worker-wait.txt` |
| Workflow smoke final run state | PASS for worker-path proof | `.omx/evidence/manual-runtime-followup/workflow-runs-after-smoke.txt` |
| Workflow smoke lifecycle events | PASS | `.omx/evidence/manual-runtime-followup/workflow-events-after-smoke.txt` |
| Workflow smoke worker logs | PASS | `.omx/evidence/manual-runtime-followup/worker-logs-after-smoke.txt` |
| Dependency audit | PASS | `.omx/evidence/manual-runtime-followup/pnpm-audit-final.txt` (`No known vulnerabilities found`) |
| TypeScript check | PASS | `.omx/evidence/manual-runtime-followup/pnpm-check-final.txt` |
| Test suite | PASS | `.omx/evidence/manual-runtime-followup/pnpm-test-final.txt` (`7` files, `78` tests passed) |
| Production build | PASS | `.omx/evidence/manual-runtime-followup/pnpm-build-final.txt` |

## Runtime findings closed at repo level

### Compose runtime

`docker compose ps` shows all required services healthy:

- `multi-agent-db`: `Up ... (healthy)`, published at `3307:3306`.
- `multi-agent-app`: `Up ... (healthy)`, published at `3005:3000`.
- `multi-agent-worker`: `Up ... (healthy)`.

The worker no longer relies on the Dockerfile app HTTP healthcheck. Compose overrides the worker healthcheck with a process check for `node dist/worker.js`, which matches the dedicated worker command.

### App/worker separation

Both runtime containers report:

- `WORKFLOW_EMBEDDED_WORKER=false` in `app`.
- `WORKFLOW_EMBEDDED_WORKER=false` in `worker`.

This verifies the intended topology: the API process queues runs, and the dedicated worker process claims and executes them.

### Database schema

The Docker MySQL database contains the expected runtime tables:

- `users`
- `workflowConfigs`
- `workflowRuns`
- `workflowSteps`
- `artifacts`
- `agentConfigs`
- `workflowRunEvents`
- `__drizzle_migrations`

Foreign-key introspection confirms the required ownership and lifecycle relations, including:

- `workflowRuns.userId -> users.id`
- `workflowRuns.configId -> workflowConfigs.id`
- `workflowSteps.runId -> workflowRuns.id`
- `artifacts.runId -> workflowRuns.id`
- `workflowRunEvents.runId -> workflowRuns.id`
- `workflowConfigs.userId -> users.id`
- `agentConfigs.userId -> users.id`

Index introspection confirms the operational indexes used by queueing, ownership filtering, lifecycle timelines, and artifact lookups, including:

- `workflow_runs_status_created_idx`
- `workflow_runs_status_updated_idx`
- `workflow_runs_user_created_idx`
- `workflow_steps_run_created_idx`
- `artifacts_run_type_idx`
- `workflow_run_events_run_created_idx`
- `workflow_run_events_run_type_idx`

### Workflow lifecycle smoke

The smoke run proves the decoupled worker path:

1. A workflow run was inserted/created as `pending`.
2. The worker claimed the run (`run_claimed`).
3. The engine started execution and emitted `run_started` plus step lifecycle events.
4. The run reached terminal `failed` because the local LLM endpoint returned `model 'gemini-2.5-flash' not found`.
5. The worker emitted `worker_finished` with failure status.

This is a valid repo-level lifecycle proof for the queue/worker/engine/observability path. It is **not** proof of successful agent completion because the configured model is unavailable in this local environment.

### Regression gate

Final regression evidence is green:

- `pnpm audit --audit-level moderate`: `No known vulnerabilities found`.
- `pnpm check`: TypeScript check passed.
- `pnpm test`: `7` test files and `78` tests passed.
- `pnpm build`: Vite client build plus server/worker bundles completed successfully.

Known non-blocking output during this gate:

- `[OAuth] ERROR: OAUTH_SERVER_URL is not configured!` appears in local/dev tests and worker logs. This is expected for this environment and does not block repo-level runtime closure.
- `[Config] JWT_SECRET is missing or weak; using a development-only fallback` appears in tests. This is expected only for local/dev test execution.
- MySQL CLI warns about command-line password usage in introspection evidence. This is a local smoke artifact, not application runtime behavior.
- Vite reports a chunk-size warning for the client bundle. This remains a P2 optimization item, not a P0/P1 runtime blocker.

## Superseded earlier blocker state

The earlier evidence directory `.omx/evidence/audit-first-runtime-evidence-20260501T205000Z/` captured a blocked state caused by local Docker/containerd/disk-space issues. That state is now superseded for the follow-up gates above by `.omx/evidence/manual-runtime-followup/`, where Compose, DB introspection, workflow lifecycle smoke, and final regression evidence all passed at repo level.

The earlier TypeScript/package-manager remediations remain valid historical context, but the current closure status should be read from the follow-up evidence matrix in this document.

## Remaining production/staging requirements

Before public launch or production certification, repeat the following outside the local repo-level smoke environment:

1. Run Compose/Kubernetes/App Service equivalent startup gates in staging/prod infrastructure.
2. Configure real `JWT_SECRET`, OAuth settings, and production/staging identity provider values.
3. Configure an available LLM model and rerun an end-to-end workflow to `completed`, not only terminal `failed` after worker execution starts.
4. Repeat DB migration, FK/index introspection, and lifecycle smoke against staging/prod data stores or disposable staging databases.
5. Run manual auth/security smoke for cross-user denial, artifact rendering, and rate-limit/guardrail behavior against the deployed environment.
6. Verify token/model cost quotas and any edge/IP-level rate limiting required for launch.
7. Address the deferred P2 client bundle-size warning when performance work is scheduled.

## Final audit status

The requested repo-level P0/P1 evidence closure is complete and documented. No production verification is claimed.
