import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Loader2, Play, Plus, Zap } from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const {
    data: runsResult,
    error: runsError,
    isLoading: isRunsLoading,
  } = trpc.workflow.runs.list.useQuery(
    { limit: 10, offset: 0 },
    { enabled: isAuthenticated }
  );

  const {
    data: configsResult,
    error: configsError,
    isLoading: isConfigsLoading,
  } = trpc.workflow.configs.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const runsLoadError =
    runsError ??
    (runsResult?.success === false
      ? new Error(runsResult.error || "Unable to load recent workflow runs.")
      : null);
  const configsLoadError =
    configsError ??
    (configsResult?.success === false
      ? new Error(configsResult.error || "Unable to load saved workflow configs.")
      : null);
  const hasRunsData = runsResult?.success === true;
  const hasConfigsData = configsResult?.success === true;
  const runs = hasRunsData ? runsResult.data ?? [] : [];
  const configs = hasConfigsData ? configsResult.data ?? [] : [];
  const loading = isRunsLoading || isConfigsLoading;
  const recentRunStatusCounts = runs.reduce(
    (counts, run) => {
      if (run.status === "pending") counts.pending += 1;
      else if (run.status === "running") counts.running += 1;
      else if (run.status === "completed") counts.completed += 1;
      else if (run.status === "failed") counts.failed += 1;

      return counts;
    },
    {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
    }
  );
  const recentRunStatusCards = [
    {
      key: "pending",
      title: "Recent Pending",
      description: "Queued in recent activity",
      count: recentRunStatusCounts.pending,
    },
    {
      key: "running",
      title: "Recent Running",
      description: "Currently in progress",
      count: recentRunStatusCounts.running,
    },
    {
      key: "completed",
      title: "Recent Completed",
      description: "Finished successfully",
      count: recentRunStatusCounts.completed,
    },
    {
      key: "failed",
      title: "Recent Failed",
      description: "Need attention",
      count: recentRunStatusCounts.failed,
    },
  ];

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Workflow Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Welcome back, {user?.name || "User"}. Manage your AI workflow executions.
          </p>
        </div>

        {runsLoadError || configsLoadError ? (
          <div className="mb-8 space-y-4">
            {runsLoadError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Unable to load recent workflow runs.</AlertTitle>
                <AlertDescription>
                  The dashboard could not refresh recent workflow activity right now.
                </AlertDescription>
              </Alert>
            ) : null}

            {configsLoadError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Unable to load saved workflow configs.</AlertTitle>
                <AlertDescription>
                  The dashboard could not refresh saved workflow configurations right now.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        {/* Recent Activity Summary */}
        {hasRunsData ? (
          <div className="mb-8">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Activity Summary</h2>
              <p className="text-sm text-gray-500">Based on the latest 10 workflow runs</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {recentRunStatusCards.map((card) => {
                const titleId = `dashboard-stat-${card.key}`;

                return (
                  <Card key={card.key}>
                    <CardHeader className="pb-3">
                      <h3 id={titleId} className="text-sm font-medium leading-none font-semibold">
                        {card.title}
                      </h3>
                    </CardHeader>
                    <CardContent>
                      <output aria-labelledby={titleId} className="block text-2xl font-bold">
                        {card.count}
                      </output>
                      <p className="text-xs text-gray-500 mt-1">{card.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : null}

        {hasConfigsData ? (
          <div className="mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Saved Configs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{configs.length}</div>
                <p className="text-xs text-gray-500 mt-1">Available workflow configurations</p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="flex gap-4 mb-8">
          <Button
            onClick={() => navigate("/launcher")}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Play className="w-4 h-4" />
            Launch Workflow
          </Button>
          <Button
            onClick={() => navigate("/configs")}
            variant="outline"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            New Configuration
          </Button>
          <Button
            onClick={() => navigate("/agents")}
            variant="outline"
            className="gap-2"
          >
            <Zap className="w-4 h-4" />
            Configure Agents
          </Button>
        </div>

        {/* Recent Runs */}
        {hasRunsData ? (
          <Card>
            <CardHeader>
              <CardTitle>Recent Workflow Runs</CardTitle>
              <CardDescription>Last 10 executions</CardDescription>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No workflow runs yet. Use Launch Workflow to start one.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {runs.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/runs/${run.id}`)}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {run.initialTask.substring(0, 50)}
                          {run.initialTask.length > 50 ? "..." : ""}
                        </p>
                        <p className="text-sm text-gray-500">
                          {run.createdAt
                            ? new Date(run.createdAt).toLocaleString()
                            : "Unknown date"}
                        </p>
                      </div>
                      <Badge className={getStatusColor(run.status)}>
                        {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
