import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, ArrowLeft, Plus, Pencil, Trash2, FolderOpen, Play, Settings2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

interface WorkflowConfig {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  initialTask: string;
  llmModel: string;
  mistralModel: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export default function ConfigManager() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<WorkflowConfig | null>(null);
  const [deleteConfig, setDeleteConfig] = useState<WorkflowConfig | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    initialTask: "",
    llmModel: "deepseek-v3.1:671b-cloud",
  });

  // Fetch configurations
  const { data: configsResult, isLoading, refetch } = trpc.workflow.configs.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const configs = (configsResult?.data || []) as WorkflowConfig[];

  // Fetch available models
  const { data: modelsResult } = trpc.workflow.getAvailableModels.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const availableModels = modelsResult?.data ?? ["deepseek-v3.1:671b-cloud"];

  // Mutations
  const createMutation = trpc.workflow.configs.create.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Configuration created!");
        setIsCreateOpen(false);
        resetForm();
        refetch();
      } else {
        toast.error(result.error || "Failed to create config");
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.workflow.configs.update.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Configuration updated!");
        setEditingConfig(null);
        refetch();
      } else {
        toast.error(result.error || "Failed to update config");
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.workflow.configs.delete.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Configuration deleted!");
        setDeleteConfig(null);
        refetch();
      } else {
        toast.error(result.error || "Failed to delete config");
      }
    },
    onError: (error) => toast.error(error.message),
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      initialTask: "",
      llmModel: availableModels[0] || "deepseek-v3.1:671b-cloud",
    });
  };

  const handleCreate = () => {
    if (!formData.name || !formData.initialTask) {
      toast.error("Name and Initial Task are required");
      return;
    }
    createMutation.mutate({
      name: formData.name,
      description: formData.description || undefined,
      initialTask: formData.initialTask,
      llmModel: formData.llmModel,
    });
  };

  const handleUpdate = () => {
    if (!editingConfig) return;
    updateMutation.mutate({
      id: editingConfig.id,
      name: formData.name || undefined,
      description: formData.description || undefined,
      initialTask: formData.initialTask || undefined,
      llmModel: formData.llmModel || undefined,
    });
  };

  const handleEdit = (config: WorkflowConfig) => {
    setEditingConfig(config);
    setFormData({
      name: config.name,
      description: config.description || "",
      initialTask: config.initialTask,
      llmModel: config.llmModel,
    });
  };

  const handleLaunch = (config: WorkflowConfig) => {
    // Navigate to launcher with pre-filled config
    navigate(`/launcher?configId=${config.id}`);
  };

  if (!isAuthenticated) return null;

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
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Settings2 className="w-8 h-8 text-blue-600" />
                Workflow Configurations
              </h1>
              <p className="text-gray-600 mt-2">
                Create, save, and manage reusable workflow templates.
              </p>
            </div>
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              New Configuration
            </Button>
          </div>
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin w-8 h-8 text-gray-400" />
          </div>
        ) : configs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">
                No workflow configurations yet. Create one to get started.
              </p>
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create First Configuration
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configs.map((config) => (
              <Card key={config.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{config.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {config.description || "No description"}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      {config.llmModel.split(":")[0]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500 uppercase tracking-wide">Initial Task</Label>
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {config.initialTask}
                    </p>
                  </div>
                  <div className="text-xs text-gray-400">
                    Created: {new Date(config.createdAt).toLocaleDateString()}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => handleLaunch(config)}
                      className="gap-1 flex-1"
                    >
                      <Play className="w-3 h-3" />
                      Launch
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(config)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteConfig(config)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Configuration</DialogTitle>
              <DialogDescription>
                Save a workflow template for quick reuse.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Python API Generator"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Brief description of this configuration"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task">Initial Task Template *</Label>
                <Textarea
                  id="task"
                  placeholder="Describe the task template..."
                  value={formData.initialTask}
                  onChange={(e) => setFormData({ ...formData, initialTask: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Default Model</Label>
                <select
                  id="model"
                  className="w-full border rounded-md p-2 text-sm"
                  value={formData.llmModel}
                  onChange={(e) => setFormData({ ...formData, llmModel: e.target.value })}
                >
                  {availableModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsCreateOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editingConfig} onOpenChange={(open) => !open && setEditingConfig(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Configuration</DialogTitle>
              <DialogDescription>
                Update the workflow configuration settings.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-task">Initial Task Template</Label>
                <Textarea
                  id="edit-task"
                  value={formData.initialTask}
                  onChange={(e) => setFormData({ ...formData, initialTask: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-model">Default Model</Label>
                <select
                  id="edit-model"
                  className="w-full border rounded-md p-2 text-sm"
                  value={formData.llmModel}
                  onChange={(e) => setFormData({ ...formData, llmModel: e.target.value })}
                >
                  {availableModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingConfig(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfig} onOpenChange={(open) => !open && setDeleteConfig(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Configuration?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{deleteConfig?.name}". This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteConfig && deleteMutation.mutate({ id: deleteConfig.id })}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
