# Architectural Structure Web - Project TODO

## Database & Backend
- [x] Create database schema for workflows, runs, steps, artifacts, and agents
- [x] Implement database utilities (db.utils.ts)
- [x] Create tRPC workflow router with CRUD operations
- [x] Integrate workflow router into main app router

## Frontend - Hooks & Utilities
- [x] Create useWorkflows hook for API interactions
- [x] Implement workflow configuration management
- [x] Implement workflow run management
- [x] Implement workflow steps tracking
- [x] Implement artifacts management
- [x] Implement agent configuration management

## Frontend - Pages
- [x] Create Dashboard page with overview and recent runs
- [x] Create WorkflowLauncher page for creating and launching workflows
- [x] Create WorkflowMonitor page for real-time execution monitoring
- [x] Create ResultsDashboard page for viewing generated artifacts
- [x] Create AgentSettings page for configuring agent behavior
- [x] Update App.tsx with new routes

## Features Implemented
- [x] Agent configuration panel for managing Nanoscript Generator, Context Provider, and Critical Analyst agents
- [x] Integration with LLM services (Ollama - DeepSeek, Qwen, Llama, Mistral, etc.)
- [x] Dynamic model selection - choose AI model per workflow run
- [x] Workflow execution engine that orchestrates the multi-agent workflow
- [x] Artifact parsing - clean code and formatted analysis reports in UI
- [x] Multi-endpoint model discovery (Ollama native + OpenAI-compatible APIs)

## Features To Implement
- [x] Project management interface to create, save, and load workflow configurations (ConfigManager page)
- [x] Execution history viewer with filtering and search capabilities (HistoryViewer page)
- [x] WebSocket support for real-time status updates via tRPC subscriptions (ws.ts, WorkflowMonitor)
- [x] Export results to various formats (JSON, CSV, Markdown) from ResultsDashboard
- [x] Agent configuration presets (Rust Team, Security Focus, Python Expert, TypeScript, Default)

## Testing & Quality
- [x] Write unit tests for database utilities
- [x] Write unit tests for tRPC routers (workflows.router.test.ts)
- [x] Test workflow execution with multiple test cases (test-workflow.ts)
- [ ] Write integration tests for workflow execution
- [ ] Test authentication and authorization
- [ ] Test error handling and edge cases

## Deployment & Documentation
- [x] Docker support with multi-stage Dockerfile and docker-compose.yml
- [x] Create deployment documentation (README.md with Getting Started, Architecture, Configuration)
- [x] Create user guide for workflow management (docs/USER_GUIDE.md)
- [x] Create API documentation (docs/API.md)
- [x] Set up CI/CD pipeline (.github/workflows/ci.yml)
- [ ] Performance optimization and caching

## Known Issues & Notes
- OAuth authentication not configured (works in dev mode without auth)
- VITE_ANALYTICS_ENDPOINT warnings can be ignored (optional analytics)
- Agent configs are created automatically on first workflow run
- LLM responses can vary - robust JSON parsing handles malformed outputs
- Port 3000 busy fallback to 3002 is normal behavior
