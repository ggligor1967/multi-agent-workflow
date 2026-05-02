import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

/**
 * Integration Tests for Workflow Execution
 * These tests verify the complete workflow execution pipeline
 */

// Mock LLM module
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(async ({ messages, tools, outputSchema }: any) => {
    // Simulate different responses based on input
    const lastMessage = messages[messages.length - 1];
    const content = typeof lastMessage.content === "string" 
      ? lastMessage.content 
      : JSON.stringify(lastMessage.content);
    
    // Simulate tool calling if tools are provided
    if (tools && tools.length > 0) {
      return {
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_123",
              type: "function",
              function: {
                name: tools[0].function.name,
                arguments: JSON.stringify({ code: "console.log('test')", language: "javascript" }),
              },
            }],
          },
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };
    }

    // Simulate structured output
    if (outputSchema) {
      return {
        choices: [{
          message: {
            role: "assistant",
            content: JSON.stringify({ code: "console.log('hello')", language: "javascript" }),
          },
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };
    }

    // Default response
    return {
      choices: [{
        message: {
          role: "assistant",
          content: "Generated code based on: " + content.substring(0, 50),
        },
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    };
  }),
  fetchAvailableModels: vi.fn(async () => ["llama3.2", "mistral", "codellama"]),
  clearModelsCache: vi.fn(),
}));

// Mock db.utils with in-memory storage
const mockStore = {
  configs: new Map<number, any>(),
  runs: new Map<number, any>(),
  steps: new Map<number, any>(),
  events: new Map<number, any>(),
  artifacts: new Map<number, any>(),
  agents: new Map<number, any>(),
  counters: { config: 1, run: 1, step: 1, event: 1, artifact: 1, agent: 1 },
};

vi.mock("../db.utils", () => ({
  createWorkflowConfig: vi.fn(async (userId: number, config: any) => {
    const id = mockStore.counters.config++;
    const record = { id, userId, ...config, createdAt: new Date(), updatedAt: new Date() };
    mockStore.configs.set(id, record);
    return [record];
  }),
  getWorkflowConfigs: vi.fn(async (userId: number) => {
    return Array.from(mockStore.configs.values()).filter(c => c.userId === userId);
  }),
  getWorkflowConfig: vi.fn(async (id: number, userId: number) => {
    const config = mockStore.configs.get(id);
    if (!config || config.userId !== userId) throw new Error("Config not found");
    return config;
  }),
  updateWorkflowConfig: vi.fn(async (id: number, userId: number, updates: any) => {
    const config = mockStore.configs.get(id);
    if (!config || config.userId !== userId) throw new Error("Config not found");
    const updated = { ...config, ...updates, updatedAt: new Date() };
    mockStore.configs.set(id, updated);
    return [updated];
  }),
  deleteWorkflowConfig: vi.fn(async (id: number, userId: number) => {
    const config = mockStore.configs.get(id);
    if (!config || config.userId !== userId) throw new Error("Config not found");
    mockStore.configs.delete(id);
    return { affectedRows: 1 };
  }),
  createWorkflowRun: vi.fn(async (userId: number, run: any) => {
    const id = mockStore.counters.run++;
    const record = { id, userId, ...run, status: "pending", createdAt: new Date(), updatedAt: new Date() };
    mockStore.runs.set(id, record);
    return record;
  }),
  countRecentWorkflowRuns: vi.fn(async (userId: number, createdAfter: Date) => {
    return Array.from(mockStore.runs.values()).filter(
      run => run.userId === userId && run.createdAt >= createdAfter
    ).length;
  }),
  countActiveWorkflowRuns: vi.fn(async (userId: number) => {
    return Array.from(mockStore.runs.values()).filter(
      run => run.userId === userId && (run.status === "pending" || run.status === "running")
    ).length;
  }),
  createWorkflowRunEvent: vi.fn(async (runId: number, userId: number, event: any) => {
    const run = mockStore.runs.get(runId);
    if (!run || run.userId !== userId) throw new Error("Workflow run not found");
    const id = mockStore.counters.event++;
    const record = { id, runId, ...event, createdAt: new Date() };
    mockStore.events.set(id, record);
    return record;
  }),
  listWorkflowRunEvents: vi.fn(async (runId: number, userId: number, limit: number = 100) => {
    const run = mockStore.runs.get(runId);
    if (!run || run.userId !== userId) throw new Error("Workflow run not found");
    return Array.from(mockStore.events.values())
      .filter(event => event.runId === runId)
      .sort((left, right) => right.id - left.id)
      .slice(0, limit);
  }),
  getWorkflowRuns: vi.fn(async (userId: number) => {
    return Array.from(mockStore.runs.values()).filter(r => r.userId === userId);
  }),
  getWorkflowRun: vi.fn(async (id: number, userId: number) => {
    const run = mockStore.runs.get(id);
    if (!run || run.userId !== userId) throw new Error("Workflow run not found");
    return run;
  }),
  assertRunOwner: vi.fn(async (runId: number, userId: number) => {
    const run = mockStore.runs.get(runId);
    if (!run || run.userId !== userId) throw new Error("Workflow run not found");
    return run;
  }),
  updateWorkflowRun: vi.fn(async (id: number, userId: number, updates: any) => {
    const run = mockStore.runs.get(id);
    if (!run || run.userId !== userId) throw new Error("Workflow run not found");
    const updated = { ...run, ...updates, updatedAt: new Date() };
    mockStore.runs.set(id, updated);
    return updated;
  }),
  createWorkflowStep: vi.fn(async (step: any, userId: number) => {
    const run = mockStore.runs.get(step.runId);
    if (!run || run.userId !== userId) throw new Error("Workflow run not found");
    const id = mockStore.counters.step++;
    const record = { id, ...step, createdAt: new Date() };
    mockStore.steps.set(id, record);
    return record;
  }),
  getWorkflowSteps: vi.fn(async (runId: number, userId: number) => {
    const run = mockStore.runs.get(runId);
    if (!run || run.userId !== userId) throw new Error("Workflow run not found");
    return Array.from(mockStore.steps.values()).filter(s => s.runId === runId);
  }),
  updateWorkflowStep: vi.fn(async (id: number, userId: number, updates: any) => {
    const step = mockStore.steps.get(id);
    if (!step) throw new Error("Step not found");
    const run = mockStore.runs.get(step.runId);
    if (!run || run.userId !== userId) throw new Error("Workflow run not found");
    const updated = { ...step, ...updates };
    mockStore.steps.set(id, updated);
    return updated;
  }),
  createArtifact: vi.fn(async (artifact: any, userId: number) => {
    const run = mockStore.runs.get(artifact.runId);
    if (!run || run.userId !== userId) throw new Error("Workflow run not found");
    const id = mockStore.counters.artifact++;
    const record = { id, ...artifact, createdAt: new Date() };
    mockStore.artifacts.set(id, record);
    return record;
  }),
  getArtifacts: vi.fn(async (runId: number, userId: number) => {
    const run = mockStore.runs.get(runId);
    if (!run || run.userId !== userId) throw new Error("Workflow run not found");
    return Array.from(mockStore.artifacts.values()).filter(a => a.runId === runId);
  }),
  getArtifactsByType: vi.fn(async (runId: number, artifactType: string, userId: number) => {
    const run = mockStore.runs.get(runId);
    if (!run || run.userId !== userId) throw new Error("Workflow run not found");
    return Array.from(mockStore.artifacts.values()).filter(
      a => a.runId === runId && a.artifactType === artifactType
    );
  }),
  getAgentConfigs: vi.fn(async (userId: number) => {
    return Array.from(mockStore.agents.values()).filter(a => a.userId === userId);
  }),
  getAgentConfig: vi.fn(async (id: number, userId: number) => {
    const agent = mockStore.agents.get(id);
    if (!agent || agent.userId !== userId) throw new Error("Agent not found");
    return agent;
  }),
  createAgentConfig: vi.fn(async (userId: number, agent: any) => {
    const id = mockStore.counters.agent++;
    const record = { id, userId, ...agent, createdAt: new Date(), updatedAt: new Date() };
    mockStore.agents.set(id, record);
    return [record];
  }),
  updateAgentConfig: vi.fn(async (id: number, userId: number, updates: any) => {
    const agent = mockStore.agents.get(id);
    if (!agent || agent.userId !== userId) throw new Error("Agent not found");
    const updated = { ...agent, ...updates, updatedAt: new Date() };
    mockStore.agents.set(id, updated);
    return [updated];
  }),
}));

// Mock services
vi.mock("../services", async () => {
  const actual = await vi.importActual<typeof import("../services")>("../services");
  return {
    ...actual,
    executeWorkflow: vi.fn(async () => {
      return {
        success: true,
        artifacts: {
          code: "console.log('Generated code')",
          analysis: "Code analysis complete",
        },
      };
    }),
  };
});

// Test context helpers
const createMockContext = (overrides: Partial<TrpcContext> = {}): TrpcContext => {
  const defaultUser = {
    id: 1,
    openId: "test-user-1",
    name: "Test User",
    email: "test-user@example.com",
    loginMethod: "manus",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user: {
      ...defaultUser,
      ...overrides.user,
    },
    req: (overrides.req ?? { protocol: "https", headers: {}, get: () => "localhost" }) as any,
    res: (overrides.res ?? { cookie: vi.fn(), clearCookie: vi.fn() }) as any,
  };
};

describe("Workflow Integration Tests", () => {
  beforeEach(() => {
    // Clear mock stores
    mockStore.configs.clear();
    mockStore.runs.clear();
    mockStore.steps.clear();
    mockStore.events.clear();
    mockStore.artifacts.clear();
    mockStore.agents.clear();
    mockStore.counters = { config: 1, run: 1, step: 1, event: 1, artifact: 1, agent: 1 };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Complete Workflow Lifecycle", () => {
    it("should create config, start run, and complete workflow", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Step 1: Create workflow configuration
      const createResult = await caller.workflow.configs.create({
        name: "Integration Test Workflow",
        description: "A test workflow for integration testing",
        initialTask: "Generate a simple hello world function",
        llmModel: "llama3.2",
        mistralModel: "mistral",
      });

      expect(createResult.success).toBe(true);
      expect(createResult.data).toBeDefined();
      const configId = createResult.data![0].id;

      // Step 2: Start workflow run
      const runResult = await caller.workflow.runs.create({
        configId,
        initialTask: "Generate a simple hello world function",
      });

      expect(runResult.success).toBe(true);
      expect(runResult.data).toBeDefined();
      const runId = runResult.data!.id;

      // Step 3: Verify run was created
      const runDetails = await caller.workflow.runs.get({ id: runId });
      expect(runDetails.success).toBe(true);
      expect(runDetails.data?.run?.id).toBe(runId);
    });

    it("should handle workflow with multiple configurations", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Create multiple configs
      const configs = await Promise.all([
        caller.workflow.configs.create({
          name: "Config 1",
          initialTask: "Task 1",
          llmModel: "llama3.2",
        }),
        caller.workflow.configs.create({
          name: "Config 2",
          initialTask: "Task 2",
          llmModel: "mistral",
        }),
      ]);

      expect(configs.every(c => c.success)).toBe(true);

      // List all configs
      const listResult = await caller.workflow.configs.list();
      expect(listResult.success).toBe(true);
      expect(listResult.data?.length).toBe(2);
    });

    it("should update workflow config and reflect changes", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Create config
      const createResult = await caller.workflow.configs.create({
        name: "Original Name",
        initialTask: "Original Task",
        llmModel: "llama3.2",
      });

      const configId = createResult.data![0].id;

      // Update config
      const updateResult = await caller.workflow.configs.update({
        id: configId,
        name: "Updated Name",
        initialTask: "Updated Task",
      });

      expect(updateResult.success).toBe(true);

      // Verify update
      const getResult = await caller.workflow.configs.get({ id: configId });
      expect(getResult.data?.name).toBe("Updated Name");
      expect(getResult.data?.initialTask).toBe("Updated Task");
    });

    it("should delete workflow config", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Create config
      const createResult = await caller.workflow.configs.create({
        name: "To Be Deleted",
        initialTask: "Task",
        llmModel: "llama3.2",
      });

      const configId = createResult.data![0].id;

      // Delete config
      const deleteResult = await caller.workflow.configs.delete({ id: configId });
      expect(deleteResult.success).toBe(true);

      // Verify deletion
      const listResult = await caller.workflow.configs.list();
      expect(listResult.data?.length).toBe(0);
    });
  });

  describe("Workflow Run History", () => {
    it("should track multiple runs for same config", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Create config
      const configResult = await caller.workflow.configs.create({
        name: "Multi-Run Config",
        initialTask: "Generate code",
        llmModel: "llama3.2",
      });

      const configId = configResult.data![0].id;

      // Start multiple runs
      await caller.workflow.runs.create({ configId, initialTask: "Task 1" });
      await caller.workflow.runs.create({ configId, initialTask: "Task 2" });
      await caller.workflow.runs.create({ configId, initialTask: "Task 3" });

      // List all runs (with required input)
      const runsResult = await caller.workflow.runs.list({ limit: 50, offset: 0 });
      expect(runsResult.success).toBe(true);
      expect(runsResult.data?.length).toBe(3);
    });
  });

  describe("LLM Model Discovery", () => {
    it("should fetch available models", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const modelsResult = await caller.workflow.getAvailableModels();
      expect(modelsResult.success).toBe(true);
      expect(modelsResult.data).toContain("llama3.2");
      expect(modelsResult.data).toContain("mistral");
    });
  });
});

describe("Multi-User Isolation", () => {
  it("should isolate workflow configs between users", async () => {
    const user1Ctx = createMockContext({ 
      user: {
        id: 1,
        openId: "user-1",
        name: "User 1",
        email: "user1@example.com",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      }
    });
    const user2Ctx = createMockContext({ 
      user: {
        id: 2,
        openId: "user-2",
        name: "User 2",
        email: "user2@example.com",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      }
    });

    const caller1 = appRouter.createCaller(user1Ctx);
    const caller2 = appRouter.createCaller(user2Ctx);

    // User 1 creates config
    await caller1.workflow.configs.create({
      name: "User 1 Config",
      initialTask: "Task 1",
      llmModel: "llama3.2",
    });

    // User 2 creates config
    await caller2.workflow.configs.create({
      name: "User 2 Config",
      initialTask: "Task 2",
      llmModel: "mistral",
    });

    // Each user should only see their own configs
    const user1Configs = await caller1.workflow.configs.list();
    const user2Configs = await caller2.workflow.configs.list();

    expect(user1Configs.data?.length).toBe(1);
    expect(user1Configs.data?.[0].name).toBe("User 1 Config");

    expect(user2Configs.data?.length).toBe(1);
    expect(user2Configs.data?.[0].name).toBe("User 2 Config");
  });

  it("should prevent user from accessing another user's config", async () => {
    const user1Ctx = createMockContext({ 
      user: {
        id: 1,
        openId: "user-1",
        name: "User 1",
        email: "user1@example.com",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      }
    });
    const user2Ctx = createMockContext({ 
      user: {
        id: 2,
        openId: "user-2",
        name: "User 2",
        email: "user2@example.com",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      }
    });

    const caller1 = appRouter.createCaller(user1Ctx);
    const caller2 = appRouter.createCaller(user2Ctx);

    // User 1 creates config
    const result = await caller1.workflow.configs.create({
      name: "Private Config",
      initialTask: "Task",
      llmModel: "llama3.2",
    });

    const configId = result.data![0].id;

    // User 2 tries to access User 1's config
    const accessResult = await caller2.workflow.configs.get({ id: configId });
    expect(accessResult.success).toBe(false);
    expect(accessResult.error).toBe("Config not found");
  });
});
