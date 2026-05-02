CREATE TABLE `workflowRunEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`level` enum('info','warn','error') NOT NULL DEFAULT 'info',
	`source` varchar(32) NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `workflowRunEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `workflowRunEvents` ADD CONSTRAINT `workflowRunEvents_runId_workflowRuns_id_fk` FOREIGN KEY (`runId`) REFERENCES `workflowRuns`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `workflow_run_events_run_created_idx` ON `workflowRunEvents` (`runId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `workflow_run_events_run_type_idx` ON `workflowRunEvents` (`runId`,`eventType`);