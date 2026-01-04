import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, ArrowLeft, Download, Copy, Code, FileText, CheckCircle2, XCircle, Clock, FileJson, FileSpreadsheet } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useEffect } from "react";

// Type for artifacts from the API
interface Artifact {
  id: number;
  artifactType: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | null;
}

export default function ResultsDashboard({ params }: { params: { id: string } }) {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const runId = parseInt(params.id);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  // Fetch run data with tRPC - no polling needed for completed runs
  const { data: queryResult, isLoading, error } = trpc.workflow.runs.get.useQuery(
    { id: runId },
    { enabled: isAuthenticated && !isNaN(runId) }
  );

  const run = queryResult?.data?.run;
  const artifacts = queryResult?.data?.artifacts ?? [];

  // Helper to get artifacts by type
  const getArtifactsByType = (type: string): Artifact[] => {
    return artifacts.filter((a: Artifact) => a.artifactType === type);
  };

  // Get the primary code artifact (final_code or nanoscript)
  const getFinalCode = (): Artifact | null => {
    const finalCode = getArtifactsByType("final_code");
    if (finalCode.length > 0) return finalCode[0];
    const nanoscripts = getArtifactsByType("nanoscript");
    if (nanoscripts.length > 0) return nanoscripts[0];
    return null;
  };

  // Get the analysis report artifact
  const getAnalysisReport = (): Artifact | null => {
    const analysis = getArtifactsByType("analysis");
    if (analysis.length > 0) return analysis[0];
    const reports = getArtifactsByType("report");
    if (reports.length > 0) return reports[0];
    return null;
  };

  // Copy content to clipboard
  const handleCopy = (content: string, label: string) => {
    navigator.clipboard.writeText(content);
    toast.success(`${label} copied to clipboard!`);
  };

  // Download content as file
  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  };

  // Export all results as JSON
  const handleExportJSON = () => {
    if (!run) return;
    
    const exportData = {
      run: {
        id: run.id,
        status: run.status,
        initialTask: run.initialTask,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        errorMessage: run.errorMessage,
      },
      artifacts: artifacts.map((a: Artifact) => ({
        id: a.id,
        type: a.artifactType,
        content: a.content,
        metadata: a.metadata,
        createdAt: a.createdAt,
      })),
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `workflow-run-${runId}-export.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Exported as JSON");
  };

  // Export artifacts as CSV
  const handleExportCSV = () => {
    if (!run || artifacts.length === 0) {
      toast.error("No artifacts to export");
      return;
    }

    // Build CSV content
    const headers = ["Artifact ID", "Type", "Content Length", "Created At", "Content Preview"];
    const rows = artifacts.map((a: Artifact) => [
      a.id.toString(),
      a.artifactType,
      a.content.length.toString(),
      a.createdAt ? new Date(a.createdAt).toISOString() : "",
      `"${a.content.substring(0, 200).replace(/"/g, '""').replace(/\n/g, " ")}"`,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `workflow-run-${runId}-artifacts.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Exported as CSV");
  };

  // Export all code and analysis as a combined package
  const handleExportAll = () => {
    if (!run) return;

    const finalCode = getFinalCode();
    const analysisReport = getAnalysisReport();
    
    let content = `# Workflow Run #${runId} Export\n`;
    content += `Generated: ${new Date().toISOString()}\n`;
    content += `Status: ${run.status}\n`;
    content += `Task: ${run.initialTask}\n\n`;
    content += `${"=".repeat(80)}\n\n`;
    
    if (finalCode) {
      content += `## Generated Code\n\n`;
      content += "```\n";
      content += finalCode.content;
      content += "\n```\n\n";
      content += `${"=".repeat(80)}\n\n`;
    }

    if (analysisReport) {
      content += `## Analysis Report\n\n`;
      content += analysisReport.content;
      content += "\n\n";
      content += `${"=".repeat(80)}\n\n`;
    }

    if (artifacts.length > 0) {
      content += `## All Artifacts Summary\n\n`;
      artifacts.forEach((a: Artifact) => {
        content += `- ${a.artifactType}: ${a.content.length} chars\n`;
      });
    }

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `workflow-run-${runId}-complete.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Exported complete package");
  };

  // Status badge styling
  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; icon: React.ReactNode }> = {
      completed: { bg: "bg-green-100 text-green-800", icon: <CheckCircle2 className="w-3 h-3" /> },
      failed: { bg: "bg-red-100 text-red-800", icon: <XCircle className="w-3 h-3" /> },
      running: { bg: "bg-blue-100 text-blue-800", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
      pending: { bg: "bg-yellow-100 text-yellow-800", icon: <Clock className="w-3 h-3" /> },
    };
    const style = styles[status] || styles.pending;
    return (
      <Badge className={`${style.bg} gap-1`}>
        {style.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  // Error or not found state
  if (error || !run) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-5xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="mb-6 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <XCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Workflow Run Not Found</h2>
                <p className="text-muted-foreground">
                  {error?.message || `Run #${runId} could not be loaded.`}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const finalCode = getFinalCode();
  const analysisReport = getAnalysisReport();

  // Calculate duration if both timestamps exist
  const duration = run.startedAt && run.completedAt
    ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
    : null;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        {/* Navigation */}
        <Button
          variant="ghost"
          onClick={() => navigate("/dashboard")}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Workflow Results</h1>
            <p className="text-muted-foreground mt-1">Run #{runId}</p>
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Export Options</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportJSON} className="gap-2 cursor-pointer">
                  <FileJson className="w-4 h-4" />
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCSV} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4" />
                  Export Artifacts (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportAll} className="gap-2 cursor-pointer">
                  <FileText className="w-4 h-4" />
                  Export Complete Report (MD)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {finalCode && (
                  <DropdownMenuItem 
                    onClick={() => handleDownload(finalCode.content, `workflow-${runId}-code.ts`)} 
                    className="gap-2 cursor-pointer"
                  >
                    <Code className="w-4 h-4" />
                    Download Code Only
                  </DropdownMenuItem>
                )}
                {analysisReport && (
                  <DropdownMenuItem 
                    onClick={() => handleDownload(analysisReport.content, `workflow-${runId}-analysis.md`)} 
                    className="gap-2 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    Download Analysis Only
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {getStatusBadge(run.status)}
          </div>
        </div>

        {/* Summary Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Execution Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Task</p>
                <p className="font-medium text-sm leading-relaxed">
                  {run.initialTask.length > 100
                    ? run.initialTask.substring(0, 100) + "..."
                    : run.initialTask}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Started</p>
                <p className="font-medium text-sm">
                  {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Completed</p>
                <p className="font-medium text-sm">
                  {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Duration</p>
                <p className="font-medium text-sm">
                  {duration !== null ? `${duration}s` : "—"}
                </p>
              </div>
            </div>
            {run.errorMessage && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800 font-medium">Error</p>
                <p className="text-sm text-red-700 mt-1">{run.errorMessage}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="code" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="code" className="gap-2">
              <Code className="w-4 h-4" />
              Final Code
            </TabsTrigger>
            <TabsTrigger value="analysis" className="gap-2">
              <FileText className="w-4 h-4" />
              Analysis Report
            </TabsTrigger>
          </TabsList>

          {/* Final Code Tab */}
          <TabsContent value="code">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Generated Code</CardTitle>
                    <CardDescription>
                      Final code output from the Nanoscript Generator agent
                    </CardDescription>
                  </div>
                  {finalCode && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(finalCode.content, "Code")}
                        className="gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleDownload(finalCode.content, `workflow-${runId}-code.ts`)}
                        className="gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download Code
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {finalCode ? (
                  <div className="relative">
                    <pre className="bg-zinc-950 text-zinc-100 rounded-lg p-4 overflow-auto max-h-[500px] text-sm font-mono leading-relaxed">
                      <code>{finalCode.content}</code>
                    </pre>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No code artifacts generated yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analysis Report Tab */}
          <TabsContent value="analysis">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Analysis Report</CardTitle>
                    <CardDescription>
                      Quality review and recommendations from the Critical Analyst agent
                    </CardDescription>
                  </div>
                  {analysisReport && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(analysisReport.content, "Report")}
                        className="gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleDownload(analysisReport.content, `workflow-${runId}-analysis.md`)}
                        className="gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download Report
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {analysisReport ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <div className="bg-muted/50 rounded-lg p-6 whitespace-pre-wrap text-sm leading-relaxed">
                      {analysisReport.content}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No analysis report generated yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* All Artifacts Summary */}
        {artifacts.length > 0 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-lg">All Artifacts ({artifacts.length})</CardTitle>
              <CardDescription>Complete list of all generated artifacts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {artifacts.map((artifact: Artifact) => (
                  <div key={artifact.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono text-xs">
                        {artifact.artifactType}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {artifact.content.length} characters
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopy(artifact.content, artifact.artifactType)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          handleDownload(
                            artifact.content,
                            `artifact-${artifact.id}-${artifact.artifactType}.txt`
                          )
                        }
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
