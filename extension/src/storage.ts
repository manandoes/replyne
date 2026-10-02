import { DEFAULT_DRAFT_OPTIONS, type DraftOptions } from "@shared/contracts";
import type { Capture } from "./capture";

/**
 * chrome.storage wrappers.
 *  - local:   the extension session token and UI preferences
 *  - session: the pending capture (in memory; cleared when the browser closes)
 */

export const CAPTURE_KEY = "pendingCapture";
const AUTH_KEY = "auth";
const PREFS_KEY = "prefs";

export type StoredAuth = { token: string; expiresAt: string };
export type Prefs = { workspaceId: string | null; profileId: string | null; options: DraftOptions };

export async function getAuth(): Promise<StoredAuth | null> {
  const stored = await chrome.storage.local.get(AUTH_KEY);
  const auth = stored[AUTH_KEY] as StoredAuth | undefined;
  return auth && new Date(auth.expiresAt) > new Date() ? auth : null;
}

export const setAuth = (auth: StoredAuth) => chrome.storage.local.set({ [AUTH_KEY]: auth });
export const clearAuth = () => chrome.storage.local.remove(AUTH_KEY);

export async function getPrefs(): Promise<Prefs> {
  const stored = await chrome.storage.local.get(PREFS_KEY);
  const prefs = stored[PREFS_KEY] as Partial<Prefs> | undefined;
  return {
    workspaceId: prefs?.workspaceId ?? null,
    profileId: prefs?.profileId ?? null,
    options: { ...DEFAULT_DRAFT_OPTIONS, ...prefs?.options },
  };
}

export const setPrefs = (prefs: Prefs) => chrome.storage.local.set({ [PREFS_KEY]: prefs });

export async function takeCapture(): Promise<Capture | null> {
  const stored = await chrome.storage.session.get(CAPTURE_KEY);
  const capture = (stored[CAPTURE_KEY] as Capture | undefined) ?? null;
  if (capture) await chrome.storage.session.remove(CAPTURE_KEY);
  return capture;
}

export function onCapture(listener: (capture: Capture) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    const next = changes[CAPTURE_KEY]?.newValue as Capture | undefined;
    if (area === "session" && next) {
      listener(next);
      void chrome.storage.session.remove(CAPTURE_KEY);
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
