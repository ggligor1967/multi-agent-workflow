// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  navigate: vi.fn(),
  search: vi.fn<() => string>(),
  useAuth: vi.fn(),
  configsUseQuery: vi.fn(),
  modelsUseQuery: vi.fn(),
  runsCreateUseMutation: vi.fn(),
  mutationOptions: undefined as unknown,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflow: {
      configs: {
        list: {
          useQuery: (...args: unknown[]) => mocks.configsUseQuery(...args),
        },
      },
      getAvailableModels: {
        useQuery: (...args: unknown[]) => mocks.modelsUseQuery(...args),
      },
      runs: {
        create: {
          useMutation: (options: unknown) => mocks.runsCreateUseMutation(options),
        },
      },
    },
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/launcher", mocks.navigate],
  useSearch: () => mocks.search(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

// Shared Select shim — avoids duplicating the bespoke jsdom stub across smoke tests.
vi.mock("@/components/ui/select", () => import("./__test-helpers__/select-mock"));

import WorkflowLauncher from "./WorkflowLauncher";

type LauncherConfig = {
  id: number;
  name: string;
  initialTask: string;
  llmModel: string;
};

type RenderOptions = {
  search?: string;
  configs?: LauncherConfig[];
  models?: string[];
};

type MutationOptions = {
  onSuccess?: (result: {
    success: boolean;
    data?: { id?: number };
    error?: string;
  }) => void;
  onError?: (error: Error) => void;
};

const defaultConfigs: LauncherConfig[] = [
  {
    id: 123,
    name: "Release checklist",
    initialTask: "Generate a release checklist",
    llmModel: "llama3.2:latest",
  },
];

const defaultModels = ["deepseek-v3.1:671b-cloud", "llama3.2:latest"];

async function expectTriggerLabel(
  container: HTMLElement,
  selector: string,
  expectedText: string
) {
  await waitFor(() => {
    expect(container.querySelector(selector)?.textContent ?? "").toContain(expectedText);
  });
}

function getMutationOptions(): MutationOptions {
  return (mocks.mutationOptions as MutationOptions | undefined) ?? {};
}

function renderLauncher(options: RenderOptions = {}) {
  const {
    search = "?configId=123",
    configs = defaultConfigs,
    models = defaultModels,
  } = options;

  mocks.search.mockReturnValue(search);
  mocks.configsUseQuery.mockReturnValue({
    data: { data: configs },
    isLoading: false,
  });
  mocks.modelsUseQuery.mockReturnValue({
    data: { data: models },
    isLoading: false,
  });
  mocks.runsCreateUseMutation.mockImplementation((mutationOptions: MutationOptions) => {
    mocks.mutationOptions = mutationOptions;
    return {
      mutate: mocks.mutate,
      isPending: false,
    };
  });

  return render(createElement(WorkflowLauncher));
}

describe("WorkflowLauncher DOM smoke coverage", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.navigate.mockReset();
    mocks.search.mockReset();
    mocks.useAuth.mockReset();
    mocks.configsUseQuery.mockReset();
    mocks.modelsUseQuery.mockReset();
    mocks.runsCreateUseMutation.mockReset();
    mocks.mutationOptions = undefined;
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();

    mocks.useAuth.mockReturnValue({
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("prefills the launcher form from a valid configId URL and submits numeric configId", async () => {
    const { container } = renderLauncher();

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/Initial Task/i) as HTMLTextAreaElement).value
      ).toBe("Generate a release checklist");
    });

    const configTrigger = container.querySelector("#config");
    const modelTrigger = container.querySelector("#model");

    await waitFor(() => {
      expect(configTrigger?.textContent ?? "").toContain("Release checklist");
      expect(modelTrigger?.textContent ?? "").toContain("llama3.2:latest");
    });

    fireEvent.click(screen.getByRole("button", { name: /Launch Workflow/i }));

    expect(mocks.mutate).toHaveBeenCalledWith({
      configId: 123,
      initialTask: "Generate a release checklist",
      modelId: "llama3.2:latest",
    });
  });

  it("falls back to the first available model when the saved model is no longer valid", async () => {
    const { container } = renderLauncher({
      configs: [
        {
          id: 123,
          name: "Fallback model config",
          initialTask: "Summarize release risks",
          llmModel: "stale-model:latest",
        },
      ],
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/Initial Task/i) as HTMLTextAreaElement).value
      ).toBe("Summarize release risks");
    });

    await expectTriggerLabel(container, "#model", "deepseek-v3.1:671b-cloud");

    fireEvent.click(screen.getByRole("button", { name: /Launch Workflow/i }));

    expect(mocks.mutate).toHaveBeenCalledWith({
      configId: 123,
      initialTask: "Summarize release risks",
      modelId: "deepseek-v3.1:671b-cloud",
    });
  });

  it("does not prefill or submit a bad configId when the URL param is invalid", async () => {
    const { container } = renderLauncher({
      search: "?configId=abc",
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/Initial Task/i) as HTMLTextAreaElement).value
      ).toBe("");
    });

    const configTrigger = container.querySelector("#config");
    const modelTrigger = container.querySelector("#model");

    await waitFor(() => {
      expect(configTrigger?.textContent ?? "").toContain("Select a configuration");
      expect(modelTrigger?.textContent ?? "").toContain("deepseek-v3.1:671b-cloud");
    });

    fireEvent.change(screen.getByLabelText(/Initial Task/i), {
      target: { value: "Run a DOM smoke test" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Launch Workflow/i }));

    expect(mocks.mutate).toHaveBeenCalledWith({
      configId: undefined,
      initialTask: "Run a DOM smoke test",
      modelId: "deepseek-v3.1:671b-cloud",
    });
  });

  it("shows a success state with the created run id and monitor navigation after a successful submit", async () => {
    renderLauncher();

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/Initial Task/i) as HTMLTextAreaElement).value
      ).toBe("Generate a release checklist");
    });

    fireEvent.click(screen.getByRole("button", { name: /Launch Workflow/i }));

    expect(mocks.mutate).toHaveBeenCalledWith({
      configId: 123,
      initialTask: "Generate a release checklist",
      modelId: "llama3.2:latest",
    });

    getMutationOptions().onSuccess?.({
      success: true,
      data: { id: 456 },
    });

    await waitFor(() => {
      expect(screen.getByText(/Workflow created successfully/i)).toBeTruthy();
    });

    expect(screen.getByText(/Run ID: 456/i)).toBeTruthy();
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Open Run Monitor/i }));

    expect(mocks.navigate).toHaveBeenLastCalledWith("/runs/456");
    expect(screen.getByRole("button", { name: /View History/i })).toBeTruthy();
  });

  it("keeps the existing error toast behavior and does not show a success state when submit fails", async () => {
    renderLauncher();

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/Initial Task/i) as HTMLTextAreaElement).value
      ).toBe("Generate a release checklist");
    });

    fireEvent.click(screen.getByRole("button", { name: /Launch Workflow/i }));

    getMutationOptions().onError?.(new Error("Network down"));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("Error: Network down");
    });

    expect(screen.queryByText(/Workflow created successfully/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Open Run Monitor/i })).toBeNull();
  });
});
