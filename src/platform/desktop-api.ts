import type {
  AIProvider,
  AIUsagePurpose,
  AIUsageRecord,
  AppData,
  MailDraft,
} from "../domain/types";

export type Unsubscribe = () => void;

export type NavigationPage =
  | "home"
  | "new"
  | "mail"
  | "applications"
  | "journey"
  | "settings";

export interface NavigationTarget {
  page: NavigationPage;
  eventId?: string;
  text?: string;
}

export interface ImportedTableFile {
  name: string;
  content: string;
  format: "csv" | "tsv";
}

export interface NotificationScheduleResult {
  scheduled: number;
}

export interface AIRecognizeRequest {
  apiBaseUrl: string;
  model: string;
  provider: AIProvider;
  requireJsonOutput: boolean;
  text: string;
  /** ISO timestamp used only as the calendar reference for ambiguous mail dates. */
  referenceDate?: string;
  purpose?: AIUsagePurpose;
  bypassCache?: boolean;
  fast?: boolean;
}

export interface AIRecognizeResult {
  draft: MailDraft;
  usage: AIUsageRecord;
}

export interface DesktopAPI {
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<boolean>;
    close(): Promise<void>;
    quit(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximized(callback: (maximized: boolean) => void): Unsubscribe;
  };
  data: {
    load(): Promise<AppData>;
    save(data: AppData): Promise<AppData>;
    onChanged(callback: (data: AppData) => void): Unsubscribe;
  };
  dialog: {
    importTable(): Promise<ImportedTableFile | null>;
    exportCsv(name: string, content: string): Promise<string | null>;
  };
  system: {
    openExternal(url: string): Promise<void>;
    openDataDirectory(): Promise<void>;
    getStartAtLogin(): Promise<boolean>;
    setStartAtLogin(enabled: boolean): Promise<boolean>;
  };
  clipboard: {
    readText(): Promise<string>;
  };
  notifications: {
    reschedule(data: AppData): Promise<NotificationScheduleResult>;
  };
  ai: {
    hasCredential(url: string): Promise<boolean>;
    saveCredential(url: string, key: string): Promise<void>;
    recognize(request: AIRecognizeRequest): Promise<AIRecognizeResult>;
  };
  navigation: {
    onNavigate(callback: (target: NavigationTarget) => void): Unsubscribe;
  };
}
