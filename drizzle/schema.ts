import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Workflow Configuration Tables
export const workflowConfigs = mysqlTable(
  "workflowConfigs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    initialTask: text("initialTask").notNull(),
    llmModel: varchar("llmModel", { length: 64 }).default("llama3.2").notNull(),
    mistralModel: varchar("mistralModel", { length: 64 }).default("mistral").notNull(),
    isActive: int("isActive").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userCreatedIdx: index("workflow_configs_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type WorkflowConfig = typeof workflowConfigs.$inferSelect;
export type InsertWorkflowConfig = typeof workflowConfigs.$inferInsert;

// Workflow Runs (Execution History)
export const workflowRuns = mysqlTable(
  "workflowRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    configId: int("configId").references(() => workflowConfigs.id, {
      onDelete: "set null",
    }),
    status: mysqlEnum("status", ["pending", "running", "completed", "failed"])
      .default("pending")
      .notNull(),
    initialTask: text("initialTask").notNull(),
    selectedModel: varchar("selectedModel", { length: 100 }),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userCreatedIdx: index("workflow_runs_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
    configIdx: index("workflow_runs_config_idx").on(table.configId),
    statusCreatedIdx: index("workflow_runs_status_created_idx").on(
      table.status,
      table.createdAt
    ),
    statusUpdatedIdx: index("workflow_runs_status_updated_idx").on(
      table.status,
      table.updatedAt
    ),
  })
);

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type InsertWorkflowRun = typeof workflowRuns.$inferInsert;

// Workflow Steps (Progress Tracking)
export const workflowSteps = mysqlTable(
  "workflowSteps",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("runId")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    stepName: varchar("stepName", { length: 64 }).notNull(), // "setup", "initialization", "orchestration", "synchronization"
    status: mysqlEnum("status", ["pending", "running", "completed", "failed"])
      .default("pending")
      .notNull(),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    output: text("output"),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    runCreatedIdx: index("workflow_steps_run_created_idx").on(
      table.runId,
      table.createdAt
    ),
  })
);

export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type InsertWorkflowStep = typeof workflowSteps.$inferInsert;

// Workflow Run Lifecycle Events (Observability Timeline)
export const workflowRunEvents = mysqlTable(
  "workflowRunEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("runId")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    level: mysqlEnum("level", ["info", "warn", "error"])
      .default("info")
      .notNull(),
    source: varchar("source", { length: 32 }).notNull(),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    message: text("message").notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    runCreatedIdx: index("workflow_run_events_run_created_idx").on(
      table.runId,
      table.createdAt
    ),
    runTypeIdx: index("workflow_run_events_run_type_idx").on(
      table.runId,
      table.eventType
    ),
  })
);

export type WorkflowRunEvent = typeof workflowRunEvents.$inferSelect;
export type InsertWorkflowRunEvent = typeof workflowRunEvents.$inferInsert;

// Generated Artifacts (Code, Reports, etc.)
export const artifacts = mysqlTable(
  "artifacts",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("runId")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    artifactType: varchar("artifactType", { length: 64 }).notNull(), // "nanoscript", "context_data", "analysis", "final_code", "report"
    content: text("content").notNull(),
    mimeType: varchar("mimeType", { length: 64 }).default("text/plain").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    runCreatedIdx: index("artifacts_run_created_idx").on(
      table.runId,
      table.createdAt
    ),
    runTypeIdx: index("artifacts_run_type_idx").on(
      table.runId,
      table.artifactType
    ),
  })
);

export type Artifact = typeof artifacts.$inferSelect;
export type InsertArtifact = typeof artifacts.$inferInsert;

// Agent Configurations
export const agentConfigs = mysqlTable(
  "agentConfigs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentType: varchar("agentType", { length: 64 }).notNull(), // "nanoscript_generator", "context_provider", "critical_analyst"
    role: varchar("role", { length: 255 }).notNull(),
    goal: text("goal").notNull(),
    backstory: text("backstory").notNull(),
    llmModel: varchar("llmModel", { length: 64 }).notNull(),
    isActive: int("isActive").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userCreatedIdx: index("agent_configs_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
  })
);

export type AgentConfig = typeof agentConfigs.$inferSelect;
export type InsertAgentConfig = typeof agentConfigs.$inferInsert;