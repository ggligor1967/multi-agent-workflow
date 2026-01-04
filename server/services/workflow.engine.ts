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

  /**
   * Execute the complete workflow
   */
  async execute(): Promise<WorkflowExecutionResult> {
    this.log("Starting workflow execution");

    try {
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
    await dbUtils.createWorkflowStep({
      runId: this.runId,
      stepName,
      status: "pending",
    });

    // Fetch the created record
    const steps = await dbUtils.getWorkflowSteps(this.runId);
    const step = steps.find((s: WorkflowStep) => s.stepName === stepName);

    if (!step) {
      throw new Error(`Failed to create step record: ${stepName}`);
    }

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

    if (status === "running") {
      updates.startedAt = new Date();
    } else if (status === "completed" || status === "failed") {
      updates.completedAt = new Date();
    }

    if (errorMessage) {
      updates.errorMessage = errorMessage;
    }

    await dbUtils.updateWorkflowStep(stepId, updates);

    // Emit WebSocket event for real-time updates
    const step = Array.from(this.stepRecords.values()).find(s => s.id === stepId);
    if (step) {
      workflowEvents.emitStepUpdate(this.runId, step.stepName, status);
    }
  }

  /**
   * Update workflow run status
   */
  private async updateRunStatus(
    status: "pending" | "running" | "completed" | "failed",
    errorMessage?: string
  ): Promise<void> {
    const updates: Record<string, unknown> = { status };

    if (status === "running") {
      updates.startedAt = new Date();
    } else if (status === "completed" || status === "failed") {
      updates.completedAt = new Date();
    }

    if (errorMessage) {
      updates.errorMessage = errorMessage;
    }

    await dbUtils.updateWorkflowRun(this.runId, this.userId, updates);

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
    const result = await dbUtils.createArtifact({
      runId: this.runId,
      artifactType,
      content,
      mimeType,
    });

    this.log(`Saved artifact: ${artifactType}`);

    // Emit WebSocket event for real-time updates
    // The result from createArtifact returns a ResultSetHeader with insertId
    const insertResult = result as unknown as { insertId?: number };
    const artifactId = insertResult?.insertId || 0;
    workflowEvents.emitArtifactCreated(this.runId, artifactType, artifactId);
  }

  /**
   * Handle execution errors
   */
  private async handleExecutionError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Mark run as failed
    await this.updateRunStatus("failed", errorMessage);

    // Save error as artifact for debugging
    await this.saveArtifact(
      "error",
      JSON.stringify(
        {
          message: errorMessage,
          timestamp: new Date().toISOString(),
          artifacts: this.artifacts,
        },
        null,
        2
      ),
      "application/json"
    );
  }

  /**
   * Logging utility
   */
  private log(message: string): void {
    console.log(`[WorkflowEngine:${this.runId}] ${message}`);
  }

  /**
   * Error logging utility
   */
  private logError(message: string, error: unknown): void {
    console.error(
      `[WorkflowEngine:${this.runId}] ${message}:`,
      error instanceof Error ? error.message : error
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
