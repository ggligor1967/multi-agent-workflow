// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useAuth: vi.fn(),
  runsListUseQuery: vi.fn(),
  refetch: vi.fn(),
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
    },
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/history", mocks.navigate],
}));

vi.mock("@/components/ui/select", () => import("./__test-helpers__/select-mock"));

import HistoryViewer, { buildHistoryRelaunchPath } from "./HistoryViewer";

type HistoryRun = {
  id: number;
  userId: number;
  configId: number | null;
  initialTask: string;
  status: string;
  createdAt: string | Date;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  errorMessage: string | null;
};

function renderHistoryViewer(runs: HistoryRun[]) {
  mocks.runsListUseQuery.mockReturnValue({
    data: { data: runs },
    isLoading: false,
    refetch: mocks.refetch,
  });

  return render(createElement(HistoryViewer));
}

describe("buildHistoryRelaunchPath", () => {
  it.each([
    [123, "/launcher?configId=123"],
    [null, null],
    [undefined, null],
    [0, null],
    [-1, null],
    [12.5, null],
    ["123", null],
    [Number.NaN, null],
  ])("returns %s -> %s", (configId, expectedPath) => {
    expect(buildHistoryRelaunchPath(configId)).toBe(expectedPath);
  });
});

describe("HistoryViewer DOM smoke coverage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.useAuth.mockReset();
    mocks.runsListUseQuery.mockReset();
    mocks.refetch.mockReset();

    mocks.useAuth.mockReturnValue({
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a relaunch action for history rows with a valid config id and navigates to the launcher context", () => {
    renderHistoryViewer([
      {
        id: 42,
        userId: 1,
        configId: 123,
        initialTask: "Release checklist",
        status: "completed",
        createdAt: "2026-05-03T10:00:00.000Z",
        startedAt: "2026-05-03T10:00:02.000Z",
        completedAt: "2026-05-03T10:01:02.000Z",
        errorMessage: null,
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Launch again/i }));

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenLastCalledWith("/launcher?configId=123");
  });

  it("does not show the config-based relaunch action when a history row has no config id", () => {
    renderHistoryViewer([
      {
        id: 43,
        userId: 1,
        configId: null,
        initialTask: "Ad hoc run",
        status: "failed",
        createdAt: "2026-05-03T10:00:00.000Z",
        startedAt: "2026-05-03T10:00:02.000Z",
        completedAt: "2026-05-03T10:00:20.000Z",
        errorMessage: "Boom",
      },
    ]);

    expect(screen.queryByRole("button", { name: /Launch again/i })).toBeNull();
  });

  it("keeps the existing row navigation to the run monitor", () => {
    renderHistoryViewer([
      {
        id: 45,
        userId: 1,
        configId: 123,
        initialTask: "Open existing run",
        status: "running",
        createdAt: "2026-05-03T10:00:00.000Z",
        startedAt: "2026-05-03T10:00:02.000Z",
        completedAt: null,
        errorMessage: null,
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Open run 45/i }));

    expect(mocks.navigate).toHaveBeenLastCalledWith("/runs/45");
  });

  it("supports keyboard navigation to the run monitor from the main row action", () => {
    renderHistoryViewer([
      {
        id: 46,
        userId: 1,
        configId: 123,
        initialTask: "Keyboard open run",
        status: "completed",
        createdAt: "2026-05-03T10:00:00.000Z",
        startedAt: "2026-05-03T10:00:02.000Z",
        completedAt: "2026-05-03T10:01:02.000Z",
        errorMessage: null,
      },
    ]);

    const rowAction = screen.getByRole("button", { name: /Open run 46/i });

    fireEvent.keyDown(rowAction, { key: "Enter" });
    expect(mocks.navigate).toHaveBeenLastCalledWith("/runs/46");

    fireEvent.keyDown(rowAction, { key: " " });
    expect(mocks.navigate).toHaveBeenLastCalledWith("/runs/46");
  });
});