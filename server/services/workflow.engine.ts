import type { AgentConfig, WorkflowConfig, WorkflowRun, WorkflowStep } from "../../drizzle/schema";
import {
  ContextProviderAgent,
  NanoscriptGeneratorAgent,
  CriticalAnalystAgent,
  type AgentContext,
  type AgentResult,
  type BaseAgent,
  AGENT_TYPES,
} from "../agents";
import * as dbUtils from "../db.utils";
import { workflowEvents } from "../_core/ws";
import { recordWorkflowRunEvent } from "./workflow.observability";

// Basic secret scrubbing to avoid persisting sensitive tokens in artifacts
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(bearer\s+)[A-Za-z0-9._\-]{10,}/gi, "$1[REDACTED]"],
  [/aws_access_key_id\s*=\s*[A-Z0-9]{16,}/gi, "aws_access_key_id=[REDACTED]"],
  [/aws_secret_access_key\s*=\s*[A-Za-z0-9\/+=]{20,}/gi, "aws_secret_access_key=[REDACTED]"],
  [/(AKIA|ASIA)[A-Z0-9]{16}/g, "[REDACTED_AWS_KEY]"],
  [/([A-Za-z0-9_-]*password[A-Za-z0-9_-]*|secret|token|api[_-]?key)\s*[:=]\s*["']?([^\s"']{12,})["']?/gi, "$1=[REDACTED]"],
];

const scrubSensitiveData = (content: string): string => {
  return SECRET_PATTERNS.reduce((acc, [regex, replacement]) => acc.replace(regex, replacement), content);
};

/**
 * Workflow step names matching the schema and copilot-instructions.md
 */
export const WORKFLOW_STEPS = {
  SETUP: "setup",
  INITIALIZATION: "initialization",
  ORCHESTRATION: "orchestration",
  SYNCHRONIZATION: "synchronization",
} as const;

export type WorkflowStepName = (typeof WORKFLOW_STEPS)[keyof typeof WORKFLOW_STEPS];

/**
 * Step status values
 */
type StepStatus = "pending" | "running" | "completed" | "failed";

/**
 * Workflow execution result
 */
export interface WorkflowExecutionResult {
  success: boolean;
  runId: number;
  artifacts: Record<string, string>;
  error?: string;
}

/**
 * WorkflowEngine orchestrates the multi-agent workflow execution.
 *
 * Flow:
 * 1. Setup - Initialize run, load agent configs
 * 2. Initialization - Context Provider gathers domain context
 * 3. Orchestration - Nanoscript Generator produces code with context
 * 4. Synchronization - Critical Analyst reviews and refines
 */
export class WorkflowEngine {
  private runId: number;
  private userId: number;
  private selectedModel?: string;
  private workflowRun: WorkflowRun | null = null;
  private workflowConfig: WorkflowConfig | null = null;
  private agentConfigs: Map<string, AgentConfig> = new Map();
  private agents: Map<string, BaseAgent> = new Map();
  private stepRecords: Map<string, WorkflowStep> = new Map();
  private artifacts: Record<string, string> = {};

  constructor(runId: number, userId: number, modelId?: string) {
    this.runId = runId;
    this.userId = userId;
    this.selectedModel = modelId;
  }

  private getDurationMs(
    start: Date | string | null | undefined,
    end: Date | string | null | undefined
  ): number | null {
    if (!start || !end) {
      return null;
    }

    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return null;
    }

    return Math.max(0, endDate.getTime() - startDate.getTime());
  }

  /**
   * Execute the complete workflow
   */
  async execute(): Promise<WorkflowExecutionResult> {
    this.log("Starting workflow execution");

    try {
      // Prevent duplicate or concurrent execution for the same run
      await this.ensureRunIsStartable();

      // Step 1: Setup
      await this.executeStep(WORKFLOW_STEPS.SETUP, async () => {
        await this.loadWorkflowRun();
        await this.loadAgentConfigs();
        await this.initializeAgents();
      });

      // Update run status to running
      await this.updateRunStatus("running");

      // Step 2: Initialization - Context Provider
      await this.executeStep(WORKFLOW_STEPS.INITIALIZATION, async () => {
        const result = await this.runContextProvider();
        this.artifacts.context_provider = result.content;
        await this.saveArtifact("context_data", result.content);
      });

      // Step 3: Orchestration - Nanoscript Generator
      await this.executeStep(WORKFLOW_STEPS.ORCHESTRATION, async () => {
        const result = await this.runNanoscriptGenerator();
        this.artifacts.nanoscript_generator = result.content;
        await this.saveArtifact("nanoscript", result.content);
      });

      // Step 4: Synchronization - Critical Analyst
      await this.executeStep(WORKFLOW_STEPS.SYNCHRONIZATION, async () => {
        const result = await this.runCriticalAnalyst();
        this.artifacts.critical_analyst = result.content;
        await this.saveArtifact("analysis", result.content);

        // Save final code - use finalCode from analyst if available, otherwise use generated code
        const finalCode = result.finalCode || this.artifacts.nanoscript_generator || "";
        await this.saveArtifact("final_code", finalCode);
      });

      // Mark run as completed
      await this.updateRunStatus("completed");

      this.log("Workflow execution completed successfully");

      return {
        success: true,
        runId: this.runId,
        artifacts: this.artifacts,
      };
    } catch (error) {
      this.logError("Workflow execution failed", error);
      await this.handleExecutionError(error);

      return {
        success: false,
        runId: this.runId,
        artifacts: this.artifacts,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Ensure the run is in a state that can be started
   */
  private async ensureRunIsStartable(): Promise<void> {
    const run = await dbUtils.getWorkflowRun(this.runId, this.userId);

    if (run.status === "running") {
      throw new Error(`Workflow run ${this.runId} is already running`);
    }

    if (run.status === "completed") {
      throw new Error(`Workflow run ${this.runId} has already completed`);
    }

    // Allow pending and failed runs to be (re)started
    this.workflowRun = run;
  }

  /**
   * Execute a single workflow step with status tracking
   */
  private async executeStep(
    stepName: WorkflowStepName,
    executor: () => Promise<void>
  ): Promise<void> {
    this.log(`Starting step: ${stepName}`);

    // Create step record
    const stepRecord = await this.createStepRecord(stepName);
    this.stepRecords.set(stepName, stepRecord);

    // Mark step as running
    await this.updateStepStatus(stepRecord.id, "running");

    try {
      await executor();

      // Mark step as completed
      await this.updateStepStatus(stepRecord.id, "completed");
      this.log(`Step completed: ${stepName}`);
    } catch (error) {
      // Mark step as failed
      await this.updateStepStatus(
        stepRecord.id,
        "failed",
        error instanceof Error ? error.message : "Unknown error"
      );
      throw error;
    }
  }

  /**
   * Load workflow run from database
   */
  private async loadWorkflowRun(): Promise<void> {
    this.workflowRun = await dbUtils.getWorkflowRun(this.runId, this.userId);

    if (!this.workflowRun) {
      throw new Error(`Workflow run ${this.runId} not found`);
    }

    // Load workflow config if exists
    if (this.workflowRun.configId) {
      this.workflowConfig = await dbUtils.getWorkflowConfig(
        this.workflowRun.configId,
        this.userId
      );
    }

    if (!this.selectedModel && this.workflowRun.selectedModel) {
      this.selectedModel = this.workflowRun.selectedModel;
    }

    this.log(`Loaded workflow run: ${this.runId}`);
  }

  /**
   * Load agent configurations for the user
   */
  private async loadAgentConfigs(): Promise<void> {
    // Try to load user's agent configs
    const configs = await dbUtils.getAgentConfigs(this.userId);

    // Map configs by agent type
    for (const config of configs) {
      if (config.isActive) {
        this.agentConfigs.set(config.agentType, config);
      }
    }

    // Create default configs for any missing agents
    await this.ensureDefaultAgentConfigs();

    this.log(`Loaded ${this.agentConfigs.size} agent configurations`);
  }

  /**
   * Ensure default agent configs exist for required agent types
   */
  private async ensureDefaultAgentConfigs(): Promise<void> {
    const defaultModel =
      this.selectedModel ||
      this.workflowConfig?.llmModel ||
      "gemini-2.5-flash";

    const requiredAgents = [
      {
        type: AGENT_TYPES.CONTEXT_PROVIDER,
        role: "Domain Context Specialist",
        goal: "Gather and structure relevant domain knowledge, examples, and constraints for code generation",
        backstory: "Expert at analyzing requirements and finding relevant context",
        llmModel: defaultModel,
      },
      {
        type: AGENT_TYPES.NANOSCRIPT_GENERATOR,
        role: "Code Generation Specialist",
        goal: "Generate clean, well-structured, and functional code based on requirements and context",
        backstory: "Expert programmer with deep knowledge of best practices and design patterns",
        llmModel: defaultModel,
      },
      {
        type: AGENT_TYPES.CRITICAL_ANALYST,
        role: "Code Review Specialist",
        goal: "Review code for bugs, security issues, and improvements; ensure quality standards",
        backstory: "Senior engineer with expertise in code review, security, and best practices",
        llmModel: defaultModel,
      },
    ];

    for (const agent of requiredAgents) {
      if (!this.agentConfigs.has(agent.type)) {
        // Create default config in database
        const created = await dbUtils.createAgentConfig(this.userId, {
          agentType: agent.type,
          role: agent.role,
          goal: agent.goal,
          backstory: agent.backstory,
          llmModel: agent.llmModel,
          isActive: 1,
        });

        if (created && created.length > 0) {
          this.agentConfigs.set(agent.type, created[0]);
        }
      }
    }
  }

  /**
   * Initialize agent instances from configs
   */
  private async initializeAgents(): Promise<void> {
    const applyModelOverride = (config?: AgentConfig) => {
      if (!config) return config;
      if (!this.selectedModel) return config;
      return { ...config, llmModel: this.selectedModel };
    };

    const contextConfig = applyModelOverride(
      this.agentConfigs.get(AGENT_TYPES.CONTEXT_PROVIDER)
    );
    const generatorConfig = applyModelOverride(
      this.agentConfigs.get(AGENT_TYPES.NANOSCRIPT_GENERATOR)
    );
    const analystConfig = applyModelOverride(
      this.agentConfigs.get(AGENT_TYPES.CRITICAL_ANALYST)
    );

    if (!contextConfig || !generatorConfig || !analystConfig) {
      throw new Error("Missing required agent configurations");
    }

    this.agents.set(
      AGENT_TYPES.CONTEXT_PROVIDER,
      new ContextProviderAgent(contextConfig)
    );
    this.agents.set(
      AGENT_TYPES.NANOSCRIPT_GENERATOR,
      new NanoscriptGeneratorAgent(generatorConfig)
    );
    this.agents.set(
      AGENT_TYPES.CRITICAL_ANALYST,
      new CriticalAnalystAgent(analystConfig)
    );

    this.log("Agents initialized");
  }

  /**
   * Run the Context Provider agent
   */
  private async runContextProvider(): Promise<AgentResult> {
    const agent = this.agents.get(AGENT_TYPES.CONTEXT_PROVIDER) as ContextProviderAgent;
    if (!agent) throw new Error("Context Provider agent not initialized");

    const context: AgentContext = {
      initialTask: this.workflowRun!.initialTask,
      metadata: {
        runId: this.runId,
        configId: this.workflowRun!.configId,
      },
    };

    const result = await agent.execute(context);

    if (!result.success) {
      throw new Error(`Context Provider failed: ${result.error}`);
    }

    return result;
  }

  /**
   * Run the Nanoscript Generator agent
   */
  private async runNanoscriptGenerator(): Promise<AgentResult> {
    const agent = this.agents.get(AGENT_TYPES.NANOSCRIPT_GENERATOR) as NanoscriptGeneratorAgent;
    if (!agent) throw new Error("Nanoscript Generator agent not initialized");

    const context: AgentContext = {
      initialTask: this.workflowRun!.initialTask,
      previousArtifacts: {
        context_provider: this.artifacts.context_provider,
      },
      metadata: {
        runId: this.runId,
        configId: this.workflowRun!.configId,
      },
    };

    const result = await agent.execute(context);

    if (!result.success) {
      throw new Error(`Nanoscript Generator failed: ${result.error}`);
    }

    return result;
  }

  /**
   * Run the Critical Analyst agent
   */
  private async runCriticalAnalyst(): Promise<AgentResult> {
    const agent = this.agents.get(AGENT_TYPES.CRITICAL_ANALYST) as CriticalAnalystAgent;
    if (!agent) throw new Error("Critical Analyst agent not initialized");

    const context: AgentContext = {
      initialTask: this.workflowRun!.initialTask,
      previousArtifacts: {
        context_provider: this.artifacts.context_provider,
        nanoscript_generator: this.artifacts.nanoscript_generator,
      },
      metadata: {
        runId: this.runId,
        configId: this.workflowRun!.configId,
      },
    };

    const result = await agent.execute(context);

    if (!result.success) {
      throw new Error(`Critical Analyst failed: ${result.error}`);
    }

    return result;
  }

  /**
   * Create a workflow step record in the database
   */
  private async createStepRecord(stepName: string): Promise<WorkflowStep> {
    const step = await dbUtils.createWorkflowStep({
      runId: this.runId,
      stepName,
      status: "pending",
    }, this.userId);

    return step;
  }

  /**
   * Update workflow step status
   */
  private async updateStepStatus(
    stepId: number,
    status: StepStatus,
    errorMessage?: string
  ): Promise<void> {
    const updates: Record<string, unknown> = { status };
    const timestamp = new Date();

    if (status === "running") {
      updates.startedAt = timestamp;
    } else if (status === "completed" || status === "failed") {
      updates.completedAt = timestamp;
    }

    if (errorMessage) {
      updates.errorMessage = errorMessage;
    }

    const updatedStep = await dbUtils.updateWorkflowStep(stepId, this.userId, updates);
    this.stepRecords.set(updatedStep.stepName, updatedStep);

    const lifecycleEventType =
      status === "running"
        ? "step_started"
        : status === "completed"
          ? "step_completed"
          : "step_failed";
    const lifecycleMessage =
      status === "running"
        ? `Step ${updatedStep.stepName} started`
        : status === "completed"
          ? `Step ${updatedStep.stepName} completed`
          : `Step ${updatedStep.stepName} failed`;

    await recordWorkflowRunEvent({
      runId: this.runId,
      userId: this.userId,
      source: "engine",
      eventType: lifecycleEventType,
      level: status === "failed" ? "error" : "info",
      message: lifecycleMessage,
      metadata: {
        stepId: updatedStep.id,
        stepName: updatedStep.stepName,
        status,
        durationMs:
          status === "completed" || status === "failed"
            ? this.getDurationMs(updatedStep.startedAt, updatedStep.completedAt)
            : null,
        errorMessage: errorMessage ?? null,
      },
    });

    // Emit WebSocket event for real-time updates
    workflowEvents.emitStepUpdate(this.runId, updatedStep.stepName, status);
  }

  /**
   * Update workflow run status
   */
  private async updateRunStatus(
    status: "pending" | "running" | "completed" | "failed",
    errorMessage?: string
  ): Promise<void> {
    const updates: Record<string, unknown> = { status };
    const timestamp = new Date();
    const previousRun = this.workflowRun;

    if (status === "running") {
      updates.startedAt = timestamp;
    } else if (status === "completed" || status === "failed") {
      updates.completedAt = timestamp;
    }

    if (errorMessage) {
      updates.errorMessage = errorMessage;
    }

    await dbUtils.updateWorkflowRun(this.runId, this.userId, updates);

    if (previousRun) {
      this.workflowRun = {
        ...previousRun,
        ...updates,
      } as WorkflowRun;
    }

    const lifecycleEventType =
      status === "running"
        ? "run_started"
        : status === "completed"
          ? "run_completed"
          : status === "failed"
            ? "run_failed"
            : "run_pending";
    const lifecycleMessage =
      status === "running"
        ? "Workflow run started"
        : status === "completed"
          ? "Workflow run completed"
          : status === "failed"
            ? "Workflow run failed"
            : "Workflow run queued";

    await recordWorkflowRunEvent({
      runId: this.runId,
      userId: this.userId,
      source: "engine",
      eventType: lifecycleEventType,
      level: status === "failed" ? "error" : "info",
      message: lifecycleMessage,
      metadata: {
        status,
        selectedModel: this.selectedModel ?? this.workflowRun?.selectedModel ?? null,
        queueLatencyMs:
          status === "running"
            ? this.getDurationMs(previousRun?.createdAt, timestamp)
            : null,
        executionDurationMs:
          status === "completed" || status === "failed"
            ? this.getDurationMs(previousRun?.startedAt, timestamp)
            : null,
        artifactCount: Object.keys(this.artifacts).length,
        errorMessage: errorMessage ?? null,
      },
    });

    // Emit WebSocket event for real-time updates
    workflowEvents.emitRunStatusChanged(this.runId, status, errorMessage);
  }

  /**
   * Save an artifact to the database
   */
  private async saveArtifact(
    artifactType: string,
    content: string,
    mimeType: string = "text/markdown"
  ): Promise<void> {
    const sanitizedContent = scrubSensitiveData(content);
    const artifact = await dbUtils.createArtifact({
      runId: this.runId,
      artifactType,
      content: sanitizedContent,
      mimeType,
    }, this.userId);

    this.log(`Saved artifact: ${artifactType}`);

    await recordWorkflowRunEvent({
      runId: this.runId,
      userId: this.userId,
      source: "engine",
      eventType: "artifact_saved",
      message: `Saved artifact ${artifactType}`,
      metadata: {
        artifactId: artifact.id,
        artifactType,
        mimeType,
        contentBytes: Buffer.byteLength(sanitizedContent, "utf8"),
      },
    });

    // Emit WebSocket event for real-time updates
    workflowEvents.emitArtifactCreated(this.runId, artifactType, artifact.id ?? 0);
  }

  /**
   * Handle execution errors
   */
  private async handleExecutionError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Mark run as failed - guard against secondary failures (e.g. run not found)
    try {
      await this.updateRunStatus("failed", errorMessage);
    } catch (statusError) {
      this.logError("Failed to mark run as failed", statusError);
    }

    // Save error as artifact for debugging - guard against secondary failures
    try {
      await this.saveArtifact(
        "error",
        scrubSensitiveData(
          JSON.stringify(
            {
              message: errorMessage,
              stack: error instanceof Error ? error.stack : undefined,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          )
        ),
        "application/json"
      );
    } catch (artifactError) {
      this.logError("Failed to save error artifact", artifactError);
    }
  }

  /**
   * Logging utility
   */
  private log(message: string): void {
    console.log(
      JSON.stringify({
        scope: "workflow.engine",
        timestamp: new Date().toISOString(),
        runId: this.runId,
        userId: this.userId,
        selectedModel: this.selectedModel ?? this.workflowRun?.selectedModel ?? null,
        message,
      })
    );
  }

  /**
   * Error logging utility
   */
  private logError(message: string, error: unknown): void {
    console.error(
      JSON.stringify({
        scope: "workflow.engine",
        timestamp: new Date().toISOString(),
        runId: this.runId,
        userId: this.userId,
        selectedModel: this.selectedModel ?? this.workflowRun?.selectedModel ?? null,
        message,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

/**
 * Factory function to create and execute a workflow
 */
export async function executeWorkflow(
  runId: number,
  userId: number,
  options?: { modelId?: string }
): Promise<WorkflowExecutionResult> {
  const engine = new WorkflowEngine(runId, userId, options?.modelId);
  return engine.execute();
}
