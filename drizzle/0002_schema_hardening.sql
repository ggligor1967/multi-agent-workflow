SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'NO_AUTO_VALUE_ON_ZERO');
--> statement-breakpoint
INSERT INTO `users` (`id`, `openId`, `name`, `loginMethod`, `role`, `createdAt`, `updatedAt`, `lastSignedIn`)
SELECT 0, '__system__', 'System Templates', 'system', 'admin', NOW(), NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM `users`
  WHERE `id` = 0
);
--> statement-breakpoint
ALTER TABLE `workflowConfigs`
ADD CONSTRAINT `workflowConfigs_userId_users_id_fk`
FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX `workflow_configs_user_created_idx`
ON `workflowConfigs` (`userId`, `createdAt`);
--> statement-breakpoint
ALTER TABLE `workflowRuns`
ADD CONSTRAINT `workflowRuns_userId_users_id_fk`
FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade,
ADD CONSTRAINT `workflowRuns_configId_workflowConfigs_id_fk`
FOREIGN KEY (`configId`) REFERENCES `workflowConfigs`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `workflow_runs_user_created_idx`
ON `workflowRuns` (`userId`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `workflow_runs_config_idx`
ON `workflowRuns` (`configId`);
--> statement-breakpoint
ALTER TABLE `workflowSteps`
ADD CONSTRAINT `workflowSteps_runId_workflowRuns_id_fk`
FOREIGN KEY (`runId`) REFERENCES `workflowRuns`(`id`) ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX `workflow_steps_run_created_idx`
ON `workflowSteps` (`runId`, `createdAt`);
--> statement-breakpoint
ALTER TABLE `artifacts`
ADD CONSTRAINT `artifacts_runId_workflowRuns_id_fk`
FOREIGN KEY (`runId`) REFERENCES `workflowRuns`(`id`) ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX `artifacts_run_created_idx`
ON `artifacts` (`runId`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `artifacts_run_type_idx`
ON `artifacts` (`runId`, `artifactType`);
--> statement-breakpoint
ALTER TABLE `agentConfigs`
ADD CONSTRAINT `agentConfigs_userId_users_id_fk`
FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX `agent_configs_user_created_idx`
ON `agentConfigs` (`userId`, `createdAt`);