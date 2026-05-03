import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Search, History, Filter, Calendar, CheckCircle, XCircle, Clock, Play } from "lucide-react";
import { useLocation } from "wouter";

interface WorkflowRun {
  id: number;
  userId: number;
  configId: number | null;
  initialTask: string;
  status: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  errorMessage: string | null;
}

export function buildHistoryRelaunchPath(configId: unknown): string | null {
  return typeof configId === "number" && Number.isInteger(configId) && configId > 0
    ? `/launcher?configId=${configId}`
    : null;
}

export default function HistoryViewer() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [limit, setLimit] = useState(50);

  // Fetch runs
  const { data: runsResult, isLoading, refetch } = trpc.workflow.runs.list.useQuery(
    { limit, offset: 0 },
    { enabled: isAuthenticated }
  );
  const allRuns = (runsResult?.data || []) as unknown as WorkflowRun[];

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  // Filtered runs
  const filteredRuns = useMemo(() => {
    let runs = [...allRuns];

    // Status filter
    if (statusFilter !== "all") {
      runs = runs.filter(r => r.status === statusFilter);
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      const filterDate = new Date();
      
      switch (dateFilter) {
        case "today":
          filterDate.setHours(0, 0, 0, 0);
          break;
        case "week":
          filterDate.setDate(now.getDate() - 7);
          break;
        case "month":
          filterDate.setMonth(now.getMonth() - 1);
          break;
      }
      
      runs = runs.filter(r => new Date(r.createdAt) >= filterDate);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      runs = runs.filter(r => 
        r.initialTask.toLowerCase().includes(query) ||
        r.id.toString().includes(query)
      );
    }

    return runs;
  }, [allRuns, statusFilter, dateFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = allRuns.length;
    const completed = allRuns.filter(r => r.status === "completed").length;
    const failed = allRuns.filter(r => r.status === "failed").length;
    const running = allRuns.filter(r => r.status === "running").length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { total, completed, failed, running, successRate };
  }, [allRuns]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "failed": return <XCircle className="w-4 h-4 text-red-600" />;
      case "running": return <Play className="w-4 h-4 text-blue-600 animate-pulse" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      running: "bg-blue-100 text-blue-800",
      pending: "bg-gray-100 text-gray-800",
    };
    return variants[status] || variants.pending;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (start: Date | string, end: Date | string | null) => {
    if (!end) return "In progress";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
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
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <History className="w-8 h-8 text-indigo-600" />
            Execution History
          </h1>
          <p className="text-gray-600 mt-2">
            View, filter, and search all workflow executions.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-gray-500">Total Runs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <p className="text-xs text-gray-500">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <p className="text-xs text-gray-500">Failed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold text-blue-600">{stats.running}</div>
              <p className="text-xs text-gray-500">Running</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{stats.successRate}%</div>
              <p className="text-xs text-gray-500">Success Rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4 items-end">
              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs text-gray-500 mb-1 block">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by task or run ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div className="w-[150px]">
                <Label className="text-xs text-gray-500 mb-1 block">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Filter */}
              <div className="w-[150px]">
                <Label className="text-xs text-gray-500 mb-1 block">Time Period</Label>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last 7 Days</SelectItem>
                    <SelectItem value="month">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Limit */}
              <div className="w-[120px]">
                <Label className="text-xs text-gray-500 mb-1 block">Show</Label>
                <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 runs</SelectItem>
                    <SelectItem value="50">50 runs</SelectItem>
                    <SelectItem value="100">100 runs</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button variant="outline" onClick={() => refetch()} className="gap-2">
                <Filter className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin w-8 h-8 text-gray-400" />
          </div>
        ) : filteredRuns.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {allRuns.length === 0 
                  ? "No workflow runs yet. Launch a workflow to get started."
                  : "No runs match your filters."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Showing {filteredRuns.length} of {allRuns.length} runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredRuns.map((run) => {
                  const relaunchPath = buildHistoryRelaunchPath(run.configId);

                  return (
                    <div
                      key={run.id}
                      className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Open run ${run.id}`}
                        onClick={() => navigate(`/runs/${run.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            navigate(`/runs/${run.id}`);
                          }
                        }}
                        className="flex flex-1 items-center gap-4 min-w-0 cursor-pointer"
                      >
                        {getStatusIcon(run.status)}

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {run.initialTask}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(run.createdAt)}
                            </span>
                            <span>
                              Duration: {formatDuration(run.createdAt, run.completedAt)}
                            </span>
                            <span className="text-gray-400">
                              ID: {run.id}
                            </span>
                          </div>
                        </div>

                        <Badge className={getStatusBadge(run.status)}>
                          {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                        </Badge>
                      </div>

                      {relaunchPath ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => navigate(relaunchPath)}
                        >
                          <Play className="w-4 h-4" />
                          Launch again
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
