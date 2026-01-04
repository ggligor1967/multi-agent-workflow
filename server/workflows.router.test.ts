import { describe, it, expect, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock services module (executeWorkflow)
vi.mock("./services", () => ({
  executeWorkflow: vi.fn(async () => ({ success: true, artifacts: {} })),
}));

// Mock db.utils module
vi.mock("./db.utils", () => {
  // In-memory storage for tests
  const mockConfigs: Map<number, any> = new Map();
  const mockRuns: Map<number, any> = new Map();
  const mockSteps: Map<number, any> = new Map();
  const mockArtifacts: Map<number, any> = new Map();
  const mockAgents: Map<number, any> = new Map();
  let configIdCounter = 1;
  let runIdCounter = 1;
  let stepIdCounter = 1;
  let artifactIdCounter = 1;
  let agentIdCounter = 1;

  return {
    createWorkflowConfig: vi.fn(async (userId: number, config: any) => {
      const id = configIdCounter++;
      const record = { id, userId, ...config, createdAt: new Date(), updatedAt: new Date() };
      mockConfigs.set(id, record);
      return [record];
    }),
    getWorkflowConfigs: vi.fn(async (userId: number) => {
      return Array.from(mockConfigs.values()).filter(c => c.userId === userId);
    }),
    getWorkflowConfig: vi.fn(async (id: number, userId: number) => {
      const config = mockConfigs.get(id);
      if (!config || config.userId !== userId) throw new Error("Config not found");
      return config;
    }),
    updateWorkflowConfig: vi.fn(async (id: number, userId: number, updates: any) => {
      const config = mockConfigs.get(id);
      if (!config || config.userId !== userId) throw new Error("Config not found");
      const updated = { ...config, ...updates, updatedAt: new Date() };
      mockConfigs.set(id, updated);
      return [updated];
    }),
    deleteWorkflowConfig: vi.fn(async (id: number, userId: number) => {
      const config = mockConfigs.get(id);
      if (!config || config.userId !== userId) throw new Error("Config not found");
      mockConfigs.delete(id);
      return { affectedRows: 1 };
    }),
    createWorkflowRun: vi.fn(async (userId: number, run: any) => {
      const id = runIdCounter++;
      const record = { id, userId, ...run, status: "pending", createdAt: new Date(), updatedAt: new Date() };
      mockRuns.set(id, record);
      return record;
    }),
    getWorkflowRuns: vi.fn(async (userId: number) => {
      return Array.from(mockRuns.values()).filter(r => r.userId === userId);
    }),
    getWorkflowRun: vi.fn(async (id: number, userId: number) => {
      const run = mockRuns.get(id);
      if (!run || run.userId !== userId) throw new Error("Run not found");
      return run;
    }),
    updateWorkflowRun: vi.fn(async (id: number, userId: number, updates: any) => {
      const run = mockRuns.get(id);
      if (!run || run.userId !== userId) throw new Error("Run not found");
      const updated = { ...run, ...updates, updatedAt: new Date() };
      mockRuns.set(id, updated);
      return updated;
    }),
    createWorkflowStep: vi.fn(async (step: any) => {
      const id = stepIdCounter++;
      const record = { id, ...step, createdAt: new Date() };
      mockSteps.set(id, record);
      return [record];
    }),
    getWorkflowSteps: vi.fn(async (runId: number) => {
      return Array.from(mockSteps.values()).filter(s => s.runId === runId);
    }),
    updateWorkflowStep: vi.fn(async (id: number, updates: any) => {
      const step = mockSteps.get(id);
      if (!step) throw new Error("Step not found");
      const updated = { ...step, ...updates };
      mockSteps.set(id, updated);
      return updated;
    }),
    createArtifact: vi.fn(async (artifact: any) => {
      const id = artifactIdCounter++;
      const record = { id, ...artifact, createdAt: new Date() };
      mockArtifacts.set(id, record);
      return [record];
    }),
    getArtifacts: vi.fn(async (runId: number) => {
      return Array.from(mockArtifacts.values()).filter(a => a.runId === runId);
    }),
    getArtifactsByType: vi.fn(async (runId: number, type: string) => {
      return Array.from(mockArtifacts.values()).filter(a => a.runId === runId && a.artifactType === type);
    }),
    createAgentConfig: vi.fn(async (userId: number, config: any) => {
      const id = agentIdCounter++;
      const record = { id, userId, ...config, createdAt: new Date(), updatedAt: new Date() };
      mockAgents.set(id, record);
      return [record];
    }),
    getAgentConfigs: vi.fn(async (userId: number) => {
      return Array.from(mockAgents.values()).filter(a => a.userId === userId);
    }),
    getAgentConfig: vi.fn(async (id: number, userId: number) => {
      const agent = mockAgents.get(id);
      if (!agent || agent.userId !== userId) throw new Error("Agent not found");
      return agent;
    }),
  };
});

// Mock user context
function createAuthContext(userId: number = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      email: `user${userId}@example.com`,
      name: `Test User ${userId}`,
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Workflow Router", () => {
  let ctx: TrpcContext;

  beforeEach(() => {
    ctx = createAuthContext();
  });

  describe("Workflow Configurations", () => {
    it("should list workflow configurations", async () => {
      const caller = appRouter.createCaller(ctx);
      const result = await caller.workflow.configs.list();

      expect(result).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should create a workflow configuration", async () => {
      const caller = appRouter.createCaller(ctx);
      const configData = {
        name: "Test Config",
        description: "Test configuration",
        initialTask: "Generate a Python script",
        llmModel: "gpt-4",
        mistralModel: "mistral-large",
      };

      const result = await caller.workflow.configs.create(configData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].name).toBe(configData.name);
    });

    it("should update a workflow configuration", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a config first
      const createResult = await caller.workflow.configs.create({
        name: "Test Config",
        description: "Test configuration",
        initialTask: "Generate a Python script",
        llmModel: "gpt-4",
        mistralModel: "mistral-large",
      });

      if (!createResult.data || !createResult.data[0]) {
        throw new Error("Failed to create config");
      }

      // Update it
      const updateResult = await caller.workflow.configs.update({
        id: createResult.data[0].id,
        name: "Updated Config",
        description: "Updated description",
        initialTask: "Generate a JavaScript file",
        llmModel: "gpt-3.5-turbo",
        mistralModel: "mistral-medium",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data?.[0]?.name).toBe("Updated Config");
    });

    it("should delete a workflow configuration", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a config first
      const createResult = await caller.workflow.configs.create({
        name: "Test Config",
        description: "Test configuration",
        initialTask: "Generate a Python script",
        llmModel: "gpt-4",
        mistralModel: "mistral-large",
      });

      if (!createResult.data || !createResult.data[0]) {
        throw new Error("Failed to create config");
      }

      // Delete it
      const deleteResult = await caller.workflow.configs.delete({
        id: createResult.data[0].id,
      });

      expect(deleteResult.success).toBe(true);
    });
  });

  describe("Workflow Runs", () => {
    it("should create a workflow run", async () => {
      const caller = appRouter.createCaller(ctx);
      const runData = {
        initialTask: "Generate a Python script for data processing",
      };

      const result = await caller.workflow.runs.create(runData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.status).toBe("pending");
      expect(result.data.initialTask).toBe(runData.initialTask);
    });

    it("should list workflow runs", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a run first
      await caller.workflow.runs.create({
        initialTask: "Test task",
      });

      // List runs
      const result = await caller.workflow.runs.list({
        limit: 10,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it("should get a specific workflow run", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a run first
      const createResult = await caller.workflow.runs.create({
        initialTask: "Test task",
      });

      if (!createResult.data) {
        throw new Error("Failed to create run");
      }

      // Get the run
      const getResult = await caller.workflow.runs.get({
        id: createResult.data.id,
      });

      expect(getResult.success).toBe(true);
      expect(getResult.data.run).toBeDefined();
      expect(getResult.data.run.id).toBe(createResult.data.id);
    });

    it("should update workflow run status", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a run first
      const createResult = await caller.workflow.runs.create({
        initialTask: "Test task",
      });

      if (!createResult.data) {
        throw new Error("Failed to create run");
      }

      // Update status
      const updateResult = await caller.workflow.runs.updateStatus({
        id: createResult.data.id,
        status: "running",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data?.status).toBe("running");
    });
  });

  describe("Workflow Steps", () => {
    it("should create a workflow step", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a run first
      const runResult = await caller.workflow.runs.create({
        initialTask: "Test task",
      });

      if (!runResult.data) {
        throw new Error("Failed to create run");
      }

      // Create a step
      const stepResult = await caller.workflow.steps.create({
        runId: runResult.data.id,
        stepName: "setup",
      });

      expect(stepResult.success).toBe(true);
      expect(stepResult.data).toBeDefined();
      expect(Array.isArray(stepResult.data)).toBe(true);
      expect(stepResult.data[0].stepName).toBe("setup");
    });

    it("should list workflow steps", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a run and step
      const runResult = await caller.workflow.runs.create({
        initialTask: "Test task",
      });

      if (!runResult.data) {
        throw new Error("Failed to create run");
      }

      await caller.workflow.steps.create({
        runId: runResult.data.id,
        stepName: "setup",
      });

      // List steps
      const listResult = await caller.workflow.steps.list({
        runId: runResult.data.id,
      });

      expect(listResult.success).toBe(true);
      expect(Array.isArray(listResult.data)).toBe(true);
      expect(listResult.data.length).toBeGreaterThan(0);
    });

    it("should update workflow step status", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a run and step
      const runResult = await caller.workflow.runs.create({
        initialTask: "Test task",
      });

      if (!runResult.data) {
        throw new Error("Failed to create run");
      }

      const stepResult = await caller.workflow.steps.create({
        runId: runResult.data.id,
        stepName: "setup",
      });

      if (!stepResult.data || !stepResult.data[0]) {
        throw new Error("Failed to create step");
      }

      // Update step status
      const updateResult = await caller.workflow.steps.updateStatus({
        id: stepResult.data[0].id,
        status: "completed",
        output: "Setup completed successfully",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data?.status).toBe("completed");
      expect(updateResult.data?.output).toBe("Setup completed successfully");
    });
  });

  describe("Artifacts", () => {
    it("should create an artifact", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a run first
      const runResult = await caller.workflow.runs.create({
        initialTask: "Test task",
      });

      if (!runResult.data) {
        throw new Error("Failed to create run");
      }

      // Create an artifact
      const artifactResult = await caller.workflow.artifacts.create({
        runId: runResult.data.id,
        artifactType: "nanoscript",
        content: "print('Hello, World!')",
      });

      expect(artifactResult.success).toBe(true);
      expect(artifactResult.data).toBeDefined();
      expect(Array.isArray(artifactResult.data)).toBe(true);
      expect(artifactResult.data[0].artifactType).toBe("nanoscript");
    });

    it("should list artifacts by run", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a run and artifact
      const runResult = await caller.workflow.runs.create({
        initialTask: "Test task",
      });

      if (!runResult.data) {
        throw new Error("Failed to create run");
      }

      await caller.workflow.artifacts.create({
        runId: runResult.data.id,
        artifactType: "nanoscript",
        content: "print('Hello')",
      });

      // List artifacts
      const listResult = await caller.workflow.artifacts.list({
        runId: runResult.data.id,
      });

      expect(listResult.success).toBe(true);
      expect(Array.isArray(listResult.data)).toBe(true);
      expect(listResult.data.length).toBeGreaterThan(0);
    });

    it("should get artifacts by type", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create a run and artifact
      const runResult = await caller.workflow.runs.create({
        initialTask: "Test task",
      });

      if (!runResult.data) {
        throw new Error("Failed to create run");
      }

      await caller.workflow.artifacts.create({
        runId: runResult.data.id,
        artifactType: "nanoscript",
        content: "print('Hello')",
      });

      // Get by type
      const typeResult = await caller.workflow.artifacts.getByType({
        runId: runResult.data.id,
        artifactType: "nanoscript",
      });

      expect(typeResult.success).toBe(true);
      expect(Array.isArray(typeResult.data)).toBe(true);
      expect(typeResult.data.length).toBeGreaterThan(0);
    });
  });

  describe("Agents", () => {
    it("should create an agent configuration", async () => {
      const caller = appRouter.createCaller(ctx);
      const agentData = {
        agentType: "nanoscript_generator" as const,
        role: "developer",
        goal: "Generate Python code",
        backstory: "Expert Python developer",
        llmModel: "gpt-4",
      };

      const result = await caller.workflow.agents.create(agentData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].agentType).toBe(agentData.agentType);
    });

    it("should list agent configurations", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create an agent first
      await caller.workflow.agents.create({
        agentType: "context_provider" as const,
        role: "developer",
        goal: "Generate Python code",
        backstory: "Expert Python developer",
        llmModel: "gpt-4",
      });

      // List agents
      const result = await caller.workflow.agents.list();

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it("should get a specific agent", async () => {
      const caller = appRouter.createCaller(ctx);

      // Create an agent first
      const createResult = await caller.workflow.agents.create({
        agentType: "critical_analyst" as const,
        role: "developer",
        goal: "Generate Python code",
        backstory: "Expert Python developer",
        llmModel: "gpt-4",
      });

      if (!createResult.data || !createResult.data[0]) {
        throw new Error("Failed to create agent");
      }

      // Get the agent
      const getResult = await caller.workflow.agents.get({
        id: createResult.data[0].id,
      });

      expect(getResult.success).toBe(true);
      expect(getResult.data).toBeDefined();
      expect(getResult.data.id).toBe(createResult.data[0].id);
    });
  });
});
