import { getDb } from "./db";
import {
  workflowConfigs,
  workflowRuns,
  workflowSteps,
  workflowRunEvents,
  artifacts,
  agentConfigs,
  InsertWorkflowConfig,
  InsertWorkflowRun,
  InsertWorkflowStep,
  InsertWorkflowRunEvent,
  InsertArtifact,
  InsertAgentConfig,
} from "../drizzle/schema";
import { eq, desc, and, asc, lt, gte, inArray } from "drizzle-orm";

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

export async function countRecentWorkflowRuns(userId: number, createdAfter: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const runs = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.userId, userId),
        gte(workflowRuns.createdAt, createdAfter)
      )
    );

  return runs.length;
}

export async function countActiveWorkflowRuns(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const runs = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.userId, userId),
        inArray(workflowRuns.status, ["pending", "running"])
      )
    );

  return runs.length;
}

export async function getPendingWorkflowRuns(limit = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.status, "pending"))
    .orderBy(asc(workflowRuns.createdAt))
    .limit(limit);
}

export async function getStaleRunningWorkflowRuns(staleBefore: Date, limit = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.status, "running"), lt(workflowRuns.updatedAt, staleBefore)))
    .orderBy(asc(workflowRuns.updatedAt))
    .limit(limit);
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

export async function assertRunOwner(runId: number, userId: number) {
  return getWorkflowRun(runId, userId);
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

export async function createWorkflowRunEvent(
  runId: number,
  userId: number,
  event: Omit<InsertWorkflowRunEvent, "runId">
) {
  await assertRunOwner(runId, userId);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .insert(workflowRunEvents)
    .values({
      ...event,
      runId,
    })
    .$returningId();

  const id = result[0]?.id;
  if (!id) throw new Error("Failed to create workflow run event");

  const created = await db
    .select()
    .from(workflowRunEvents)
    .where(eq(workflowRunEvents.id, id))
    .limit(1);

  return created[0];
}

export async function listWorkflowRunEvents(runId: number, userId: number, limit = 100) {
  await assertRunOwner(runId, userId);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(workflowRunEvents)
    .where(eq(workflowRunEvents.runId, runId))
    .orderBy(desc(workflowRunEvents.createdAt), desc(workflowRunEvents.id))
    .limit(limit);
}

/**
 * Workflow Step Operations
 */
export async function createWorkflowStep(step: InsertWorkflowStep, userId: number) {
  await assertRunOwner(step.runId, userId);

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(workflowSteps).values(step).$returningId();
  const id = result[0]?.id;
  if (!id) throw new Error("Failed to create workflow step");

  const created = await db
    .select()
    .from(workflowSteps)
    .where(eq(workflowSteps.id, id))
    .limit(1);

  return created[0];
}

export async function getWorkflowSteps(runId: number, userId: number) {
  await assertRunOwner(runId, userId);

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
  userId: number,
  updates: Partial<InsertWorkflowStep>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(workflowSteps)
    .where(eq(workflowSteps.id, id))
    .limit(1);

  if (existing.length === 0) {
    throw new Error("Workflow step not found");
  }

  await assertRunOwner(existing[0].runId, userId);

  await db
    .update(workflowSteps)
    .set(updates)
    .where(eq(workflowSteps.id, id));

  const updated = await db
    .select()
    .from(workflowSteps)
    .where(eq(workflowSteps.id, id))
    .limit(1);

  return updated[0];
}

/**
 * Artifact Operations
 */
export async function createArtifact(artifact: InsertArtifact, userId: number) {
  await assertRunOwner(artifact.runId, userId);

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(artifacts).values(artifact).$returningId();
  const id = result[0]?.id;
  if (!id) throw new Error("Failed to create artifact");

  const created = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, id))
    .limit(1);

  return created[0];
}

export async function getArtifacts(runId: number, userId: number) {
  await assertRunOwner(runId, userId);

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.runId, runId))
    .orderBy(artifacts.createdAt);
}

export async function getArtifactsByType(
  runId: number,
  artifactType: string,
  userId: number
) {
  await assertRunOwner(runId, userId);

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
