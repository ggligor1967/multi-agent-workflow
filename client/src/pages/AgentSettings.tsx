import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Save, Search, Code, Brain, Pencil, Sparkles, Palette, Wand2, ShieldCheck, Rocket, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// Preset configurations for different workflows
interface AgentPreset {
  name: string;
  icon: React.ReactNode;
  description: string;
  context_provider: { role: string; goal: string; backstory: string };
  nanoscript_generator: { role: string; goal: string; backstory: string };
  critical_analyst: { role: string; goal: string; backstory: string };
}

const AGENT_PRESETS: AgentPreset[] = [
  {
    name: "Rust Team",
    icon: <Rocket className="w-4 h-4" />,
    description: "Optimized for Rust development with safety and performance focus",
    context_provider: {
      role: "Senior Rust Ecosystem Expert",
      goal: "Provide comprehensive Rust-specific context including crate recommendations, design patterns, and memory safety guidelines",
      backstory: "You are a Rust expert with deep knowledge of the ecosystem. You know popular crates for common tasks, understand ownership and borrowing patterns, and can recommend the most idiomatic approaches. You help developers navigate async runtime choices, error handling patterns, and performance optimization strategies.",
    },
    nanoscript_generator: {
      role: "Senior Rust Developer",
      goal: "Generate idiomatic, memory-safe, and performant Rust code following best practices",
      backstory: "You are a senior Rust developer with 10+ years of systems programming experience. You write code that leverages Rust's ownership system, uses Result and Option correctly, avoids unnecessary allocations, and follows the Rust API Guidelines. You prefer using well-maintained crates from the ecosystem.",
    },
    critical_analyst: {
      role: "Rust Safety and Performance Reviewer",
      goal: "Ensure code is memory-safe, free of undefined behavior, and optimized for performance",
      backstory: "You are an expert code reviewer specializing in Rust. You check for unsafe usage justification, proper error handling, potential panics, lifetime issues, and suggest performance improvements. You ensure the code compiles without warnings and follows clippy recommendations.",
    },
  },
  {
    name: "Security Focus",
    icon: <ShieldCheck className="w-4 h-4" />,
    description: "Security-first approach for sensitive applications",
    context_provider: {
      role: "Application Security Expert",
      goal: "Identify security requirements, threat models, and provide secure coding guidelines",
      backstory: "You are a security consultant with expertise in OWASP, secure coding practices, and threat modeling. You identify potential attack vectors, recommend security controls, and ensure compliance with security standards. You know common vulnerabilities (injection, XSS, CSRF, etc.) and how to prevent them.",
    },
    nanoscript_generator: {
      role: "Secure Software Developer",
      goal: "Write secure code that follows defense-in-depth principles and minimizes attack surface",
      backstory: "You are a developer who prioritizes security in every line of code. You validate all inputs, use parameterized queries, implement proper authentication and authorization, handle secrets securely, and avoid common security pitfalls. You follow the principle of least privilege.",
    },
    critical_analyst: {
      role: "Security Code Auditor",
      goal: "Identify vulnerabilities, security flaws, and recommend mitigations",
      backstory: "You are a penetration tester and code auditor. You analyze code for injection vulnerabilities, authentication bypasses, sensitive data exposure, insecure configurations, and cryptographic issues. You provide detailed remediation guidance and prioritize findings by severity.",
    },
  },
  {
    name: "Python Expert",
    icon: <Zap className="w-4 h-4" />,
    description: "Pythonic code with type hints and modern best practices",
    context_provider: {
      role: "Python Ecosystem Specialist",
      goal: "Provide Python-specific context including library recommendations and Pythonic patterns",
      backstory: "You are a Python expert familiar with the vast ecosystem. You know the best libraries for data science (pandas, numpy), web frameworks (FastAPI, Django), testing (pytest), and tooling (ruff, mypy). You understand PEP guidelines and Python design philosophy.",
    },
    nanoscript_generator: {
      role: "Senior Python Developer",
      goal: "Generate clean, type-annotated, Pythonic code following PEP standards",
      backstory: "You are a senior Python developer who writes beautiful, readable code. You use type hints, follow PEP 8, leverage Python's powerful features (comprehensions, generators, context managers) appropriately, and structure code for maintainability. You prefer standard library when sufficient.",
    },
    critical_analyst: {
      role: "Python Code Quality Reviewer",
      goal: "Ensure code quality, type safety, and adherence to Python best practices",
      backstory: "You review Python code for quality issues, type correctness, potential bugs, and Pythonic patterns. You check for proper exception handling, suggest performance improvements, and ensure the code would pass ruff, mypy, and pytest checks.",
    },
  },
  {
    name: "TypeScript/Node.js",
    icon: <Code className="w-4 h-4" />,
    description: "Modern TypeScript with strict typing and async patterns",
    context_provider: {
      role: "TypeScript/Node.js Expert",
      goal: "Provide TypeScript-specific context including type patterns and ecosystem recommendations",
      backstory: "You are a TypeScript expert who knows the Node.js ecosystem deeply. You understand advanced types, generics, utility types, and when to use them. You know popular packages (zod, prisma, tRPC) and modern patterns (ESM, async/await).",
    },
    nanoscript_generator: {
      role: "Senior TypeScript Developer",
      goal: "Generate strictly typed, modern TypeScript code with proper async handling",
      backstory: "You are a senior TypeScript developer who maximizes type safety. You use strict mode, avoid any, leverage generics, and handle errors properly. You write clean async/await code, use proper dependency injection, and follow SOLID principles.",
    },
    critical_analyst: {
      role: "TypeScript Code Reviewer",
      goal: "Ensure type safety, proper error handling, and modern JavaScript patterns",
      backstory: "You review TypeScript code for type issues, missing null checks, improper async handling, and potential runtime errors. You suggest stricter types, better error boundaries, and performance improvements. You ensure the code follows modern ESM standards.",
    },
  },
  {
    name: "Default / General",
    icon: <Palette className="w-4 h-4" />,
    description: "Balanced general-purpose configuration",
    context_provider: {
      role: "Technical Research Specialist",
      goal: "Gather relevant technical context, best practices, and domain knowledge for the task",
      backstory: "You are a skilled researcher who finds the most relevant information for any programming task. You identify applicable design patterns, find documentation, and provide context that helps produce high-quality code.",
    },
    nanoscript_generator: {
      role: "Senior Software Developer",
      goal: "Generate clean, well-structured, and maintainable code",
      backstory: "You are a versatile senior developer with experience across multiple languages and paradigms. You write clean, readable code with proper error handling, follow language-specific conventions, and prioritize maintainability.",
    },
    critical_analyst: {
      role: "Code Quality Reviewer",
      goal: "Review code for bugs, quality issues, and suggest improvements",
      backstory: "You are an experienced code reviewer who catches bugs, identifies code smells, and suggests improvements. You check for proper error handling, edge cases, and provide actionable feedback to improve code quality.",
    },
  },
];

// Agent type icons and colors
const AGENT_META: Record<string, { icon: React.ReactNode; color: string; label: string; description: string }> = {
  context_provider: {
    icon: <Search className="w-6 h-6" />,
    color: "bg-blue-100 text-blue-600",
    label: "Context Provider",
    description: "Gathers domain knowledge, examples, and constraints for code generation",
  },
  nanoscript_generator: {
    icon: <Code className="w-6 h-6" />,
    color: "bg-purple-100 text-purple-600",
    label: "Nanoscript Generator",
    description: "Creates clean, well-structured code based on requirements and context",
  },
  critical_analyst: {
    icon: <Brain className="w-6 h-6" />,
    color: "bg-green-100 text-green-600",
    label: "Critical Analyst",
    description: "Reviews code for bugs, security issues, and suggests improvements",
  },
};

interface AgentConfig {
  id: number;
  userId: number;
  agentType: string;
  role: string;
  goal: string;
  backstory: string;
  llmModel: string;
  isActive: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export default function AgentSettings() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);
  const [formData, setFormData] = useState({
    role: "",
    goal: "",
    backstory: "",
  });
  const [applyingPreset, setApplyingPreset] = useState(false);

  // Fetch agent configurations
  const { data: agentsResult, isLoading, refetch } = trpc.workflow.agents.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const agents = agentsResult?.data || [];

  // Update mutation
  const updateAgentMutation = trpc.workflow.agents.update.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Agent configuration updated successfully!");
        setEditingAgent(null);
        refetch();
      } else {
        toast.error(result.error || "Failed to update agent");
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

  // Apply a preset to all agents
  const handleApplyPreset = async (preset: AgentPreset) => {
    if (agents.length === 0) {
      toast.error("No agents to configure. Run a workflow first.");
      return;
    }

    setApplyingPreset(true);
    const agentsByType = agents.reduce((acc, agent) => {
      acc[agent.agentType] = agent;
      return acc;
    }, {} as Record<string, AgentConfig>);

    try {
      const updates: Promise<unknown>[] = [];
      
      for (const [agentType, config] of Object.entries({
        context_provider: preset.context_provider,
        nanoscript_generator: preset.nanoscript_generator,
        critical_analyst: preset.critical_analyst,
      })) {
        const agent = agentsByType[agentType];
        if (agent) {
          updates.push(
            updateAgentMutation.mutateAsync({
              id: agent.id,
              role: config.role,
              goal: config.goal,
              backstory: config.backstory,
            })
          );
        }
      }

      await Promise.all(updates);
      toast.success(`Applied "${preset.name}" preset to all agents!`);
      refetch();
    } catch (error) {
      toast.error("Failed to apply preset");
    } finally {
      setApplyingPreset(false);
    }
  };

  // Open edit dialog
  const handleEdit = (agent: AgentConfig) => {
    setEditingAgent(agent);
    setFormData({
      role: agent.role,
      goal: agent.goal,
      backstory: agent.backstory,
    });
  };

  // Save changes
  const handleSave = () => {
    if (!editingAgent) return;

    updateAgentMutation.mutate({
      id: editingAgent.id,
      role: formData.role,
      goal: formData.goal,
      backstory: formData.backstory,
    });
  };

  // Group agents by type (to show only one of each type)
  const uniqueAgents = agents.reduce((acc, agent) => {
    if (!acc[agent.agentType] || agent.isActive) {
      acc[agent.agentType] = agent;
    }
    return acc;
  }, {} as Record<string, AgentConfig>);

  const agentList = Object.values(uniqueAgents);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
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
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Sparkles className="w-8 h-8 text-purple-600" />
                Agent Configuration
              </h1>
              <p className="text-gray-600 mt-2">
                Customize the behavior of your AI agents. Fine-tune their roles, goals, and system prompts
                to optimize for specific tasks or programming languages.
              </p>
            </div>
            {/* Presets Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={applyingPreset || agentList.length === 0}>
                  {applyingPreset ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Apply Preset
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Agent Configuration Presets</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {AGENT_PRESETS.map((preset) => (
                  <DropdownMenuItem
                    key={preset.name}
                    onClick={() => handleApplyPreset(preset)}
                    className="flex flex-col items-start gap-1 cursor-pointer py-2"
                  >
                    <div className="flex items-center gap-2 font-medium">
                      {preset.icon}
                      {preset.name}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {preset.description}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin w-8 h-8 text-gray-400" />
          </div>
        ) : agentList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">
                No agent configurations found. Run a workflow first to create default agent configs.
              </p>
              <Button
                onClick={() => navigate("/launcher")}
                className="mt-4 gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Launch a Workflow
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Agent Cards */}
            <div className="grid grid-cols-1 gap-6">
              {agentList.map((agent) => {
                const meta = AGENT_META[agent.agentType] || {
                  icon: <Code className="w-6 h-6" />,
                  color: "bg-gray-100 text-gray-600",
                  label: agent.agentType,
                  description: "Custom agent",
                };

                return (
                  <Card key={agent.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-lg ${meta.color}`}>
                            {meta.icon}
                          </div>
                          <div>
                            <CardTitle className="text-lg">{meta.label}</CardTitle>
                            <CardDescription>{meta.description}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={agent.isActive ? "default" : "secondary"}>
                            {agent.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(agent)}
                            className="gap-2"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500 uppercase tracking-wide">Role</Label>
                          <p className="text-sm font-medium">{agent.role}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500 uppercase tracking-wide">LLM Model</Label>
                          <Badge variant="outline" className="font-mono text-xs">
                            {agent.llmModel}
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Goal</Label>
                        <p className="text-sm text-gray-700">{agent.goal}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Backstory / System Prompt</Label>
                        <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md border">
                          {agent.backstory}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Tips */}
            <Card className="mt-6 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-800">💡 Tips for Agent Configuration</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-amber-700 space-y-2">
                <p>• <strong>Role:</strong> Define the persona (e.g., "Senior Rust Developer", "Security Expert")</p>
                <p>• <strong>Goal:</strong> What the agent should achieve (e.g., "Write idiomatic, safe Rust code")</p>
                <p>• <strong>Backstory:</strong> System prompt context that shapes behavior (detailed instructions)</p>
                <p>• Changes apply to new workflow runs. Existing runs use their original configuration.</p>
              </CardContent>
            </Card>
          </>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingAgent} onOpenChange={(open) => !open && setEditingAgent(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingAgent && AGENT_META[editingAgent.agentType]?.icon}
                Edit {editingAgent && AGENT_META[editingAgent.agentType]?.label}
              </DialogTitle>
              <DialogDescription>
                Customize this agent's behavior for your workflows. Changes will apply to new runs.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Role */}
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Input
                  id="role"
                  placeholder="e.g., Senior Python Developer"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                />
                <p className="text-xs text-gray-500">
                  The persona the agent will adopt. Be specific about expertise.
                </p>
              </div>

              {/* Goal */}
              <div className="space-y-2">
                <Label htmlFor="goal">Goal *</Label>
                <Textarea
                  id="goal"
                  placeholder="e.g., Generate clean, well-documented, production-ready code"
                  value={formData.goal}
                  onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                  rows={3}
                />
                <p className="text-xs text-gray-500">
                  What this agent should accomplish. Keep it focused and actionable.
                </p>
              </div>

              {/* Backstory */}
              <div className="space-y-2">
                <Label htmlFor="backstory">Backstory / System Prompt *</Label>
                <Textarea
                  id="backstory"
                  placeholder="You are an expert programmer with 15 years of experience..."
                  value={formData.backstory}
                  onChange={(e) => setFormData({ ...formData, backstory: e.target.value })}
                  rows={6}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  Detailed context that shapes the agent's behavior. This becomes part of the system prompt.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditingAgent(null)}
                disabled={updateAgentMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateAgentMutation.isPending || !formData.role || !formData.goal || !formData.backstory}
                className="gap-2"
              >
                {updateAgentMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
