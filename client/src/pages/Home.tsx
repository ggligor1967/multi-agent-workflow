import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Workflow, Brain, Code, BarChart3, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Welcome back, {user?.name || "User"}!
            </h1>
            <p className="text-lg text-gray-600">
              Ready to launch your next multi-agent AI workflow?
            </p>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-blue-600" />
                  Launch Workflow
                </CardTitle>
                <CardDescription>
                  Create and execute a new multi-agent AI workflow
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => navigate("/launcher")}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-green-600" />
                  View Dashboard
                </CardTitle>
                <CardDescription>
                  Monitor your workflows and view execution history
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => navigate("/dashboard")}
                  variant="outline"
                  className="w-full gap-2"
                >
                  Open Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Features Overview */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Brain className="w-5 h-5 text-purple-600" />
                    Multi-Agent AI
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Leverage specialized AI agents working together to solve complex tasks and generate high-quality outputs.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Code className="w-5 h-5 text-blue-600" />
                    Code Generation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Automatically generate executable code, scripts, and documentation based on your requirements.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Zap className="w-5 h-5 text-yellow-600" />
                    Real-Time Monitoring
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Track workflow execution in real-time with detailed progress updates and step-by-step monitoring.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Agent Types */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Available Agents</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Nanoscript Generator</CardTitle>
                  <CardDescription>Code Generation</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Generates executable scripts and code based on task requirements and specifications.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Context Provider</CardTitle>
                  <CardDescription>Information Gathering</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Gathers relevant context and information to support the workflow execution and decision-making.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Critical Analyst</CardTitle>
                  <CardDescription>Quality Assurance</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Reviews, validates, and provides critical analysis of generated outputs for quality assurance.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-16 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Zap className="w-8 h-8 text-blue-600" />
            <h1 className="text-4xl font-bold text-gray-900">Architectural Structure</h1>
          </div>
          <p className="text-xl text-gray-600 mb-8">
            Multi-Agent AI Workflow Management Platform
          </p>
          <p className="text-lg text-gray-700 max-w-2xl mx-auto mb-8">
            Orchestrate powerful multi-agent AI workflows to generate code, analyze data, and solve complex problems with ease.
          </p>
          <Button
            onClick={() => window.location.href = getLoginUrl()}
            size="lg"
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8"
          >
            Get Started
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-600" />
                Intelligent Agents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Deploy specialized AI agents that work together to accomplish complex tasks with precision and efficiency.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5 text-blue-600" />
                Code Generation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Automatically generate production-ready code, scripts, and documentation tailored to your specifications.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-green-600" />
                Real-Time Monitoring
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Monitor workflow execution in real-time with comprehensive progress tracking and detailed analytics.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Ready to automate your workflow?
          </h2>
          <p className="text-gray-600 mb-6">
            Sign in to start creating and managing your multi-agent AI workflows.
          </p>
          <Button
            onClick={() => window.location.href = getLoginUrl()}
            size="lg"
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8"
          >
            Sign In
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
