import { describe, it, expect, vi } from "vitest";
import type { AgentConfig } from "../../drizzle/schema";
import { BaseAgent, type AgentContext, type AgentResult } from "./base.agent";
import type { Tool } from "../_core/llm";

// Mock the LLM invocation so no real HTTP calls are made
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// ─── Minimal concrete subclass for testing protected methods ─────────────────
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

  // ── Expose protected helpers for testing ──────────────────────────────────
  public testToStringArray(value: unknown): string[] {
    return this.toStringArray(value);
  }

  public testTryParseJson(str: string): Record<string, unknown> | null {
    return this.tryParseJson(str);
  }

  public testParseToolCallFromContent(
    content: string
  ): Record<string, unknown> | null {
    return this.parseToolCallFromContent(content);
  }

  public testExtractCodeFromMalformedJson(content: string): string | null {
    return this.extractCodeFromMalformedJson(content);
  }

  public testParseAllToolCallsFromContent(
    content: string
  ): Array<Record<string, unknown>> {
    return this.parseAllToolCallsFromContent(content);
  }
}

const agent = new TestAgent(MOCK_CONFIG);

// ─── toStringArray ────────────────────────────────────────────────────────────
describe("BaseAgent.toStringArray", () => {
  it("returns [] for null / undefined / falsy values", () => {
    expect(agent.testToStringArray(null)).toEqual([]);
    expect(agent.testToStringArray(undefined)).toEqual([]);
    expect(agent.testToStringArray(0)).toEqual([]);
    expect(agent.testToStringArray("")).toEqual([]);
  });

  it("maps a native array to string array", () => {
    expect(agent.testToStringArray(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(agent.testToStringArray([1, 2, 3])).toEqual(["1", "2", "3"]);
  });

  it("parses a JSON-serialised array string", () => {
    expect(agent.testToStringArray('["x","y"]')).toEqual(["x", "y"]);
  });

  it("splits a comma-separated string", () => {
    expect(agent.testToStringArray("foo, bar, baz")).toEqual([
      "foo",
      "bar",
      "baz",
    ]);
  });

  it("wraps a plain single string in an array", () => {
    expect(agent.testToStringArray("hello")).toEqual(["hello"]);
  });

  it("ignores whitespace-only strings", () => {
    expect(agent.testToStringArray("   ")).toEqual([]);
  });
});

// ─── tryParseJson ─────────────────────────────────────────────────────────────
describe("BaseAgent.tryParseJson", () => {
  it("parses valid JSON", () => {
    const result = agent.testTryParseJson('{"key":"value"}');
    expect(result).toEqual({ key: "value" });
  });

  it("returns null for completely invalid JSON", () => {
    expect(agent.testTryParseJson("not json at all")).toBeNull();
  });

  it("repairs trailing comma before closing brace", () => {
    const result = agent.testTryParseJson('{"key":"value",}');
    expect(result).toEqual({ key: "value" });
  });

  it("repairs trailing comma before closing bracket", () => {
    const result = agent.testTryParseJson('{"arr":["a","b",]}');
    expect(result).toEqual({ arr: ["a", "b"] });
  });

  it("repairs unquoted property names (simple case)", () => {
    const result = agent.testTryParseJson('{key:"value"}');
    expect(result).toEqual({ key: "value" });
  });
});

// ─── parseToolCallFromContent ─────────────────────────────────────────────────
describe("BaseAgent.parseToolCallFromContent", () => {
  it("parses a plain JSON object", () => {
    const result = agent.testParseToolCallFromContent('{"name":"test","value":1}');
    expect(result).toEqual({ name: "test", value: 1 });
  });

  it("parses JSON wrapped in a markdown json code block", () => {
    const content = '```json\n{"name":"provide_context","domain_context":"test"}\n```';
    const result = agent.testParseToolCallFromContent(content);
    expect(result).toMatchObject({ name: "provide_context" });
  });

  it("parses JSON wrapped in a plain markdown code block", () => {
    const content = '```\n{"key":"value"}\n```';
    const result = agent.testParseToolCallFromContent(content);
    expect(result).toEqual({ key: "value" });
  });

  it("returns null for empty content", () => {
    expect(agent.testParseToolCallFromContent("")).toBeNull();
    expect(agent.testParseToolCallFromContent("   ")).toBeNull();
  });

  it("returns null when no JSON object is found", () => {
    expect(agent.testParseToolCallFromContent("plain text with no JSON")).toBeNull();
  });

  it("extracts the first JSON object from mixed text", () => {
    const content = 'Some preamble text\n{"code":"hello"}\nSome suffix';
    const result = agent.testParseToolCallFromContent(content);
    expect(result).toMatchObject({ code: "hello" });
  });
});

// ─── extractCodeFromMalformedJson ─────────────────────────────────────────────
describe("BaseAgent.extractCodeFromMalformedJson", () => {
  it("extracts code from a well-formed JSON code property", () => {
    const content = '{"name":"generate_code","code":"function add(a, b) { return a + b; }"}';
    const result = agent.testExtractCodeFromMalformedJson(content);
    expect(result).toContain("function add");
  });

  it("extracts code from a markdown code block within malformed JSON", () => {
    const content = '{"description":"test","code":"```ts\\nconst x = 1;\\n```"}';
    // Strategy 1 regex should capture the code string value
    const result = agent.testExtractCodeFromMalformedJson(content);
    expect(result).not.toBeNull();
  });

  it("extracts a function definition directly from content", () => {
    // Strategy 3: function definition must end with `}` at string end (or `};`)
    const content = '{"description":"test"} function computeSum(a, b) { return a + b; }';
    const result = agent.testExtractCodeFromMalformedJson(content);
    expect(result).not.toBeNull();
    expect(result).toContain("computeSum");
  });

  it("returns null when no code pattern is found", () => {
    const result = agent.testExtractCodeFromMalformedJson("no code here at all");
    expect(result).toBeNull();
  });
});

// ─── parseAllToolCallsFromContent ─────────────────────────────────────────────
describe("BaseAgent.parseAllToolCallsFromContent", () => {
  it("returns an empty array for empty content", () => {
    expect(agent.testParseAllToolCallsFromContent("")).toEqual([]);
  });

  it("parses a single JSON object", () => {
    const result = agent.testParseAllToolCallsFromContent('{"key":"val"}');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ key: "val" });
  });

  it("parses multiple JSON code blocks", () => {
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
