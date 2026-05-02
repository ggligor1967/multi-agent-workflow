import { describe, expect, it } from "vitest";
import {
  buildConfigPrefillState,
  buildRunCreateInput,
  parsePositiveConfigId,
  resolveAvailableModel,
  shouldApplyUrlConfigPrefill,
} from "./WorkflowLauncher";

const availableModels = ["deepseek-v3.1:671b-cloud", "llama3.2:latest"];

describe("WorkflowLauncher config prefill helpers", () => {
  it("prefills launcher state from a URL configId and matching saved config", () => {
    const urlConfigId = parsePositiveConfigId("configId=123");
    const config = {
      id: 123,
      initialTask: "Generate a release checklist",
      llmModel: "llama3.2:latest",
    };

    expect(urlConfigId).toBe(123);
    expect(buildConfigPrefillState(config, availableModels)).toEqual({
      selectedConfig: "123",
      initialTask: "Generate a release checklist",
      selectedModel: "llama3.2:latest",
    });
  });

  it("sends numeric configId and available model when launching from a saved config", () => {
    expect(
      buildRunCreateInput(
        "123",
        "  Generate a release checklist  ",
        "llama3.2:latest",
        availableModels
      )
    ).toEqual({
      configId: 123,
      initialTask: "Generate a release checklist",
      modelId: "llama3.2:latest",
    });
  });

  it("falls back when a saved config model is no longer available", () => {
    const config = {
      id: 123,
      initialTask: "Generate a release checklist",
      llmModel: "stale-model:latest",
    };

    expect(resolveAvailableModel(config.llmModel, availableModels)).toBe(
      "deepseek-v3.1:671b-cloud"
    );
    expect(buildConfigPrefillState(config, availableModels).selectedModel).toBe(
      "deepseek-v3.1:671b-cloud"
    );
    expect(
      buildRunCreateInput("123", config.initialTask, "stale-model:latest", availableModels)
    ).toEqual({
      configId: 123,
      initialTask: "Generate a release checklist",
      modelId: undefined,
    });
  });

  it("keeps manual launcher usage without configId valid", () => {
    expect(
      buildRunCreateInput(
        "",
        "  Run a manual launcher task  ",
        "deepseek-v3.1:671b-cloud",
        availableModels
      )
    ).toEqual({
      configId: undefined,
      initialTask: "Run a manual launcher task",
      modelId: "deepseek-v3.1:671b-cloud",
    });
  });

  it("allows URL configId changes to apply a new matching config", () => {
    expect(shouldApplyUrlConfigPrefill(456, 123, false)).toBe(true);

    expect(
      buildConfigPrefillState(
        {
          id: 456,
          initialTask: "Generate migration notes",
          llmModel: "deepseek-v3.1:671b-cloud",
        },
        availableModels
      )
    ).toEqual({
      selectedConfig: "456",
      initialTask: "Generate migration notes",
      selectedModel: "deepseek-v3.1:671b-cloud",
    });
  });

  it("does not reapply stale URL prefill after it already ran", () => {
    expect(shouldApplyUrlConfigPrefill(123, 123, false)).toBe(false);
  });

  it("waits for available models before URL prefill", () => {
    expect(shouldApplyUrlConfigPrefill(123, null, true)).toBe(false);
  });
});
