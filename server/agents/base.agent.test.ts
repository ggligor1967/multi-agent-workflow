import { describe, it, expect, vi } from "vitest";
import type { AgentConfig } from "../../drizzle/schema";
import { BaseAgent, type AgentContext, type AgentResult } from "./base.agent";
import type { Tool } from "../_core/llm";

// Mock the LLM module so no real HTTP calls are made during tests
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// ─── Minimal concrete subclass for testing protected methods ─────────────────
//
// BaseAgent is abstract, so we create a minimal TestAgent that exposes the
// protected helper methods as public wrappers, enabling direct unit testing
// without going through the full agent execution pipeline.

const MOCK_CONFIG: AgentConfig = {
  id: 1,
  userId: 1,
  agentType: "test_agent",
  role: "Test Role",
  goal: "Test Goal",
  backstory: "Test Backstory",
  llmModel: "test-model",
  isActive: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

class TestAgent extends BaseAgent {
  get agentType(): string {
    return "test_agent";
  }

  protected getTools(): Tool[] {
    return [];
  }

  async execute(_context: AgentContext): Promise<AgentResult> {
    return { success: true, content: "test" };
  }

  // ── Public wrappers for protected helpers ──────────────────────────────────

  /** @see BaseAgent.toStringArray */
  public testToStringArray(value: unknown): string[] {
    return this.toStringArray(value);
  }

  /** @see BaseAgent.tryParseJson */
  public testTryParseJson(str: string): Record<string, unknown> | null {
    return this.tryParseJson(str);
  }

  /** @see BaseAgent.parseToolCallFromContent */
  public testParseToolCallFromContent(
    content: string
  ): Record<string, unknown> | null {
    return this.parseToolCallFromContent(content);
  }

  /** @see BaseAgent.extractCodeFromMalformedJson */
  public testExtractCodeFromMalformedJson(content: string): string | null {
    return this.extractCodeFromMalformedJson(content);
  }

  /** @see BaseAgent.parseAllToolCallsFromContent */
  public testParseAllToolCallsFromContent(
    content: string
  ): Array<Record<string, unknown>> {
    return this.parseAllToolCallsFromContent(content);
  }
}

const agent = new TestAgent(MOCK_CONFIG);

// ─── toStringArray ────────────────────────────────────────────────────────────
//
// toStringArray converts heterogeneous values (arrays, JSON strings, CSV strings,
// bare strings, nullish) into a uniform string[].  It is used by all three agents
// to normalise tool-call output before further processing.

describe("BaseAgent.toStringArray", () => {
  it("returns [] for null, undefined, and other falsy values", () => {
    // Guard against nullish values passed from LLM output that lacks expected fields
    expect(agent.testToStringArray(null)).toEqual([]);
    expect(agent.testToStringArray(undefined)).toEqual([]);
    expect(agent.testToStringArray(0)).toEqual([]);
    expect(agent.testToStringArray("")).toEqual([]);
  });

  it("converts each element of a native array to a string", () => {
    // String arrays are returned unchanged; numeric arrays are stringified
    expect(agent.testToStringArray(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(agent.testToStringArray([1, 2, 3])).toEqual(["1", "2", "3"]);
  });

  it("parses a JSON-serialised array string into a string array", () => {
    // LLMs sometimes return arrays serialised as JSON strings
    expect(agent.testToStringArray('["x","y"]')).toEqual(["x", "y"]);
  });

  it("splits a comma-separated string into trimmed, non-empty tokens", () => {
    // Handles the common "a, b, c" pattern returned by LLMs for list fields
    expect(agent.testToStringArray("foo, bar, baz")).toEqual([
      "foo",
      "bar",
      "baz",
    ]);
  });

  it("wraps a plain single string in a single-element array", () => {
    // A non-empty, non-CSV string is treated as one item
    expect(agent.testToStringArray("hello")).toEqual(["hello"]);
  });

  it("returns [] for a whitespace-only string", () => {
    // Whitespace is treated as empty, matching the trim().filter(Boolean) behaviour
    expect(agent.testToStringArray("   ")).toEqual([]);
  });
});

// ─── tryParseJson ─────────────────────────────────────────────────────────────
//
// tryParseJson attempts to parse a string as JSON, applying light repair
// heuristics for common LLM output malformations before giving up.

describe("BaseAgent.tryParseJson", () => {
  it("parses well-formed JSON without any repair", () => {
    const result = agent.testTryParseJson('{"key":"value"}');
    expect(result).toEqual({ key: "value" });
  });

  it("returns null for completely invalid JSON (no repair possible)", () => {
    expect(agent.testTryParseJson("not json at all")).toBeNull();
  });

  it("repairs a trailing comma before a closing brace", () => {
    // Common LLM output: extra trailing comma in objects
    const result = agent.testTryParseJson('{"key":"value",}');
    expect(result).toEqual({ key: "value" });
  });

  it("repairs a trailing comma before a closing bracket", () => {
    // Common LLM output: extra trailing comma in arrays
    const result = agent.testTryParseJson('{"arr":["a","b",]}');
    expect(result).toEqual({ arr: ["a", "b"] });
  });

  it("repairs unquoted property names (simple case)", () => {
    // Some LLMs omit quotes around property names
    const result = agent.testTryParseJson('{key:"value"}');
    expect(result).toEqual({ key: "value" });
  });
});

// ─── parseToolCallFromContent ─────────────────────────────────────────────────
//
// parseToolCallFromContent handles the variety of formats in which an LLM may
// return a JSON tool-call: plain JSON, markdown-fenced JSON, or JSON embedded
// in prose.

describe("BaseAgent.parseToolCallFromContent", () => {
  it("parses a plain JSON object from content", () => {
    const result = agent.testParseToolCallFromContent(
      '{"name":"test","value":1}'
    );
    expect(result).toEqual({ name: "test", value: 1 });
  });

  it("parses JSON wrapped in a ```json code block", () => {
    const content =
      '```json\n{"name":"provide_context","domain_context":"test"}\n```';
    const result = agent.testParseToolCallFromContent(content);
    expect(result).toMatchObject({ name: "provide_context" });
  });

  it("parses JSON wrapped in a plain ``` code block", () => {
    const content = '```\n{"key":"value"}\n```';
    const result = agent.testParseToolCallFromContent(content);
    expect(result).toEqual({ key: "value" });
  });

  it("returns null for empty or whitespace-only content", () => {
    expect(agent.testParseToolCallFromContent("")).toBeNull();
    expect(agent.testParseToolCallFromContent("   ")).toBeNull();
  });

  it("returns null when the content contains no JSON object", () => {
    expect(
      agent.testParseToolCallFromContent("plain text with no JSON")
    ).toBeNull();
  });

  it("extracts the first JSON object from content mixed with prose", () => {
    const content = 'Some preamble text\n{"code":"hello"}\nSome suffix';
    const result = agent.testParseToolCallFromContent(content);
    expect(result).toMatchObject({ code: "hello" });
  });
});

// ─── extractCodeFromMalformedJson ─────────────────────────────────────────────
//
// extractCodeFromMalformedJson applies four successive strategies to extract
// source code from JSON that cannot be fully parsed.  This handles real-world
// LLM output where code strings contain newlines, backticks, or nested braces
// that break standard JSON parsing.

describe("BaseAgent.extractCodeFromMalformedJson", () => {
  it("extracts a code string from a well-formed 'code' property (strategy 1)", () => {
    const content =
      '{"name":"generate_code","code":"function add(a, b) { return a + b; }"}';
    const result = agent.testExtractCodeFromMalformedJson(content);
    expect(result).toContain("function add");
  });

  it("extracts code from a markdown code block embedded in a JSON string (strategy 1/4)", () => {
    const content = '{"description":"test","code":"```ts\\nconst x = 1;\\n```"}';
    const result = agent.testExtractCodeFromMalformedJson(content);
    expect(result).not.toBeNull();
  });

  it("extracts a function definition from content using keyword detection (strategy 3)", () => {
    const content =
      '{"description":"test"} function computeSum(a, b) { return a + b; }';
    const result = agent.testExtractCodeFromMalformedJson(content);
    expect(result).not.toBeNull();
    expect(result).toContain("computeSum");
  });

  it("returns null when no recognisable code pattern is present", () => {
    const result = agent.testExtractCodeFromMalformedJson(
      "no code here at all"
    );
    expect(result).toBeNull();
  });
});

// ─── parseAllToolCallsFromContent ─────────────────────────────────────────────
//
// parseAllToolCallsFromContent collects every tool-call JSON object from an LLM
// response that may contain multiple fenced code blocks or bare JSON objects.

describe("BaseAgent.parseAllToolCallsFromContent", () => {
  it("returns an empty array for empty content", () => {
    expect(agent.testParseAllToolCallsFromContent("")).toEqual([]);
  });

  it("returns an array with one item for a single JSON object", () => {
    const result = agent.testParseAllToolCallsFromContent('{"key":"val"}');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ key: "val" });
  });

  it("extracts all JSON objects from multiple markdown code blocks", () => {
    const content = [
      "```json",
      '{"name":"block1"}',
      "```",
      "",
      "```json",
      '{"name":"block2"}',
      "```",
    ].join("\n");

    const results = agent.testParseAllToolCallsFromContent(content);
    expect(results.length).toBeGreaterThanOrEqual(2);
    const names = results.map((r) => r.name);
    expect(names).toContain("block1");
    expect(names).toContain("block2");
  });
});
