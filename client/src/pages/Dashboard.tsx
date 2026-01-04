import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useWorkflows } from "@/_core/hooks/useWorkflows";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Plus, Zap } from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const { listRuns, listConfigs } = useWorkflows();
  const [, navigate] = useLocation();

  const [runs, setRuns] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
      return;
    }

    const loadData = async () => {
      setLoading(true);
      const [runsData, configsData] = await Promise.all([
        listRuns(10, 0),
        listConfigs(),
      ]);
      setRuns(runsData || []);
      setConfigs(configsData || []);
      setLoading(false);
    };

    loadData();
  }, [isAuthenticated]);

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

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{runs.length}</div>
              <p className="text-xs text-gray-500 mt-1">Workflow executions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Saved Configs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{configs.length}</div>
              <p className="text-xs text-gray-500 mt-1">Workflow configurations</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {runs.length > 0
                  ? Math.round(
                      (runs.filter((r) => r.status === "completed").length / runs.length) * 100
                    )
                  : 0}
                %
              </div>
              <p className="text-xs text-gray-500 mt-1">Completed runs</p>
            </CardContent>
          </Card>
        </div>

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
        <Card>
          <CardHeader>
            <CardTitle>Recent Workflow Runs</CardTitle>
            <CardDescription>Last 10 executions</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No workflow runs yet. Start by launching a new workflow.</p>
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
      </div>
    </div>
  );
}
