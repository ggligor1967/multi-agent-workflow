# Audit aplicatie - Multi-Agent AI Workflow Orchestrator

Data audit: 2026-05-01
Tip audit: static architecture/code/security audit + verificari locale
Scop: intelegerea arhitecturii, logicii de business, structurii codului, fluxurilor de utilizator, performantelor, securitatii si scalabilitatii.

## Sumar executiv

Scor orientativ: 6/10.

Aplicatia este un orchestrator TypeScript full-stack: React/Vite pe client, tRPC/Express si WebSocket pe server, Drizzle ORM cu MySQL pentru persistenta. Fluxul principal este clar: utilizatorul lanseaza un workflow, serverul creeaza un run, engine-ul executa secvential trei agenti AI si persista pasii si artifactele in baza de date.

Arhitectura este potrivita pentru un MVP functional, dar are probleme reale care blocheaza stabilizarea si scalarea: autorizare incompleta pe resurse copil, risc XSS pe artifacte generate de AI, un bug functional in hook-urile frontend, typecheck picat, vulnerabilitati de dependinte si executie workflow in procesul web.

## Verificari rulate

- `pnpm test`: trecut, 66 teste.
- `pnpm build`: trecut, cu warning pentru bundle frontend mare: `971.23 kB` minified JS.
- `pnpm check`: esuat in `server/db.ts` pe incompatibilitate de tip Drizzle/MySQL pool.
- `pnpm audit --audit-level moderate`: esuat, 60 vulnerabilitati: 1 critical, 22 high, 34 moderate, 3 low.
- Audit automat generat in `audit_artifacts/`.

## Arhitectura observata

### Stack tehnic

- Frontend: React 19, Vite, TailwindCSS, shadcn/Radix UI, React Query, tRPC client.
- Backend: Express, tRPC 11, WebSocket subscriptions.
- AI integration: provider OpenAI-compatible/Ollama prin `BUILT_IN_FORGE_API_URL` si `BUILT_IN_FORGE_API_KEY`.
- Persistenta: MySQL 8, Drizzle ORM.
- Deploy: Dockerfile multi-stage, docker-compose cu app + MySQL.
- Testare: Vitest pentru server.

### Flux principal

1. Utilizatorul intra in dashboard/launcher.
2. `WorkflowLauncher` creeaza un run prin `workflow.runs.create`.
3. Routerul tRPC creeaza run-ul cu status `pending`.
4. `executeWorkflow` porneste fire-and-forget in procesul web.
5. `WorkflowEngine` executa pasii:
   - `setup`
   - `initialization` / Context Provider
   - `orchestration` / Nanoscript Generator
   - `synchronization` / Critical Analyst
6. Artifactele sunt salvate in DB.
7. `WorkflowMonitor` se aboneaza la evenimente WebSocket si refetch-uieste datele.

### Model date

Tabele principale:

- `users`
- `workflowConfigs`
- `workflowRuns`
- `workflowSteps`
- `artifacts`
- `agentConfigs`

Observatie: schema nu defineste foreign keys sau indexuri explicite pentru `userId`, `runId`, `configId`, desi aceste coloane sunt folosite in query-uri frecvente.

## Puncte forte

- Separare clara pe foldere: `client`, `server`, `shared`, `drizzle`, `docs`.
- tRPC ofera contracte tipizate intre frontend si backend.
- Exista teste server relevante pentru auth, workflow router, erori si integrare.
- Engine-ul workflow are pasi expliciti si persistenta pentru status/artifacte.
- Exista WebSocket pentru feedback live in monitor.
- Dockerfile si CI sunt prezente.
- Artifactele sunt scrub-uite partial pentru secrete inainte de persistenta.

## Probleme prioritizate

### P0 - IDOR / acces cross-user la steps si artifacts

Severitate: critic

Evidenta:

- `runs.get` verifica proprietarul run-ului prin `dbUtils.getWorkflowRun(input.id, ctx.user.id)`.
- `steps.list`, `steps.create`, `steps.updateStatus`, `artifacts.list`, `artifacts.getByType`, `artifacts.create` lucreaza direct cu `runId` sau `id`, fara `ctx.user`.
- DB helpers precum `getWorkflowSteps(runId)`, `getArtifacts(runId)` si `updateWorkflowStep(id, updates)` nu valideaza ownership.

Cauza radacina:

Autorizarea este aplicata pe resursa parinte `workflowRuns`, dar nu este propagata catre resursele copil. Routerele copil au fost gandite ca operatii interne, dar sunt expuse ca `protectedProcedure`, deci orice user autentificat le poate apela.

Impact:

Un utilizator autentificat poate citi artifactele altui workflow, vedea progresul, crea artifacte sau modifica statusul pasilor daca ghiceste ID-uri numerice.

Remediere:

1. Adauga helper `assertRunOwner(runId, userId)` in `server/db.utils.ts`.
2. Creeaza variante sigure:
   - `getWorkflowSteps(runId, userId)`
   - `createWorkflowStep(step, userId)`
   - `updateWorkflowStep(stepId, userId, updates)`
   - `getArtifacts(runId, userId)`
   - `getArtifactsByType(runId, artifactType, userId)`
   - `createArtifact(artifact, userId)`
3. In `workflows.router.ts`, toate procedurile `steps` si `artifacts` trebuie sa primeasca `ctx` si sa foloseasca helper-ele cu `ctx.user.id`.
4. Adauga teste negative cross-user pentru toate operatiile copil.
5. Pastreaza o cale interna pentru `WorkflowEngine`, dar asigura-te ca primeste `userId` si valideaza run-ul.

### P0 - XSS pe artifacte AI in WorkflowMonitor

Severitate: high

Evidenta:

- `WorkflowMonitor` foloseste `dangerouslySetInnerHTML` pentru artifactele de tip `analysis`.
- Continutul vine din LLM/artifacte persistate si este transformat prin replace-uri regex, nu sanitizat.

Cauza radacina:

UI-ul incearca sa converteasca Markdown-like text in HTML manual, dar trateaza output-ul AI ca HTML sigur.

Impact:

Un artifact generat sau injectat poate introduce HTML/JS si compromite sesiunea utilizatorului.

Remediere:

1. Elimina `dangerouslySetInnerHTML`.
2. Randare minima: afiseaza `analysis` in `pre`/text cu `white-space: pre-wrap`.
3. Daca este necesar Markdown, foloseste un renderer Markdown configurat fara HTML raw.
4. Daca HTML este necesar, foloseste DOMPurify actualizat si o politica CSP stricta.
5. Adauga test pentru payload precum `<img src=x onerror=alert(1)>`.

### P0 - Dashboard poate crapa din cauza incalcarii regulilor React hooks

Severitate: high

Evidenta:

- `useWorkflows()` defineste functii async care cheama `trpc.workflow...useQuery()` si `useMutation()` in interiorul callback-urilor.
- `Dashboard` apeleaza `listRuns` si `listConfigs` in `useEffect`.

Cauza radacina:

Hook-urile React/tRPC sunt folosite ca functii imperative, in afara fluxului normal de randare.

Impact:

Dashboard-ul poate produce `Invalid hook call`, comportament instabil si date neincarcate.

Remediere:

1. Elimina `useWorkflows` sau transforma-l in hook declarativ.
2. In `Dashboard`, foloseste direct:
   - `trpc.workflow.runs.list.useQuery({ limit: 10, offset: 0 }, { enabled: isAuthenticated })`
   - `trpc.workflow.configs.list.useQuery(undefined, { enabled: isAuthenticated })`
3. Pentru operatii imperative, foloseste `trpc.useUtils().client...` sau mutatii declarate la top-level.
4. Adauga test frontend sau smoke test cu Playwright pentru incarcarea dashboard-ului.

### P1 - Typecheck esuat in `server/db.ts`

Severitate: high

Evidenta:

`pnpm check` esueaza cu incompatibilitate intre tipurile pool-ului Drizzle si `mysql2/promise`.

Cauza radacina:

Tipul `_db` este derivat din `drizzle`, dar instanta primeste un `mysql2/promise` pool care nu corespunde exact asteptarii `$client`.

Impact:

CI va pica la `pnpm check`; orice schimbare noua va fi greu de validat.

Remediere:

1. Tipizeaza explicit:
   - `import type { MySql2Database } from "drizzle-orm/mysql2";`
   - `let _db: MySql2Database | null = null;`
2. Sau ajusteaza importul/pool-ul la varianta recomandata de Drizzle pentru `mysql2/promise`.
3. Ruleaza `pnpm check`.
4. Adauga typecheck obligatoriu inainte de merge.

### P1 - Dependinte vulnerabile

Severitate: high

Evidenta:

`pnpm audit --audit-level moderate` raporteaza 60 vulnerabilitati:

- `fast-xml-parser` critic/high prin AWS SDK.
- `@trpc/server < 11.8.0` high.
- `pnpm < 10.27.0` high.
- `axios < 1.15.0` high/moderate.
- `tar`, `postcss`, `dompurify`, `uuid` moderate/high in lanturi tranzitive.

Cauza radacina:

Dependinte neactualizate si toolchain pin-uit pe versiuni vulnerabile.

Remediere:

1. Actualizeaza `@trpc/client`, `@trpc/react-query`, `@trpc/server` la `>=11.8.0`.
2. Actualizeaza `axios` la `>=1.15.0`.
3. Actualizeaza `pnpm` in `packageManager`, Dockerfile si CI la `>=10.27.0`.
4. Actualizeaza AWS SDK sau adauga override pentru `fast-xml-parser >=5.7.0`, verificand compatibilitatea.
5. Actualizeaza Vite/PostCSS/Tailwind plugin chain.
6. Ruleaza `pnpm install`, `pnpm audit`, `pnpm test`, `pnpm build`, `pnpm check`.

### P1 - Executie workflow in procesul web

Severitate: high

Evidenta:

`runs.create` porneste `executeWorkflow(...).catch(...)` fire-and-forget in acelasi proces Express.

Cauza radacina:

Nu exista worker queue, retry persistent, max concurrency, cancellation sau recuperare dupa restart.

Impact:

La trafic mai mare, procesul web va fi blocat de job-uri LLM lungi. Restart-ul serverului poate pierde executii. Scalarea orizontala nu coordoneaza job-urile.

Remediere:

1. Introdu job queue: BullMQ/Redis sau o tabela `workflowJobs`.
2. Muta `WorkflowEngine` intr-un worker separat.
3. Adauga campuri: `attempts`, `lockedBy`, `lockedAt`, `nextRetryAt`, `timeoutAt`.
4. Configureaza concurrency per worker si rate limits pentru providerul LLM.
5. Adauga endpoint de cancel/retry.
6. Web serverul trebuie doar sa creeze job-ul si sa returneze ID-ul.

### P1 - Lipsa rate limiting si limite input insuficiente

Severitate: medium-high

Evidenta:

- Body parser permite `50mb`.
- `initialTask` are doar `z.string().min(1)`, fara max length.
- Nu exista rate limiting.

Cauza radacina:

Validarea este orientata pe prezenta campurilor, nu pe cost/abuz.

Impact:

Userii pot trimite prompturi foarte mari sau multe workflow-uri costisitoare, ducand la costuri LLM, presiune DB si DoS.

Remediere:

1. Redu body limit global la 1-2 MB pentru API standard.
2. Adauga `initialTask: z.string().min(1).max(20000)` sau limita potrivita produsului.
3. Valideaza `modelId` impotriva unei liste permise.
4. Adauga rate limit per user/IP pe `runs.create`.
5. Adauga quota per user: runs active, tokens estimate, runs per ora.

### P1 - Schema DB fara FK/indexuri

Severitate: medium-high

Evidenta:

Tabelele copil contin `userId`, `runId`, `configId`, dar schema nu defineste foreign keys/indexuri explicite.

Cauza radacina:

Schema a crescut rapid pentru MVP, fara constrangeri relationale.

Impact:

Stergeri inconsistente, date orfane, query-uri lente pe masura ce cresc runs/artifacts.

Remediere:

1. Adauga FK:
   - `workflowConfigs.userId -> users.id`
   - `workflowRuns.userId -> users.id`
   - `workflowRuns.configId -> workflowConfigs.id`
   - `workflowSteps.runId -> workflowRuns.id`
   - `artifacts.runId -> workflowRuns.id`
   - `agentConfigs.userId -> users.id`
2. Adauga indexuri pe `userId`, `runId`, `createdAt`, `artifactType`.
3. Stabileste delete policy: cascade pentru steps/artifacts la stergere run, restrict pentru user daca exista date istorice.

### P2 - Sesiuni prea lungi si configurare secrete slaba

Severitate: medium

Evidenta:

- Cookie/JWT expira dupa un an.
- `ENV.cookieSecret` default este string gol daca lipseste env var.
- Docker Compose are fallback `your-super-secret-jwt-key-change-in-production`.

Cauza radacina:

Configuratia de dezvoltare a ramas prea aproape de runtime-ul de productie.

Remediere:

1. La boot in productie, opreste serverul daca `JWT_SECRET` lipseste sau are valoare default/slaba.
2. Redu sesiunea la 7-30 zile.
3. Adauga refresh/rotation daca este necesar.
4. Seteaza `app.set("trust proxy", 1)` daca ruleaza in spatele proxy HTTPS, ca `secure` cookies sa fie corecte.

### P2 - Bundle frontend mare

Severitate: medium

Evidenta:

`pnpm build` genereaza chunk JS de `971.23 kB`, peste pragul Vite.

Cauza radacina:

Aplicatia incarca rutele si componentele UI intr-un singur bundle.

Remediere:

1. Foloseste `React.lazy`/dynamic import pentru pagini: Dashboard, Launcher, Monitor, Results, AgentSettings, ConfigManager, HistoryViewer, ComponentShowcase.
2. Configureaza `manualChunks` pentru vendor: React, Radix, charts, tRPC.
3. Elimina importuri grele nefolosite.
4. Muta `ComponentShowcase` in ruta dev-only sau exclude din build public daca nu este feature utilizator.

### P2 - Documentatie incompleta sau neactualizata

Severitate: medium

Evidenta:

- README refera imagini inexistente in `docs/images`.
- Lipseste `LICENSE`.
- Nu exista OpenAPI/Postman; pentru tRPC exista doar docs Markdown.

Remediere:

1. Adauga/sterge referintele la screenshots.
2. Adauga `LICENSE` conform `package.json` MIT.
3. Genereaza documentatie tRPC sau mentine `docs/API.md` sincronizat cu routerele reale.

## Recomandari pe termen

### Imediat

1. Fix autorizare `steps`/`artifacts`.
2. Elimina `dangerouslySetInnerHTML`.
3. Repara `useWorkflows`/Dashboard.
4. Repara `pnpm check`.

### 1-2 sprinturi

1. Upgrade dependinte vulnerabile.
2. Adauga rate limiting si max length pentru inputuri.
3. Adauga teste cross-user.
4. Adauga FK/indexuri DB.
5. Introdu CSP si security headers.

### 1-3 luni

1. Muta workflow execution intr-un worker/queue.
2. Adauga observabilitate: structured logs, metrics, tracing, job durations, token usage.
3. Optimizeaza bundle-ul frontend prin code splitting.
4. Introdu Playwright smoke tests pentru fluxurile principale.

### 3-6 luni

1. Scalare orizontala cu worker pool.
2. Retry/cancellation robust pentru workflow-uri.
3. Model de quota per user/tenant.
4. Contract API generat automat si validat in CI.

## Riscuri ramase / necunoscute

| Necunoscut | Cum se verifica | Criteriu de promovare la verificat |
| --- | --- | --- |
| Comportament runtime complet cu DB real | `docker compose up`, migrare DB, lansare workflow real | Run complet cu artifacte persistate si monitor live |
| Compatibilitate upgrade tRPC/AWS SDK/axios | branch de upgrade + test/build/check/audit | toate verificarile trec |
| Impact real al XSS | test controlat cu payload HTML in artifact | payload-ul este randat inert |
| Capacitate concurrency LLM | test de incarcare cu N workflow-uri simultane | latente si erori masurate, fara blocare web process |

## Concluzie

Aplicatia are o baza arhitecturala buna pentru prototip/MVP, dar nu trebuie scalata sau expusa unor utilizatori multipli fara remedierea problemelor P0/P1. Prioritatea tehnica este inchiderea bresei de autorizare pe resurse copil, eliminarea XSS-ului din artifacte, stabilizarea dashboard-ului si readucerea toolchain-ului la stare verde (`check`, `audit`, `test`, `build`).
