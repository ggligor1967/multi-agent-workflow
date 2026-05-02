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

// Use real wouter with an in-memory location so Router/Route/Switch/useLocation/useSearch
// are the real implementations — changes to App.tsx routing will be reflected in this test.
vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  const { memoryLocation } = await import("wouter/memory-location");
  const React = await import("react");

  function Router({
    children,
    initialPath = "/",
  }: {
    children: React.ReactNode;
    initialPath?: string;
  }) {
    const memRef = React.useRef<ReturnType<typeof memoryLocation> | null>(null);
    if (!memRef.current) {
      memRef.current = memoryLocation({ path: initialPath });
    }
    return React.createElement(actual.Router, { hook: memRef.current.hook }, children);
  }

  return { ...actual, Router };
});

// Shared Select shim — avoids duplicating the bespoke jsdom stub across smoke tests.
vi.mock("@/components/ui/select", () => import("./__test-helpers__/select-mock"));

import { Router, useLocation, useSearch } from "wouter";
import { AppRoutes } from "@/App";

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

/** Renders the real app route table so routing changes in App.tsx break this test. */
function LocationProbe() {
  const [location] = useLocation();
  const search = useSearch();
  const full = search ? `${location}?${search}` : location;
  return createElement("div", { "data-testid": "location" }, full);
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
      createElement(AppRoutes),
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
