import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const projectRef = process.env.SUPABASE_PROJECT_REF;
if (!projectRef) {
  console.error("Missing SUPABASE_PROJECT_REF in environment.");
  process.exit(1);
}

const functionsDir = join(process.cwd(), "supabase", "functions");
const entries = readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
  .map((entry) => entry.name)
  .sort();

if (entries.length === 0) {
  console.warn("No functions found under supabase/functions.");
  process.exit(0);
}

const extraArgs = process.argv.slice(2);
const failed = [];

for (const name of entries) {
  const args = ["functions", "deploy", name, "--project-ref", projectRef, ...extraArgs];
  console.log(`\n==> Deploying ${name}`);
  const result = spawnSync("supabase", args, { stdio: "inherit" });
  if (result.status !== 0) {
    failed.push(name);
  }
}

if (failed.length > 0) {
  console.error(`\nFailed to deploy: ${failed.join(", ")}`);
  process.exit(1);
}

console.log("\nAll functions deployed.");
