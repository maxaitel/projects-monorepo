#!/usr/bin/env node
import fs from "node:fs";
import vm from "node:vm";

const file = process.argv[2] || "src/generatedUsage.js";
const source = fs.readFileSync(file, "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);

const data = context.window.CODEX_USAGE_DATA;
assert(data, "generated data should define window.CODEX_USAGE_DATA");
assert(data.schemaVersion === 1, "schema version should be 1");
assert(Array.isArray(data.daily), "daily should be an array");
assert(data.daily.length > 0, "daily should contain rows");
assert(Array.isArray(data.threads), "threads should be an array");
assert(data.threads.length > 0, "threads should contain rows");
assert(data.totals.total > 0, "total tokens should be positive");
assert(data.quality.tokenEvents > 0, "token events should be positive");

console.log(`Smoke test passed for ${file}`);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
