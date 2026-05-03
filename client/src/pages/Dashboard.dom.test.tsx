// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useAuth: vi.fn(),
  runsListUseQuery: vi.fn(),
  configsListUseQuery: vi.fn(),
  runsRefetch: vi.fn(),
  configsRefetch: vi.fn(),
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

type DashboardQuerySuccess<T> = {
  success: true;
  data: T;
};

type DashboardQueryFailure = {
  success: false;
  error: string;
};

type DashboardQueryResult<T> = DashboardQuerySuccess<T> | DashboardQueryFailure;

function renderDashboard(options: {
  runs?: DashboardRun[];
  configs?: DashboardConfig[];
  runsError?: Error | null;
  configsError?: Error | null;
  runsData?: DashboardQueryResult<DashboardRun[]> | undefined;
  configsData?: DashboardQueryResult<DashboardConfig[]> | undefined;
  runsIsFetching?: boolean;
  configsIsFetching?: boolean;
  runsRefetch?: ReturnType<typeof vi.fn>;
  configsRefetch?: ReturnType<typeof vi.fn>;
} = {}) {
  const runs = options.runs ?? [];
  const configs = options.configs ?? [];
  const runsError = options.runsError ?? null;
  const configsError = options.configsError ?? null;
  const runsData = "runsData" in options ? options.runsData : { success: true, data: runs };
  const configsData = "configsData" in options
    ? options.configsData
    : { success: true, data: configs };
  const runsIsFetching = options.runsIsFetching ?? false;
  const configsIsFetching = options.configsIsFetching ?? false;
  const runsRefetch = options.runsRefetch ?? mocks.runsRefetch;
  const configsRefetch = options.configsRefetch ?? mocks.configsRefetch;

  mocks.runsListUseQuery.mockReturnValue({
    data: runsData,
    error: runsError,
    isFetching: runsIsFetching,
    isLoading: false,
    refetch: runsRefetch,
  });

  mocks.configsListUseQuery.mockReturnValue({
    data: configsData,
    error: configsError,
    isFetching: configsIsFetching,
    isLoading: false,
    refetch: configsRefetch,
  });

  return render(<Dashboard />);
}

describe("Dashboard DOM smoke coverage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.useAuth.mockReset();
    mocks.runsListUseQuery.mockReset();
    mocks.configsListUseQuery.mockReset();
    mocks.runsRefetch.mockReset();
    mocks.configsRefetch.mockReset();

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
      runsData: {
        success: false,
        error: "DB unavailable",
      },
    });

    expect(screen.getByText("Unable to load recent workflow runs.")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Retry recent workflow runs/i })).toBeTruthy();
    expect(screen.getByText("Saved Configs")).toBeTruthy();
    expect(screen.queryByText("Recent Activity Summary")).toBeNull();
    expect(screen.queryByText("Recent Workflow Runs")).toBeNull();
    expect(screen.queryByText("No workflow runs yet. Use Launch Workflow to start one.")).toBeNull();
  });

  it("clicking the runs retry action calls the runs query refetch", () => {
    renderDashboard({
      runsData: {
        success: false,
        error: "DB unavailable",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /Retry recent workflow runs/i }));

    expect(mocks.runsRefetch).toHaveBeenCalledTimes(1);
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
      configsData: {
        success: false,
        error: "Config DB unavailable",
      },
    });

    expect(screen.getByText("Unable to load saved workflow configs.")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Retry saved workflow configs/i })).toBeTruthy();
    expect(screen.getByLabelText("Recent Running").textContent).toBe("1");
    expect(screen.getByText("Open recent run")).toBeTruthy();
    expect(screen.queryByText("Saved Configs")).toBeNull();
  });

  it("clicking the configs retry action calls the configs query refetch", () => {
    renderDashboard({
      configsData: {
        success: false,
        error: "Configs unavailable",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /Retry saved workflow configs/i }));

    expect(mocks.configsRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows both dashboard load errors without crashing", () => {
    renderDashboard({
      runsError: new Error("Network failure"),
      runsData: undefined,
      configsData: {
        success: false,
        error: "Configs unavailable",
      },
    });

    expect(screen.getByText("Workflow Dashboard")).toBeTruthy();
    expect(screen.getByText("Unable to load recent workflow runs.")).toBeTruthy();
    expect(screen.getByText("Unable to load saved workflow configs.")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Retry recent workflow runs/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry saved workflow configs/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Launch Workflow/i })).toBeTruthy();
  });

  it("shows a query-level workflow runs error without treating it as empty success", () => {
    renderDashboard({
      runsError: new Error("Transport failure"),
      runsData: undefined,
      configs: [],
    });

    expect(screen.getByText("Unable to load recent workflow runs.")).toBeTruthy();
    expect(screen.queryByText("Recent Activity Summary")).toBeNull();
    expect(screen.queryByText("No workflow runs yet. Use Launch Workflow to start one.")).toBeNull();
    expect(screen.getByText("Saved Configs")).toBeTruthy();
  });

  it("disables retry buttons while their corresponding query is fetching", () => {
    renderDashboard({
      runsData: {
        success: false,
        error: "DB unavailable",
      },
      configsData: {
        success: false,
        error: "Configs unavailable",
      },
      runsIsFetching: true,
      configsIsFetching: true,
    });

    expect((screen.getByRole("button", { name: /Retry recent workflow runs/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Retry saved workflow configs/i }) as HTMLButtonElement).disabled).toBe(true);
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