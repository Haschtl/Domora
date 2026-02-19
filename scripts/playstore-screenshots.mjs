import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const screenshotSpecPath = "tests/e2e/playstore-screenshots.spec.ts";

const forwardArgs = process.argv.slice(2);
const e2ePort = Number(process.env.E2E_PORT ?? "4173");

const hasPnpm = () => {
  const check = spawnSync("pnpm", ["--version"], { stdio: "ignore" });
  return check.status === 0;
};

const packageManager = hasPnpm() ? "pnpm" : "npm";

const parseEnvFile = (filePath) => {
  try {
    const raw = readFileSync(filePath, "utf8");
    const lines = raw.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore missing env files
  }
};

parseEnvFile(resolve(process.cwd(), ".env"));
parseEnvFile(resolve(process.cwd(), ".env.local"));

const runCommand = ({ command, args, env = process.env, captureOutput = false }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["inherit", "pipe", "pipe"]
    });

    let output = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (captureOutput) output += text;
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);
      if (captureOutput) output += text;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(new Error(`Command failed (${command} ${args.join(" ")}), exit code: ${code ?? "unknown"}`));
    });
  });

const run = async () => {
  const screenshotEmail = process.env.PLAYSTORE_SCREENSHOT_EMAIL?.trim() ?? "";
  const screenshotPassword = process.env.PLAYSTORE_SCREENSHOT_PASSWORD?.trim() ?? "";
  const hasReporterArg = forwardArgs.some((arg) => arg === "--reporter" || arg.startsWith("--reporter="));
  const hasWorkersArg = forwardArgs.some((arg) => arg === "--workers" || arg.startsWith("--workers="));
  const playwrightArgs = [
    "test",
    screenshotSpecPath,
    ...(hasReporterArg ? [] : ["--reporter=line"]),
    ...(hasWorkersArg ? [] : ["--workers=1"]),
    ...forwardArgs
  ];

  const screenshotCommand =
    packageManager === "pnpm"
      ? {
          command: "pnpm",
          args: ["exec", "playwright", ...playwrightArgs]
        }
      : {
          command: "npm",
          args: ["exec", "playwright", "--", ...playwrightArgs]
        };

  if (!screenshotEmail || !screenshotPassword) {
    throw new Error(
      [
        "Missing screenshot credentials.",
        "Set PLAYSTORE_SCREENSHOT_EMAIL and PLAYSTORE_SCREENSHOT_PASSWORD",
        "in your environment before running this script."
      ].join(" ")
    );
  }

  console.log("Capturing Google Play screenshots...");
  await runCommand({
    command: screenshotCommand.command,
    args: screenshotCommand.args,
    env: {
      ...process.env,
      ...(packageManager === "npm"
        ? { E2E_WEB_SERVER_COMMAND: `npm run dev -- --host 127.0.0.1 --port ${e2ePort}` }
        : {}),
      PLAYSTORE_SCREENSHOT_EMAIL: screenshotEmail,
      PLAYSTORE_SCREENSHOT_PASSWORD: screenshotPassword
    }
  });

  console.log("Done. Screenshots are available under screenshots/google-play (or PLAYSTORE_SCREENSHOT_DIR).");
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
