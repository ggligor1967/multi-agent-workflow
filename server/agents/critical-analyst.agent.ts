import type { Tool } from "../_core/llm";
import {
  BaseAgent,
  type AgentContext,
  type AgentResult,
} from "./base.agent";

/**
 * Critical Analyst Agent
 * 
 * Responsible for reviewing the generated code for errors, security issues,
 * and potential improvements. This agent runs last in the workflow to
 * validate and refine the output from the Nanoscript Generator.
 */
export class CriticalAnalystAgent extends BaseAgent {
  get agentType(): string {
    return "critical_analyst";
  }

  protected getTools(): Tool[] {
    return [
      {
        type: "function",
        function: {
          name: "analyze_code_quality",
          description:
            "Analyze code for quality issues, bugs, and improvements",
          parameters: {
            type: "object",
            properties: {
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    severity: {
                      type: "string",
                      enum: ["critical", "high", "medium", "low"],
                    },
                    category: {
                      type: "string",
                      enum: ["bug", "security", "performance", "maintainability", "style"],
                    },
                    description: { type: "string" },
                    line_reference: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["severity", "category", "description"],
                },
                description: "List of identified issues",
              },
              overall_score: {
                type: "number",
                description: "Quality score from 0-100",
              },
            },
            required: ["issues", "overall_score"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "security_review",
          description:
            "Perform security analysis of the code",
          parameters: {
            type: "object",
            properties: {
              vulnerabilities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
                    description: { type: "string" },
                    mitigation: { type: "string" },
                  },
                  required: ["type", "severity", "description"],
                },
                description: "Security vulnerabilities found",
              },
              secure_coding_violations: {
                type: "array",
                items: { type: "string" },
                description: "Secure coding practice violations",
              },
              recommendations: {
                type: "array",
                items: { type: "string" },
                description: "Security recommendations",
              },
            },
            required: ["vulnerabilities"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "suggest_improvements",
          description:
            "Suggest improvements and provide refined code",
          parameters: {
            type: "object",
            properties: {
              improvements: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    area: { type: "string" },
                    current: { type: "string" },
                    suggested: { type: "string" },
                    rationale: { type: "string" },
                  },
                  required: ["area", "suggested", "rationale"],
                },
                description: "Suggested improvements",
              },
              refined_code: {
                type: "string",
                description: "Improved version of the code",
              },
              summary: {
                type: "string",
                description: "Summary of changes made",
              },
            },
            required: ["improvements", "summary"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "approve_output",
          description:
            "Approve the code as ready for final output",
          parameters: {
            type: "object",
            properties: {
              approved: {
                type: "boolean",
                description: "Whether the code is approved",
              },
              final_code: {
                type: "string",
                description: "The final approved code (with any refinements)",
              },
              notes: {
                type: "string",
                description: "Any notes or caveats about the approval",
              },
            },
            required: ["approved"],
          },
        },
      },
    ];
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    this.resetConversation();
    this.log("Starting critical analysis...");

    if (!context.previousArtifacts?.nanoscript_generator) {
      this.logError("No code to analyze", "Missing nanoscript_generator artifact");
      return {
        success: false,
        content: "",
        error: "No generated code provided for analysis",
      };
    }

    try {
      const userPrompt = this.buildAnalysisPrompt(context);
      const messages = this.buildInitialMessages(userPrompt);

      const result = await this.invoke(messages, {
        tools: this.getTools(),
        toolChoice: "auto",
      });

      const content = this.extractContent(result);
      const toolCalls = this.extractToolCalls(result);

      // Parse analysis and extract final code
      let analysisReport = "";
      let finalCode = "";
      
      if (toolCalls && toolCalls.length > 0) {
        const parsed = this.parseAnalysisToolCalls(toolCalls);
        analysisReport = parsed.report;
        finalCode = parsed.finalCode;
      } else if (content) {
        const parsed = this.parseAnalysisFromContent(content);
        analysisReport = parsed.report;
        finalCode = parsed.finalCode;
      }

      // If no final code extracted, use the original code
      if (!finalCode && context.previousArtifacts?.nanoscript_generator) {
        finalCode = context.previousArtifacts.nanoscript_generator;
      }

      this.log("Critical analysis completed successfully");

      return {
        success: true,
        content: analysisReport,
        finalCode,
        toolCalls,
        usage: result.usage,
      };
    } catch (error) {
      this.logError("Critical analysis failed", error);
      return {
        success: false,
        content: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Parse tool calls and build analysis report + extract final code
   */
  private parseAnalysisToolCalls(
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>
  ): { report: string; finalCode: string } {
    const sections: string[] = [];
    let finalCode = "";

    for (const toolCall of toolCalls) {
      const { name, arguments: argsJson } = toolCall.function;
      
      try {
        const args = JSON.parse(argsJson);
        
        switch (name) {
          case "analyze_code_quality": {
            const formatted = this.safeFormatQualityAnalysis(args);
            if (formatted) sections.push(formatted);
            break;
          }
          case "security_review": {
            const formatted = this.safeFormatSecurityReview(args);
            if (formatted) sections.push(formatted);
            break;
          }
          case "suggest_improvements": {
            const formatted = this.safeFormatImprovements(args);
            if (formatted) sections.push(formatted);
            // Extract refined_code if present (priority over approve_output)
            if (!finalCode && args.refined_code && typeof args.refined_code === "string") {
              finalCode = args.refined_code;
            }
            break;
          }
          case "approve_output": {
            const formatted = this.safeFormatApproval(args);
            if (formatted) sections.push(formatted);
            // final_code from approve_output has highest priority
            if (args.final_code && typeof args.final_code === "string") {
              finalCode = args.final_code;
            }
            break;
          }
        }
      } catch (error) {
        this.logError(`Failed to parse tool call ${name}`, error);
      }
    }

    return {
      report: sections.join("\n\n---\n\n"),
      finalCode,
    };
  }

  /**
   * Parse multiple JSON objects from content and build report
   */
  private parseAnalysisFromContent(content: string): { report: string; finalCode: string } {
    // Safety: wrap in try-catch
    try {
      // First, extract JSON from markdown code blocks if present
      const { jsonBlocks, nonJsonContent } = this.extractJsonFromCodeBlocks(content);
      
      const sections: string[] = [];
      let finalCode = "";

      // Parse JSON blocks first
      for (const jsonStr of jsonBlocks) {
        const parsed = this.tryParseJson(jsonStr);
        if (parsed) {
          const extracted = this.extractFromParsedJson(parsed);
          if (extracted.section) sections.push(extracted.section);
          if (extracted.finalCode && !finalCode) finalCode = extracted.finalCode;
        }
      }

      // If no JSON blocks found in code fences, try to parse inline JSON
      if (jsonBlocks.length === 0) {
        const trimmed = content.trim();
        
        // Check if content looks like JSON (starts with { and contains known tool names)
        const looksLikeJson = (trimmed.startsWith("{") || trimmed.includes("{\"name\"")) && 
          (trimmed.includes('"analyze_code_quality"') || 
           trimmed.includes('"security_review"') ||
           trimmed.includes('"suggest_improvements"') ||
           trimmed.includes('"approve_output"') ||
           trimmed.includes('"issues"') ||
           trimmed.includes('"vulnerabilities"'));

        if (looksLikeJson) {
          // Try to extract multiple JSON objects (some may be on separate lines)
          const jsonObjects = this.extractInlineJsonObjects(content);
          for (const jsonStr of jsonObjects) {
            const parsed = this.tryParseJson(jsonStr);
            if (parsed) {
              const extracted = this.extractFromParsedJson(parsed);
              if (extracted.section) sections.push(extracted.section);
              if (extracted.finalCode && !finalCode) finalCode = extracted.finalCode;
            }
          }
        }
      }

      // Add non-JSON content (markdown text) to the report
      const cleanNonJson = nonJsonContent.trim();
      if (cleanNonJson && !this.looksLikeRawJson(cleanNonJson)) {
        sections.push(cleanNonJson);
      }

      return {
        report: sections.length > 0 ? sections.join("\n\n---\n\n") : content,
        finalCode,
      };
    } catch (error) {
      // Safety fallback: return raw content
      this.logError("Failed to parse analysis from content", error);
      return { report: content, finalCode: "" };
    }
  }

  /**
   * Check if content looks like raw JSON (should be parsed, not shown as-is)
   */
  private looksLikeRawJson(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.startsWith("{") && trimmed.endsWith("}") && 
      (trimmed.includes('"name"') || trimmed.includes('"parameters"'));
  }

  /**
   * Extract inline JSON objects from content (not in code fences)
   */
  private extractInlineJsonObjects(content: string): string[] {
    const results: string[] = [];
    
    // Match JSON objects starting with {"name": or just {
    // Find balanced braces
    let depth = 0;
    let start = -1;
    
    for (let i = 0; i < content.length; i++) {
      if (content[i] === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (content[i] === "}") {
        depth--;
        if (depth === 0 && start !== -1) {
          const jsonStr = content.substring(start, i + 1);
          // Only include if it looks like a tool call
          if (jsonStr.includes('"name"') || jsonStr.includes('"issues"') || 
              jsonStr.includes('"vulnerabilities"') || jsonStr.includes('"approved"')) {
            results.push(jsonStr);
          }
          start = -1;
        }
      }
    }
    
    return results;
  }

  /**
   * Extract JSON from markdown code blocks
   */
  private extractJsonFromCodeBlocks(content: string): { jsonBlocks: string[]; nonJsonContent: string } {
    const jsonBlocks: string[] = [];
    let nonJsonContent = content;

    // Match ```json ... ``` or ``` { ... } ```
    const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const blockContent = match[1].trim();
      if (blockContent.startsWith("{") || blockContent.startsWith("[")) {
        jsonBlocks.push(blockContent);
        // Remove from non-JSON content
        nonJsonContent = nonJsonContent.replace(match[0], "");
      }
    }

    return { jsonBlocks, nonJsonContent };
  }

  /**
   * Extract formatted section and final code from parsed JSON
   */
  private extractFromParsedJson(parsed: Record<string, unknown>): { section: string | null; finalCode: string } {
    // Handle {"name": "tool_name", "parameters": {...}} format
    const toolName = parsed.name as string | undefined;
    const params = (parsed.parameters || parsed) as Record<string, unknown>;
    
    let section: string | null = null;
    let finalCode = "";

    if (toolName === "analyze_code_quality" || params.issues) {
      section = this.safeFormatQualityAnalysis(params);
    }
    if (toolName === "security_review" || params.vulnerabilities) {
      section = this.safeFormatSecurityReview(params);
    }
    if (toolName === "suggest_improvements" || params.improvements) {
      section = this.safeFormatImprovements(params);
      if (params.refined_code && typeof params.refined_code === "string") {
        finalCode = params.refined_code;
      }
    }
    if (toolName === "approve_output" || typeof params.approved === "boolean") {
      section = this.safeFormatApproval(params);
      if (params.final_code && typeof params.final_code === "string") {
        finalCode = params.final_code;
      }
    }

    return { section, finalCode };
  }

  /**
   * Extract analysis from malformed JSON using regex
   */
  private extractAnalysisFromMalformedJson(content: string): string | null {
    const sections: string[] = [];
    
    // Try to extract overall_score
    const scoreMatch = content.match(/"overall_score"\s*:\s*(\d+)/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1]);
      sections.push(`## Code Quality Analysis\n\n**Overall Score:** ${score >= 70 ? "✅" : "❌"} ${score}/100`);
    }

    // Try to extract issues
    const issuesMatch = content.match(/"issues"\s*:\s*\[([\s\S]*?)\]/);
    if (issuesMatch) {
      sections.push("**Issues Found:**\n- See detailed analysis below");
    }

    // Try to extract vulnerabilities
    const vulnsMatch = content.match(/"vulnerabilities"\s*:\s*\[([\s\S]*?)\]/);
    if (vulnsMatch) {
      sections.push("## Security Review\n\n**Vulnerabilities:** Check detected");
    }

    return sections.length > 0 ? sections.join("\n\n---\n\n") : null;
  }

  /**
   * Safe wrapper for formatQualityAnalysis - handles unknown structure
   */
  private safeFormatQualityAnalysis(data: Record<string, unknown>): string | null {
    try {
      // Handle issues as either array or stringified JSON
      let issues: unknown[] = [];
      if (Array.isArray(data.issues)) {
        issues = data.issues;
      } else if (typeof data.issues === "string") {
        // Try to parse stringified JSON array
        try {
          const parsed = JSON.parse(data.issues.replace(/«|»/g, '"'));
          if (Array.isArray(parsed)) issues = parsed;
        } catch {
          // Ignore parse errors
        }
      }
      
      const score = typeof data.overall_score === "number" ? data.overall_score : 0;
      
      return this.formatQualityAnalysis({
        issues: issues.map((i: unknown) => {
          const issue = i as Record<string, unknown>;
          return {
            severity: String(issue.severity || "unknown"),
            category: String(issue.category || "general"),
            description: String(issue.description || ""),
            line_reference: issue.line_reference ? String(issue.line_reference) : undefined,
            suggestion: issue.suggestion ? String(issue.suggestion) : undefined,
          };
        }),
        overall_score: score,
      });
    } catch {
      return null;
    }
  }

  /**
   * Safe wrapper for formatSecurityReview - handles unknown structure
   */
  private safeFormatSecurityReview(data: Record<string, unknown>): string | null {
    try {
      // Handle vulnerabilities as either array or stringified JSON
      let vulns: unknown[] = [];
      if (Array.isArray(data.vulnerabilities)) {
        vulns = data.vulnerabilities;
      } else if (typeof data.vulnerabilities === "string") {
        // Try to parse stringified JSON array
        try {
          const parsed = JSON.parse(data.vulnerabilities.replace(/«|»/g, '"'));
          if (Array.isArray(parsed)) vulns = parsed;
        } catch {
          // Ignore parse errors
        }
      }
      
      return this.formatSecurityReview({
        vulnerabilities: vulns.map((v: unknown) => {
          const vuln = v as Record<string, unknown>;
          return {
            type: String(vuln.type || "unknown"),
            severity: String(vuln.severity || "unknown"),
            description: String(vuln.description || ""),
            mitigation: vuln.mitigation ? String(vuln.mitigation) : undefined,
          };
        }),
        secure_coding_violations: this.toStringArray(data.secure_coding_violations),
        recommendations: this.toStringArray(data.recommendations),
      });
    } catch {
      return null;
    }
  }

  /**
   * Safe wrapper for formatImprovements - handles unknown structure
   */
  private safeFormatImprovements(data: Record<string, unknown>): string | null {
    try {
      const improvements = Array.isArray(data.improvements) ? data.improvements : [];
      
      return this.formatImprovements({
        improvements: improvements.map((i: unknown) => {
          const imp = i as Record<string, unknown>;
          return {
            area: String(imp.area || "General"),
            current: imp.current ? String(imp.current) : undefined,
            suggested: String(imp.suggested || ""),
            rationale: String(imp.rationale || ""),
          };
        }),
        refined_code: data.refined_code ? String(data.refined_code) : undefined,
        summary: String(data.summary || ""),
      });
    } catch {
      return null;
    }
  }

  /**
   * Safe wrapper for formatApproval - handles unknown structure
   */
  private safeFormatApproval(data: Record<string, unknown>): string | null {
    try {
      return this.formatApproval({
        approved: Boolean(data.approved),
        final_code: data.final_code ? String(data.final_code) : undefined,
        notes: data.notes ? String(data.notes) : undefined,
      });
    } catch {
      return null;
    }
  }

  private buildAnalysisPrompt(context: AgentContext): string {
    const generatedCode = context.previousArtifacts?.nanoscript_generator || "";
    const contextInfo = context.previousArtifacts?.context_provider || "";

    return `Review and analyze the following generated code:

**Original Task:**
${context.initialTask}

**Context/Requirements:**
${contextInfo || "No additional context provided."}

**Generated Code:**
${generatedCode}

Please perform a comprehensive review:
1. Analyze code quality and identify any bugs or issues
2. Perform a security review for vulnerabilities
3. Suggest improvements for performance, maintainability, and best practices
4. Provide a refined version if needed
5. Approve or flag the code for revision

Use the available tools to structure your analysis.`;
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
          case "analyze_code_quality":
            outputs.push(this.formatQualityAnalysis(args));
            break;

          case "security_review":
            outputs.push(this.formatSecurityReview(args));
            break;

          case "suggest_improvements":
            outputs.push(this.formatImprovements(args));
            break;

          case "approve_output":
            outputs.push(this.formatApproval(args));
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

  private formatQualityAnalysis(args: {
    issues: Array<{
      severity: string;
      category: string;
      description: string;
      line_reference?: string;
      suggestion?: string;
    }>;
    overall_score: number;
  }): string {
    const issuesList = args.issues.length
      ? args.issues
          .map(
            (issue) =>
              `- **[${issue.severity.toUpperCase()}] ${issue.category}:** ${issue.description}` +
              (issue.line_reference ? ` (${issue.line_reference})` : "") +
              (issue.suggestion ? `\n  → Suggestion: ${issue.suggestion}` : "")
          )
          .join("\n")
      : "No issues found.";

    const scoreEmoji = args.overall_score >= 80 ? "✅" : args.overall_score >= 60 ? "⚠️" : "❌";

    return `## Code Quality Analysis

**Overall Score:** ${scoreEmoji} ${args.overall_score}/100

**Issues Found:**
${issuesList}`;
  }

  private formatSecurityReview(args: {
    vulnerabilities: Array<{
      type: string;
      severity: string;
      description: string;
      mitigation?: string;
    }>;
    secure_coding_violations?: string[];
    recommendations?: string[];
  }): string {
    const vulns = args.vulnerabilities.length
      ? args.vulnerabilities
          .map(
            (v) =>
              `- **[${v.severity.toUpperCase()}] ${v.type}:** ${v.description}` +
              (v.mitigation ? `\n  → Mitigation: ${v.mitigation}` : "")
          )
          .join("\n")
      : "No vulnerabilities found.";

    const violations = args.secure_coding_violations?.length
      ? `\n**Secure Coding Violations:**\n${args.secure_coding_violations.map((v) => `- ${v}`).join("\n")}`
      : "";

    const recs = args.recommendations?.length
      ? `\n**Recommendations:**\n${args.recommendations.map((r) => `- ${r}`).join("\n")}`
      : "";

    return `## Security Review

**Vulnerabilities:**
${vulns}${violations}${recs}`;
  }

  private formatImprovements(args: {
    improvements: Array<{
      area: string;
      current?: string;
      suggested: string;
      rationale: string;
    }>;
    refined_code?: string;
    summary: string;
  }): string {
    const improvementsList = args.improvements
      .map(
        (imp) =>
          `### ${imp.area}\n` +
          (imp.current ? `**Current:** ${imp.current}\n` : "") +
          `**Suggested:** ${imp.suggested}\n` +
          `**Rationale:** ${imp.rationale}`
      )
      .join("\n\n");

    const refinedCode = args.refined_code
      ? `\n**Refined Code:**\n\`\`\`\n${args.refined_code}\n\`\`\``
      : "";

    return `## Suggested Improvements

**Summary:** ${args.summary}

${improvementsList}${refinedCode}`;
  }

  private formatApproval(args: {
    approved: boolean;
    final_code?: string;
    notes?: string;
  }): string {
    const status = args.approved ? "✅ APPROVED" : "❌ NEEDS REVISION";
    const notes = args.notes ? `\n**Notes:** ${args.notes}` : "";
    const code = args.final_code
      ? `\n**Final Code:**\n\`\`\`\n${args.final_code}\n\`\`\``
      : "";

    return `## Final Decision

**Status:** ${status}${notes}${code}`;
  }
}
