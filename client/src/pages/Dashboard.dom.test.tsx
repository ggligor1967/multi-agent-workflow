// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useAuth: vi.fn(),
  runsListUseQuery: vi.fn(),
  configsListUseQuery: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflow: {
      runs: {
        list: {
          useQuery: (...args: unknown[]) => mocks.runsListUseQuery(...args),
        },
      },
      configs: {
        list: {
          useQuery: (...args: unknown[]) => mocks.configsListUseQuery(...args),
        },
      },
    },
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/dashboard", mocks.navigate],
}));

import Dashboard from "./Dashboard";

type DashboardRun = {
  id: number;
  userId: number;
  configId: number | null;
  status: string;
  initialTask: string;
  selectedModel: string | null;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  errorMessage: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type DashboardConfig = {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  initialTask: string;
  llmModel: string;
  mistralModel: string;
  isActive: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function renderDashboard({
  runs = [],
  configs = [],
  runsError = null,
  configsError = null,
  hasRunsData = true,
  hasConfigsData = true,
}: {
  runs?: DashboardRun[];
  configs?: DashboardConfig[];
  runsError?: Error | null;
  configsError?: Error | null;
  hasRunsData?: boolean;
  hasConfigsData?: boolean;
} = {}) {
  mocks.runsListUseQuery.mockReturnValue({
    data: hasRunsData ? { data: runs } : undefined,
    error: runsError,
    isLoading: false,
  });

  mocks.configsListUseQuery.mockReturnValue({
    data: hasConfigsData ? { data: configs } : undefined,
    error: configsError,
    isLoading: false,
  });

  return render(<Dashboard />);
}

describe("Dashboard DOM smoke coverage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.useAuth.mockReset();
    mocks.runsListUseQuery.mockReset();
    mocks.configsListUseQuery.mockReset();

    mocks.useAuth.mockReturnValue({
      isAuthenticated: true,
      user: {
        name: "Dashboard User",
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows truthful recent status counts and scope microcopy based on the latest 10 runs", () => {
    renderDashboard({
      runs: [
        {
          id: 1,
          userId: 1,
          configId: null,
          status: "pending",
          initialTask: "Pending run",
          selectedModel: null,
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          createdAt: "2026-05-03T10:00:00.000Z",
          updatedAt: "2026-05-03T10:00:00.000Z",
        },
        {
          id: 2,
          userId: 1,
          configId: null,
          status: "running",
          initialTask: "Running run",
          selectedModel: null,
          startedAt: "2026-05-03T10:01:00.000Z",
          completedAt: null,
          errorMessage: null,
          createdAt: "2026-05-03T10:01:00.000Z",
          updatedAt: "2026-05-03T10:01:00.000Z",
        },
        {
          id: 3,
          userId: 1,
          configId: null,
          status: "completed",
          initialTask: "Completed run",
          selectedModel: null,
          startedAt: "2026-05-03T10:02:00.000Z",
          completedAt: "2026-05-03T10:03:00.000Z",
          errorMessage: null,
          createdAt: "2026-05-03T10:02:00.000Z",
          updatedAt: "2026-05-03T10:03:00.000Z",
        },
        {
          id: 4,
          userId: 1,
          configId: null,
          status: "failed",
          initialTask: "Failed run",
          selectedModel: null,
          startedAt: "2026-05-03T10:04:00.000Z",
          completedAt: "2026-05-03T10:05:00.000Z",
          errorMessage: "Boom",
          createdAt: "2026-05-03T10:04:00.000Z",
          updatedAt: "2026-05-03T10:05:00.000Z",
        },
      ],
      configs: [
        {
          id: 10,
          userId: 1,
          name: "Starter config",
          description: null,
          initialTask: "Ship it",
          llmModel: "mistral-small",
          mistralModel: "mistral-small",
          isActive: 1,
          createdAt: "2026-05-03T10:00:00.000Z",
          updatedAt: "2026-05-03T10:00:00.000Z",
        },
        {
          id: 11,
          userId: 1,
          name: "Second config",
          description: null,
          initialTask: "Ship it again",
          llmModel: "mistral-small",
          mistralModel: "mistral-small",
          isActive: 1,
          createdAt: "2026-05-03T10:00:00.000Z",
          updatedAt: "2026-05-03T10:00:00.000Z",
        },
      ],
    });

    expect(mocks.runsListUseQuery).toHaveBeenCalledWith(
      { limit: 10, offset: 0 },
      { enabled: true }
    );
    screen.getByText("Based on the latest 10 workflow runs");
    expect(screen.getByLabelText("Recent Pending").textContent).toBe("1");
    expect(screen.getByLabelText("Recent Running").textContent).toBe("1");
    expect(screen.getByLabelText("Recent Completed").textContent).toBe("1");
    expect(screen.getByLabelText("Recent Failed").textContent).toBe("1");
    expect(screen.getByText("Saved Configs")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("shows zero recent status counts and preserves the empty recent-runs state", () => {
    renderDashboard({
      runs: [],
      configs: [],
    });

    expect(screen.getByLabelText("Recent Pending").textContent).toBe("0");
    expect(screen.getByLabelText("Recent Running").textContent).toBe("0");
    expect(screen.getByLabelText("Recent Completed").textContent).toBe("0");
    expect(screen.getByLabelText("Recent Failed").textContent).toBe("0");
    expect(screen.queryByText("Unable to load recent workflow runs.")).toBeNull();
    expect(screen.queryByText("Unable to load saved workflow configs.")).toBeNull();
    screen.getByText("No workflow runs yet. Use Launch Workflow to start one.");
  });

  it("shows a recent workflow runs error while preserving saved config data", () => {
    renderDashboard({
      configs: [
        {
          id: 10,
          userId: 1,
          name: "Starter config",
          description: null,
          initialTask: "Ship it",
          llmModel: "mistral-small",
          mistralModel: "mistral-small",
          isActive: 1,
          createdAt: "2026-05-03T10:00:00.000Z",
          updatedAt: "2026-05-03T10:00:00.000Z",
        },
      ],
      runsError: new Error("Unable to load runs"),
      hasRunsData: false,
    });

    expect(screen.getByText("Unable to load recent workflow runs.")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText("Saved Configs")).toBeTruthy();
    expect(screen.queryByText("Recent Activity Summary")).toBeNull();
    expect(screen.queryByText("Recent Workflow Runs")).toBeNull();
  });

  it("shows a saved workflow configs error while preserving recent run data", () => {
    renderDashboard({
      runs: [
        {
          id: 7,
          userId: 1,
          configId: null,
          status: "running",
          initialTask: "Open recent run",
          selectedModel: null,
          startedAt: "2026-05-03T10:00:00.000Z",
          completedAt: null,
          errorMessage: null,
          createdAt: "2026-05-03T10:00:00.000Z",
          updatedAt: "2026-05-03T10:00:00.000Z",
        },
      ],
      configsError: new Error("Unable to load configs"),
      hasConfigsData: false,
    });

    expect(screen.getByText("Unable to load saved workflow configs.")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByLabelText("Recent Running").textContent).toBe("1");
    expect(screen.getByText("Open recent run")).toBeTruthy();
    expect(screen.queryByText("Saved Configs")).toBeNull();
  });

  it("shows both dashboard load errors without crashing", () => {
    renderDashboard({
      runsError: new Error("Unable to load runs"),
      configsError: new Error("Unable to load configs"),
      hasRunsData: false,
      hasConfigsData: false,
    });

    expect(screen.getByText("Workflow Dashboard")).toBeTruthy();
    expect(screen.getByText("Unable to load recent workflow runs.")).toBeTruthy();
    expect(screen.getByText("Unable to load saved workflow configs.")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Launch Workflow/i })).toBeTruthy();
  });

  it("keeps dashboard quick actions and recent run navigation available", () => {
    renderDashboard({
      runs: [
        {
          id: 7,
          userId: 1,
          configId: null,
          status: "running",
          initialTask: "Open recent run",
          selectedModel: null,
          startedAt: "2026-05-03T10:00:00.000Z",
          completedAt: null,
          errorMessage: null,
          createdAt: "2026-05-03T10:00:00.000Z",
          updatedAt: "2026-05-03T10:00:00.000Z",
        },
      ],
      configs: [],
    });

    fireEvent.click(screen.getByRole("button", { name: /Launch Workflow/i }));
    expect(mocks.navigate).toHaveBeenLastCalledWith("/launcher");

    fireEvent.click(screen.getByRole("button", { name: /New Configuration/i }));
    expect(mocks.navigate).toHaveBeenLastCalledWith("/configs");

    screen.getByRole("button", { name: /Configure Agents/i });

    fireEvent.click(screen.getByText("Open recent run"));
    expect(mocks.navigate).toHaveBeenLastCalledWith("/runs/7");
  });
});