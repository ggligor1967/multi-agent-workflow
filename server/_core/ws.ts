import { EventEmitter } from "events";
import type { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import type { appRouter } from "../routers";
import { createContext } from "./context";

/**
 * Workflow event types for real-time updates
 */
export type WorkflowEventType =
  | "step_update"
  | "artifact_created"
  | "run_status_changed"
  | "run_completed"
  | "run_failed";

/**
 * Workflow event payload structure
 */
export interface WorkflowEvent {
  type: WorkflowEventType;
  runId: number;
  data: {
    stepName?: string;
    stepStatus?: string;
    artifactType?: string;
    artifactId?: number;
    status?: string;
    errorMessage?: string;
    timestamp: string;
  };
}

/**
 * Global EventEmitter singleton for workflow events
 * Used to broadcast updates from workflow engine to WebSocket clients
 */
class WorkflowEventEmitter extends EventEmitter {
  private static instance: WorkflowEventEmitter;

  private constructor() {
    super();
    // Increase max listeners to handle multiple concurrent workflow runs
    this.setMaxListeners(100);
  }

  static getInstance(): WorkflowEventEmitter {
    if (!WorkflowEventEmitter.instance) {
      WorkflowEventEmitter.instance = new WorkflowEventEmitter();
    }
    return WorkflowEventEmitter.instance;
  }

  /**
   * Emit a step update event
   */
  emitStepUpdate(runId: number, stepName: string, stepStatus: string): void {
    const event: WorkflowEvent = {
      type: "step_update",
      runId,
      data: {
        stepName,
        stepStatus,
        timestamp: new Date().toISOString(),
      },
    };
    this.emit(`workflow:${runId}`, event);
    this.emit("workflow:all", event);
    console.log(`[WS] Step update: run=${runId}, step=${stepName}, status=${stepStatus}`);
  }

  /**
   * Emit an artifact created event
   */
  emitArtifactCreated(runId: number, artifactType: string, artifactId: number): void {
    const event: WorkflowEvent = {
      type: "artifact_created",
      runId,
      data: {
        artifactType,
        artifactId,
        timestamp: new Date().toISOString(),
      },
    };
    this.emit(`workflow:${runId}`, event);
    this.emit("workflow:all", event);
    console.log(`[WS] Artifact created: run=${runId}, type=${artifactType}`);
  }

  /**
   * Emit a run status changed event
   */
  emitRunStatusChanged(runId: number, status: string, errorMessage?: string): void {
    const event: WorkflowEvent = {
      type: status === "completed" ? "run_completed" : status === "failed" ? "run_failed" : "run_status_changed",
      runId,
      data: {
        status,
        errorMessage,
        timestamp: new Date().toISOString(),
      },
    };
    this.emit(`workflow:${runId}`, event);
    this.emit("workflow:all", event);
    console.log(`[WS] Run status changed: run=${runId}, status=${status}`);
  }
}

// Export singleton instance
export const workflowEvents = WorkflowEventEmitter.getInstance();

/**
 * WebSocket server state
 */
let wssHandler: ReturnType<typeof applyWSSHandler<typeof appRouter>> | null = null;

/**
 * Set up WebSocket server for tRPC subscriptions
 */
export function setupWebSocketServer(httpServer: HTTPServer, router: typeof appRouter): void {
  // Create WebSocket server attached to HTTP server
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/api/trpc",
  });

  // Apply tRPC WebSocket handler
  wssHandler = applyWSSHandler<typeof appRouter>({
    wss,
    router,
    createContext: async (opts) => {
      // For WebSocket connections, we create a minimal context
      // Real auth would need to be handled via connection params or cookies
      return {
        req: {
          protocol: "wss",
          headers: opts.req?.headers || {},
          get: (name: string) => {
            const headers = opts.req?.headers || {};
            return headers[name.toLowerCase()] as string | undefined;
          },
        } as any,
        res: {} as any,
        user: null, // WebSocket connections start unauthenticated
      };
    },
  });

  // Log WebSocket connections
  wss.on("connection", (ws: WebSocket, req) => {
    console.log(`[WS] Client connected from ${req.socket.remoteAddress}`);

    ws.on("close", () => {
      console.log(`[WS] Client disconnected`);
    });

    ws.on("error", (error) => {
      console.error(`[WS] Error:`, error);
    });
  });

  console.log(`[WS] WebSocket server initialized on /api/trpc`);
}

/**
 * Clean up WebSocket server
 */
export function closeWebSocketServer(): void {
  if (wssHandler) {
    wssHandler.broadcastReconnectNotification();
    console.log(`[WS] WebSocket server closed`);
  }
}
