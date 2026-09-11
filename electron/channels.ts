export const IPC = {
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowQuit: "window:quit",
  windowIsMaximized: "window:is-maximized",
  windowMaximizedChanged: "window:maximized-changed",

  dataLoad: "data:load",
  dataSave: "data:save",
  dataChanged: "data:changed",

  dialogImportTable: "dialog:import-table",
  dialogExportCsv: "dialog:export-csv",

  systemOpenExternal: "system:open-external",
  systemOpenDataDirectory: "system:open-data-directory",
  systemGetStartAtLogin: "system:get-start-at-login",
  systemSetStartAtLogin: "system:set-start-at-login",

  clipboardReadText: "clipboard:read-text",
  notificationsReschedule: "notifications:reschedule",

  aiHasCredential: "ai:has-credential",
  aiSaveCredential: "ai:save-credential",
  aiRecognize: "ai:recognize",

  navigationReady: "navigation:ready",
  navigationChanged: "navigation:changed",
} as const;
