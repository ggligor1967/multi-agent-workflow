CREATE TABLE `agentConfigs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`agentType` varchar(64) NOT NULL,
	`role` varchar(255) NOT NULL,
	`goal` text NOT NULL,
	`backstory` text NOT NULL,
	`llmModel` varchar(64) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agentConfigs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`artifactType` varchar(64) NOT NULL,
	`content` text NOT NULL,
	`mimeType` varchar(64) NOT NULL DEFAULT 'text/plain',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflowConfigs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`initialTask` text NOT NULL,
	`llmModel` varchar(64) NOT NULL DEFAULT 'llama3.2',
	`mistralModel` varchar(64) NOT NULL DEFAULT 'mistral',
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflowConfigs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflowRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`configId` int,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`initialTask` text NOT NULL,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflowRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflowSteps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`stepName` varchar(64) NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`startedAt` timestamp,
	`completedAt` timestamp,
	`output` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflowSteps_id` PRIMARY KEY(`id`)
);
