import type { DesktopAPI } from "./desktop-api";

export function getDesktopAPI(): DesktopAPI {
  if (typeof window === "undefined" || !window.interviewBar) {
    throw new Error("Desktop API is only available inside the Electron application.");
  }
  return window.interviewBar;
}
