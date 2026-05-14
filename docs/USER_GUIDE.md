# User Guide - Multi-Agent AI Workflow Orchestrator

This guide explains how to use the Multi-Agent AI Workflow Orchestrator to build software solutions using collaborative AI agents.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Launching a Workflow](#launching-a-workflow)
4. [Monitoring Execution](#monitoring-execution)
5. [Viewing Results](#viewing-results)
6. [Managing Configurations](#managing-configurations)
7. [Agent Settings](#agent-settings)
8. [Execution History](#execution-history)
9. [Tips & Best Practices](#tips--best-practices)

---

## Getting Started

### First Login

1. Navigate to `http://localhost:3005` (Docker) or `http://localhost:3000` (local dev)
2. Click **"Login"** button
3. In development mode, this creates a dev user automatically
4. You'll be redirected to the Dashboard

### Understanding the Interface

The application has a sidebar navigation with the following sections:

| Icon | Section | Description |
|------|---------|-------------|
| 🏠 | Dashboard | Overview and quick actions |
| 🚀 | Launcher | Create and launch new workflows |
| 📊 | Monitor | Real-time execution tracking |
| 📁 | Results | View generated artifacts |
| ⚙️ | Agents | Configure AI agent behavior |
| 📋 | History | Browse past executions |
| 💾 | Configs | Manage saved configurations |

---

## Dashboard Overview

The Dashboard provides a quick overview of your workflow activity:

### Recent Activity Summary

- **Recent Pending** - Queued in the latest 10 workflow runs
- **Recent Running** - In-progress runs from the latest 10 workflow runs
- **Recent Completed** - Successfully finished runs from the latest 10 workflow runs
- **Recent Failed** - Recent runs that need attention

The status summary is based on the latest 10 workflow runs shown on the dashboard.

### Saved Configs

Shows how many saved workflow configurations are available to launch or relaunch.

### Recent Activity

Shows the most recent workflow runs with their status:

- 🟡 **Pending** - Queued for execution
- 🔵 **Running** - Currently executing
- 🟢 **Completed** - Successfully finished
- 🔴 **Failed** - Encountered an error

### Quick Actions

- **Launch Workflow** - Jump to the Launcher
- **New Configuration** - Create a saved workflow configuration
- **Configure Agents** - Update agent roles and behavior

---

## Launching a Workflow

### Step 1: Navigate to Launcher

Click **"Launcher"** in the sidebar or the **"Launch Workflow"** button on the Dashboard.

### Step 2: Configure Your Task

#### Task Description
Enter a clear, detailed description of what you want to build. Be specific about:
- The programming language
- Required functionality
- Input/output specifications
- Any constraints or requirements

**Example:**
```
Create a TypeScript function that validates email addresses.
It should:
- Accept a string parameter
- Return a boolean
- Handle edge cases like empty strings
- Use a regex pattern that follows RFC 5322
- Include JSDoc documentation
```

#### Workflow Name (Optional)
Give your workflow a memorable name for easy identification in history.

### Step 3: Select AI Model

Choose from available models in the dropdown:

| Model | Best For |
|-------|----------|
| `llama3.2` | Fast, general purpose tasks |
| `mistral` | Code generation and analysis |
| `deepseek-r1:7b` | Complex reasoning tasks |
| `qwen2.5-coder:7b` | Code-focused tasks |
| `deepseek-v3.1:671b-cloud` | Large, complex projects |

### Step 4: Launch

Click **"Launch Workflow"** to start execution. You'll be automatically redirected to the Monitor page.

---

## Monitoring Execution

### Real-Time Progress

The Monitor page shows live updates as your workflow executes:

#### Workflow Steps

1. **Setup** ⚙️
   - Initializes the workflow run
   - Loads agent configurations
   - Prepares execution context

2. **Initialization** 📚
   - Context Provider gathers domain knowledge
   - Retrieves relevant examples and patterns
   - Builds enriched context for code generation

3. **Orchestration** 🔨
   - Nanoscript Generator produces initial code
   - Uses context from previous step
   - Creates structured output

4. **Synchronization** 🔍
   - Critical Analyst reviews the output
   - Checks for errors and security issues
   - Suggests improvements
   - Produces final refined result

#### Status Indicators

Each step shows:
- ⏳ **Pending** - Waiting to start
- 🔄 **Running** - Currently executing
- ✅ **Completed** - Successfully finished
- ❌ **Failed** - Error occurred

#### Live Logs

The log panel shows real-time output from each agent, including:
- Agent thoughts and reasoning
- Code being generated
- Analysis findings

---

## Viewing Results

### Navigate to Results

After a workflow completes:
1. Click **"View Results"** button on the Monitor page, or
2. Navigate to **"Results"** in the sidebar

### Artifact Types

#### Code Artifacts
Generated code with syntax highlighting. Features:
- Copy to clipboard button
- Language detection
- Line numbers

#### Analysis Reports
Structured reports from the Critical Analyst including:
- Code quality assessment
- Security considerations
- Improvement suggestions
- Best practices compliance

### Export Options

Export your results in multiple formats:

| Format | Use Case |
|--------|----------|
| **JSON** | Full structured data for processing |
| **Markdown** | Documentation and sharing |
| **CSV** | Spreadsheet analysis |

Click the **"Export"** dropdown and select your preferred format.

---

## Managing Configurations

### Saving a Configuration

1. After configuring a workflow in the Launcher
2. Click **"Save Configuration"**
3. Enter a name for the configuration
4. Click **"Save"**

### Loading a Configuration

1. Navigate to **"Configs"** in the sidebar
2. Browse saved configurations
3. Click **"Load"** on the desired config
4. Modify if needed, then launch

### Configuration Includes
- Task description
- Selected AI model
- Workflow name template

---

## Agent Settings

### Accessing Agent Settings

Navigate to **"Agents"** in the sidebar.

### Configuring Agents

Each agent has configurable properties:

#### Context Provider
- **Role**: Gathers domain knowledge
- **Goal**: Enrich tasks with relevant context
- **Backstory**: Agent's expertise and approach

#### Nanoscript Generator
- **Role**: Produces code solutions
- **Goal**: Generate optimized, clean code
- **Backstory**: Coding expertise and style

#### Critical Analyst
- **Role**: Reviews and refines output
- **Goal**: Ensure quality and security
- **Backstory**: Analysis methodology

### Using Presets

Quick-start presets for common scenarios:

| Preset | Focus |
|--------|-------|
| **Default** | Balanced general-purpose |
| **Rust Team** | Rust-focused development |
| **Python Expert** | Python best practices |
| **TypeScript** | TypeScript/JavaScript focus |
| **Security Focus** | Security-first approach |

Click a preset button to apply its configuration.

---

## Execution History

### Browsing History

Navigate to **"History"** in the sidebar to see all past executions.

### Filtering Options

- **Status**: Filter by completed, failed, running
- **Date Range**: Select time period
- **Search**: Find by workflow name or task

### History Entry Details

Each entry shows:
- Workflow name
- Execution date/time
- Duration
- Status
- Quick actions (View, Re-run, Delete)

### Re-running a Workflow

1. Find the workflow in History
2. Click **"Re-run"**
3. Optionally modify the task
4. Launch the new execution

---

## Tips & Best Practices

### Writing Effective Tasks

✅ **Do:**
- Be specific about requirements
- Mention the programming language explicitly
- Include expected inputs and outputs
- Specify any constraints or edge cases

❌ **Don't:**
- Use vague descriptions like "make it work"
- Forget to mention the language
- Skip error handling requirements
- Ignore security considerations

### Choosing the Right Model

| Task Type | Recommended Model |
|-----------|------------------|
| Quick prototypes | `llama3.2` |
| Production code | `qwen2.5-coder:7b` |
| Complex algorithms | `deepseek-r1:7b` |
| Large projects | `deepseek-v3.1:671b-cloud` |

### Optimizing Results

1. **Iterate**: Use the results as input for follow-up workflows
2. **Refine**: Adjust agent prompts for better output
3. **Compare**: Try different models for the same task
4. **Save**: Store good configurations for reuse

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Workflow stuck on "Running" | Check LLM connection, view logs |
| Poor code quality | Try a different model or refine task description |
| Missing context | Provide more details in task description |
| Timeout errors | Use a smaller model or simplify the task |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Launch workflow (in Launcher) |
| `Escape` | Close modal dialogs |
| `Ctrl+S` | Save configuration |

---

## Getting Help

If you encounter issues:

1. Check the browser console for errors
2. View application logs: `docker logs multi-agent-app`
3. Verify LLM connection: Ensure Ollama is running
4. Check the [README.md](../README.md) for configuration details

---

<p align="center">
  <sub>Happy building with AI agents! 🤖</sub>
</p>
