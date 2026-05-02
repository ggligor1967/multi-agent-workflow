import { describe, expect, it } from "vitest";
import {
  buildWorkflowRunMetrics,
  hydrateWorkflowRunEvent,
} from "./services/workflow.observability";

describe("workflow observability helpers", () => {
  it("computes queue, execution, and step duration metrics", () => {
    const createdAt = new Date("2026-05-01T10:00:00.000Z");
    const startedAt = new Date("2026-05-01T10:00:05.000Z");
    const completedAt = new Date("2026-05-01T10:00:20.000Z");

    const metrics = buildWorkflowRunMetrics(
      {
        id: 1,
        userId: 1,
        configId: null,
        status: "completed",
        initialTask: "demo",
        selectedModel: "mistral-small",
        startedAt,
        completedAt,
        errorMessage: null,
        createdAt,
        updatedAt: completedAt,
      },
      [
        {
          id: 1,
          runId: 1,
          stepName: "initialization",
          status: "completed",
          startedAt: new Date("2026-05-01T10:00:05.000Z"),
          completedAt: new Date("2026-05-01T10:00:08.000Z"),
          output: null,
          errorMessage: null,
          createdAt,
        },
        {
          id: 2,
          runId: 1,
          stepName: "orchestration",
          status: "completed",
          startedAt: new Date("2026-05-01T10:00:08.000Z"),
          completedAt: new Date("2026-05-01T10:00:16.000Z"),
          output: null,
          errorMessage: null,
          createdAt,
        },
      ],
      [
        {
          id: 1,
          runId: 1,
          artifactType: "context_data",
          content: "{}",
          mimeType: "application/json",
          createdAt: new Date("2026-05-01T10:00:09.000Z"),
        },
      ],
      [
        {
          id: 1,
          runId: 1,
          level: "info",
          source: "api",
          eventType: "run_queued",
          message: "queued",
          metadata: null,
          createdAt,
        },
        {
          id: 2,
          runId: 1,
          level: "warn",
          source: "worker",
          eventType: "run_claimed",
          message: "claimed",
          metadata: null,
          createdAt: startedAt,
        },
        {
          id: 3,
          runId: 1,
          level: "error",
          source: "engine",
          eventType: "step_failed",
          message: "failed",
          metadata: null,
          createdAt: completedAt,
        },
      ]
    );

    expect(metrics.queueLatencyMs).toBe(5_000);
    expect(metrics.executionDurationMs).toBe(15_000);
    expect(metrics.totalLifecycleDurationMs).toBe(20_000);
    expect(metrics.timeToFirstArtifactMs).toBe(4_000);
    expect(metrics.artifactCount).toBe(1);
    expect(metrics.warningEventCount).toBe(1);
    expect(metrics.errorEventCount).toBe(1);
    expect(metrics.stepDurations[0]?.durationMs).toBe(3_000);
    expect(metrics.stepDurations[1]?.durationMs).toBe(8_000);
  });

  it("hydrates persisted metadata into an object", () => {
    const event = hydrateWorkflowRunEvent({
      id: 1,
      runId: 1,
      level: "info",
      source: "worker",
      eventType: "run_claimed",
      message: "Worker claimed queued run",
      metadata: JSON.stringify({ workerId: "worker-1", queueLatencyMs: 2500 }),
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
    });

    expect(event.metadata).toEqual({ workerId: "worker-1", queueLatencyMs: 2500 });
  });
});