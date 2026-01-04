import "dotenv/config";
import { WorkflowEngine } from "../services/workflow.engine";
import * as dbUtils from "../db.utils";
import { workflowConfigs } from "../../drizzle/schema";
import { getDb } from "../db";

// Test tasks for different scenarios
const TEST_TASKS = [
  {
    name: "Email Validation",
    task: "Create a TypeScript function called validateEmail that takes an email string as input and returns true if it's a valid email format, false otherwise. Use a regex pattern for validation.",
  },
  {
    name: "Array Sorting",
    task: "Write a TypeScript function called quickSort that implements the quicksort algorithm for an array of numbers. It should sort in ascending order and return a new sorted array.",
  },
  {
    name: "API Client",
    task: "Create a TypeScript class called HttpClient with methods: get(url: string), post(url: string, data: object), and delete(url: string). Use fetch API and handle errors properly.",
  },
  {
    name: "Date Formatter",
    task: "Write a TypeScript function called formatDate that takes a Date object and a format string (like 'YYYY-MM-DD' or 'DD/MM/YYYY') and returns the formatted date string.",
  },
];

async function testWorkflow(taskIndex = 0) {
  const selectedTask = TEST_TASKS[taskIndex] || TEST_TASKS[0];
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${selectedTask.name}`);
  console.log(`${"=".repeat(60)}\n`);
  
  // Get existing workflow config using raw db query
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    return { success: false, error: "Database not available" };
  }
  
  const configs = await db.select().from(workflowConfigs).limit(1);
  
  if (configs.length === 0) {
    console.error("No workflow configs found. Run pnpm db:seed first.");
    return { success: false, error: "No workflow configs" };
  }
  
  const config = configs[0];
  console.log("Using config:", config.name);
  console.log("Task:", selectedTask.task.substring(0, 100) + "...\n");
  
  // Create a new workflow run
  const runResult = await dbUtils.createWorkflowRun(config.userId, {
    configId: config.id,
    initialTask: selectedTask.task,
    status: "pending",
  });
  
  if (!runResult.id) {
    console.error("Failed to create workflow run");
    return { success: false, error: "Failed to create run" };
  }
  
  console.log("Created workflow run:", runResult.id, "\n");
  
  // Execute the workflow
  const engine = new WorkflowEngine(runResult.id, config.userId);
  const result = await engine.execute();
  
  console.log("\n--- RESULT ---");
  console.log("Success:", result.success);
  if (result.error) console.log("Error:", result.error);
  
  if (result.artifacts?.nanoscript_generator) {
    console.log("\n--- GENERATED CODE ---");
    console.log(result.artifacts.nanoscript_generator);
  }
  
  if (result.artifacts?.critical_analyst) {
    console.log("\n--- ANALYSIS ---");
    console.log(result.artifacts.critical_analyst.substring(0, 800));
    if (result.artifacts.critical_analyst.length > 800) console.log("...");
  }

  return result;
}

// Run test
const taskIndex = parseInt(process.argv[2] || "0");
console.log("Starting workflow test...");
console.log("Available tasks:", TEST_TASKS.map((t, i) => `${i}: ${t.name}`).join(", "));

testWorkflow(taskIndex).then((result) => {
  console.log("\n" + "=".repeat(60));
  console.log(result.success ? "✅ TEST PASSED" : "❌ TEST FAILED");
  process.exit(result.success ? 0 : 1);
}).catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
