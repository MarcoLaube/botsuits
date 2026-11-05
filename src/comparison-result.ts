import { storedComparisonSchema } from "./comparison.js";

// Metadata alone is not a completed tool result in the installed host bridge.
export function readComparisonResult(output: unknown) {
  const parsed = storedComparisonSchema.safeParse(output);
  if (parsed.success) return { status: "ready" as const, value: parsed.data };
  if (output && typeof output === "object" && "error" in output && typeof output.error === "string") {
    return { status: "error" as const, error: output.error };
  }
  if (output && typeof output === "object" && "comparisonId" in output && "revision" in output && "comparison" in output && output.comparison !== null) {
    return { status: "error" as const, error: "The comparison response is invalid. Ask in chat to reopen it." };
  }
  return { status: "loading" as const };
}
