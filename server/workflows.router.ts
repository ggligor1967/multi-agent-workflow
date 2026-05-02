import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as dbUtils from "./db.utils";
import { fetchAvailableModels } from "./_core/llm";
import { observable } from "@trpc/server/observable";
import { workflowEvents, type WorkflowEvent } from "./_core/ws";
import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";
import {
  buildWorkflowRunMetrics,
  hydrateWorkflowRunEvent,
  recordWorkflowRunEvent,
} from "./services";

const TASK_INPUT_SCHEMA = z.string().trim().min(1).max(20_000);
const MODEL_ID_SCHEMA = z.string().trim().min(1).max(100);
const WORKFLOW_UPDATE_POLL_INTERVAL_MS = 1_000;

type RequestIpSource = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
};

function getRequestIp(req: RequestIpSource) {
  const forwardedFor = req.headers?.["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return req.ip ?? req.socket?.remoteAddress ?? null;
}

function logRunCreateGuardrailViolation(
  reason: string,
  userId: number,
  req: RequestIpSource,
  metadata?: Record<string, unknown>
) {
  console.warn(
    JSON.stringify({
      scope: "workflow.guardrail",
      timestamp: new Date().toISOString(),
      userId,
      ip: getRequestIp(req),
      reason,
      metadata: metadata ?? null,
    })
  );
}

async function validateRequestedModel(modelId?: string) {
  if (!modelId) {
    return;
  }

  const availableModels = await fetchAvailableModels();
  if (!availableModels.includes(modelId)) {
    throw new Error(
      `Selected model '${modelId}' is not available. Refresh the model list and try again.`
    );
  }
}

type WorkflowRunSnapshot = {
  run: {
    status: string;
    errorMessage: string | null;
  };
  steps: Array<{
    id: number;
    stepName: string;
    status: string;
  }>;
  artifacts: Array<{
    id: number;
    artifactType: string;
  }>;
  latestEvent: {
    id: number;
    eventType: string;
    level: string;
    message: string;
    createdAt: Date;
  } | null;
};

async function loadWorkflowRunSnapshot(
  runId: number,
  userId: number
): Promise<WorkflowRunSnapshot> {
  const [run, steps, artifacts, latestEvents] = await Promise.all([
    dbUtils.getWorkflowRun(runId, userId),
    dbUtils.getWorkflowSteps(runId, userId),
    dbUtils.getArtifacts(runId, userId),
    dbUtils.listWorkflowRunEvents(runId, userId, 1),
  ]);
  const latestEvent = latestEvents[0] ?? null;

  return {
    run: {
      status: run.status,
      errorMessage: run.errorMessage ?? null,
    },
    steps: steps.map(step => ({
      id: step.id,
      stepName: step.stepName,
      status: step.status,
    })),
    artifacts: artifacts.map(artifact => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
    })),
    latestEvent: latestEvent
      ? {
          id: latestEvent.id,
          eventType: latestEvent.eventType,
          level: latestEvent.level,
          message: latestEvent.message,
          createdAt: latestEvent.createdAt,
        }
      : null,
  };
}

function getWorkflowRunSnapshotKey(snapshot: WorkflowRunSnapshot): string {
  return JSON.stringify(snapshot);
}

function buildWorkflowEventFromSnapshotDiff(
  runId: number,
  previousSnapshot: WorkflowRunSnapshot,
  nextSnapshot: WorkflowRunSnapshot
): WorkflowEvent {
  const timestamp = new Date().toISOString();

  if (
    previousSnapshot.run.status !== nextSnapshot.run.status ||
    previousSnapshot.run.errorMessage !== nextSnapshot.run.errorMessage
  ) {
    return {
      type:
        nextSnapshot.run.status === "completed"
          ? "run_completed"
          : nextSnapshot.run.status === "failed"
            ? "run_failed"
            : "run_status_changed",
      runId,
      data: {
        status: nextSnapshot.run.status,
        errorMessage: nextSnapshot.run.errorMessage ?? undefined,
        timestamp,
      },
    };
  }

  const previousSteps = new Map(previousSnapshot.steps.map(step => [step.id, step]));
  const changedStep = nextSnapshot.steps.find(step => {
    const previousStep = previousSteps.get(step.id);
    return !previousStep || previousStep.status !== step.status;
  });

  if (changedStep) {
    return {
      type: "step_update",
      runId,
      data: {
        stepName: changedStep.stepName,
        stepStatus: changedStep.status,
        timestamp,
      },
    };
  }

  const previousArtifactIds = new Set(previousSnapshot.artifacts.map(artifact => artifact.id));
  const createdArtifact = nextSnapshot.artifacts.find(
    artifact => !previousArtifactIds.has(artifact.id)
  );

  if (createdArtifact) {
    return {
      type: "artifact_created",
      runId,
      data: {
        artifactId: createdArtifact.id,
        artifactType: createdArtifact.artifactType,
        timestamp,
      },
    };
  }

  if (
    previousSnapshot.latestEvent?.id !== nextSnapshot.latestEvent?.id &&
    nextSnapshot.latestEvent
  ) {
    return {
      type: "lifecycle_event",
      runId,
      data: {
        lifecycleEventType: nextSnapshot.latestEvent.eventType,
        lifecycleEventLevel: nextSnapshot.latestEvent.level,
        message: nextSnapshot.latestEvent.message,
        timestamp: nextSnapshot.latestEvent.createdAt.toISOString(),
      },
    };
  }

  return {
    type: "run_status_changed",
    runId,
    data: {
      status: nextSnapshot.run.status,
      errorMessage: nextSnapshot.run.errorMessage ?? undefined,
      timestamp,
    },
  };
}

/**
 * Workflow Router - Handles all workflow-related operations
 * Includes configuration management, execution, and history tracking
 */
export const workflowRouter = router({
  /**
   * Available model discovery
   */
  getAvailableModels: protectedProcedure.query(async () => {
    try {
      const models = await fetchAvailableModels();
      return { success: true, data: models };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch models",
      };
    }
  }),

  /**
   * Workflow Configuration Management
   */
  configs: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        const configs = await dbUtils.getWorkflowConfigs(ctx.user.id);
        return { success: true, data: configs };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to fetch configs",
        };
      }
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        try {
          const config = await dbUtils.getWorkflowConfig(input.id, ctx.user.id);
          return { success: true, data: config };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Config not found",
          };
        }
      }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          initialTask: TASK_INPUT_SCHEMA,
          llmModel: MODEL_ID_SCHEMA.default("llama3.2"),
          mistralModel: MODEL_ID_SCHEMA.default("mistral"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await dbUtils.createWorkflowConfig(ctx.user.id, input);
          return { success: true, data: result };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create config",
          };
        }
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          initialTask: TASK_INPUT_SCHEMA.optional(),
          llmModel: MODEL_ID_SCHEMA.optional(),
          mistralModel: MODEL_ID_SCHEMA.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const { id, ...updates } = input;
          const result = await dbUtils.updateWorkflowConfig(id, ctx.user.id, updates);
          return { success: true, data: result };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update config",
          };
        }
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await dbUtils.deleteWorkflowConfig(input.id, ctx.user.id);
          return { success: true, data: result };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to delete config",
          };
        }
      }),
  }),

  /**
   * Workflow Execution Management
   */
  runs: router({
    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        try {
          const runs = await dbUtils.getWorkflowRuns(
            ctx.user.id,
            input.limit,
            input.offset
          );
          return { success: true, data: runs };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to fetch runs",
          };
        }
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        try {
          const [run, steps, artifacts, events] = await Promise.all([
            dbUtils.getWorkflowRun(input.id, ctx.user.id),
            dbUtils.getWorkflowSteps(input.id, ctx.user.id),
            dbUtils.getArtifacts(input.id, ctx.user.id),
            dbUtils.listWorkflowRunEvents(input.id, ctx.user.id),
          ]);
          return {
            success: true,
            data: {
              run,
              steps,
              artifacts,
              events: events.map(hydrateWorkflowRunEvent),
              metrics: buildWorkflowRunMetrics(run, steps, artifacts, events),
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Run not found",
          };
        }
      }),

    create: protectedProcedure
      .input(
        z.object({
          configId: z.number().optional(),
          initialTask: TASK_INPUT_SCHEMA,
          modelId: MODEL_ID_SCHEMA.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          if (input.configId) {
            await dbUtils.getWorkflowConfig(input.configId, ctx.user.id);
          }

          const [recentRuns, activeRuns] = await Promise.all([
            dbUtils.countRecentWorkflowRuns(
              ctx.user.id,
              new Date(Date.now() - ENV.workflowRunCreateWindowMs)
            ),
            dbUtils.countActiveWorkflowRuns(ctx.user.id),
          ]);

          if (activeRuns >= ENV.workflowRunActiveLimit) {
            logRunCreateGuardrailViolation(
              "active-run-limit-exceeded",
              ctx.user.id,
              ctx.req,
              {
                activeRuns,
                limit: ENV.workflowRunActiveLimit,
              }
            );

            return {
              success: false,
              error:
                `Too many active workflow runs (${activeRuns}). ` +
                `Wait for one to finish before starting another.`,
            };
          }

          if (recentRuns >= ENV.workflowRunCreateMaxPerWindow) {
            logRunCreateGuardrailViolation(
              "run-create-rate-limit-exceeded",
              ctx.user.id,
              ctx.req,
              {
                recentRuns,
                limit: ENV.workflowRunCreateMaxPerWindow,
                windowMs: ENV.workflowRunCreateWindowMs,
              }
            );

            return {
              success: false,
              error:
                "Rate limit exceeded for workflow creation. Please wait a few minutes and try again.",
            };
          }

          await validateRequestedModel(input.modelId);

          const run = await dbUtils.createWorkflowRun(ctx.user.id, {
            configId: input.configId,
            initialTask: input.initialTask,
            selectedModel: input.modelId,
            status: "pending",
          });

          await recordWorkflowRunEvent({
            runId: run.id,
            userId: ctx.user.id,
            source: "api",
            eventType: "run_queued",
            message: "Workflow run queued for worker pickup",
            metadata: {
              selectedModel: input.modelId ?? null,
              configId: input.configId ?? null,
            },
          });

          return { success: true, data: run };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create run",
          };
        }
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "running", "completed", "failed"]),
          errorMessage: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const { id, status, errorMessage } = input;
          const updates: any = { status };
          if (errorMessage) updates.errorMessage = errorMessage;
          if (status === "running") updates.startedAt = new Date();
          if (status === "completed" || status === "failed") {
            updates.completedAt = new Date();
          }

          const result = await dbUtils.updateWorkflowRun(id, ctx.user.id, updates);
          return { success: true, data: result };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update run status",
          };
        }
      }),

    /**
     * Real-time subscription for workflow updates
     * Subscribes to events for a specific run ID
     */
    onUpdate: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .subscription(async ({ ctx, input }) => {
        try {
          // Enforce run ownership before subscribing
          await dbUtils.getWorkflowRun(input.runId, ctx.user.id);
        } catch (error) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              error instanceof Error ? error.message : "Unable to access workflow run",
          });
        }

        return observable<WorkflowEvent>((emit) => {
          const eventChannel = `workflow:${input.runId}`;
          let previousSnapshot: WorkflowRunSnapshot | null = null;
          let previousSnapshotKey = "";

          const publishSnapshotDiff = async () => {
            try {
              const nextSnapshot = await loadWorkflowRunSnapshot(input.runId, ctx.user.id);
              const nextSnapshotKey = getWorkflowRunSnapshotKey(nextSnapshot);

              if (!previousSnapshot) {
                previousSnapshot = nextSnapshot;
                previousSnapshotKey = nextSnapshotKey;
                return;
              }

              if (nextSnapshotKey === previousSnapshotKey) {
                return;
              }

              emit.next(
                buildWorkflowEventFromSnapshotDiff(
                  input.runId,
                  previousSnapshot,
                  nextSnapshot
                )
              );

              previousSnapshot = nextSnapshot;
              previousSnapshotKey = nextSnapshotKey;
            } catch (error) {
              console.error(
                `[WS] Failed to poll workflow ${input.runId}:`,
                error instanceof Error ? error.message : error
              );
            }
          };

          const onEvent = () => {
            void publishSnapshotDiff();
          };

          // Subscribe to events for this specific run
          workflowEvents.on(eventChannel, onEvent);
          void publishSnapshotDiff();

          const poller = setInterval(() => {
            void publishSnapshotDiff();
          }, WORKFLOW_UPDATE_POLL_INTERVAL_MS);

          console.log(`[WS] Client subscribed to ${eventChannel}`);

          // Return cleanup function
          return () => {
            clearInterval(poller);
            workflowEvents.off(eventChannel, onEvent);
            console.log(`[WS] Client unsubscribed from ${eventChannel}`);
          };
        });
      }),
  }),

  /**
   * Workflow Steps (Progress Tracking)
   */
  steps: router({
    list: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .query(async ({ ctx, input }) => {
        try {
          const steps = await dbUtils.getWorkflowSteps(input.runId, ctx.user.id);
          return { success: true, data: steps };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to fetch steps",
          };
        }
      }),

    create: protectedProcedure
      .input(
        z.object({
          runId: z.number(),
          stepName: z.enum(["setup", "initialization", "orchestration", "synchronization"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await dbUtils.createWorkflowStep({
            runId: input.runId,
            stepName: input.stepName,
            status: "pending",
          }, ctx.user.id);
          return { success: true, data: result };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create step",
          };
        }
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "running", "completed", "failed"]),
          output: z.string().optional(),
          errorMessage: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const { id, status, output, errorMessage } = input;
          const updates: any = { status };
          if (output) updates.output = output;
          if (errorMessage) updates.errorMessage = errorMessage;
          if (status === "running") updates.startedAt = new Date();
          if (status === "completed" || status === "failed") {
            updates.completedAt = new Date();
          }

          const result = await dbUtils.updateWorkflowStep(id, ctx.user.id, updates);
          return { success: true, data: result };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update step status",
          };
        }
      }),
  }),

  /**
   * Generated Artifacts Management
   */
  artifacts: router({
    list: protectedProcedure
      .input(z.object({ runId: z.number() }))
      .query(async ({ ctx, input }) => {
        try {
          const artifacts = await dbUtils.getArtifacts(input.runId, ctx.user.id);
          return { success: true, data: artifacts };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to fetch artifacts",
          };
        }
      }),

    getByType: protectedProcedure
      .input(
        z.object({
          runId: z.number(),
          artifactType: z.string(),
        })
      )
      .query(async ({ ctx, input }) => {
        try {
          const artifacts = await dbUtils.getArtifactsByType(
            input.runId,
            input.artifactType,
            ctx.user.id
          );
          return { success: true, data: artifacts };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to fetch artifacts",
          };
        }
      }),

    create: protectedProcedure
      .input(
        z.object({
          runId: z.number(),
          artifactType: z.enum([
            "nanoscript",
            "context_data",
            "analysis",
            "final_code",
            "report",
          ]),
          content: z.string(),
          mimeType: z.string().default("text/plain"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await dbUtils.createArtifact(input, ctx.user.id);
          return { success: true, data: result };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create artifact",
          };
        }
      }),
  }),

  /**
   * Agent Configuration Management
   */
  agents: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        const configs = await dbUtils.getAgentConfigs(ctx.user.id);
        return { success: true, data: configs };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to fetch agent configs",
        };
      }
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        try {
          const config = await dbUtils.getAgentConfig(input.id, ctx.user.id);
          return { success: true, data: config };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Agent config not found",
          };
        }
      }),

    create: protectedProcedure
      .input(
        z.object({
          agentType: z.enum([
            "nanoscript_generator",
            "context_provider",
            "critical_analyst",
          ]),
          role: z.string(),
          goal: z.string(),
          backstory: z.string(),
          llmModel: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await dbUtils.createAgentConfig(ctx.user.id, input);
          return { success: true, data: result };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create agent config",
          };
        }
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          role: z.string().optional(),
          goal: z.string().optional(),
          backstory: z.string().optional(),
          llmModel: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const { id, ...updates } = input;
          const result = await dbUtils.updateAgentConfig(id, ctx.user.id, updates);
          return { success: true, data: result };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update agent config",
          };
        }
      }),
  }),
});

export type WorkflowRouter = typeof workflowRouter;
