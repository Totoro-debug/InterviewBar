import type { DesktopAPI } from "./desktop-api";

declare global {
  interface Window {
    interviewBar: DesktopAPI;
  }
}

export {};
