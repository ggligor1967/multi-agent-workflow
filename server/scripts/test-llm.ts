/**
 * LLM Connection Test Script
 *
 * Validates that the LLM API connection is properly configured.
 *
 * Usage:
 *   pnpm test:llm
 *
 * Or directly:
 *   npx tsx server/scripts/test-llm.ts
 */

// Load environment variables FIRST before any other imports
import dotenv from "dotenv";
dotenv.config();

// Now import LLM after env is loaded
import { invokeLLM } from "../_core/llm";

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testLLMConnection() {
  log("\n🔌 LLM Connection Test", "cyan");
  log("━".repeat(50), "dim");

  // Check environment variables first
  const apiKey = process.env.BUILT_IN_FORGE_API_KEY;
  const apiUrl = process.env.BUILT_IN_FORGE_API_URL;

  log("\n📋 Environment Check:", "blue");
  log(`   BUILT_IN_FORGE_API_KEY: ${apiKey ? "✓ Set" : "✗ Missing"}`, apiKey ? "green" : "red");
  log(`   BUILT_IN_FORGE_API_URL: ${apiUrl ? `✓ ${apiUrl}` : "○ Using default"}`, apiUrl ? "green" : "yellow");

  if (!apiKey) {
    log("\n❌ Error: BUILT_IN_FORGE_API_KEY is not set.", "red");
    log("\n💡 To fix this:", "yellow");
    log("   1. Create a .env file in the project root", "dim");
    log("   2. Add: BUILT_IN_FORGE_API_KEY=your_api_key_here", "dim");
    log("   3. Optionally add: BUILT_IN_FORGE_API_URL=https://your-api-endpoint", "dim");
    log("\n", "reset");
    process.exit(1);
  }

  log("\n🚀 Sending test message...", "blue");

  try {
    const startTime = Date.now();

    const result = await invokeLLM({
      messages: [
        {
          role: "user",
          content: "Hello! Please respond with a brief greeting and confirm you are working correctly. Keep your response under 50 words.",
        },
      ],
      maxTokens: 100,
    });

    const elapsed = Date.now() - startTime;

    // Success!
    log("\n" + "━".repeat(50), "dim");
    log("✅ LLM Connection Successful!", "green");
    log("━".repeat(50), "dim");

    log(`\n📊 Response Details:`, "blue");
    log(`   Model:          ${result.model}`, "green");
    log(`   Response Time:  ${elapsed}ms`, "green");

    if (result.usage) {
      log(`   Prompt Tokens:  ${result.usage.prompt_tokens}`, "dim");
      log(`   Output Tokens:  ${result.usage.completion_tokens}`, "dim");
      log(`   Total Tokens:   ${result.usage.total_tokens}`, "dim");
    }

    const responseContent = result.choices[0]?.message?.content;
    const responseText =
      typeof responseContent === "string"
        ? responseContent
        : Array.isArray(responseContent)
          ? responseContent.map((c) => ("text" in c ? c.text : "")).join("")
          : "";

    log(`\n💬 Response:`, "blue");
    log(`   "${responseText.trim()}"`, "green");

    log("\n" + "━".repeat(50), "dim");
    log("🎉 Your LLM configuration is working correctly!", "green");
    log("   You can now start the server with: pnpm dev", "dim");
    log("\n", "reset");

    process.exit(0);
  } catch (error) {
    log("\n" + "━".repeat(50), "dim");
    log("❌ LLM Connection Failed!", "red");
    log("━".repeat(50), "dim");

    const errorMessage = error instanceof Error ? error.message : String(error);

    log(`\n🔍 Error Details:`, "red");
    log(`   ${errorMessage}`, "dim");

    // Provide helpful suggestions based on error type
    log("\n💡 Troubleshooting:", "yellow");

    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
      log("   → Invalid API key. Check BUILT_IN_FORGE_API_KEY in your .env file.", "dim");
      log("   → Ensure the key is correct and has not expired.", "dim");
    } else if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
      log("   → API key lacks permissions. Contact your API provider.", "dim");
    } else if (
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("Connection refused")
    ) {
      log("   → Cannot reach the API server.", "dim");
      log("   → Check BUILT_IN_FORGE_API_URL is correct.", "dim");
      log("   → Verify your network connection and firewall settings.", "dim");
    } else if (errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")) {
      log("   → Request timed out. The API server may be slow or unreachable.", "dim");
      log("   → Try again in a few moments.", "dim");
    } else if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
      log("   → Rate limit exceeded. Wait a moment and try again.", "dim");
    } else if (errorMessage.includes("500") || errorMessage.includes("Internal Server Error")) {
      log("   → API server error. This is likely a temporary issue.", "dim");
      log("   → Try again in a few moments.", "dim");
    } else {
      log("   → Check your .env file has the correct values:", "dim");
      log("     BUILT_IN_FORGE_API_KEY=your_api_key", "dim");
      log("     BUILT_IN_FORGE_API_URL=https://api.example.com (optional)", "dim");
    }

    log("\n📄 Environment variables to check:", "yellow");
    log("   BUILT_IN_FORGE_API_KEY  - Your API authentication key", "dim");
    log("   BUILT_IN_FORGE_API_URL  - API endpoint (optional, has default)", "dim");
    log("\n", "reset");

    process.exit(1);
  }
}

// Run the test
testLLMConnection();
