// Temporary diagnostics. IDs are capabilities: keep these development logs private.
export function traceComparison(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    const line = JSON.stringify({ time: new Date().toISOString(), pid: process.pid, event, ...details });
    console.info("[comparison-trace]", line);
    if (process.env.NODE_ENV !== "test") {
      try {
        mkdirSync(".skybridge", { recursive: true });
        const path = ".skybridge/comparison-trace.jsonl";
        if (existsSync(path) && statSync(path).size > 2 * 1024 * 1024) writeFileSync(path, "");
        appendFileSync(path, line + "\n");
      } catch {
        // Diagnostics must never cause a comparison operation to fail.
      }
    }
  }
}
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";

