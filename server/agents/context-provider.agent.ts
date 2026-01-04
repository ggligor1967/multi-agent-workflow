import type { Tool } from "../_core/llm";
import {
  BaseAgent,
  type AgentContext,
  type AgentResult,
} from "./base.agent";

/**
 * Context Provider Agent
 * 
 * Responsible for gathering domain knowledge, examples, and constraints
 * to enrich the code generation process. This agent runs first in the
 * workflow to provide context for the Nanoscript Generator.
 */
export class ContextProviderAgent extends BaseAgent {
  get agentType(): string {
    return "context_provider";
  }

  protected getTools(): Tool[] {
    return [
      {
        type: "function",
        function: {
          name: "search_knowledge_base",
          description:
            "Search the knowledge base for relevant documentation, examples, and patterns",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query to find relevant context",
              },
              category: {
                type: "string",
                enum: ["documentation", "examples", "patterns", "constraints"],
                description: "Category of knowledge to search",
              },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "extract_requirements",
          description:
            "Extract and structure requirements from the user task",
          parameters: {
            type: "object",
            properties: {
              functional_requirements: {
                type: "array",
                items: { type: "string" },
                description: "List of functional requirements",
              },
              technical_constraints: {
                type: "array",
                items: { type: "string" },
                description: "List of technical constraints",
              },
              quality_attributes: {
                type: "array",
                items: { type: "string" },
                description: "Non-functional requirements like performance, security",
              },
            },
            required: ["functional_requirements"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "provide_context",
          description:
            "Provide the gathered context to the next agent in the workflow",
          parameters: {
            type: "object",
            properties: {
              domain_context: {
                type: "string",
                description: "Relevant domain knowledge and background",
              },
              code_examples: {
                type: "array",
                items: { type: "string" },
                description: "Relevant code examples or patterns",
              },
              constraints: {
                type: "array",
                items: { type: "string" },
                description: "Constraints and requirements to follow",
              },
              recommendations: {
                type: "string",
                description: "Recommendations for implementation approach",
              },
            },
            required: ["domain_context", "constraints"],
          },
        },
      },
    ];
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    this.resetConversation();
    this.log(`Gathering context for task: ${context.initialTask.substring(0, 100)}...`);

    try {
      const userPrompt = this.buildContextGatheringPrompt(context);
      const messages = this.buildInitialMessages(userPrompt);

      const result = await this.invoke(messages, {
        tools: this.getTools(),
        toolChoice: "auto",
      });

      const content = this.extractContent(result);
      const toolCalls = this.extractToolCalls(result);

      // Process tool calls if any
      let contextOutput = content;
      
      if (toolCalls && toolCalls.length > 0) {
        // LLM correctly used tool calling
        contextOutput = await this.processToolCalls(toolCalls, context);
      } else if (content) {
        // LLM returned JSON in content instead of tool_calls - parse it
        contextOutput = this.formatContextFromContent(content);
      }

      this.log("Context gathering completed successfully");

      return {
        success: true,
        content: contextOutput,
        toolCalls,
        usage: result.usage,
      };
    } catch (error) {
      this.logError("Context gathering failed", error);
      return {
        success: false,
        content: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Format context information from raw JSON content
   */
  private formatContextFromContent(content: string): string {
    const parsed = this.parseToolCallFromContent(content);
    if (!parsed) {
      return content;
    }

    const sections: string[] = [];

    // Handle extract_requirements format
    if (parsed.functional_requirements) {
      sections.push("## Requirements Analysis\n");
      
      if (Array.isArray(parsed.functional_requirements)) {
        sections.push("**Functional Requirements:**");
        for (const req of parsed.functional_requirements) {
          sections.push(`- ${req}`);
        }
      }
      
      if (Array.isArray(parsed.non_functional_requirements)) {
        sections.push("\n**Non-Functional Requirements:**");
        for (const req of parsed.non_functional_requirements as string[]) {
          sections.push(`- ${req}`);
        }
      }
      
      if (Array.isArray(parsed.constraints)) {
        sections.push("\n**Constraints:**");
        for (const c of parsed.constraints as string[]) {
          sections.push(`- ${c}`);
        }
      }
    }

    // Handle provide_context format
    if (parsed.domain_context && typeof parsed.domain_context === "string") {
      sections.push("## Domain Context\n");
      sections.push(parsed.domain_context as string);
      
      if (Array.isArray(parsed.technical_recommendations)) {
        sections.push("\n**Technical Recommendations:**");
        for (const rec of parsed.technical_recommendations as string[]) {
          sections.push(`- ${rec}`);
        }
      }
      
      if (Array.isArray(parsed.examples)) {
        sections.push("\n**Examples & References:**");
        for (const ex of parsed.examples as string[]) {
          sections.push(`- ${ex}`);
        }
      }
    }

    // Handle search_knowledge_base format
    if (parsed.query && typeof parsed.query === "string") {
      sections.push("## Knowledge Base Query\n");
      sections.push(`Query: ${parsed.query}`);
      if (parsed.category) sections.push(`Category: ${parsed.category}`);
    }

    return sections.length > 0 ? sections.join("\n") : content;
  }

  private buildContextGatheringPrompt(context: AgentContext): string {
    return `Analyze the following task and gather relevant context for code generation:

**Task:**
${context.initialTask}

Please:
1. Identify the domain and technical requirements
2. Extract functional requirements and constraints
3. Search for relevant patterns and examples
4. Provide structured context for the code generator

Use the available tools to structure your findings, then provide a comprehensive context summary.`;
  }

  private async processToolCalls(
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
    context: AgentContext
  ): Promise<string> {
    const results: string[] = [];

    for (const toolCall of toolCalls) {
      const { name, arguments: argsJson } = toolCall.function;
      
      try {
        const args = JSON.parse(argsJson);
        
        switch (name) {
          case "search_knowledge_base":
            // TODO: Implement actual knowledge base search (RAG)
            results.push(
              `[Knowledge Base Search]\nQuery: ${args.query}\nCategory: ${args.category || "all"}\n` +
              `Note: Knowledge base integration pending. Using task analysis instead.`
            );
            break;
            
          case "extract_requirements": {
            const funcReqs = this.toStringArray(args.functional_requirements);
            const techConstraints = this.toStringArray(args.technical_constraints);
            const qualityAttrs = this.toStringArray(args.quality_attributes);
            
            results.push(
              `[Requirements Extracted]\n` +
              `Functional: ${funcReqs.length > 0 ? funcReqs.join(", ") : "None specified"}\n` +
              `Technical Constraints: ${techConstraints.length > 0 ? techConstraints.join(", ") : "None specified"}\n` +
              `Quality Attributes: ${qualityAttrs.length > 0 ? qualityAttrs.join(", ") : "None specified"}`
            );
            break;
          }
            
          case "provide_context": {
            const constraints = this.toStringArray(args.constraints);
            const codeExamples = this.toStringArray(args.code_examples);
            
            results.push(
              `[Context Summary]\n` +
              `Domain Context: ${args.domain_context || "Not provided"}\n` +
              `Examples: ${codeExamples.length} provided\n` +
              `Constraints: ${constraints.length > 0 ? constraints.join("; ") : "None"}\n` +
              `Recommendations: ${args.recommendations || "None"}`
            );
            break;
          }
            
          default:
            this.log(`Unknown tool called: ${name}`);
        }
      } catch (error) {
        this.logError(`Failed to process tool call ${name}`, error);
      }
    }

    return results.join("\n\n");
  }
}
