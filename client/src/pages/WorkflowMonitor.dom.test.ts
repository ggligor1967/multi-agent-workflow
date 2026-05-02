// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useAuth: vi.fn(),
  runsGetUseQuery: vi.fn(),
  runsOnUpdateUseSubscription: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflow: {
      runs: {
        get: {
          useQuery: (...args: unknown[]) => mocks.runsGetUseQuery(...args),
        },
        onUpdate: {
          useSubscription: (...args: unknown[]) => mocks.runsOnUpdateUseSubscription(...args),
        },
      },
    },
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/runs/456", mocks.navigate],
}));

import WorkflowMonitor, { buildRetryLauncherPath } from "./WorkflowMonitor";

type MonitorRun = {
  id: number;
  status: "failed" | "pending" | "running" | "completed";
  configId: unknown;
  initialTask: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
};

function renderMonitor(configId: unknown) {
  const run: MonitorRun = {
    id: 456,
    status: "failed",
    configId,
    initialTask: "Recover the failed workflow",
    createdAt: "2026-05-03T10:00:00.000Z",
    startedAt: "2026-05-03T10:00:05.000Z",
    completedAt: "2026-05-03T10:01:00.000Z",
    errorMessage: "Worker crashed",
  };

  mocks.runsGetUseQuery.mockReturnValue({
    data: {
      success: true,
      data: {
        run,
        steps: [],
        artifacts: [],
        events: [],
        metrics: {
          stepDurations: [],
        },
      },
    },
    isLoading: false,
    error: null,
    refetch: mocks.refetch,
  });
  mocks.runsOnUpdateUseSubscription.mockReturnValue(undefined);

  return render(createElement(WorkflowMonitor, { params: { id: "456" } }));
}

describe("buildRetryLauncherPath", () => {
  it.each([
    [123, "/launcher?configId=123"],
    ["123", "/launcher"],
    [null, "/launcher"],
    [undefined, "/launcher"],
    [0, "/launcher"],
    [-1, "/launcher"],
    [12.5, "/launcher"],
    [Number.NaN, "/launcher"],
  ])("returns %s -> %s", (configId, expectedPath) => {
    expect(buildRetryLauncherPath(configId)).toBe(expectedPath);
  });
});

describe("WorkflowMonitor DOM smoke coverage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.useAuth.mockReset();
    mocks.runsGetUseQuery.mockReset();
    mocks.runsOnUpdateUseSubscription.mockReset();
    mocks.refetch.mockReset();

    mocks.useAuth.mockReturnValue({
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("preserves config context when retrying a failed run with a valid config id", () => {
    renderMonitor(123);

    fireEvent.click(screen.getByRole("button", { name: /Try Again/i }));

    expect(mocks.navigate).toHaveBeenLastCalledWith("/launcher?configId=123");
  });

  it("falls back to the plain launcher path when retrying a failed run without a valid config id", () => {
    renderMonitor(null);

    fireEvent.click(screen.getByRole("button", { name: /Try Again/i }));

    expect(mocks.navigate).toHaveBeenLastCalledWith("/launcher");
  });
});