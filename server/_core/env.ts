const DEFAULT_DEV_JWT_SECRET = "dev-insecure-jwt-secret-change-me";
const DEFAULT_WORKFLOW_WORKER_POLL_INTERVAL_MS = 1_000;
const DEFAULT_WORKFLOW_WORKER_STALE_RUN_MS = 5 * 60 * 1_000;
const DEFAULT_WORKFLOW_RUN_CREATE_WINDOW_MS = 15 * 60 * 1_000;
const DEFAULT_WORKFLOW_RUN_CREATE_MAX_PER_WINDOW = 30;
const DEFAULT_WORKFLOW_RUN_ACTIVE_LIMIT = 25;
const WEAK_JWT_SECRETS = new Set([
  "",
  "your-super-secret-jwt-key-change-in-production",
  "mysecretkey123randomstring",
  DEFAULT_DEV_JWT_SECRET,
]);

function resolveCookieSecret() {
  const configuredSecret = process.env.JWT_SECRET?.trim() ?? "";
  const isWeakSecret =
    configuredSecret.length < 32 || WEAK_JWT_SECRETS.has(configuredSecret);

  if (process.env.NODE_ENV === "production" && isWeakSecret) {
    throw new Error(
      "JWT_SECRET must be set to a strong, non-default value in production"
    );
  }

  if (isWeakSecret) {
    console.warn(
      "[Config] JWT_SECRET is missing or weak; using a development-only fallback"
    );
    return DEFAULT_DEV_JWT_SECRET;
  }

  return configuredSecret;
}

function readPositiveIntEnv(name: string, fallback: number) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    console.warn(`[Config] ${name} must be a positive integer; using ${fallback}`);
    return fallback;
  }

  return parsedValue;
}

function resolveEmbeddedWorkflowWorker() {
  const configuredValue = process.env.WORKFLOW_EMBEDDED_WORKER?.trim().toLowerCase();

  if (configuredValue === "true") {
    return true;
  }

  if (configuredValue === "false") {
    return false;
  }

  return process.env.NODE_ENV !== "production";
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: resolveCookieSecret(),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  enableEmbeddedWorkflowWorker: resolveEmbeddedWorkflowWorker(),
  workflowWorkerId: process.env.WORKFLOW_WORKER_ID?.trim() || `worker-${process.pid}`,
  workflowWorkerPollIntervalMs: readPositiveIntEnv(
    "WORKFLOW_WORKER_POLL_INTERVAL_MS",
    DEFAULT_WORKFLOW_WORKER_POLL_INTERVAL_MS
  ),
  workflowWorkerStaleRunThresholdMs: readPositiveIntEnv(
    "WORKFLOW_WORKER_STALE_RUN_MS",
    DEFAULT_WORKFLOW_WORKER_STALE_RUN_MS
  ),
  workflowRunCreateWindowMs: readPositiveIntEnv(
    "WORKFLOW_RUN_CREATE_WINDOW_MS",
    DEFAULT_WORKFLOW_RUN_CREATE_WINDOW_MS
  ),
  workflowRunCreateMaxPerWindow: readPositiveIntEnv(
    "WORKFLOW_RUN_CREATE_MAX_PER_WINDOW",
    DEFAULT_WORKFLOW_RUN_CREATE_MAX_PER_WINDOW
  ),
  workflowRunActiveLimit: readPositiveIntEnv(
    "WORKFLOW_RUN_ACTIVE_LIMIT",
    DEFAULT_WORKFLOW_RUN_ACTIVE_LIMIT
  ),
};
