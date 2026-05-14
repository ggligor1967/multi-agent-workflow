import type { PoolConnection } from "mysql2/promise";
import * as dbUtils from "../db.utils";
import { getDbPool } from "../db";
import { ENV } from "../_core/env";
import { executeWorkflow } from "./workflow.engine";
import { recordWorkflowRunEvent } from "./workflow.observability";

const WORKFLOW_LOCK_PREFIX = "workflow-run";
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_STALE_RUN_THRESHOLD_MS = 5 * 60 * 1_000;
const DEFAULT_STALE_RECOVERY_BATCH_SIZE = 25;

export interface WorkflowWorkerOptions {
  workerId?: string;
  pollIntervalMs?: number;
  staleRunThresholdMs?: number;
  maxRunsPerTick?: number;
}

interface WorkflowRunLock {
  connection: PoolConnection;
  key: string;
}

interface WorkflowWorkerStats {
  ticks: number;
  emptyTicks: number;
  claimedRuns: number;
  completedRuns: number;
  failedRuns: number;
  staleRecoveredRuns: number;
  lastTickStartedAt: Date | null;
  lastTickCompletedAt: Date | null;
  lastErrorMessage: string | null;
}

function parseLockResult(rows: unknown, fieldName: string): number {
  const firstRow = Array.isArray(rows) ? rows[0] : null;
  if (!firstRow || typeof firstRow !== "object") {
    return 0;
  }

  const value = (firstRow as Record<string, unknown>)[fieldName];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function getLockKey(runId: number): string {
  return `${WORKFLOW_LOCK_PREFIX}:${runId}`;
}

async function acquireWorkflowRunLock(runId: number): Promise<WorkflowRunLock | null> {
  const pool = await getDbPool();
  if (!pool) {
    return null;
  }

  const connection = await pool.getConnection();
  const key = getLockKey(runId);

  try {
    const [rows] = await connection.query("SELECT GET_LOCK(?, 0) AS acquired", [key]);
    const acquired = parseLockResult(rows, "acquired") === 1;

    if (!acquired) {
      connection.release();
      return null;
    }

    return { connection, key };
  } catch (error) {
    connection.release();
    throw error;
  }
}

async function releaseWorkflowRunLock(lock: WorkflowRunLock): Promise<void> {
  try {
    await lock.connection.query("DO RELEASE_LOCK(?)", [lock.key]);
  } catch (error) {
    console.warn(
      `[WorkflowWorker] Failed to release lock ${lock.key}:`,
      error instanceof Error ? error.message : error
    );
  } finally {
    lock.connection.release();
  }
}

async function isWorkflowRunLockFree(runId: number): Promise<boolean> {
  const pool = await getDbPool();
  if (!pool) {
    return false;
  }

  const [rows] = await pool.query("SELECT IS_FREE_LOCK(?) AS isFree", [getLockKey(runId)]);
  return parseLockResult(rows, "isFree") === 1;
}

export class WorkflowWorker {
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly staleRunThresholdMs: number;
  private readonly maxRunsPerTick: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isTickActive = false;
  private readonly stats: WorkflowWorkerStats = {
    ticks: 0,
    emptyTicks: 0,
    claimedRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    staleRecoveredRuns: 0,
    lastTickStartedAt: null,
    lastTickCompletedAt: null,
    lastErrorMessage: null,
  };

  constructor(options: WorkflowWorkerOptions = {}) {
    this.workerId = options.workerId ?? ENV.workflowWorkerId;
    this.pollIntervalMs = options.pollIntervalMs ?? ENV.workflowWorkerPollIntervalMs;
    this.staleRunThresholdMs =
      options.staleRunThresholdMs ?? ENV.workflowWorkerStaleRunThresholdMs;
    this.maxRunsPerTick = Math.max(1, options.maxRunsPerTick ?? 1);
  }

  async start(): Promise<void> {
    if (this.timer) {
      return;
    }

    this.log("Starting workflow worker");
    await this.recoverStaleRuns();
    await this.runOnce();

    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    while (this.isTickActive) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    this.log("Workflow worker stopped");
  }

  async runOnce(): Promise<number> {
    if (this.isTickActive) {
      return 0;
    }

    const pool = await getDbPool();
    if (!pool) {
      return 0;
    }

    this.isTickActive = true;
    let processedRuns = 0;
    this.stats.ticks += 1;
    this.stats.lastTickStartedAt = new Date();

    try {
      const pendingRuns = await dbUtils.getPendingWorkflowRuns(this.maxRunsPerTick);

      if (pendingRuns.length === 0) {
        this.stats.emptyTicks += 1;
      }

      for (const run of pendingRuns) {
        const lock = await acquireWorkflowRunLock(run.id);
        if (!lock) {
          this.log("Skipped run because the workflow lock is held elsewhere", {
            runId: run.id,
          });
          continue;
        }

        try {
          this.stats.claimedRuns += 1;
          this.log(`Claimed run ${run.id}`);
          await recordWorkflowRunEvent({
            runId: run.id,
            userId: run.userId,
            source: "worker",
            eventType: "run_claimed",
            message: "Worker claimed queued run",
            metadata: {
              workerId: this.workerId,
              selectedModel: run.selectedModel ?? null,
              queueLatencyMs:
                run.createdAt instanceof Date
                  ? Math.max(0, Date.now() - run.createdAt.getTime())
                  : null,
            },
          });

          const result = await executeWorkflow(run.id, run.userId, {
            modelId: run.selectedModel ?? undefined,
          });

          if (result.success) {
            this.stats.completedRuns += 1;
          } else {
            this.stats.failedRuns += 1;
          }

          await recordWorkflowRunEvent({
            runId: run.id,
            userId: run.userId,
            source: "worker",
            eventType: "worker_finished",
            level: result.success ? "info" : "error",
            message: result.success
              ? "Worker finished processing run successfully"
              : "Worker finished processing run with failure status",
            metadata: {
              workerId: this.workerId,
              success: result.success,
              error: result.error ?? null,
              artifactCount: Object.keys(result.artifacts).length,
            },
          });

          processedRuns += 1;
        } catch (error) {
          this.stats.failedRuns += 1;
          this.stats.lastErrorMessage =
            error instanceof Error ? error.message : String(error);
          await recordWorkflowRunEvent({
            runId: run.id,
            userId: run.userId,
            source: "worker",
            eventType: "worker_execution_exception",
            level: "error",
            message: "Worker caught an unexpected execution exception",
            metadata: {
              workerId: this.workerId,
              error: error instanceof Error ? error.message : String(error),
            },
          });
          this.logError(`Run ${run.id} failed during worker execution`, error);
        } finally {
          await releaseWorkflowRunLock(lock);
        }
      }

      this.stats.lastTickCompletedAt = new Date();
      if (processedRuns > 0) {
        this.log("Worker tick completed", {
          processedRuns,
          stats: this.getStatsSnapshot(),
        });
      }

      return processedRuns;
    } finally {
      this.isTickActive = false;
    }
  }

  async recoverStaleRuns(): Promise<number> {
    const pool = await getDbPool();
    if (!pool) {
      return 0;
    }

    const staleBefore = new Date(Date.now() - this.staleRunThresholdMs);
    const staleRuns = await dbUtils.getStaleRunningWorkflowRuns(
      staleBefore,
      DEFAULT_STALE_RECOVERY_BATCH_SIZE
    );

    let recoveredRuns = 0;

    for (const run of staleRuns) {
      const lockFree = await isWorkflowRunLockFree(run.id);
      if (!lockFree) {
        continue;
      }

      await dbUtils.updateWorkflowRun(run.id, run.userId, {
        status: "failed",
        completedAt: new Date(),
        errorMessage: "Workflow worker stopped before finishing this run",
      });
      await recordWorkflowRunEvent({
        runId: run.id,
        userId: run.userId,
        source: "worker",
        eventType: "stale_run_recovered",
        level: "warn",
        message: "Worker recovered a stale running workflow as failed",
        metadata: {
          workerId: this.workerId,
          staleRunThresholdMs: this.staleRunThresholdMs,
        },
      });
      recoveredRuns += 1;
      this.stats.staleRecoveredRuns += 1;
      this.log(`Recovered stale run ${run.id} as failed`);
    }

    return recoveredRuns;
  }

  private getStatsSnapshot() {
    return {
      ...this.stats,
      lastTickStartedAt: this.stats.lastTickStartedAt?.toISOString() ?? null,
      lastTickCompletedAt: this.stats.lastTickCompletedAt?.toISOString() ?? null,
    };
  }

  private log(message: string, metadata?: Record<string, unknown>): void {
    console.log(
      JSON.stringify({
        scope: "workflow.worker",
        timestamp: new Date().toISOString(),
        workerId: this.workerId,
        message,
        metadata: metadata ?? null,
      })
    );
  }

  private logError(message: string, error: unknown): void {
    console.error(
      JSON.stringify({
        scope: "workflow.worker",
        timestamp: new Date().toISOString(),
        workerId: this.workerId,
        message,
        error: error instanceof Error ? error.message : String(error),
        stats: this.getStatsSnapshot(),
      })
    );
  }
}

export async function startEmbeddedWorkflowWorker(): Promise<WorkflowWorker | null> {
  if (!ENV.enableEmbeddedWorkflowWorker) {
    return null;
  }

  const worker = new WorkflowWorker({
    workerId: ENV.workflowWorkerId,
    pollIntervalMs: ENV.workflowWorkerPollIntervalMs,
    staleRunThresholdMs: ENV.workflowWorkerStaleRunThresholdMs,
  });

  await worker.start();
  return worker;
}