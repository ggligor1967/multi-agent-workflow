import type { Tool } from "../_core/llm";
import {
  BaseAgent,
  type AgentContext,
  type AgentResult,
} from "./base.agent";

/**
 * Nanoscript Generator Agent
 * 
 * Responsible for producing initial code/scripts based on the user task
 * and context provided by the Context Provider agent. This agent focuses
 * on generating functional, well-structured code.
 */
export class NanoscriptGeneratorAgent extends BaseAgent {
  get agentType(): string {
    return "nanoscript_generator";
  }

  protected getTools(): Tool[] {
    return [
      {
        type: "function",
        function: {
          name: "generate_code",
          description:
            "Generate code based on requirements and context",
          parameters: {
            type: "object",
            properties: {
              language: {
                type: "string",
                description: "Programming language for the code",
              },
              code: {
                type: "string",
                description: "The generated code",
              },
              description: {
                type: "string",
                description: "Brief description of what the code does",
              },
              dependencies: {
                type: "array",
                items: { type: "string" },
                description: "Required dependencies or imports",
              },
            },
            required: ["language", "code", "description"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "generate_tests",
          description:
            "Generate test cases for the produced code",
          parameters: {
            type: "object",
            properties: {
              test_framework: {
                type: "string",
                description: "Testing framework to use",
              },
              test_code: {
                type: "string",
                description: "The generated test code",
              },
              test_cases: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                  },
                },
                description: "List of test cases",
              },
            },
            required: ["test_framework", "test_code"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "explain_implementation",
          description:
            "Provide detailed explanation of implementation decisions",
          parameters: {
            type: "object",
            properties: {
              architecture_decisions: {
                type: "array",
                items: { type: "string" },
                description: "Key architectural decisions made",
              },
              patterns_used: {
                type: "array",
                items: { type: "string" },
                description: "Design patterns applied",
              },
              trade_offs: {
                type: "string",
                description: "Trade-offs and alternatives considered",
              },
            },
            required: ["architecture_decisions"],
          },
        },
      },
    ];
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    this.resetConversation();
    this.log(`Generating code for task: ${context.initialTask.substring(0, 100)}...`);

    try {
      const userPrompt = this.buildGenerationPrompt(context);
      const messages = this.buildInitialMessages(userPrompt);

      const result = await this.invoke(messages, {
        tools: this.getTools(),
        toolChoice: "auto",
      });

      const content = this.extractContent(result);
      const toolCalls = this.extractToolCalls(result);

      // Extract ONLY the raw code from LLM response
      let generatedCode = "";
      
      if (toolCalls && toolCalls.length > 0) {
        generatedCode = this.extractCodeFromToolCalls(toolCalls);
      } else if (content) {
        generatedCode = this.extractRawCodeFromContent(content);
      }

      this.log("Code generation completed successfully");

      return {
        success: true,
        content: generatedCode,
        toolCalls,
        usage: result.usage,
      };
    } catch (error) {
      this.logError("Code generation failed", error);
      return {
        success: false,
        content: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Extract raw code string from tool calls
   */
  private extractCodeFromToolCalls(
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>
  ): string {
    for (const toolCall of toolCalls) {
      if (toolCall.function.name === "generate_code") {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          
          // Check various possible field names for code
          const codeFields = ["code", "function", "source", "source_code", "implementation"];
          for (const field of codeFields) {
            const value = args[field];
            if (value && typeof value === "string" && value.trim().length > 0) {
              return this.cleanCodeString(value);
            }
          }
          
          // Also check for nested parameters
          if (args.parameters) {
            for (const field of codeFields) {
              if (args.parameters[field] && typeof args.parameters[field] === "string" && args.parameters[field].trim().length > 0) {
                return this.cleanCodeString(args.parameters[field]);
              }
            }
          }
        } catch (error) {
          this.logError("Failed to parse generate_code arguments", error);
        }
      }
    }
    return "";
  }

  /**
   * Extract raw code from JSON content (handles markdown-wrapped JSON)
   */
  private extractRawCodeFromContent(content: string): string {
    // Safety: wrap everything in try-catch
    try {
      // First, check if content looks like a JSON tool call
      const trimmed = content.trim();
      const looksLikeToolCall = trimmed.startsWith("{") && 
        (trimmed.includes('"generate_code"') || trimmed.includes("'generate_code'") || 
         trimmed.includes('"code"') || trimmed.includes('"parameters"'));

      if (looksLikeToolCall) {
        // Try standard JSON parse first
        const parsed = this.parseToolCallFromContent(content);
        if (parsed) {
          const code = this.extractCodeFromParsedJson(parsed);
          if (code && code.length > 10) {
            return this.cleanCodeString(code);
          }
        }
        
        // If standard parse failed, try regex extraction
        const extracted = this.extractCodeFromMalformedJson(content);
        if (extracted && extracted.length > 10) {
          return this.cleanCodeString(extracted);
        }
      }

      // If not JSON tool call, check for markdown code blocks
      const codeBlockMatch = content.match(/```(?:typescript|ts|javascript|js)?\s*\n?([\s\S]+?)\n?```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        return codeBlockMatch[1].trim();
      }

      // Return raw content as fallback (might be plain code)
      return this.stripMarkdownCodeBlocks(content);
    } catch (error) {
      // Safety fallback: return raw content so we don't lose data
      this.logError("Failed to extract code from content", error);
      return content;
    }
  }

  /**
   * Extract code from parsed JSON object
   */
  private extractCodeFromParsedJson(parsed: Record<string, unknown>): string | null {
    const codeFields = ["code", "function", "source", "source_code", "implementation"];

    // Handle {"name": "generate_code", "parameters": {...}} format
    if (parsed.name === "generate_code" && parsed.parameters) {
      const params = parsed.parameters as Record<string, unknown>;
      for (const field of codeFields) {
        const value = params[field];
        if (value && typeof value === "string" && value.trim().length > 0) {
          return value;
        }
      }
    }

    // Handle direct format {"code": "..."}
    for (const field of codeFields) {
      const value = parsed[field];
      if (value && typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }

    return null;
  }

  /**
   * Clean code string - handle escaped JSON, fix newlines, etc.
   */
  private cleanCodeString(code: string): string {
    let cleaned = code.trim();
    
    // First: if it starts with a quote, it's a JSON-encoded string - parse it
    if (cleaned.startsWith('"') || cleaned.startsWith("'")) {
      try {
        const parsed = JSON.parse(cleaned);
        if (typeof parsed === "string") {
          cleaned = parsed;
        }
      } catch {
        // Not valid JSON string, remove quotes manually
        if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
            (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
          cleaned = cleaned.slice(1, -1);
          // Fix escaped characters
          cleaned = cleaned.replace(/\\"/g, '"').replace(/\\'/g, "'");
        }
      }
    }
    
    // Second: if it looks like JSON object, try to extract code from it
    if (cleaned.trim().startsWith("{") && cleaned.includes("function")) {
      try {
        const parsed = JSON.parse(cleaned);
        if (typeof parsed === "object" && parsed !== null) {
          for (const key of ["code", "function", "source"]) {
            if (typeof parsed[key] === "string") {
              cleaned = parsed[key];
              break;
            }
          }
        }
      } catch {
        // Not valid JSON object - might be actual code that starts with {
        // Check if it looks like a function definition
        if (/function\s+\w+|const\s+\w+\s*=|=>\s*{/.test(cleaned)) {
          // It's code, not JSON - keep as is
        }
      }
    }
    
    // Fix escaped newlines and tabs
    cleaned = cleaned.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r");
    
    // Fix double-escaped characters
    cleaned = cleaned.replace(/\\\\/g, "\\");
    
    // Remove trailing JSON artifacts like "}} or "}
    cleaned = cleaned.replace(/["']\s*\}\s*\}?\s*$/, '');
    cleaned = cleaned.replace(/\}\s*\}\s*$/, '}');
    
    // Remove leading JSON artifacts like { at the very start
    if (cleaned.startsWith('{') && !cleaned.match(/^\{\s*(function|class|const|let|var|if|for|while|return)/)) {
      cleaned = cleaned.replace(/^\{\s*/, '');
    }
    
    return cleaned.trim();
  }

  /**
   * Strip markdown code block wrappers from content
   */
  private stripMarkdownCodeBlocks(content: string): string {
    const match = content.match(/```(?:\w+)?\s*\n?([\s\S]*?)\n?```/);
    return match ? match[1].trim() : content.trim();
  }

  private buildGenerationPrompt(context: AgentContext): string {
    const contextSection = context.previousArtifacts?.context_provider
      ? `\n**Context from Analysis:**\n${context.previousArtifacts.context_provider}\n`
      : "";

    return `Generate code for the following task:

**Task:**
${context.initialTask}
${contextSection}
Please:
1. Write clean, well-structured code that solves the task
2. Include necessary imports and dependencies
3. Add appropriate comments and documentation
4. Consider edge cases and error handling
5. Generate tests if appropriate

Use the generate_code tool to structure your output, and optionally use generate_tests for test cases.`;
  }

  private async processToolCalls(
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>
  ): Promise<string> {
    const outputs: string[] = [];

    for (const toolCall of toolCalls) {
      const { name, arguments: argsJson } = toolCall.function;

      try {
        const args = JSON.parse(argsJson);

        switch (name) {
          case "generate_code":
            outputs.push(this.formatCodeOutput(args));
            break;

          case "generate_tests":
            outputs.push(this.formatTestOutput(args));
            break;

          case "explain_implementation":
            outputs.push(this.formatExplanation(args));
            break;

          default:
            this.log(`Unknown tool called: ${name}`);
        }
      } catch (error) {
        this.logError(`Failed to process tool call ${name}`, error);
      }
    }

    return outputs.join("\n\n---\n\n");
  }

  private formatCodeOutput(args: {
    language: string;
    code: string;
    description: string;
    dependencies?: string[] | string;
  }): string {
    // Handle dependencies as string or array using helper
    const depsList = this.toStringArray(args.dependencies);
    
    const deps = depsList.length > 0
      ? `\n**Dependencies:** ${depsList.join(", ")}`
      : "";

    return `## Generated Code

**Language:** ${args.language}${deps}

**Description:** ${args.description}

\`\`\`${args.language}
${args.code}
\`\`\``;
  }

  private formatTestOutput(args: {
    test_framework: string;
    test_code: string;
    test_cases?: Array<{ name: string; description: string }>;
  }): string {
    const testCasesList = args.test_cases
      ?.map((tc) => `- **${tc.name}:** ${tc.description}`)
      .join("\n") || "";

    return `## Generated Tests

**Framework:** ${args.test_framework}

${testCasesList ? `**Test Cases:**\n${testCasesList}\n` : ""}
\`\`\`
${args.test_code}
\`\`\``;
  }

  private formatExplanation(args: {
    architecture_decisions: string[];
    patterns_used?: string[];
    trade_offs?: string;
  }): string {
    const decisions = args.architecture_decisions
      .map((d) => `- ${d}`)
      .join("\n");

    const patterns = args.patterns_used?.length
      ? `\n**Patterns Used:**\n${args.patterns_used.map((p) => `- ${p}`).join("\n")}`
      : "";

    const tradeoffs = args.trade_offs
      ? `\n**Trade-offs:**\n${args.trade_offs}`
      : "";

    return `## Implementation Notes

**Architecture Decisions:**
${decisions}${patterns}${tradeoffs}`;
  }
}
