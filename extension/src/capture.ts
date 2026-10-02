import { CAPTURED_TEXT_MAX_CHARS } from "@shared/contracts";
import { describeSourceUrl, type SourceUrl } from "@shared/reddit-url";

/**
 * A piece of text the user explicitly captured (context menu, toolbar click
 * with a selection, or paste). Nothing leaves the browser until they press
 * Generate, and they can edit or remove both the text and the link first.
 */
export type Capture = {
  text: string;
  truncated: boolean;
  source: SourceUrl | null;
  /** Default: include the link only for Reddit pages. The user can change it. */
  includeSource: boolean;
  method: "context_menu" | "toolbar" | "paste";
  capturedAt: number;
};

const ZERO_WIDTH = /[​-‍﻿]/g;

export function normalizeCapturedText(raw: string): { text: string; truncated: boolean } {
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(ZERO_WIDTH, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > CAPTURED_TEXT_MAX_CHARS
    ? { text: text.slice(0, CAPTURED_TEXT_MAX_CHARS), truncated: true }
    : { text, truncated: false };
}

export function buildCapture(input: {
  text: string;
  url: string | null;
  method: Capture["method"];
  capturedAt: number;
}): Capture | null {
  const { text, truncated } = normalizeCapturedText(input.text);
  if (!text) return null;
  const source = describeSourceUrl(input.url);
  return {
    text,
    truncated,
    source,
    includeSource: source?.isReddit ?? false,
    method: input.method,
    capturedAt: input.capturedAt,
  };
}
