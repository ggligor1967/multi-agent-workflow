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

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");

  type SelectContextValue = {
    value: string;
    items: Map<string, string>;
    registerItem: (value: string, label: string) => void;
  };

  const SelectContext = React.createContext<SelectContextValue | null>(null);

  function useSelectContext() {
    const context = React.useContext(SelectContext);
    if (!context) {
      throw new Error("Select components must be used inside Select");
    }
    return context;
  }

  function Select({ value = "", children }: { value?: string; children: React.ReactNode }) {
    const [items, setItems] = React.useState<Map<string, string>>(new Map());

    const registerItem = React.useCallback((itemValue: string, label: string) => {
      setItems((previous) => {
        if (previous.get(itemValue) === label) {
          return previous;
        }

        const next = new Map(previous);
        next.set(itemValue, label);
        return next;
      });
    }, []);

    const contextValue = React.useMemo(
      () => ({ value, items, registerItem }),
      [items, registerItem, value]
    );

    return React.createElement(SelectContext.Provider, { value: contextValue }, children);
  }

  function SelectTrigger({
    children,
    id,
    disabled,
  }: {
    children: React.ReactNode;
    id?: string;
    disabled?: boolean;
  }) {
    return React.createElement(
      "button",
      { type: "button", id, disabled },
      children
    );
  }

  function SelectValue({ placeholder }: { placeholder?: string }) {
    const context = useSelectContext();
    const label = context.items.get(context.value) ?? placeholder ?? "";
    return React.createElement("span", null, label);
  }

  function SelectContent({ children }: { children: React.ReactNode }) {
    return React.createElement("div", { hidden: true }, children);
  }

  function SelectItem({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) {
    const context = useSelectContext();
    const label = typeof children === "string" ? children : String(children ?? "");

    React.useEffect(() => {
      context.registerItem(value, label);
    }, [context, label, value]);

    return null;
  }

  return {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  };
});

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

const defaultConfigs: LauncherConfig[] = [
  {
    id: 123,
    name: "Release checklist",
    initialTask: "Generate a release checklist",
    llmModel: "llama3.2:latest",
  },
];

const defaultModels = ["deepseek-v3.1:671b-cloud", "llama3.2:latest"];

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
  mocks.runsCreateUseMutation.mockReturnValue({
    mutate: mocks.mutate,
    isPending: false,
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

    const modelTrigger = container.querySelector("#model");
    await waitFor(() => {
      expect(modelTrigger?.textContent ?? "").toContain("deepseek-v3.1:671b-cloud");
    });

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
});
