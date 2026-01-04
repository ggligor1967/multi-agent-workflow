import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

export interface WorkflowConfig {
  id: number;
  name: string;
  description?: string;
  initialTask: string;
  llmModel: string;
  mistralModel: string;
  isActive: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowRun {
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  initialTask: string;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}

export interface WorkflowStep {
  id: number;
  runId: number;
  stepName: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
  errorMessage?: string;
  createdAt: Date;
}

export interface Artifact {
  id: number;
  runId: number;
  artifactType: string;
  content: string;
  mimeType: string;
  createdAt: Date;
}

export function useWorkflows() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Workflow Configs
  const listConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await trpc.workflow.configs.list.useQuery().data;
      return result?.success ? result.data : [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch configs";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getConfig = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await trpc.workflow.configs.get.useQuery({ id }).data;
      return result?.success ? result.data : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch config";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createConfig = useCallback(
    async (config: {
      name: string;
      description?: string;
      initialTask: string;
      llmModel?: string;
      mistralModel?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const createMutation = trpc.workflow.configs.create.useMutation();
        const result = await createMutation.mutateAsync(config);
        return result.success ? result.data : null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create config";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateConfig = useCallback(
    async (
      id: number,
      updates: Partial<Omit<WorkflowConfig, "id" | "createdAt" | "updatedAt">>
    ) => {
      setLoading(true);
      setError(null);
      try {
        const updateMutation = trpc.workflow.configs.update.useMutation();
        const result = await updateMutation.mutateAsync({ id, ...updates });
        return result.success ? result.data : null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update config";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteConfig = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const deleteMutation = trpc.workflow.configs.delete.useMutation();
      const result = await deleteMutation.mutateAsync({ id });
      return result.success;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete config";
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Workflow Runs
  const listRuns = useCallback(async (limit = 50, offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const result = await trpc.workflow.runs.list.useQuery({ limit, offset }).data;
      return result?.success ? result.data : [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch runs";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getRun = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await trpc.workflow.runs.get.useQuery({ id }).data;
      return result?.success ? result.data : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch run";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createRun = useCallback(
    async (data: { configId?: number; initialTask: string; modelId?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const createMutation = trpc.workflow.runs.create.useMutation();
        const result = await createMutation.mutateAsync(data);
        return result.success ? result.data : null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create run";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateRunStatus = useCallback(
    async (
      id: number,
      status: "pending" | "running" | "completed" | "failed",
      errorMessage?: string
    ) => {
      setLoading(true);
      setError(null);
      try {
        const updateMutation = trpc.workflow.runs.updateStatus.useMutation();
        const result = await updateMutation.mutateAsync({
          id,
          status,
          errorMessage,
        });
        return result.success ? result.data : null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update run status";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Workflow Steps
  const listSteps = useCallback(async (runId: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await trpc.workflow.steps.list.useQuery({ runId }).data;
      return result?.success ? result.data : [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch steps";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createStep = useCallback(
    async (runId: number, stepName: string) => {
      setLoading(true);
      setError(null);
      try {
        const createMutation = trpc.workflow.steps.create.useMutation();
        const result = await createMutation.mutateAsync({
          runId,
          stepName: stepName as any,
        });
        return result.success ? result.data : null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create step";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );


  const updateStepStatus = useCallback(
    async (
      id: number,
      status: "pending" | "running" | "completed" | "failed",
      output?: string,
      errorMessage?: string
    ) => {
      setLoading(true);
      setError(null);
      try {
        const updateMutation = trpc.workflow.steps.updateStatus.useMutation();
        const result = await updateMutation.mutateAsync({
          id,
          status,
          output,
          errorMessage,
        });
        return result.success ? result.data : null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update step status";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Artifacts
  const listArtifacts = useCallback(async (runId: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await trpc.workflow.artifacts.list.useQuery({ runId }).data;
      return result?.success ? result.data : [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch artifacts";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getArtifactsByType = useCallback(
    async (runId: number, artifactType: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await trpc.workflow.artifacts.getByType.useQuery({
          runId,
          artifactType,
        }).data;
        return result?.success ? result.data : [];
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch artifacts";
        setError(message);
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const createArtifact = useCallback(
    async (data: {
      runId: number;
      artifactType: string;
      content: string;
      mimeType?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const createMutation = trpc.workflow.artifacts.create.useMutation();
        const result = await createMutation.mutateAsync(data as any);
        return result.success ? result.data : null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create artifact";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Agents
  const listAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await trpc.workflow.agents.list.useQuery().data;
      return result?.success ? result.data : [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch agents";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getAgent = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await trpc.workflow.agents.get.useQuery({ id }).data;
      return result?.success ? result.data : null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch agent";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createAgent = useCallback(
    async (data: {
      agentType: string;
      role: string;
      goal: string;
      backstory: string;
      llmModel: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const createMutation = trpc.workflow.agents.create.useMutation();
        const result = await createMutation.mutateAsync(data as any);
        return result.success ? result.data : null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create agent";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    // Configs
    listConfigs,
    getConfig,
    createConfig,
    updateConfig,
    deleteConfig,
    // Runs
    listRuns,
    getRun,
    createRun,
    updateRunStatus,
    // Steps
    listSteps,
    createStep,
    updateStepStatus,
    // Artifacts
    listArtifacts,
    getArtifactsByType,
    createArtifact,
    // Agents
    listAgents,
    getAgent,
    createAgent,
  };
}
