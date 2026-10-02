/**
 * Reddit text is untrusted input. It reaches the model only inside a single
 * delimited block, and anything in the text that could close or reopen that
 * block is neutralized, so injected instructions can't escape into the trusted
 * parts of the prompt.
 */

export const UNTRUSTED_TAG = "untrusted_reddit_text";

const DELIMITER_LOOKALIKE = /<\s*\/?\s*untrusted_reddit_text\b[^>]*>/gi;
// Control characters other than tab and newline.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeUntrusted(text: string, maxChars: number): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(DELIMITER_LOOKALIKE, (match) => match.replace(/</g, "‹").replace(/>/g, "›"))
    .slice(0, maxChars)
    .trim();
}

export function wrapUntrusted(text: string, maxChars: number): string {
  return `<${UNTRUSTED_TAG}>\n${sanitizeUntrusted(text, maxChars)}\n</${UNTRUSTED_TAG}>`;
}
