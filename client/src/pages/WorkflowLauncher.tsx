import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, ArrowLeft, Sparkles, Brain, Code, Search } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

function parsePositiveConfigId(search: string): number | null {
  const rawConfigId = new URLSearchParams(search).get("configId");
  if (!rawConfigId) return null;

  const configId = Number(rawConfigId);
  return Number.isInteger(configId) && configId > 0 ? configId : null;
}

export default function WorkflowLauncher() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const lastPrefilledConfigId = useRef<number | null>(null);

  const [selectedConfig, setSelectedConfig] = useState<string>("");
  const [initialTask, setInitialTask] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("");

  const urlConfigId = useMemo(() => {
    return parsePositiveConfigId(search);
  }, [search]);

  // Fetch saved configurations
  const { data: configsResult, isLoading: configsLoading } = trpc.workflow.configs.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const configs = configsResult?.data ?? [];

  // Fetch available models
  const { data: modelsResult, isLoading: modelsLoading } = trpc.workflow.getAvailableModels.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const availableModels = modelsResult?.data ?? ["llama3.2:latest"];

  useEffect(() => {
    if (availableModels.length > 0 && !selectedModel) {
      setSelectedModel(availableModels[0]);
    }
  }, [availableModels, selectedModel]);

  useEffect(() => {
    if (!urlConfigId) {
      lastPrefilledConfigId.current = null;
      return;
    }

    if (lastPrefilledConfigId.current === urlConfigId) {
      return;
    }

    const config = configs.find((item) => item.id === urlConfigId);
    if (!config) {
      return;
    }

    setSelectedConfig(config.id.toString());
    setInitialTask(config.initialTask);
    setSelectedModel(config.llmModel);
    lastPrefilledConfigId.current = urlConfigId;
  }, [configs, urlConfigId]);

  // Create run mutation
  const createRunMutation = trpc.workflow.runs.create.useMutation({
    onSuccess: (result) => {
      if (result.success && result.data?.id) {
        toast.success("Workflow launched! Redirecting to monitor...");
        navigate(`/runs/${result.data.id}`);
      } else {
        toast.error(result.error || "Failed to launch workflow");
      }
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!initialTask.trim()) {
      toast.error("Please enter an initial task");
      return;
    }

    const selectedConfigId = selectedConfig ? Number(selectedConfig) : undefined;
    const configId =
      selectedConfigId !== undefined &&
      Number.isInteger(selectedConfigId) &&
      selectedConfigId > 0
        ? selectedConfigId
        : undefined;

    createRunMutation.mutate({
      configId,
      initialTask: initialTask.trim(),
      modelId: selectedModel || undefined,
    });
  };

  const handleConfigChange = (configId: string) => {
    setSelectedConfig(configId);

    const parsedConfigId = Number(configId);
    const config = configs.find((item) => item.id === parsedConfigId);
    if (!config) return;

    setInitialTask(config.initialTask);
    setSelectedModel(config.llmModel);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
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
          <h1 className="text-3xl font-bold text-gray-900">Launch Workflow</h1>
          <p className="text-gray-600 mt-2">
            Configure and execute a new multi-agent AI workflow.
          </p>
        </div>

        {/* Launcher Form */}
        <Card>
          <CardHeader>
            <CardTitle>Workflow Configuration</CardTitle>
            <CardDescription>
              Select a configuration or create a new workflow execution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLaunch} className="space-y-6">
              {/* Configuration Selection */}
              <div className="space-y-2">
                <Label htmlFor="config">Use Saved Configuration (Optional)</Label>
                <Select value={selectedConfig} onValueChange={handleConfigChange}>
                  <SelectTrigger id="config" disabled={configsLoading}>
                    <SelectValue placeholder="Select a configuration..." />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.map((config) => (
                      <SelectItem key={config.id} value={config.id.toString()}>
                        {config.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {configs.length === 0
                    ? "No saved configurations. You can create one after launching."
                    : `${configs.length} configuration(s) available`}
                </p>
              </div>

              {/* Initial Task */}
              <div className="space-y-2">
                <Label htmlFor="task">Initial Task *</Label>
                <Textarea
                  id="task"
                  placeholder="Describe the task you want the AI agents to perform. Be specific about what you want them to generate or analyze."
                  value={initialTask}
                  onChange={(e) => setInitialTask(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <p className="text-xs text-gray-500">
                  {initialTask.length} characters
                </p>
              </div>

              {/* Model Selection */}
              <div className="space-y-2">
                <Label htmlFor="model">Select AI Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger id="model" disabled={modelsLoading}>
                    <SelectValue placeholder="Choose a model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {modelsLoading
                    ? "Loading available models..."
                    : `Defaulting to ${selectedModel || "llama3.2:latest"}; pick faster or larger models as needed.`}
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Multi-Agent Workflow
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <div className="p-1.5 bg-blue-100 rounded">
                      <Search className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">1. Context Provider</p>
                      <p className="text-gray-600 text-xs">Gathers domain context</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="p-1.5 bg-purple-100 rounded">
                      <Code className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">2. Nanoscript Generator</p>
                      <p className="text-gray-600 text-xs">Creates the code</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="p-1.5 bg-green-100 rounded">
                      <Brain className="w-3.5 h-3.5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">3. Critical Analyst</p>
                      <p className="text-gray-600 text-xs">Reviews & validates</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={createRunMutation.isPending || !initialTask.trim()}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  {createRunMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Launching...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Launch Workflow
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/dashboard")}
                  disabled={createRunMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
