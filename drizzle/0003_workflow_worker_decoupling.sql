ALTER TABLE `workflowRuns`
ADD COLUMN `selectedModel` varchar(100),
ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
--> statement-breakpoint
CREATE INDEX `workflow_runs_status_created_idx`
ON `workflowRuns` (`status`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `workflow_runs_status_updated_idx`
ON `workflowRuns` (`status`, `updatedAt`);