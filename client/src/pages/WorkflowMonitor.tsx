import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  Loader2,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Clock,
  Brain,
  Code,
  Search,
  FileText,
  ArrowRight,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useMemo, useState, useCallback } from "react";

function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs == null) {
    return "—";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatMetadataValue(value: unknown): string {
  if (value == null) {
    return "—";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

/**
 * Step configuration for display
 */
const STEP_CONFIG = {
  setup: {
    name: "Setup",
    description: "Initializing workflow and loading configurations",
    icon: Clock,
    agentName: null,
  },
  initialization: {
    name: "Context Provider",
    description: "Gathering domain context and requirements",
    icon: Search,
    agentName: "Context Provider Agent",
  },
  orchestration: {
    name: "Nanoscript Generator",
    description: "Generating code based on task and context",
    icon: Code,
    agentName: "Nanoscript Generator Agent",
  },
  synchronization: {
    name: "Critical Analyst",
    description: "Reviewing and validating the generated code",
    icon: Brain,
    agentName: "Critical Analyst Agent",
  },
} as const;

/**
 * Artifact type to display name mapping
 */
const ARTIFACT_NAMES: Record<string, string> = {
  context_data: "Context Analysis",
  nanoscript: "Generated Code",
  analysis: "Code Review",
  final_code: "Final Output",
  error: "Error Details",
};

interface WorkflowMonitorProps {
  params: { id: string };
}

export default function WorkflowMonitor({ params }: WorkflowMonitorProps) {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [isWsConnected, setIsWsConnected] = useState(false);

  const runId = parseInt(params.id);

  // Use tRPC useQuery for initial data fetch
  const {
    data: queryResult,
    isLoading,
    error: queryError,
    refetch,
  } = trpc.workflow.runs.get.useQuery(
    { id: runId },
    {
      enabled: isAuthenticated && !isNaN(runId),
      // No polling - we'll use WebSocket for real-time updates
      refetchInterval: false,
    }
  );

  const run = queryResult?.data?.run;
  const steps = queryResult?.data?.steps || [];
  const artifacts = queryResult?.data?.artifacts || [];
  const events = queryResult?.data?.events || [];
  const metrics = queryResult?.data?.metrics;

  // Determine if workflow is still in progress
  const isInProgress = run?.status === "pending" || run?.status === "running";

  // Refetch data when needed
  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  // Subscribe to real-time updates via WebSocket
  trpc.workflow.runs.onUpdate.useSubscription(
    { runId },
    {
      enabled: isAuthenticated && !isNaN(runId) && isInProgress,
      onStarted: () => {
        setIsWsConnected(true);
        console.log(`[WS] Subscribed to workflow ${runId} updates`);
      },
      onData: (event: unknown) => {
        console.log(`[WS] Received event:`, event);
        // Refetch data when we receive any event to get the latest state
        handleRefetch();
      },
      onError: (error: unknown) => {
        console.error(`[WS] Subscription error:`, error);
        setIsWsConnected(false);
      },
    }
  );

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    if (!steps || steps.length === 0) return 0;
    const completed = steps.filter(
      (s: { status: string }) => s.status === "completed" || s.status === "failed"
    ).length;
    return Math.round((completed / 4) * 100); // 4 total steps expected
  }, [steps]);

  // Get agent steps (excluding setup)
  const agentSteps = useMemo(() => {
    const stepOrder = ["initialization", "orchestration", "synchronization"];
    return stepOrder.map((stepName) => {
      const step = steps.find((s: { stepName: string }) => s.stepName === stepName);
      const config = STEP_CONFIG[stepName as keyof typeof STEP_CONFIG];
      return {
        stepName,
        config,
        step,
        status: step?.status || "pending",
      };
    });
  }, [steps]);

  const stepMetrics = useMemo(() => {
    return new Map(
      (metrics?.stepDurations || []).map(metric => [metric.stepName, metric])
    );
  }, [metrics]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "failed":
        return "bg-red-100 text-red-800 border-red-200";
      case "running":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStepBorderColor = (status: string) => {
    switch (status) {
      case "completed":
        return "border-l-green-500";
      case "failed":
        return "border-l-red-500";
      case "running":
        return "border-l-blue-500";
      default:
        return "border-l-gray-300";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="animate-spin w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600">Loading workflow...</p>
        </div>
      </div>
    );
  }

  if (queryError || !queryResult?.success) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="mb-4 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <p className="text-gray-700 font-medium">Workflow run not found</p>
                <p className="text-gray-500 mt-2">
                  {queryError?.message || queryResult?.error || "Unable to load workflow details"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="mb-4 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Workflow Execution Monitor
              </h1>
              <p className="text-gray-600 mt-2">
                Run #{runId} • Started{" "}
                {run?.createdAt
                  ? new Date(run.createdAt).toLocaleString()
                  : "Unknown"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isInProgress && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Live updates</span>
                  {isWsConnected ? (
                    <span title="WebSocket connected">
                      <Wifi className="w-4 h-4 text-green-500" />
                    </span>
                  ) : (
                    <span title="Connecting...">
                      <WifiOff className="w-4 h-4 text-gray-400" />
                    </span>
                  )}
                </div>
              )}
              <Badge className={`${getStatusColor(run?.status || "pending")} px-3 py-1`}>
                {run?.status
                  ? run.status.charAt(0).toUpperCase() + run.status.slice(1)
                  : "Unknown"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Task Description */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Task</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{run?.initialTask || "No task description"}</p>
          </CardContent>
        </Card>

        {/* Overall Progress */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Overall Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Execution Progress</span>
                <span className="text-sm text-gray-500">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Started</p>
                <p className="font-medium">
                  {run?.startedAt
                    ? new Date(run.startedAt).toLocaleTimeString()
                    : "Pending"}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Completed</p>
                <p className="font-medium">
                  {run?.completedAt
                    ? new Date(run.completedAt).toLocaleTimeString()
                    : isInProgress
                    ? "In progress..."
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Steps Completed</p>
                <p className="font-medium">
                  {steps.filter((s) => s.status === "completed").length} / 4
                </p>
              </div>
              <div>
                <p className="text-gray-600">Artifacts</p>
                <p className="font-medium">{artifacts.length} generated</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Observability */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Lifecycle Observability
            </CardTitle>
            <CardDescription>
              Queue latency, runtime, and worker lifecycle signals for this run
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Queue wait</p>
                <p className="font-medium">
                  {formatDuration(metrics?.queueLatencyMs ?? metrics?.currentQueueAgeMs)}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Execution time</p>
                <p className="font-medium">
                  {formatDuration(
                    metrics?.executionDurationMs ?? metrics?.currentExecutionAgeMs
                  )}
                </p>
              </div>
              <div>
                <p className="text-gray-600">First artifact</p>
                <p className="font-medium">
                  {formatDuration(metrics?.timeToFirstArtifactMs)}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Lifecycle span</p>
                <p className="font-medium">
                  {formatDuration(metrics?.totalLifecycleDurationMs)}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Event volume</p>
                <p className="font-medium">{metrics?.totalEventCount ?? 0} events</p>
              </div>
              <div>
                <p className="text-gray-600">Warnings / errors</p>
                <p className="font-medium">
                  {metrics?.warningEventCount ?? 0} / {metrics?.errorEventCount ?? 0}
                </p>
              </div>
            </div>
            {metrics?.lastEventAt && (
              <p className="text-xs text-gray-500">
                Last lifecycle event: {new Date(metrics.lastEventAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Agent Steps */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Agent Execution Steps</CardTitle>
            <CardDescription>
              Three AI agents working together to complete your task
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {agentSteps.map((item, index) => {
                const IconComponent = item.config.icon;
                return (
                  <div
                    key={item.stepName}
                    className={`border rounded-lg p-4 border-l-4 ${getStepBorderColor(
                      item.status
                    )} transition-all duration-300`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`p-2 rounded-lg ${
                          item.status === "running"
                            ? "bg-blue-100"
                            : item.status === "completed"
                            ? "bg-green-100"
                            : item.status === "failed"
                            ? "bg-red-100"
                            : "bg-gray-100"
                        }`}
                      >
                        <IconComponent
                          className={`w-5 h-5 ${
                            item.status === "running"
                              ? "text-blue-600"
                              : item.status === "completed"
                              ? "text-green-600"
                              : item.status === "failed"
                              ? "text-red-600"
                              : "text-gray-400"
                          }`}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-medium text-gray-900 flex items-center gap-2">
                            <span className="text-sm text-gray-400">
                              Step {index + 1}
                            </span>
                            {item.config.name}
                            {item.status === "running" && (
                              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                            )}
                          </h3>
                          <Badge className={getStatusColor(item.status)}>
                            {item.status.charAt(0).toUpperCase() +
                              item.status.slice(1)}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 mb-2">
                          {item.config.description}
                        </p>
                        {item.step?.errorMessage && (
                          <div className="bg-red-50 border border-red-200 rounded p-3 mb-2 text-sm text-red-700">
                            <strong>Error:</strong> {item.step.errorMessage}
                          </div>
                        )}
                        <div className="flex gap-4 text-xs text-gray-500">
                          {item.step?.startedAt && (
                            <span>
                              Started:{" "}
                              {new Date(item.step.startedAt).toLocaleTimeString()}
                            </span>
                          )}
                          {item.step?.completedAt && (
                            <span>
                              Completed:{" "}
                              {new Date(item.step.completedAt).toLocaleTimeString()}
                            </span>
                          )}
                          {stepMetrics.get(item.stepName)?.durationMs != null && (
                            <span>
                              Duration: {formatDuration(stepMetrics.get(item.stepName)?.durationMs)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Lifecycle Timeline */}
        {events.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Lifecycle Timeline</CardTitle>
              <CardDescription>
                Persisted worker and engine events for this workflow run
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80 rounded-md border">
                <div className="divide-y">
                  {events.map(
                    (event: {
                      id: number;
                      level: string;
                      source: string;
                      eventType: string;
                      message: string;
                      metadata?: Record<string, unknown> | null;
                      createdAt: Date | string;
                    }) => {
                      const metadataEntries = Object.entries(event.metadata || {})
                        .filter(([, value]) => value !== null && value !== undefined)
                        .slice(0, 4);

                      return (
                        <div key={event.id} className="p-4 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={getStatusColor(event.level === "error" ? "failed" : event.level === "warn" ? "pending" : "running")}>
                              {event.level.toUpperCase()}
                            </Badge>
                            <span className="text-sm font-medium text-gray-900">
                              {event.message}
                            </span>
                            <span className="text-xs text-gray-500">
                              {event.source} • {event.eventType}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(event.createdAt).toLocaleString()}
                          </div>
                          {metadataEntries.length > 0 && (
                            <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                              {metadataEntries.map(([key, value]) => (
                                <span
                                  key={key}
                                  className="rounded-full bg-gray-100 px-2 py-1"
                                >
                                  {key}: {formatMetadataValue(value)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Artifacts */}
        {artifacts.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Generated Artifacts
              </CardTitle>
              <CardDescription>
                Live output from each agent as they complete
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={artifacts[0]?.artifactType} className="w-full">
                <TabsList className="mb-4">
                  {artifacts
                    .filter((a) => a.artifactType !== "error")
                    .map((artifact) => (
                      <TabsTrigger
                        key={artifact.id}
                        value={artifact.artifactType}
                        className="gap-2"
                      >
                        {ARTIFACT_NAMES[artifact.artifactType] || artifact.artifactType}
                      </TabsTrigger>
                    ))}
                </TabsList>
                {artifacts
                  .filter((a) => a.artifactType !== "error")
                  .map((artifact) => (
                    <TabsContent key={artifact.id} value={artifact.artifactType}>
                      <ScrollArea className="h-96 rounded-md border p-4">
                        {artifact.artifactType === "nanoscript" || artifact.artifactType === "final_code" ? (
                          <pre className="text-sm whitespace-pre-wrap font-mono bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto">
                            {artifact.content}
                          </pre>
                        ) : artifact.artifactType === "analysis" ? (
                          <pre className="text-sm whitespace-pre-wrap font-sans bg-gray-50 p-4 rounded-lg text-gray-800">
                            {artifact.content}
                          </pre>
                        ) : (
                          <pre className="text-sm whitespace-pre-wrap font-mono">
                            {artifact.content}
                          </pre>
                        )}
                      </ScrollArea>
                      <p className="text-xs text-gray-500 mt-2">
                        Generated at{" "}
                        {new Date(artifact.createdAt).toLocaleString()}
                      </p>
                    </TabsContent>
                  ))}
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Error Message */}
        {run?.errorMessage && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="text-red-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Execution Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-800">{run.errorMessage}</p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button onClick={() => navigate("/dashboard")} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          {run?.status === "completed" && (
            <Button
              onClick={() => navigate(`/results/${runId}`)}
              className="bg-green-600 hover:bg-green-700"
            >
              View Full Results
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          {run?.status === "failed" && (
            <Button
              onClick={() => navigate("/launcher")}
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-50"
            >
              Try Again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
