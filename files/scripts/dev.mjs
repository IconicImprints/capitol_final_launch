import { spawn } from "node:child_process";
import process from "node:process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "dev:api"], { stdio: "inherit", env: process.env }),
  spawn(npm, ["run", "dev:frontend"], { stdio: "inherit", env: process.env }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 250);
}

for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", (code, signal) => {
    if (!stopping && (code ?? 1) !== 0 && signal !== "SIGTERM") stop(code ?? 1);
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
