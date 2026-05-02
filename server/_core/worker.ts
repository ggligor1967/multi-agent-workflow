import "dotenv/config";
import { closeDb } from "../db";
import { WorkflowWorker } from "../services/workflow.worker";
import { ENV } from "./env";

async function startWorkerProcess() {
  const worker = new WorkflowWorker({
    workerId: ENV.workflowWorkerId,
    pollIntervalMs: ENV.workflowWorkerPollIntervalMs,
    staleRunThresholdMs: ENV.workflowWorkerStaleRunThresholdMs,
  });

  const shutdown = async () => {
    await worker.stop();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });

  await worker.start();
  console.log(`[WorkflowWorker:${ENV.workflowWorkerId}] Worker process started`);
}

startWorkerProcess().catch(error => {
  console.error(
    "[WorkflowWorker] Failed to start worker process:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});