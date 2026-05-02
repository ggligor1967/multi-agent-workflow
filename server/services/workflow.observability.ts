import type {
  Artifact,
  WorkflowRun,
  WorkflowRunEvent,
  WorkflowStep,
} from "../../drizzle/schema";
import * as dbUtils from "../db.utils";
import { workflowEvents } from "../_core/ws";

export type WorkflowObservabilityLevel = "info" | "warn" | "error";

export interface WorkflowRunEventMetadata {
  [key: string]: unknown;
}

export interface WorkflowRunEventView
  extends Omit<WorkflowRunEvent, "metadata"> {
  metadata: WorkflowRunEventMetadata | null;
}

export interface WorkflowStepMetric {
  stepName: string;
  status: string;
  durationMs: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface WorkflowRunMetrics {
  queueLatencyMs: number | null;
  executionDurationMs: number | null;
  totalLifecycleDurationMs: number;
  currentQueueAgeMs: number | null;
  currentExecutionAgeMs: number | null;
  timeToFirstArtifactMs: number | null;
  artifactCount: number;
  totalEventCount: number;
  warningEventCount: number;
  errorEventCount: number;
  completedStepCount: number;
  failedStepCount: number;
  lastEventAt: Date | null;
  stepDurations: WorkflowStepMetric[];
}

export interface RecordWorkflowRunEventInput {
  runId: number;
  userId: number;
  source: string;
  eventType: string;
  message: string;
  level?: WorkflowObservabilityLevel;
  metadata?: WorkflowRunEventMetadata;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffMs(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined
): number | null {
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!startDate || !endDate) {
    return null;
  }

  return Math.max(0, endDate.getTime() - startDate.getTime());
}

function safeSerializeMetadata(metadata?: WorkflowRunEventMetadata): string | null {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  try {
    return JSON.stringify(metadata);
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function structuredLog(
  level: WorkflowObservabilityLevel,
  payload: Record<string, unknown>
): void {
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function parseWorkflowRunEventMetadata(
  metadata: string | null
): WorkflowRunEventMetadata | null {
  if (!metadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === "object"
      ? (parsed as WorkflowRunEventMetadata)
      : null;
  } catch {
    return { rawMetadata: metadata, parseError: true };
  }
}

export function hydrateWorkflowRunEvent(
  event: WorkflowRunEvent
): WorkflowRunEventView {
  return {
    ...event,
    metadata: parseWorkflowRunEventMetadata(event.metadata),
  };
}

export async function recordWorkflowRunEvent(
  input: RecordWorkflowRunEventInput
): Promise<WorkflowRunEvent | null> {
  const level = input.level ?? "info";
  const payload = {
    scope: "workflow.lifecycle",
    timestamp: new Date().toISOString(),
    runId: input.runId,
    userId: input.userId,
    source: input.source,
    eventType: input.eventType,
    level,
    message: input.message,
    metadata: input.metadata ?? null,
  };

  structuredLog(level, payload);

  try {
    const created = await dbUtils.createWorkflowRunEvent(input.runId, input.userId, {
      source: input.source,
      eventType: input.eventType,
      level,
      message: input.message,
      metadata: safeSerializeMetadata(input.metadata),
    });

    workflowEvents.emitLifecycleEvent(input.runId, input.eventType, level, input.message);
    return created;
  } catch (error) {
    structuredLog("warn", {
      scope: "workflow.lifecycle",
      timestamp: new Date().toISOString(),
      runId: input.runId,
      source: input.source,
      eventType: input.eventType,
      message: "Failed to persist workflow lifecycle event",
      persistError: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}

export function buildWorkflowRunMetrics(
  run: WorkflowRun,
  steps: WorkflowStep[],
  artifacts: Artifact[],
  events: WorkflowRunEvent[]
): WorkflowRunMetrics {
  const now = new Date();
  const sortedArtifacts = [...artifacts].sort((left, right) => {
    return toDate(left.createdAt)!.getTime() - toDate(right.createdAt)!.getTime();
  });
  const firstArtifactAt = sortedArtifacts[0]?.createdAt ?? null;
  const queueLatencyMs = diffMs(run.createdAt, run.startedAt);
  const executionDurationMs = run.startedAt
    ? diffMs(run.startedAt, run.completedAt ?? now)
    : null;
  const totalLifecycleDurationMs = diffMs(run.createdAt, run.completedAt ?? now) ?? 0;
  const currentQueueAgeMs = run.status === "pending" ? diffMs(run.createdAt, now) : null;
  const currentExecutionAgeMs = run.status === "running" ? diffMs(run.startedAt, now) : null;
  const timeToFirstArtifactMs = firstArtifactAt
    ? diffMs(run.startedAt ?? run.createdAt, firstArtifactAt)
    : null;
  const warningEventCount = events.filter(event => event.level === "warn").length;
  const errorEventCount = events.filter(event => event.level === "error").length;
  const lastEventAt = events.reduce<Date | null>((latest, event) => {
    const candidate = toDate(event.createdAt);
    if (!candidate) {
      return latest;
    }

    if (!latest || candidate.getTime() > latest.getTime()) {
      return candidate;
    }

    return latest;
  }, null);

  return {
    queueLatencyMs,
    executionDurationMs,
    totalLifecycleDurationMs,
    currentQueueAgeMs,
    currentExecutionAgeMs,
    timeToFirstArtifactMs,
    artifactCount: artifacts.length,
    totalEventCount: events.length,
    warningEventCount,
    errorEventCount,
    completedStepCount: steps.filter(step => step.status === "completed").length,
    failedStepCount: steps.filter(step => step.status === "failed").length,
    lastEventAt,
    stepDurations: steps.map(step => ({
      stepName: step.stepName,
      status: step.status,
      durationMs:
        step.status === "running"
          ? diffMs(step.startedAt, now)
          : diffMs(step.startedAt, step.completedAt),
      startedAt: toDate(step.startedAt),
      completedAt: toDate(step.completedAt),
    })),
  };
}