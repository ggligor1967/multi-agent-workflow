import { getDb } from "./db";
import {
  workflowConfigs,
  workflowRuns,
  workflowSteps,
  artifacts,
  agentConfigs,
  InsertWorkflowConfig,
  InsertWorkflowRun,
  InsertWorkflowStep,
  InsertArtifact,
  InsertAgentConfig,
} from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

/**
 * Workflow Configuration Operations
 */
export async function createWorkflowConfig(
  userId: number,
  config: Omit<InsertWorkflowConfig, "userId">
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const insertResult = await db.insert(workflowConfigs).values({
    ...config,
    userId,
  }).$returningId();
  
  // Fetch and return the created record
  const id = insertResult[0]?.id;
  if (!id) throw new Error("Failed to create config");
  
  const created = await db.select().from(workflowConfigs).where(eq(workflowConfigs.id, id)).limit(1);
  return created;
}

export async function getWorkflowConfigs(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .select()
    .from(workflowConfigs)
    .where(eq(workflowConfigs.userId, userId))
    .orderBy(desc(workflowConfigs.createdAt));
}

export async function getWorkflowConfig(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(workflowConfigs)
    .where(eq(workflowConfigs.id, id))
    .limit(1);

  if (result.length === 0 || result[0].userId !== userId) {
    throw new Error("Workflow config not found");
  }

  return result[0];
}

export async function updateWorkflowConfig(
  id: number,
  userId: number,
  updates: Partial<InsertWorkflowConfig>
) {
  const existing = await getWorkflowConfig(id, userId);
  if (!existing) throw new Error("Workflow config not found");

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .update(workflowConfigs)
    .set(updates)
    .where(eq(workflowConfigs.id, id));
}

export async function deleteWorkflowConfig(id: number, userId: number) {
  const existing = await getWorkflowConfig(id, userId);
  if (!existing) throw new Error("Workflow config not found");

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .delete(workflowConfigs)
    .where(eq(workflowConfigs.id, id));
}

/**
 * Workflow Run Operations
 */
export async function createWorkflowRun(
  userId: number,
  run: Omit<InsertWorkflowRun, "userId">
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(workflowRuns).values({
    ...run,
    userId,
  }).$returningId();
  
  // Fetch and return the created record
  const id = result[0]?.id;
  if (!id) throw new Error("Failed to create run");
  
  const created = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).limit(1);
  return created[0];
}

export async function getWorkflowRuns(userId: number, limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.userId, userId))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getWorkflowRun(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, id))
    .limit(1);

  if (result.length === 0 || result[0].userId !== userId) {
    throw new Error("Workflow run not found");
  }

  return result[0];
}

export async function updateWorkflowRun(
  id: number,
  userId: number,
  updates: Partial<InsertWorkflowRun>
) {
  const existing = await getWorkflowRun(id, userId);
  if (!existing) throw new Error("Workflow run not found");

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .update(workflowRuns)
    .set(updates)
    .where(eq(workflowRuns.id, id));
}

/**
 * Workflow Step Operations
 */
export async function createWorkflowStep(step: InsertWorkflowStep) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(workflowSteps).values(step);
}

export async function getWorkflowSteps(runId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .select()
    .from(workflowSteps)
    .where(eq(workflowSteps.runId, runId))
    .orderBy(workflowSteps.createdAt);
}

export async function updateWorkflowStep(
  id: number,
  updates: Partial<InsertWorkflowStep>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .update(workflowSteps)
    .set(updates)
    .where(eq(workflowSteps.id, id));
}

/**
 * Artifact Operations
 */
export async function createArtifact(artifact: InsertArtifact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(artifacts).values(artifact);
}

export async function getArtifacts(runId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.runId, runId))
    .orderBy(artifacts.createdAt);
}

export async function getArtifactsByType(runId: number, artifactType: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.runId, runId), eq(artifacts.artifactType, artifactType)));
}

/**
 * Agent Configuration Operations
 */
export async function createAgentConfig(
  userId: number,
  config: Omit<InsertAgentConfig, "userId">
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(agentConfigs).values({
    ...config,
    userId,
  });
  // Return the created record by querying it back
  const created = await db
    .select()
    .from(agentConfigs)
    .where(eq(agentConfigs.userId, userId))
    .orderBy(desc(agentConfigs.createdAt))
    .limit(1);
  return created;
}

export async function getAgentConfigs(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .select()
    .from(agentConfigs)
    .where(eq(agentConfigs.userId, userId))
    .orderBy(desc(agentConfigs.createdAt));
}

export async function getAgentConfig(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(agentConfigs)
    .where(eq(agentConfigs.id, id))
    .limit(1);

  if (result.length === 0 || result[0].userId !== userId) {
    throw new Error("Agent config not found");
  }

  return result[0];
}

export async function updateAgentConfig(
  id: number,
  userId: number,
  updates: Partial<InsertAgentConfig>
) {
  const existing = await getAgentConfig(id, userId);
  if (!existing) throw new Error("Agent config not found");

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .update(agentConfigs)
    .set(updates)
    .where(eq(agentConfigs.id, id));
}
