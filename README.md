# Multi-Agent AI Workflow Orchestrator

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![tRPC](https://img.shields.io/badge/tRPC-11-398CCB?logo=trpc&logoColor=white)](https://trpc.io/)
[![Ollama](https://img.shields.io/badge/Ollama-Local_AI-000000?logo=ollama&logoColor=white)](https://ollama.ai/)
[![OpenAI Compatible](https://img.shields.io/badge/OpenAI-Compatible-412991?logo=openai&logoColor=white)](https://openai.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

> **Orchestrate specialized AI agents to collaboratively build, analyze, and refine software solutions.**

## 📖 Introduction

The **Multi-Agent AI Workflow Orchestrator** is a full-stack TypeScript application that coordinates multiple AI agents working together to accomplish complex software development tasks. Instead of relying on a single AI model, this system leverages a team of specialized agents—each with distinct roles and expertise—to produce higher-quality, more reliable outputs.

### How It Works

When you submit a task, the system orchestrates three specialized AI agents in sequence:

1. **Context Provider** - Gathers domain knowledge, relevant examples, and constraints
2. **Nanoscript Generator** - Produces initial code based on the enriched context
3. **Critical Analyst** - Reviews the output for errors, security issues, and improvements

This collaborative approach mimics how real development teams work, with each agent contributing its specialized expertise to the final result.

## 🏗️ Architecture

```mermaid
flowchart TB
    subgraph Client["🖥️ Client (React + Vite)"]
        UI[Web Dashboard]
        WL[Workflow Launcher]
        WM[Workflow Monitor]
    end

    subgraph Server["⚙️ Server (Express + tRPC)"]
        API[tRPC API]
        WE[Workflow Engine]
        WS[WebSocket Server]
    end

    subgraph Agents["🤖 AI Agents"]
        CP[Context Provider]
        NG[Nanoscript Generator]
        CA[Critical Analyst]
    end

    subgraph Storage["💾 Storage"]
        DB[(MySQL Database)]
        ART[Artifacts Store]
    end

    subgraph LLM["🧠 LLM Provider"]
        OL[Ollama - Local]
        OA[OpenAI Compatible]
    end

    UI --> API
    WL --> API
    WM --> WS

    API --> WE
    WE --> CP
    CP --> NG
    NG --> CA
    CA --> ART

    CP --> LLM
    NG --> LLM
    CA --> LLM

    WE --> DB
    ART --> DB
    WS -.->|Real-time Updates| WM

    style Client fill:#e1f5fe
    style Server fill:#fff3e0
    style Agents fill:#f3e5f5
    style Storage fill:#e8f5e9
    style LLM fill:#fce4ec
```

### Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant WE as Workflow Engine
    participant CP as Context Provider
    participant NG as Nanoscript Generator
    participant CA as Critical Analyst
    participant DB as Database

    U->>C: Submit Task
    C->>S: Create Workflow Run
    S->>DB: Store Run Record
    S->>WE: Start Execution

    WE->>CP: Gather Context
    CP-->>WE: Domain Context + Examples

    WE->>NG: Generate Code
    Note over NG: Uses context from CP
    NG-->>WE: Initial Code

    WE->>CA: Review & Refine
    Note over CA: Analyzes for issues
    CA-->>WE: Refined Output

    WE->>DB: Store Artifacts
    WE-->>C: Real-time Progress (WebSocket)
    C-->>U: Display Results
```

## ✨ Key Features

### 🤖 Multi-Agent System
- **Context Provider** - Enriches tasks with domain knowledge and relevant examples
- **Nanoscript Generator** - Produces optimized code solutions
- **Critical Analyst** - Reviews output for errors, security issues, and improvements
- Configurable agent prompts and behaviors

### ⚡ Real-Time Updates
- WebSocket-powered live progress tracking
- Step-by-step workflow monitoring
- Instant status notifications

### 🏠 Local AI Support
- **Ollama Integration** - Run AI models locally for privacy and cost savings
- Support for models like Llama 3.2, Mistral, DeepSeek, Qwen
- No API keys required for local models

### 🌐 Cloud AI Compatible
- OpenAI-compatible API support
- Works with any OpenAI-compatible endpoint
- Flexible model selection per workflow

### 🐳 Docker Support
- One-command deployment with `docker-compose up`
- Pre-configured MySQL database
- Production-ready containerization

### 🔒 Authentication
- OAuth integration support
- Development mode with quick login
- Role-based access control (User/Admin)

### 📊 Workflow Management
- Save and reuse workflow configurations
- Track execution history
- View and download generated artifacts

## 📸 Screenshots

### Dashboard
![Dashboard Screenshot](docs/images/dashboard.png)
*Main dashboard showing workflow overview and quick actions*

### Workflow Launcher
![Workflow Launcher Screenshot](docs/images/workflow-launcher.png)
*Configure and launch new AI workflows*

### Workflow Monitor
![Workflow Monitor Screenshot](docs/images/workflow-monitor.png)
*Real-time progress tracking with step-by-step updates*

### Results View
![Results Screenshot](docs/images/results.png)
*View generated artifacts and download outputs*

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ (for local development)
- **Docker & Docker Compose** (for containerized deployment)
- **Ollama** (optional, for local AI models)

---

### Option A: Docker (Fastest) 🐳

The quickest way to get started is using Docker Compose.

#### 1. Clone the Repository

```bash
git clone https://github.com/your-username/multi-agent-workflow.git
cd multi-agent-workflow
```

#### 2. Configure Environment

Create a `.env` file in the root directory:

```env
# Required for JWT session encryption
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# LLM Configuration (choose one)

# Option 1: Ollama (Local AI - recommended for getting started)
# Note: Ollama must be running on your host machine
BUILT_IN_FORGE_API_KEY=ollama

# Option 2: OpenAI or compatible API
# BUILT_IN_FORGE_API_URL=https://api.openai.com/v1
# BUILT_IN_FORGE_API_KEY=sk-your-openai-key

# Optional: OAuth configuration (leave empty for dev login)
# OAUTH_SERVER_URL=https://your-oauth-server.com
# OWNER_OPEN_ID=your-admin-open-id

# Optional: Application ID
VITE_APP_ID=multi-agent-workflow
```

#### 3. Start Ollama (if using local AI)

Make sure Ollama is running on your host machine:

```bash
# Install Ollama from https://ollama.ai
# Then pull a model:
ollama pull llama3.2

# Verify it's running:
ollama list
```

#### 4. Launch the Stack

```bash
docker-compose up -d
```

This will:
- Build the application container
- Start a MySQL 8.0 database
- Run database migrations automatically
- Start the application on port **3005**

#### 5. Access the Application

Open [http://localhost:3005](http://localhost:3005) in your browser.

Click **"Login"** to use dev mode authentication (no OAuth required).

#### Docker Commands Reference

```bash
# Start the stack
docker-compose up -d

# View logs
docker logs -f multi-agent-app

# Stop the stack
docker-compose down

# Reset everything (including database)
docker-compose down -v
docker-compose up -d --build
```

---

### Option B: Local Development 💻

For development with hot-reload and debugging.

#### 1. Clone and Install Dependencies

```bash
git clone https://github.com/your-username/multi-agent-workflow.git
cd multi-agent-workflow
pnpm install
```

#### 2. Configure Environment

Create a `.env` file:

```env
# Database connection (MySQL)
DATABASE_URL=mysql://user:password@localhost:3306/multi_agent_workflow

# LLM Configuration
BUILT_IN_FORGE_API_URL=http://localhost:11434/v1
BUILT_IN_FORGE_API_KEY=ollama

# Security
JWT_SECRET=dev-secret-change-in-production

# Optional
VITE_APP_ID=multi-agent-workflow-dev
```

#### 3. Set Up the Database

```bash
# Create and apply migrations
pnpm db:push

# Seed sample data (optional)
pnpm db:seed
```

#### 4. Start Development Server

```bash
pnpm dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

#### Development Commands

```bash
# Type checking
pnpm check

# Run tests
pnpm test

# Build for production
pnpm build

# Start production build
pnpm start

# Database management
pnpm db:push    # Apply schema changes
pnpm db:seed    # Seed sample data
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes* | MySQL connection string | *(set by Docker)* |
| `BUILT_IN_FORGE_API_KEY` | Yes | API key for LLM provider (use `ollama` for local) | - |
| `BUILT_IN_FORGE_API_URL` | No | LLM API endpoint | `http://localhost:11434/v1` |
| `JWT_SECRET` | Yes | Secret for session encryption | - |
| `OAUTH_SERVER_URL` | No | OAuth server URL (enables OAuth login) | - |
| `OWNER_OPEN_ID` | No | OpenID of admin user | - |
| `VITE_APP_ID` | No | Application identifier | `multi-agent-workflow` |
| `PORT` | No | Server port | `3000` |

*\* Automatically configured when using Docker Compose*

### LLM Provider Configuration

#### Ollama (Local)

```env
BUILT_IN_FORGE_API_URL=http://localhost:11434/v1
BUILT_IN_FORGE_API_KEY=ollama
```

Recommended models:
- `llama3.2` - Fast, general purpose
- `mistral` - Good for code generation
- `deepseek-r1:7b` - Reasoning focused
- `qwen2.5-coder:7b` - Optimized for coding

#### OpenAI

```env
BUILT_IN_FORGE_API_URL=https://api.openai.com/v1
BUILT_IN_FORGE_API_KEY=sk-your-api-key
```

#### Other OpenAI-Compatible APIs

```env
BUILT_IN_FORGE_API_URL=https://your-provider.com/v1
BUILT_IN_FORGE_API_KEY=your-api-key
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite 5, TailwindCSS, shadcn/ui |
| **Backend** | Express, tRPC 11, WebSocket |
| **Database** | MySQL 8.0, Drizzle ORM |
| **AI Integration** | Ollama, OpenAI-compatible APIs |
| **Containerization** | Docker, Docker Compose |
| **Language** | TypeScript 5 (strict mode) |

---

## 📁 Project Structure

```
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # UI components (shadcn/ui)
│   │   ├── pages/          # Route pages
│   │   ├── hooks/          # React hooks
│   │   ├── contexts/       # React contexts
│   │   └── lib/            # Utilities (tRPC client)
│   └── public/             # Static assets
│
├── server/                 # Express backend
│   ├── _core/              # Core services
│   │   ├── llm.ts          # LLM integration
│   │   ├── trpc.ts         # tRPC setup
│   │   └── env.ts          # Environment config
│   ├── agents/             # AI agent implementations
│   ├── services/           # Business logic
│   └── routers.ts          # API routes
│
├── shared/                 # Shared types & constants
│   ├── types.ts
│   └── const.ts
│
├── drizzle/                # Database schema & migrations
│   └── schema.ts
│
├── docker-compose.yml      # Docker orchestration
├── Dockerfile              # Multi-stage build
└── package.json
```

---

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Type checking
pnpm check
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Project overview and quick start |
| [User Guide](docs/USER_GUIDE.md) | Detailed usage instructions |
| [API Reference](docs/API.md) | tRPC API documentation |
| [Contributing](CONTRIBUTING.md) | Contribution guidelines |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai/) for making local AI accessible
- [tRPC](https://trpc.io/) for end-to-end typesafe APIs
- [shadcn/ui](https://ui.shadcn.com/) for beautiful UI components
- [Drizzle ORM](https://orm.drizzle.team/) for type-safe database operations

---

<p align="center">
  <sub>Built with ❤️ using TypeScript, React, and AI</sub>
</p>
