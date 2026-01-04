/**
 * Agent Module Exports
 * 
 * This module provides the agent infrastructure for the multi-agent workflow.
 * Each agent is responsible for a specific phase of the code generation pipeline.
 */

// Base class and types
export {
  BaseAgent,
  type AgentContext,
  type AgentResult,
} from "./base.agent";

// Concrete agent implementations
export { ContextProviderAgent } from "./context-provider.agent";
export { NanoscriptGeneratorAgent } from "./nanoscript-generator.agent";
export { CriticalAnalystAgent } from "./critical-analyst.agent";

// Agent type constants
export const AGENT_TYPES = {
  CONTEXT_PROVIDER: "context_provider",
  NANOSCRIPT_GENERATOR: "nanoscript_generator",
  CRITICAL_ANALYST: "critical_analyst",
} as const;

export type AgentType = (typeof AGENT_TYPES)[keyof typeof AGENT_TYPES];
