import { APP_NAME } from "@shared/brand";
import { buildCapture, type Capture } from "./capture";
import { CAPTURE_KEY } from "./storage";

/**
 * Background service worker. It reacts only to explicit user actions:
 *  - clicking the toolbar icon (opens the side panel, captures the current selection), or
 *  - the "Draft a reply" context-menu item on selected text.
 * There are no content scripts and no listeners on browsing activity. Reading
 * the selection uses the temporary activeTab grant from that click.
 */

const MENU_ID = "replyline-draft-reply";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: `Draft a reply with ${APP_NAME}`,
    contexts: ["selection"],
  });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.action.onClicked.addListener((tab) => {
  // sidePanel.open must run synchronously inside the user gesture.
  void chrome.sidePanel.open({ windowId: tab.windowId });
  void captureFromTab(tab, null, "toolbar");
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab) return;
  void chrome.sidePanel.open({ windowId: tab.windowId });
  void captureFromTab(tab, info.selectionText ?? null, "context_menu");
});

async function readSelection(tabId: number): Promise<string | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString() ?? "",
    });
    return typeof result?.result === "string" ? result.result : null;
  } catch {
    // Pages like chrome:// or the web store can't be scripted; fall back to what we have.
    return null;
  }
}

async function captureFromTab(
  tab: chrome.tabs.Tab,
  fallbackText: string | null,
  method: Capture["method"]
): Promise<void> {
  // The page's own selection keeps line breaks; the menu's selectionText doesn't.
  const selected = tab.id === undefined ? null : await readSelection(tab.id);
  const text = selected?.trim() ? selected : fallbackText;
  if (!text?.trim()) return;

  const capture = buildCapture({ text, url: tab.url ?? null, method, capturedAt: Date.now() });
  if (capture) await chrome.storage.session.set({ [CAPTURE_KEY]: capture });
}
