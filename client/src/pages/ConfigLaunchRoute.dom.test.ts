// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createConfigMutate: vi.fn(),
  updateConfigMutate: vi.fn(),
  deleteConfigMutate: vi.fn(),
  createRunMutate: vi.fn(),
  refetchConfigs: vi.fn(),
  useAuth: vi.fn(),
  configsUseQuery: vi.fn(),
  modelsUseQuery: vi.fn(),
  configsCreateUseMutation: vi.fn(),
  configsUpdateUseMutation: vi.fn(),
  configsDeleteUseMutation: vi.fn(),
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
        create: {
          useMutation: (options: unknown) => mocks.configsCreateUseMutation(options),
        },
        update: {
          useMutation: (options: unknown) => mocks.configsUpdateUseMutation(options),
        },
        delete: {
          useMutation: (options: unknown) => mocks.configsDeleteUseMutation(options),
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

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  const { memoryLocation } = await import("wouter/memory-location");

  const memory = memoryLocation({ path: "/" });

  return {
    ...actual,
    Router: ({ children }: { children: React.ReactNode }) =>
      createElement(actual.Router, { hook: memory.hook }, children),
    useLocation: memory.hook,
  };
});

  function useRouterContext() {
    const context = React.useContext(RouterContext);
    if (!context) {
      throw new Error("wouter test router must be used inside Router");
    }

    return context;
  }

  function Router({
    initialPath = "/",
    children,
  }: {
    initialPath?: string;
    children: React.ReactNode;
  }) {
    const [location, setLocation] = React.useState(initialPath);
    const navigate = React.useCallback((to: string) => {
      setLocation(to);
    }, []);

    const value = React.useMemo(
      () => ({ location, navigate }),
      [location, navigate]
    );

    return React.createElement(RouterContext.Provider, { value }, children);
  }

  function useLocation() {
    const { location, navigate } = useRouterContext();
    return [location, navigate] as const;
  }

  function useSearch() {
    return getSearch(useRouterContext().location);
  }

  function Route({
    path,
    component: Component,
    children,
  }: {
    path?: string;
    component?: React.ComponentType;
    children?: React.ReactNode | ((params: Record<string, string>) => React.ReactNode);
  }) {
    const pathname = getPathname(useRouterContext().location);
    if (!matchesPath(pathname, path)) {
      return null;
    }

    if (Component) {
      return React.createElement(Component);
    }

    if (typeof children === "function") {
      return children({});
    }

    return children ?? null;
  }

  function Switch({ children }: { children: React.ReactNode }) {
    const pathname = getPathname(useRouterContext().location);
    let fallback: React.ReactNode = null;

    for (const child of React.Children.toArray(children)) {
      if (!React.isValidElement<{ path?: string }>(child)) {
        continue;
      }

      const childPath = child.props.path;
      if (!childPath) {
        fallback ??= child;
        continue;
      }

      if (matchesPath(pathname, childPath)) {
        return child;
      }
    }

    return fallback;
  }

  return {
    Router,
    Route,
    Switch,
    useLocation,
    useSearch,
  };
});

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
    return React.createElement("button", { type: "button", id, disabled }, children);
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

import { Route, Router, Switch, useLocation } from "wouter";
import ConfigManager from "./ConfigManager";
import WorkflowLauncher from "./WorkflowLauncher";

type SavedConfig = {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  initialTask: string;
  llmModel: string;
  mistralModel: string;
  createdAt: string;
  updatedAt: string;
};

const savedConfig: SavedConfig = {
  id: 123,
  userId: 1,
  name: "Release checklist",
  description: "Launch-ready config",
  initialTask: "Generate a release checklist",
  llmModel: "llama3.2:latest",
  mistralModel: "llama3.2:latest",
  createdAt: "2026-05-03T00:00:00.000Z",
  updatedAt: "2026-05-03T00:00:00.000Z",
};

const availableModels = ["llama3.2:latest", "deepseek-v3.1:671b-cloud"];

function LocationProbe() {
  const [location] = useLocation();
  return createElement("div", { "data-testid": "location" }, location);
}

function RouteHarness() {
  return createElement(
    Switch,
    null,
    createElement(Route, { path: "/configs", component: ConfigManager }),
    createElement(Route, { path: "/launcher", component: WorkflowLauncher })
  );
}

async function expectTriggerLabel(
  container: HTMLElement,
  selector: string,
  expectedText: string
) {
  await waitFor(() => {
    expect(container.querySelector(selector)?.textContent ?? "").toContain(expectedText);
  });
}

function renderConfigLaunchFlow() {
  mocks.configsUseQuery.mockReturnValue({
    data: { data: [savedConfig] },
    isLoading: false,
    refetch: mocks.refetchConfigs,
  });
  mocks.modelsUseQuery.mockReturnValue({
    data: { data: availableModels },
    isLoading: false,
  });
  mocks.configsCreateUseMutation.mockReturnValue({
    mutate: mocks.createConfigMutate,
    isPending: false,
  });
  mocks.configsUpdateUseMutation.mockReturnValue({
    mutate: mocks.updateConfigMutate,
    isPending: false,
  });
  mocks.configsDeleteUseMutation.mockReturnValue({
    mutate: mocks.deleteConfigMutate,
    isPending: false,
  });
  mocks.runsCreateUseMutation.mockReturnValue({
    mutate: mocks.createRunMutate,
    isPending: false,
  });

  return render(
    createElement(
      Router,
      { initialPath: "/configs" },
      createElement(RouteHarness),
      createElement(LocationProbe)
    )
  );
}

describe("Configs launch route DOM smoke coverage", () => {
  beforeEach(() => {
    mocks.createConfigMutate.mockReset();
    mocks.updateConfigMutate.mockReset();
    mocks.deleteConfigMutate.mockReset();
    mocks.createRunMutate.mockReset();
    mocks.refetchConfigs.mockReset();
    mocks.useAuth.mockReset();
    mocks.configsUseQuery.mockReset();
    mocks.modelsUseQuery.mockReset();
    mocks.configsCreateUseMutation.mockReset();
    mocks.configsUpdateUseMutation.mockReset();
    mocks.configsDeleteUseMutation.mockReset();
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

  it("launches a saved config from configs and submits a numeric configId from the launcher", async () => {
    const { container } = renderConfigLaunchFlow();

    expect(screen.getByText("Release checklist")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Launch$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent ?? "").toBe("/launcher?configId=123");
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/Initial Task/i) as HTMLTextAreaElement).value
      ).toBe("Generate a release checklist");
    });

    await expectTriggerLabel(container, "#config", "Release checklist");
    await expectTriggerLabel(container, "#model", "llama3.2:latest");

    fireEvent.click(screen.getByRole("button", { name: /Launch Workflow/i }));

    expect(mocks.createRunMutate).toHaveBeenCalledWith({
      configId: 123,
      initialTask: "Generate a release checklist",
      modelId: "llama3.2:latest",
    });
  });
});
