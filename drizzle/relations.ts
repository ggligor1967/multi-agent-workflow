import { relations } from "drizzle-orm";
import {
	agentConfigs,
	artifacts,
	users,
	workflowConfigs,
	workflowRunEvents,
	workflowRuns,
	workflowSteps,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
	workflowConfigs: many(workflowConfigs),
	workflowRuns: many(workflowRuns),
	agentConfigs: many(agentConfigs),
}));

export const workflowConfigsRelations = relations(
	workflowConfigs,
	({ one, many }) => ({
		user: one(users, {
			fields: [workflowConfigs.userId],
			references: [users.id],
		}),
		runs: many(workflowRuns),
	})
);

export const workflowRunsRelations = relations(
	workflowRuns,
	({ one, many }) => ({
		user: one(users, {
			fields: [workflowRuns.userId],
			references: [users.id],
		}),
		config: one(workflowConfigs, {
			fields: [workflowRuns.configId],
			references: [workflowConfigs.id],
		}),
		steps: many(workflowSteps),
		events: many(workflowRunEvents),
		artifacts: many(artifacts),
	})
);

export const workflowRunEventsRelations = relations(
	workflowRunEvents,
	({ one }) => ({
		run: one(workflowRuns, {
			fields: [workflowRunEvents.runId],
			references: [workflowRuns.id],
		}),
	})
);

export const workflowStepsRelations = relations(workflowSteps, ({ one }) => ({
	run: one(workflowRuns, {
		fields: [workflowSteps.runId],
		references: [workflowRuns.id],
	}),
}));

export const artifactsRelations = relations(artifacts, ({ one }) => ({
	run: one(workflowRuns, {
		fields: [artifacts.runId],
		references: [workflowRuns.id],
	}),
}));

export const agentConfigsRelations = relations(agentConfigs, ({ one }) => ({
	user: one(users, {
		fields: [agentConfigs.userId],
		references: [users.id],
	}),
}));
