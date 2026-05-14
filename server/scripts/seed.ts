/**
 * Database Seed Script
 *
 * Populates the database with initial agent configurations and workflow templates.
 *
 * Usage:
 *   pnpm db:seed              # Run seed (default: append mode)
 *   pnpm db:seed -- --clear   # Clear existing data before seeding
 *
 * Or directly:
 *   npx tsx server/scripts/seed.ts
 *   npx tsx server/scripts/seed.ts --clear
 */

import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import { agentConfigs, users, workflowConfigs } from "../../drizzle/schema";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const shouldClear = args.includes("--clear") || args.includes("-c");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// System user ID for seeded data (0 = system/global templates)
const SYSTEM_USER_ID = 0;
const SYSTEM_USER_OPEN_ID = "__system__";

/**
 * Agent configuration seed data
 */
const agentSeedData = [
  {
    userId: SYSTEM_USER_ID,
    agentType: "context_provider",
    role: "Senior Technical Architect",
    goal: "Analyze requirements and identify technical constraints, dependencies, and domain-specific context needed for implementation.",
    backstory: `You are a Senior Technical Architect with 15+ years of experience designing 
scalable systems. You excel at breaking down complex requirements into clear technical 
specifications. Your expertise spans distributed systems, API design, and modern web 
architectures. You have a keen eye for identifying edge cases and potential integration 
challenges before they become problems.`,
    llmModel: "llama3.2",
    isActive: 1,
  },
  {
    userId: SYSTEM_USER_ID,
    agentType: "nanoscript_generator",
    role: "Expert TypeScript Developer",
    goal: "Write clean, efficient, and type-safe code that follows best practices and modern patterns.",
    backstory: `You are an Expert TypeScript Developer who lives and breathes code quality. 
You've contributed to major open-source projects and have deep knowledge of the TypeScript 
ecosystem. You write code that is not only functional but also maintainable, well-documented, 
and testable. You follow SOLID principles and prefer composition over inheritance. Your code 
reviews are legendary for catching subtle bugs before they reach production.`,
    llmModel: "llama3.2",
    isActive: 1,
  },
  {
    userId: SYSTEM_USER_ID,
    agentType: "critical_analyst",
    role: "Security & QA Lead",
    goal: "Review code for bugs, security flaws, performance issues, and ensure it meets quality standards.",
    backstory: `You are a Security & QA Lead with a background in both offensive security 
and quality assurance. You've found critical vulnerabilities in production systems and 
prevented countless bugs from reaching users. You approach code review systematically, 
checking for OWASP Top 10 vulnerabilities, race conditions, memory leaks, and performance 
bottlenecks. You balance perfectionism with pragmatism, knowing when to flag issues and 
when to approve with minor suggestions.`,
    llmModel: "llama3.2",
    isActive: 1,
  },
];

/**
 * Workflow configuration seed data
 */
const workflowSeedData = [
  {
    userId: SYSTEM_USER_ID,
    name: "Standard Web Feature Development",
    description: `A comprehensive workflow for developing web application features. 
The Context Provider analyzes requirements, the Nanoscript Generator implements the solution, 
and the Critical Analyst reviews for quality and security.`,
    initialTask: "Implement a new feature based on the provided requirements.",
    llmModel: "llama3.2",
    mistralModel: "mistral",
    isActive: 1,
  },
  {
    userId: SYSTEM_USER_ID,
    name: "API Endpoint Development",
    description: `Specialized workflow for creating REST or GraphQL API endpoints. 
Focuses on request/response typing, validation, error handling, and security headers.`,
    initialTask: "Create a new API endpoint with proper validation and error handling.",
    llmModel: "llama3.2",
    mistralModel: "mistral",
    isActive: 1,
  },
  {
    userId: SYSTEM_USER_ID,
    name: "Database Integration Task",
    description: `Workflow optimized for database-related tasks including schema design, 
query optimization, and ORM integration. Emphasizes data integrity and performance.`,
    initialTask: "Implement database operations with proper schema and queries.",
    llmModel: "llama3.2",
    mistralModel: "mistral",
    isActive: 1,
  },
];

async function seed() {
  log("\n🌱 Database Seed Script", "green");
  log("━".repeat(50), "dim");

  // Validate DATABASE_URL
  if (!process.env.DATABASE_URL) {
    log("\n❌ Error: DATABASE_URL environment variable is not set.", "red");
    log("Please create a .env file with your database connection string.", "yellow");
    process.exit(1);
  }

  log(`\n📦 Connecting to database...`, "blue");

  try {
    const db = drizzle(process.env.DATABASE_URL);

    // Test connection
    await db.execute(sql`SELECT 1`);
    log("✓ Database connected successfully", "green");

    // Reserve userId=0 for system-owned templates so FK constraints remain valid.
    await db.execute(
      sql.raw(
        "SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'NO_AUTO_VALUE_ON_ZERO')"
      )
    );
    await db.insert(users).values({
      id: SYSTEM_USER_ID,
      openId: SYSTEM_USER_OPEN_ID,
      name: "System Templates",
      loginMethod: "system",
      role: "admin",
    }).onDuplicateKeyUpdate({
      set: {
        openId: SYSTEM_USER_OPEN_ID,
        name: "System Templates",
        loginMethod: "system",
        role: "admin",
        updatedAt: sql`CURRENT_TIMESTAMP`,
        lastSignedIn: sql`CURRENT_TIMESTAMP`,
      },
    });
    log("✓ System template user ensured", "green");

    // Clear existing data if requested
    if (shouldClear) {
      log("\n🗑️  Clearing existing seed data...", "yellow");

      // Only delete system-owned records (userId = 0)
      await db.delete(agentConfigs).where(sql`${agentConfigs.userId} = ${SYSTEM_USER_ID}`);
      await db.delete(workflowConfigs).where(sql`${workflowConfigs.userId} = ${SYSTEM_USER_ID}`);

      log("✓ Existing system data cleared", "green");
    }

    // Seed agent configurations
    log("\n🤖 Seeding agent configurations...", "blue");

    for (const agent of agentSeedData) {
      await db.insert(agentConfigs).values(agent);
      log(`  ✓ ${agent.agentType}: ${agent.role}`, "dim");
    }

    log(`✓ ${agentSeedData.length} agents seeded`, "green");

    // Seed workflow configurations
    log("\n⚙️  Seeding workflow configurations...", "blue");

    for (const workflow of workflowSeedData) {
      await db.insert(workflowConfigs).values(workflow);
      log(`  ✓ ${workflow.name}`, "dim");
    }

    log(`✓ ${workflowSeedData.length} workflow templates seeded`, "green");

    // Summary
    log("\n" + "━".repeat(50), "dim");
    log("✅ Seed completed successfully!", "green");
    log(`\n   Agents:    ${agentSeedData.length} records`, "dim");
    log(`   Workflows: ${workflowSeedData.length} records`, "dim");
    log("\n", "reset");

    process.exit(0);
  } catch (error) {
    log(`\n❌ Seed failed: ${error instanceof Error ? error.message : error}`, "red");

    if (error instanceof Error && error.message.includes("ER_NO_SUCH_TABLE")) {
      log("\n💡 Tip: Run migrations first with: pnpm db:push", "yellow");
    }

    process.exit(1);
  }
}

// Run seed
seed();
