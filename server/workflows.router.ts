import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as dbUtils from "./db.utils";
import { executeWorkflow } from "./services";
import { fetchAvailableModels } from "./_core/llm";
import { observable } from "@trpc/server/observable";
import { workflowEvents, type WorkflowEvent } from "./_core/ws";

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
          initialTask: z.string().min(1),
          llmModel: z.string().default("llama3.2"),
          mistralModel: z.string().default("mistral"),
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
          initialTask: z.string().optional(),
          llmModel: z.string().optional(),
          mistralModel: z.string().optional(),
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
          const run = await dbUtils.getWorkflowRun(input.id, ctx.user.id);
          const steps = await dbUtils.getWorkflowSteps(input.id);
          const artifacts = await dbUtils.getArtifacts(input.id);
          return { success: true, data: { run, steps, artifacts } };
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
          initialTask: z.string().min(1),
          modelId: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const run = await dbUtils.createWorkflowRun(ctx.user.id, {
            configId: input.configId,
            initialTask: input.initialTask,
            status: "pending",
          });

          // Fire-and-forget: Start workflow execution in background
          // Do NOT await - return immediately so UI remains responsive
          executeWorkflow(run.id, ctx.user.id, { modelId: input.modelId }).catch((error) => {
            console.error(
              `[WorkflowRouter] Background execution failed for run ${run.id}:`,
              error instanceof Error ? error.message : error
            );
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
    onUpdate: publicProcedure
      .input(z.object({ runId: z.number() }))
      .subscription(({ input }) => {
        return observable<WorkflowEvent>((emit) => {
          const eventChannel = `workflow:${input.runId}`;

          const onEvent = (event: WorkflowEvent) => {
            emit.next(event);
          };

          // Subscribe to events for this specific run
          workflowEvents.on(eventChannel, onEvent);

          console.log(`[WS] Client subscribed to ${eventChannel}`);

          // Return cleanup function
          return () => {
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
      .query(async ({ input }) => {
        try {
          const steps = await dbUtils.getWorkflowSteps(input.runId);
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
      .mutation(async ({ input }) => {
        try {
          const result = await dbUtils.createWorkflowStep({
            runId: input.runId,
            stepName: input.stepName,
            status: "pending",
          });
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
      .mutation(async ({ input }) => {
        try {
          const { id, status, output, errorMessage } = input;
          const updates: any = { status };
          if (output) updates.output = output;
          if (errorMessage) updates.errorMessage = errorMessage;
          if (status === "running") updates.startedAt = new Date();
          if (status === "completed" || status === "failed") {
            updates.completedAt = new Date();
          }

          const result = await dbUtils.updateWorkflowStep(id, updates);
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
      .query(async ({ input }) => {
        try {
          const artifacts = await dbUtils.getArtifacts(input.runId);
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
      .query(async ({ input }) => {
        try {
          const artifacts = await dbUtils.getArtifactsByType(
            input.runId,
            input.artifactType
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
      .mutation(async ({ input }) => {
        try {
          const result = await dbUtils.createArtifact(input);
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
