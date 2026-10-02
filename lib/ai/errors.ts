import { apiError } from "@/lib/api";
import { AiProviderError } from "@/lib/ai/provider";
import { logError } from "@/lib/log";

/** Maps provider failures to user-safe API errors (details go to the redacted log only). */
export function aiErrorResponse(error: AiProviderError, context: Record<string, unknown>) {
  logError("ai.provider_error", { ...context, kind: error.kind }, error);
  switch (error.kind) {
    case "not_configured":
      return apiError("Drafting isn't set up on the server yet.", 503, "ai_unavailable");
    case "timeout":
      return apiError("The AI took too long to respond. Try again.", 504, "ai_timeout");
    case "invalid_output":
      return apiError("The AI returned an unusable draft. Try again.", 502, "ai_invalid_output");
    default:
      return apiError("The AI provider had a problem. Try again shortly.", 502, "ai_error");
  }
}

export { AiProviderError };
