// Test JSON parsing for nanoscript generator
const testContent = `{"name": "generate_code", "parameters": {"language": "typescript", "code": "function validateEmail(email: string): boolean {\\n  const pattern = /regex/;\\n  return pattern.test(email);\\n}", "dependencies": "[]", "description": "Email validation"}}`;

console.log("=== RAW CONTENT ===");
console.log(testContent);
console.log("\n=== PARSING ===");

try {
  const parsed = JSON.parse(testContent);
  console.log("Parsed successfully!");
  console.log("Name:", parsed.name);
  console.log("Has parameters:", !!parsed.parameters);
  console.log("Code field exists:", !!parsed.parameters?.code);
  console.log("Code value:", parsed.parameters?.code);
  
  // Clean it
  let code = parsed.parameters?.code || "";
  code = code.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  
  console.log("\n=== CLEANED CODE ===");
  console.log(code);
} catch (e) {
  console.error("Parse error:", e);
}
