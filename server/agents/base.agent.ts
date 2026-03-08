import type { AgentConfig } from "../../drizzle/schema";
import {
  invokeLLM,
  type Message,
  type Tool,
  type ToolChoice,
  type InvokeResult,
  type ToolCall,
} from "../_core/llm";
import { createLogger, type Logger } from "../_core/logger";

/**
 * Agent execution context passed to each agent invocation
 */
export interface AgentContext {
  /** The user's initial task/prompt */
  initialTask: string;
  /** Artifacts from previous agents in the workflow */
  previousArtifacts?: Record<string, string>;
  /** Additional context or metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result returned from agent execution
 */
export interface AgentResult {
  success: boolean;
  content: string;
  /** Final approved code (used by CriticalAnalyst) */
  finalCode?: string;
  toolCalls?: ToolCall[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
}

/**
 * Abstract base class for all workflow agents.
 * Provides common initialization, LLM invocation wrapper, and error handling.
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected conversationHistory: Message[] = [];
  private logger?: Logger;

  constructor(config: AgentConfig) {
    this.config = config;
    // Note: Cannot call this.log here as agentType is abstract
    // Initialization logging will happen in concrete classes if needed
  }

  /**
   * Agent type identifier (must match agentType in config)
   */
  abstract get agentType(): string;

  /**
   * Define tools available to this agent
   */
  protected abstract getTools(): Tool[];

  /**
   * Build the system prompt from agent config
   */
  protected buildSystemPrompt(): string {
    return `You are ${this.config.role}.

Goal: ${this.config.goal}

Background: ${this.config.backstory}

Respond thoughtfully and stay focused on your specific role in the workflow.`;
  }

  /**
   * Execute the agent's primary task
   * Each concrete agent implements its specific logic here
   */
  abstract execute(context: AgentContext): Promise<AgentResult>;

  /**
   * Safely convert a value to an array of strings
   * Handles: array, JSON string of array, comma-separated string, single value
   */
  protected toStringArray(value: unknown): string[] {
    if (!value) return [];
    
    if (Array.isArray(value)) {
      return value.map(v => String(v));
    }
    
    if (typeof value === "string") {
      // Try parsing as JSON array
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map(v => String(v));
        }
      } catch {
        // Not JSON, check if comma-separated
        if (value.includes(",")) {
          return value.split(",").map(s => s.trim()).filter(Boolean);
        }
      }
      // Single string value
      return value.trim() ? [value.trim()] : [];
    }
    
    return [];
  }

  /**
   * Wrapper around invokeLLM with standardized error handling and logging
   */
  protected async invoke(
    messages: Message[],
    options: {
      tools?: Tool[];
      toolChoice?: ToolChoice;
    } = {}
  ): Promise<InvokeResult> {
    const { tools, toolChoice } = options;
    const model = this.config.llmModel || process.env.LLM_MODEL || "llama3.2:latest";

    this.log(`Invoking LLM with ${messages.length} messages`);

    try {
      const result = await invokeLLM({
        messages,
        model,
        tools: tools && tools.length > 0 ? tools : undefined,
        toolChoice: tools && tools.length > 0 ? toolChoice : undefined,
      });

      this.log(
        `LLM response received: ${result.choices[0]?.finish_reason ?? "unknown"}`
      );

      if (result.usage) {
        this.log(
          `Tokens used: ${result.usage.prompt_tokens} prompt, ${result.usage.completion_tokens} completion`
        );
      }

      return result;
    } catch (error) {
      this.logError("LLM invocation failed", error);
      throw error;
    }
  }

  /**
   * Build initial messages with system prompt and user task
   */
  protected buildInitialMessages(userContent: string): Message[] {
    return [
      { role: "system", content: this.buildSystemPrompt() },
      { role: "user", content: userContent },
    ];
  }

  /**
   * Extract text content from LLM response
   */
  protected extractContent(result: InvokeResult): string {
    const message = result.choices[0]?.message;
    if (!message) return "";

    const content = message.content;
    if (typeof content === "string") return content;

    // Handle array of content parts
    if (Array.isArray(content)) {
      return content
        .filter((part) => part.type === "text")
        .map((part) => (part as { type: "text"; text: string }).text)
        .join("\n");
    }

    return "";
  }

  /**
   * Extract tool calls from LLM response
   */
  protected extractToolCalls(result: InvokeResult): ToolCall[] | undefined {
    return result.choices[0]?.message?.tool_calls;
  }

  /**
   * Reset conversation history for a new execution
   */
  protected resetConversation(): void {
    this.conversationHistory = [];
  }

  /**
   * Add message to conversation history
   */
  protected addToHistory(message: Message): void {
    this.conversationHistory.push(message);
  }

  /**
   * Logging utility with agent prefix.
   * Delegates to the centralized logger for consistent output format.
   */
  protected log(message: string): void {
    this.getLogger().info(message);
  }

  /**
   * Error logging utility.
   * Delegates to the centralized logger for consistent output format.
   */
  protected logError(message: string, error: unknown): void {
    this.getLogger().error(message, error);
  }

  /**
   * Return (and lazily create) the centralized logger for this agent.
   * Initialization is deferred because agentType is abstract and not available
   * until the concrete subclass constructor has run.
   */
  private getLogger(): Logger {
    if (!this.logger) {
      this.logger = createLogger(this.agentType);
    }
    return this.logger;
  }

  /**
   * Parse tool call JSON from LLM content, handling markdown code blocks
   * Returns parsed object or null if parsing fails
   */
  protected parseToolCallFromContent(content: string): Record<string, unknown> | null {
    if (!content || content.trim().length === 0) {
      return null;
    }

    let jsonStr = content.trim();

    // Remove markdown code block wrappers (```json ... ``` or ``` ... ```)
    // Handle both single-line and multi-line code blocks anywhere in content
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Try to find JSON object in the content
    const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      jsonStr = jsonObjectMatch[0];
    }

    // Use tryParseJson which includes repair logic
    return this.tryParseJson(jsonStr);
  }

  /**
   * Parse all tool call JSONs from content (handles multiple JSON objects)
   */
  protected parseAllToolCallsFromContent(content: string): Array<Record<string, unknown>> {
    if (!content || content.trim().length === 0) {
      return [];
    }

    const results: Array<Record<string, unknown>> = [];
    let remaining = content.trim();

    // First, extract content from markdown code blocks
    const codeBlocks = remaining.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/g);
    if (codeBlocks) {
      for (const block of codeBlocks) {
        const inner = block.replace(/```(?:json)?\s*\n?/, "").replace(/\n?```$/, "").trim();
        const parsed = this.tryParseJson(inner);
        if (parsed) results.push(parsed);
      }
    }

    // Also try to parse any bare JSON objects
    const jsonPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    const bareJsons = remaining.replace(/```[\s\S]*?```/g, "").match(jsonPattern);
    if (bareJsons) {
      for (const json of bareJsons) {
        const parsed = this.tryParseJson(json);
        if (parsed && !results.some(r => JSON.stringify(r) === JSON.stringify(parsed))) {
          results.push(parsed);
        }
      }
    }

    return results;
  }

  protected tryParseJson(str: string): Record<string, unknown> | null {
    // Try direct parse first
    try {
      return JSON.parse(str);
    } catch {
      // Try to repair common JSON malformations from LLMs
    }
    
    // Try to repair the JSON
    const repaired = this.repairJson(str);
    if (repaired !== str) {
      try {
        return JSON.parse(repaired);
      } catch {
        // Still failed
      }
    }
    
    return null;
  }

  /**
   * Attempt to repair malformed JSON from LLM output
   */
  private repairJson(str: string): string {
    let repaired = str;
    
    // Fix common issues:
    // 1. "):" should be ":"
    repaired = repaired.replace(/"\s*\)\s*\{/g, '": {');
    repaired = repaired.replace(/"\s*\)\s*\[/g, '": [');
    repaired = repaired.replace(/"\s*\)\s*"/g, '": "');
    
    // 2. Missing colons after property names
    repaired = repaired.replace(/"(\w+)"\s*\{/g, '"$1": {');
    
    // 3. Trailing commas before closing braces
    repaired = repaired.replace(/,\s*\}/g, '}');
    repaired = repaired.replace(/,\s*\]/g, ']');
    
    // 4. Single quotes to double quotes (be careful with code content)
    // Only do this outside of string values
    
    // 5. Unquoted property names (simple cases)
    repaired = repaired.replace(/\{\s*(\w+)\s*:/g, '{"$1":');
    repaired = repaired.replace(/,\s*(\w+)\s*:/g, ',"$1":');
    
    // 6. Escaped backslash-n that should be literal \n  
    // Fix \\n in the middle of strings (common LLM issue)
    
    return repaired;
  }

  /**
   * Try multiple strategies to extract code from malformed JSON
   */
  protected extractCodeFromMalformedJson(content: string): string | null {
    // Strategy 1: Use regex to find "code": "..." pattern (handles escaped content)
    const codeMatch = content.match(/"code"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    if (codeMatch && codeMatch[1]) {
      // Unescape the string
      try {
        const unescaped = JSON.parse(`"${codeMatch[1]}"`);
        if (typeof unescaped === "string" && unescaped.length > 10) {
          return unescaped;
        }
      } catch {
        // Return raw match if unescape fails
        return codeMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      }
    }
    
    // Strategy 2: Look for code between "code": and next property (handles longer code)
    const codeBlockMatch = content.match(/"code"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"(?:description|dependencies|language)"|"\s*\})/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
    }
    
    // Strategy 3: Try to find function/class definitions directly in content
    const functionMatch = content.match(/((?:function|class|const|let|var|async\s+function)\s+\w+[\s\S]*?(?:\}\s*\}|\}\s*;|\}\s*$))/);
    if (functionMatch && functionMatch[1] && functionMatch[1].length > 20) {
      // Clean up any JSON artifacts around it
      let code = functionMatch[1];
      // Remove trailing JSON syntax
      code = code.replace(/\}\s*,\s*"[\w_]+"\s*:[\s\S]*$/, '}');
      return code;
    }
    
    // Strategy 4: Look for code after common markers
    const afterCodeMarker = content.match(/(?:"code"\s*:\s*["'`]|```(?:typescript|ts|javascript|js)?\s*\n)([\s\S]+?)(?:["'`]\s*[,}]|```)/);
    if (afterCodeMarker && afterCodeMarker[1] && afterCodeMarker[1].length > 10) {
      return afterCodeMarker[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    }
    
    return null;
  }

  /**
   * Extract clean code content from various formats the LLM might return
   */
  protected extractCodeFromContent(content: string): string {
    // If it's a JSON tool call, try to extract the code
    const parsed = this.parseToolCallFromContent(content);
    if (parsed) {
      // Handle direct code property
      if (parsed.code && typeof parsed.code === "string") {
        return this.formatCodeWithMetadata(parsed);
      }
      // Handle approve_output tool format
      if (parsed.final_code && typeof parsed.final_code === "string") {
        return parsed.final_code;
      }
      // Handle {"name": "generate_code", "parameters": {...}} format (llama3.2 style)
      if (parsed.name && parsed.parameters && typeof parsed.parameters === "object") {
        const params = parsed.parameters as Record<string, unknown>;
        if (params.code && typeof params.code === "string") {
          return this.formatCodeWithMetadata(params);
        }
        if (params.final_code && typeof params.final_code === "string") {
          return params.final_code as string;
        }
      }
      // Handle nested function call format (OpenAI style)
      if (parsed.name && parsed.arguments) {
        try {
          const args = typeof parsed.arguments === "string" 
            ? JSON.parse(parsed.arguments) 
            : parsed.arguments;
          if (args.code) return this.formatCodeWithMetadata(args);
          if (args.final_code) return args.final_code;
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Extract code from markdown code blocks
    const codeBlockMatch = content.match(/```(?:\w+)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Return as-is if no special format detected
    return content;
  }

  /**
   * Format code with metadata (language, description, dependencies)
   */
  private formatCodeWithMetadata(params: Record<string, unknown>): string {
    const lang = (params.language as string) || "typescript";
    const code = params.code as string;
    const description = params.description as string | undefined;
    const deps = params.dependencies;

    const sections: string[] = [];
    
    if (description) {
      sections.push(`## Generated Code\n`);
      sections.push(`**Description:** ${description}\n`);
    }
    
    if (deps) {
      const depList = Array.isArray(deps) ? deps : 
        (typeof deps === "string" ? JSON.parse(deps) : []);
      if (depList.length > 0) {
        sections.push(`**Dependencies:** ${depList.join(", ")}\n`);
      }
    }
    
    sections.push(`\`\`\`${lang}`);
    sections.push(code);
    sections.push(`\`\`\``);
    
    return sections.join("\n");
  }

  /**
   * Format analysis/review content from JSON into readable text
   * Handles multiple JSON tool calls in content
   */
  protected formatAnalysisFromContent(content: string): string {
    // Try to parse all tool calls from content
    const allParsed = this.parseAllToolCallsFromContent(content);
    
    if (allParsed.length === 0) {
      // Fallback to single parse
      const single = this.parseToolCallFromContent(content);
      if (single) {
        return this.formatSingleAnalysis(single);
      }
      return content;
    }

    // Format all parsed objects and combine
    const formatted = allParsed.map(p => this.formatSingleAnalysis(p)).filter(Boolean);
    return formatted.length > 0 ? formatted.join("\n\n---\n\n") : content;
  }

  /**
   * Format a single analysis JSON object into readable text
   */
  private formatSingleAnalysis(parsed: Record<string, unknown>): string {
    // Handle {"name": "tool_name", "parameters": {...}} format
    let data = parsed;
    if (parsed.name && parsed.parameters && typeof parsed.parameters === "object") {
      data = parsed.parameters as Record<string, unknown>;
    }

    const sections: string[] = [];

    // Handle analyze_code_quality format
    if (data.issues && Array.isArray(data.issues)) {
      sections.push("## Code Quality Analysis\n");
      if (typeof data.overall_score === "number") {
        const emoji = data.overall_score >= 80 ? "✅" : data.overall_score >= 60 ? "⚠️" : "❌";
        sections.push(`**Overall Score:** ${emoji} ${data.overall_score}/100\n`);
      }
      if (data.issues.length > 0) {
        sections.push("**Issues:**");
        for (const issue of data.issues as Array<Record<string, unknown>>) {
          sections.push(`- [${issue.severity}] ${issue.category}: ${issue.description}`);
        }
      } else {
        sections.push("No issues found.");
      }
    }

    // Handle security_review format
    if (data.vulnerabilities && Array.isArray(data.vulnerabilities)) {
      sections.push("\n## Security Review\n");
      if (data.vulnerabilities.length > 0) {
        for (const vuln of data.vulnerabilities as Array<Record<string, unknown>>) {
          sections.push(`- [${vuln.severity}] ${vuln.type}: ${vuln.description}`);
          if (vuln.mitigation) sections.push(`  → Mitigation: ${vuln.mitigation}`);
        }
      } else {
        sections.push("No vulnerabilities found.");
      }
    }

    // Handle approve_output format
    if (typeof data.approved === "boolean") {
      sections.push("\n## Final Decision\n");
      sections.push(`**Status:** ${data.approved ? "✅ APPROVED" : "❌ NEEDS REVISION"}`);
      if (data.notes) sections.push(`**Notes:** ${data.notes}`);
      if (data.final_code && typeof data.final_code === "string") {
        sections.push("\n## Final Approved Code\n");
        sections.push("```");
        sections.push(data.final_code);
        sections.push("```");
      }
    }

    // Handle suggest_improvements format
    if (data.improvements && Array.isArray(data.improvements)) {
      sections.push("\n## Suggested Improvements\n");
      if (data.summary) sections.push(`**Summary:** ${data.summary}\n`);
      for (const imp of data.improvements as Array<Record<string, unknown>>) {
        sections.push(`### ${imp.area || "General"}`);
        if (imp.current) sections.push(`**Current:** ${imp.current}`);
        sections.push(`**Suggested:** ${imp.suggested}`);
        if (imp.rationale) sections.push(`*Rationale: ${imp.rationale}*`);
        sections.push("");
      }
    }

    // Handle refined_code in improvements
    if (data.refined_code && typeof data.refined_code === "string") {
      sections.push("\n## Refined Code\n");
      sections.push("```");
      sections.push(data.refined_code);
      sections.push("```");
    }

    return sections.length > 0 ? sections.join("\n") : "";
  }
}
