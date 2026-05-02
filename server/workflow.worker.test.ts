import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPendingWorkflowRunsMock: vi.fn(),
  getStaleRunningWorkflowRunsMock: vi.fn(),
  updateWorkflowRunMock: vi.fn(),
  createWorkflowRunEventMock: vi.fn(),
  executeWorkflowMock: vi.fn(),
  getDbPoolMock: vi.fn(),
  connectionQueryMock: vi.fn(),
  connectionReleaseMock: vi.fn(),
  poolGetConnectionMock: vi.fn(),
  poolQueryMock: vi.fn(),
}));

vi.mock("./db.utils", () => ({
  getPendingWorkflowRuns: mocks.getPendingWorkflowRunsMock,
  getStaleRunningWorkflowRuns: mocks.getStaleRunningWorkflowRunsMock,
  updateWorkflowRun: mocks.updateWorkflowRunMock,
  createWorkflowRunEvent: mocks.createWorkflowRunEventMock,
}));

vi.mock("./db", () => ({
  getDbPool: mocks.getDbPoolMock,
}));

vi.mock("./services/workflow.engine", () => ({
  executeWorkflow: mocks.executeWorkflowMock,
}));

import { WorkflowWorker } from "./services/workflow.worker";

const mockConnection = {
  query: mocks.connectionQueryMock,
  release: mocks.connectionReleaseMock,
};

describe("WorkflowWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.connectionQueryMock.mockImplementation(async (query: string) => {
      if (query.includes("GET_LOCK")) {
        return [[{ acquired: 1 }], undefined];
      }

      return [[], undefined];
    });

    mocks.connectionReleaseMock.mockResolvedValue(undefined);
    mocks.poolGetConnectionMock.mockResolvedValue(mockConnection as any);
    mocks.poolQueryMock.mockResolvedValue([[{ isFree: 1 }], undefined]);
    mocks.getDbPoolMock.mockResolvedValue({
      getConnection: mocks.poolGetConnectionMock,
      query: mocks.poolQueryMock,
    } as any);
    mocks.getPendingWorkflowRunsMock.mockResolvedValue([]);
    mocks.getStaleRunningWorkflowRunsMock.mockResolvedValue([]);
    mocks.updateWorkflowRunMock.mockResolvedValue(undefined);
    mocks.createWorkflowRunEventMock.mockImplementation(async (runId: number, _userId: number, event: any) => ({
      id: Math.floor(Math.random() * 1000) + 1,
      runId,
      ...event,
      createdAt: new Date(),
    }));
    mocks.executeWorkflowMock.mockResolvedValue({
      success: true,
      runId: 7,
      artifacts: {},
    });
  });

  it("processes a pending run and forwards the selected model override", async () => {
    mocks.getPendingWorkflowRunsMock.mockResolvedValue([
      {
        id: 7,
        userId: 3,
        selectedModel: "mistral-small",
        status: "pending",
        createdAt: new Date(),
      },
    ]);

    const worker = new WorkflowWorker({
      workerId: "test-worker",
      pollIntervalMs: 1_000,
      staleRunThresholdMs: 60_000,
      maxRunsPerTick: 1,
    });

    const processedRuns = await worker.runOnce();

    expect(processedRuns).toBe(1);
    expect(mocks.executeWorkflowMock).toHaveBeenCalledWith(7, 3, {
      modelId: "mistral-small",
    });
    expect(mocks.connectionQueryMock).toHaveBeenCalledWith(
      "SELECT GET_LOCK(?, 0) AS acquired",
      ["workflow-run:7"]
    );
    expect(mocks.createWorkflowRunEventMock).toHaveBeenCalledWith(
      7,
      3,
      expect.objectContaining({
        eventType: "run_claimed",
        source: "worker",
      })
    );
    expect(mocks.connectionReleaseMock).toHaveBeenCalledTimes(1);
  });

  it("skips execution when another worker already holds the run lock", async () => {
    mocks.connectionQueryMock.mockImplementation(async (query: string) => {
      if (query.includes("GET_LOCK")) {
        return [[{ acquired: 0 }], undefined];
      }

      return [[], undefined];
    });

    mocks.getPendingWorkflowRunsMock.mockResolvedValue([
      {
        id: 9,
        userId: 4,
        selectedModel: null,
        status: "pending",
        createdAt: new Date(),
      },
    ]);

    const worker = new WorkflowWorker({
      workerId: "test-worker",
      pollIntervalMs: 1_000,
      staleRunThresholdMs: 60_000,
      maxRunsPerTick: 1,
    });

    const processedRuns = await worker.runOnce();

    expect(processedRuns).toBe(0);
    expect(mocks.executeWorkflowMock).not.toHaveBeenCalled();
    expect(mocks.connectionReleaseMock).toHaveBeenCalledTimes(1);
  });

  it("marks stale unlocked runs as failed during recovery", async () => {
    mocks.getStaleRunningWorkflowRunsMock.mockResolvedValue([
      {
        id: 11,
        userId: 8,
        status: "running",
        updatedAt: new Date(Date.now() - 600_000),
      },
    ]);

    const worker = new WorkflowWorker({
      workerId: "test-worker",
      pollIntervalMs: 1_000,
      staleRunThresholdMs: 60_000,
      maxRunsPerTick: 1,
    });

    const recoveredRuns = await worker.recoverStaleRuns();

    expect(recoveredRuns).toBe(1);
    expect(mocks.updateWorkflowRunMock).toHaveBeenCalledWith(
      11,
      8,
      expect.objectContaining({
        status: "failed",
        errorMessage: "Workflow worker stopped before finishing this run",
      })
    );
    expect(mocks.poolQueryMock).toHaveBeenCalledWith(
      "SELECT IS_FREE_LOCK(?) AS isFree",
      ["workflow-run:11"]
    );
    expect(mocks.createWorkflowRunEventMock).toHaveBeenCalledWith(
      11,
      8,
      expect.objectContaining({
        eventType: "stale_run_recovered",
        level: "warn",
      })
    );
  });
});