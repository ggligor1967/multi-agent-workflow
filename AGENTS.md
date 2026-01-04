# Repository Guidelines

## Project Structure & Module Organization
- `client/`: Vite + React UI. Key areas: `src/pages` (routes), `components` (UI pieces), `hooks`/`contexts` (state), and `lib` (client utilities). Built assets land in `dist/public`.
- `server/`: Express + tRPC backend. `_core` bootstraps context, env, and routers; `agents/` hosts workflow agents; `services/` encapsulate integrations (LLM, storage); `routers.ts` exposes tRPC procedures. Tests sit alongside code.
- `shared/`: Cross-cutting types/constants imported by both client and server via `@shared/*`.
- `drizzle/`: Database schema and generated migrations; configured for MySQL via `drizzle.config.ts`.
- Aliases: `@/*` → `client/src`, `@shared/*` → `shared/*`.

## Build, Test, and Development Commands
- `pnpm install` – install workspace dependencies.
- `pnpm dev` – watch/reload the server (`server/_core/index.ts`). Run in one terminal.
- `pnpm vite dev --host` – start the client dev server (Vite, port auto-assigned). Run in another terminal.
- `pnpm build` – build client to `dist/public` and bundle server to `dist/index.js`.
- `pnpm start` – run the bundled server from `dist`.
- `pnpm check` – type-check with `tsc --noEmit`.
- `pnpm test` – run Vitest suites (Node environment).
- `pnpm test:llm` – quick LLM connectivity check using the configured provider.
- `pnpm db:push` / `pnpm db:seed` – generate/migrate schema and seed sample data (requires `DATABASE_URL`).

## Coding Style & Naming Conventions
- TypeScript strict mode; prefer type imports where possible.
- Formatting enforced by Prettier (`pnpm format`); default two-space indentation, semicolons, and single quotes.
- React components: PascalCase filenames in `components/` and `pages/`. Hooks start with `use`, contexts end with `Provider`.
- tRPC routers/services: group procedures by domain; name mutations/queries verb-first (`create`, `list`, `update`, `delete`).
- Keep shared types in `shared/` and re-export instead of duplicating shapes.

## Testing Guidelines
- Framework: Vitest; test files match `server/**/*.test.ts` or `server/**/*.spec.ts` (see `vitest.config.ts`).
- Prefer fast unit tests that stub external calls (LLM, DB) via test doubles; see `workflows.router.test.ts` for context mocking.
- Add integration tests when touching workflow orchestration or DB utilities; isolate fixtures under `server/__fixtures__/` if needed.
- Run `pnpm test` before pushing; ensure new routes or agents include happy-path and error-path coverage.

## Commit & Pull Request Guidelines
- Git history is not available in this workspace; default to Conventional Commits (e.g., `feat: add workflow monitor page`, `fix: handle missing llm key`).
- Keep commits scoped and incremental; include relevant tests or seeds when schema or API contracts change.
- PRs should state intent, list key changes, note breaking schema/API changes, and attach UI screenshots or GIFs for visible updates. Link issues or TODO entries when applicable.

## Security & Configuration Tips
- Copy `.env.example` to `.env` and fill `DATABASE_URL`, `BUILT_IN_FORGE_API_KEY`, and `JWT_SECRET` before running tests or seeds. Never commit secrets.
- Protect production creds; prefer local `.env` and environment-specific overrides in deployment.
- Validate OAuth and LLM endpoints in lower environments before promoting to prod to avoid agent misconfiguration.
