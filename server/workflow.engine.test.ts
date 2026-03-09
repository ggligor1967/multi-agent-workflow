import { describe, it, expect, beforeEach, vi } from "vitest";
import { WorkflowEngine, executeWorkflow, WORKFLOW_STEPS } from "./services/workflow.engine";

/**
 * Shared in-memory state for database mocks.
 * Using an object so mutations inside the mock factory closures are visible.
 */
const mockDb = {
  steps: [] as Array<{
    id: number;
    runId: number;
    stepName: string;
    status: string;
    startedAt?: Date;
    completedAt?: Date;
    errorMessage?: string;
    createdAt: Date;
  }>,
  counter: 1,
  workflowRuns: new Map<string, Record<string, unknown>>(),
  agentConfigs: [] as Array<Record<string, unknown>>,
  artifacts: [] as Array<Record<string, unknown>>,
};

// ─── Mock: WebSocket events ──────────────────────────────────────────────────
vi.mock("./_core/ws", () => ({
  workflowEvents: {
    emitStepUpdate: vi.fn(),
    emitRunStatusChanged: vi.fn(),
    emitArtifactCreated: vi.fn(),
  },
}));

// ─── Mock: Agent classes ─────────────────────────────────────────────────────
vi.mock("./agents", () => ({
  ContextProviderAgent: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      content: "## Domain Context\nRelevant domain knowledge gathered.",
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    }),
  })),
  NanoscriptGeneratorAgent: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      content: "function hello() { return 'Hello World'; }",
      usage: { prompt_tokens: 150, completion_tokens: 100, total_tokens: 250 },
    }),
  })),
  CriticalAnalystAgent: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      content: "## Analysis\nCode review complete. No issues found.",
      finalCode: "function hello() { return 'Hello World'; }",
      usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
    }),
  })),
  AGENT_TYPES: {
    CONTEXT_PROVIDER: "context_provider",
    NANOSCRIPT_GENERATOR: "nanoscript_generator",
    CRITICAL_ANALYST: "critical_analyst",
  },
}));

// ─── Mock: Database utilities ─────────────────────────────────────────────────
vi.mock("./db.utils", () => ({
  getWorkflowRun: vi.fn(async (id: number, userId: number) => {
    return mockDb.workflowRuns.get(`${id}:${userId}`) ?? null;
  }),
  getWorkflowConfig: vi.fn(async () => null),
  getAgentConfigs: vi.fn(async () => mockDb.agentConfigs),
  createAgentConfig: vi.fn(
    async (userId: number, config: Record<string, unknown>) => {
      const record = {
        id: mockDb.counter++,
        userId,
        isActive: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...config,
      };
      mockDb.agentConfigs.push(record);
      return [record];
    }
  ),
  createWorkflowStep: vi.fn(async (step: Record<string, unknown>) => {
    const record = { id: mockDb.counter++, ...step, createdAt: new Date() };
    mockDb.steps.push(record as (typeof mockDb.steps)[number]);
    return [record];
  }),
  getWorkflowSteps: vi.fn(async (runId: number) => {
    return mockDb.steps.filter((s) => s.runId === runId);
  }),
  updateWorkflowStep: vi.fn(async (id: number, updates: Record<string, unknown>) => {
    const idx = mockDb.steps.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Step not found: ${id}`);
    mockDb.steps[idx] = { ...mockDb.steps[idx], ...updates } as (typeof mockDb.steps)[number];
    return mockDb.steps[idx];
  }),
  updateWorkflowRun: vi.fn(async (id: number, userId: number, updates: Record<string, unknown>) => {
    const key = `${id}:${userId}`;
    const run = mockDb.workflowRuns.get(key);
    if (!run) throw new Error(`Run not found: ${id}`);
    const updated = { ...run, ...updates };
    mockDb.workflowRuns.set(key, updated);
    return updated;
  }),
  createArtifact: vi.fn(async (artifact: Record<string, unknown>) => {
    const record = { id: mockDb.counter++, ...artifact, createdAt: new Date() };
    mockDb.artifacts.push(record);
    return { insertId: record.id };
  }),
}));

// ─── Base workflow run fixture ────────────────────────────────────────────────
const BASE_RUN: Record<string, unknown> = {
  id: 1,
  userId: 100,
  configId: null,
  initialTask: "Generate a hello world function",
  status: "pending",
  createdAt: new Date(),
  updatedAt: new Date(),
  startedAt: null,
  completedAt: null,
  errorMessage: null,
};

describe("WorkflowEngine", () => {
  beforeEach(() => {
    // Reset shared mock state before each test
    mockDb.steps = [];
    mockDb.counter = 1;
    mockDb.workflowRuns = new Map([["1:100", { ...BASE_RUN }]]);
    mockDb.agentConfigs = [];
    mockDb.artifacts = [];
    vi.clearAllMocks();
  });

  // ── WORKFLOW_STEPS constants ─────────────────────────────────────────────
  describe("WORKFLOW_STEPS", () => {
    it("defines the four required step names", () => {
      expect(WORKFLOW_STEPS.SETUP).toBe("setup");
      expect(WORKFLOW_STEPS.INITIALIZATION).toBe("initialization");
      expect(WORKFLOW_STEPS.ORCHESTRATION).toBe("orchestration");
      expect(WORKFLOW_STEPS.SYNCHRONIZATION).toBe("synchronization");
    });
  });

  // ── Successful execution ──────────────────────────────────────────────────
  describe("execute() – happy path", () => {
    it("returns success=true with the run ID", async () => {
      const engine = new WorkflowEngine(1, 100);
      const result = await engine.execute();

      expect(result.success).toBe(true);
      expect(result.runId).toBe(1);
    });

    it("populates context_provider artifact from Context Provider output", async () => {
      const engine = new WorkflowEngine(1, 100);
      const result = await engine.execute();

      expect(result.artifacts.context_provider).toContain("Domain Context");
    });

    it("populates nanoscript_generator artifact from Nanoscript Generator output", async () => {
      const engine = new WorkflowEngine(1, 100);
      const result = await engine.execute();

      expect(result.artifacts.nanoscript_generator).toContain("function hello");
    });

    it("populates critical_analyst artifact from Critical Analyst output", async () => {
      const engine = new WorkflowEngine(1, 100);
      const result = await engine.execute();

      expect(result.artifacts.critical_analyst).toContain("Analysis");
    });

    it("creates one DB step record for each of the 4 workflow steps", async () => {
      const engine = new WorkflowEngine(1, 100);
      await engine.execute();

      const stepNames = mockDb.steps.map((s) => s.stepName);
      expect(stepNames).toContain(WORKFLOW_STEPS.SETUP);
      expect(stepNames).toContain(WORKFLOW_STEPS.INITIALIZATION);
      expect(stepNames).toContain(WORKFLOW_STEPS.ORCHESTRATION);
      expect(stepNames).toContain(WORKFLOW_STEPS.SYNCHRONIZATION);
    });

    it("saves context_data, nanoscript, analysis, and final_code artifacts to the DB", async () => {
      const engine = new WorkflowEngine(1, 100);
      await engine.execute();

      const artifactTypes = mockDb.artifacts.map((a) => a.artifactType);
      expect(artifactTypes).toContain("context_data");
      expect(artifactTypes).toContain("nanoscript");
      expect(artifactTypes).toContain("analysis");
      expect(artifactTypes).toContain("final_code");
    });

    it("marks the workflow run as 'completed' in the DB", async () => {
      const engine = new WorkflowEngine(1, 100);
      await engine.execute();

      const run = mockDb.workflowRuns.get("1:100");
      expect(run?.status).toBe("completed");
    });

    it("auto-creates default agent configs when none exist for the user", async () => {
      const engine = new WorkflowEngine(1, 100);
      await engine.execute();

      // Three default configs should have been created (one per agent type)
      expect(mockDb.agentConfigs.length).toBe(3);
    });

    it("re-uses existing agent configs when they are already present", async () => {
      // Pre-populate all three agent configs
      const types = ["context_provider", "nanoscript_generator", "critical_analyst"];
      for (const agentType of types) {
        mockDb.agentConfigs.push({
          id: mockDb.counter++,
          userId: 100,
          agentType,
          isActive: 1,
          role: "Existing Role",
          goal: "Existing Goal",
          backstory: "Existing Backstory",
          llmModel: "existing-model",
        });
      }

      const engine = new WorkflowEngine(1, 100);
      await engine.execute();

      // No new configs should have been created
      expect(mockDb.agentConfigs.length).toBe(3);
    });
  });

  // ── Model override ────────────────────────────────────────────────────────
  describe("execute() – model override", () => {
    it("accepts a custom modelId and completes successfully", async () => {
      const engine = new WorkflowEngine(1, 100, "gpt-4-turbo");
      const result = await engine.execute();

      expect(result.success).toBe(true);
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────
  describe("execute() – error handling", () => {
    it("returns success=false when the workflow run does not exist", async () => {
      const engine = new WorkflowEngine(999, 100); // unknown run ID
      const result = await engine.execute();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it("returns success=false when user ID does not match the run", async () => {
      const engine = new WorkflowEngine(1, 999); // wrong userId
      const result = await engine.execute();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it("returns success=false when the Context Provider agent fails", async () => {
      const { ContextProviderAgent } = await import("./agents");
      vi.mocked(ContextProviderAgent).mockImplementationOnce(() => ({
        execute: vi.fn().mockResolvedValue({
          success: false,
          content: "",
          error: "LLM timeout",
        }),
      }));

      const engine = new WorkflowEngine(1, 100);
      const result = await engine.execute();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Context Provider failed/i);
    });

    it("returns success=false when the Nanoscript Generator agent fails", async () => {
      const { NanoscriptGeneratorAgent } = await import("./agents");
      vi.mocked(NanoscriptGeneratorAgent).mockImplementationOnce(() => ({
        execute: vi.fn().mockResolvedValue({
          success: false,
          content: "",
          error: "Model unavailable",
        }),
      }));

      const engine = new WorkflowEngine(1, 100);
      const result = await engine.execute();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Nanoscript Generator failed/i);
    });

    it("returns success=false when the Critical Analyst agent fails", async () => {
      const { CriticalAnalystAgent } = await import("./agents");
      vi.mocked(CriticalAnalystAgent).mockImplementationOnce(() => ({
        execute: vi.fn().mockResolvedValue({
          success: false,
          content: "",
          error: "Analysis error",
        }),
      }));

      const engine = new WorkflowEngine(1, 100);
      const result = await engine.execute();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Critical Analyst failed/i);
    });

    it("marks the run as 'failed' in the DB when an agent fails", async () => {
      const { ContextProviderAgent } = await import("./agents");
      vi.mocked(ContextProviderAgent).mockImplementationOnce(() => ({
        execute: vi.fn().mockResolvedValue({
          success: false,
          content: "",
          error: "Agent failure",
        }),
      }));

      const engine = new WorkflowEngine(1, 100);
      await engine.execute();

      const run = mockDb.workflowRuns.get("1:100");
      expect(run?.status).toBe("failed");
    });

    it("does not throw when the run does not exist in the DB", async () => {
      const engine = new WorkflowEngine(999, 100); // non-existent run
      // Should resolve to { success: false }, not throw
      await expect(engine.execute()).resolves.toMatchObject({ success: false });
    });

    it("saves an 'error' artifact to the DB when execution fails", async () => {
      const { ContextProviderAgent } = await import("./agents");
      vi.mocked(ContextProviderAgent).mockImplementationOnce(() => ({
        execute: vi.fn().mockResolvedValue({
          success: false,
          content: "",
          error: "Injected test failure",
        }),
      }));

      const engine = new WorkflowEngine(1, 100);
      await engine.execute();

      const errorArtifact = mockDb.artifacts.find((a) => a.artifactType === "error");
      expect(errorArtifact).toBeDefined();
      expect(typeof errorArtifact?.content).toBe("string");
    });
  });
});

// ─── executeWorkflow factory ──────────────────────────────────────────────────
describe("executeWorkflow (factory function)", () => {
  beforeEach(() => {
    mockDb.steps = [];
    mockDb.counter = 1;
    mockDb.workflowRuns = new Map([["1:100", { ...BASE_RUN }]]);
    mockDb.agentConfigs = [];
    mockDb.artifacts = [];
    vi.clearAllMocks();
  });

  it("creates a WorkflowEngine and executes it, returning success=true", async () => {
    const result = await executeWorkflow(1, 100);

    expect(result.success).toBe(true);
    expect(result.runId).toBe(1);
  });

  it("passes the modelId option through to the engine", async () => {
    const result = await executeWorkflow(1, 100, { modelId: "mistral-large" });

    expect(result.success).toBe(true);
  });

  it("returns success=false for a non-existent run", async () => {
    const result = await executeWorkflow(42, 100);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
