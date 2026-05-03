// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
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
}: {
  runs?: DashboardRun[];
  configs?: DashboardConfig[];
} = {}) {
  mocks.runsListUseQuery.mockReturnValue({
    data: { data: runs },
    isLoading: false,
  });

  mocks.configsListUseQuery.mockReturnValue({
    data: { data: configs },
    isLoading: false,
  });

  return render(createElement(Dashboard));
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

    screen.getByText("Based on the latest 10 workflow runs");
    expect(screen.getByLabelText("Recent Pending count").textContent).toBe("1");
    expect(screen.getByLabelText("Recent Running count").textContent).toBe("1");
    expect(screen.getByLabelText("Recent Completed count").textContent).toBe("1");
    expect(screen.getByLabelText("Recent Failed count").textContent).toBe("1");
    expect(screen.getByText("Saved Configs")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("shows zero recent status counts and preserves the empty recent-runs state", () => {
    renderDashboard({
      runs: [],
      configs: [],
    });

    expect(screen.getByLabelText("Recent Pending count").textContent).toBe("0");
    expect(screen.getByLabelText("Recent Running count").textContent).toBe("0");
    expect(screen.getByLabelText("Recent Completed count").textContent).toBe("0");
    expect(screen.getByLabelText("Recent Failed count").textContent).toBe("0");
    screen.getByText("No workflow runs yet. Start by launching a new workflow.");
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
