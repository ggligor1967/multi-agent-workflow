import { EventEmitter } from "events";
import type { IncomingMessage, Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import type { appRouter } from "../routers";
import { DEV_USER } from "./context";
import { sdk } from "./sdk";
import type { User } from "../../drizzle/schema";

/**
 * Workflow event types for real-time updates
 */
export type WorkflowEventType =
  | "step_update"
  | "artifact_created"
  | "lifecycle_event"
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
    lifecycleEventType?: string;
    lifecycleEventLevel?: string;
    message?: string;
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
   * Emit a lifecycle event update
   */
  emitLifecycleEvent(
    runId: number,
    lifecycleEventType: string,
    lifecycleEventLevel: string,
    message: string
  ): void {
    const event: WorkflowEvent = {
      type: "lifecycle_event",
      runId,
      data: {
        lifecycleEventType,
        lifecycleEventLevel,
        message,
        timestamp: new Date().toISOString(),
      },
    };
    this.emit(`workflow:${runId}`, event);
    this.emit("workflow:all", event);
    console.log(
      `[WS] Lifecycle event: run=${runId}, event=${lifecycleEventType}, level=${lifecycleEventLevel}`
    );
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

async function authenticateWebSocket(req: IncomingMessage): Promise<User | null> {
  try {
    return await sdk.authenticateRequest(req as any);
  } catch {
    const isDev = process.env.NODE_ENV !== "production";
    const oauthConfigured = !!process.env.OAUTH_SERVER_URL;

    if (isDev && !oauthConfigured) {
      return DEV_USER;
    }

    return null;
  }
}

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
      const user = await authenticateWebSocket(opts.req);

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
        user,
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
