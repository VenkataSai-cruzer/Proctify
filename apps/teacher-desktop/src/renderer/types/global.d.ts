export {};

declare global {
  interface Window {
    electronAPI?: {
      storeGet:            (key: string) => Promise<unknown>;
      storeSet:            (key: string, value: unknown) => Promise<void>;
      openFileDialog:      (filters: { name: string; extensions: string[] }[]) => Promise<string | null>;
      saveFileDialog:      (options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
      openDirectoryDialog: () => Promise<string | null>;
      readFile:            (path: string) => Promise<Buffer>;
      writeFile:           (path: string, data: Buffer) => Promise<boolean>;
      openPath:            (path: string) => Promise<void>;
      extractPdfText:      (path: string) => Promise<{ text: string; pages: number }>;
      openProjector:       () => Promise<boolean>;
      getVersion:          () => Promise<string>;
      getPlatform:         () => Promise<string>;
      getUserDataPath:     () => Promise<string>;
      getDbPath:           () => Promise<string>;
      getDatabaseUrl:      () => Promise<string>;
      getServerInfo:       () => Promise<{
        ok: boolean;
        labMode: "HOME" | "LAB_SERVER" | "LAB_CLIENT" | null;
        running: boolean;
        embedded: boolean;
        healthy: boolean;
        port: number;
        url: string;
        pid: number | null;
        restarts: number;
        lastError: string | null;
        bundlePath: string;
        dbPath: string;
      }>;
      restartServer:       () => Promise<unknown>;
      onServerStatus:      (callback: (data: unknown) => void) => void;
      onServerLog:         (callback: (data: { level: string; line: string }) => void) => void;
      checkForUpdates:     () => Promise<{
        stage: string; channel?: string; version?: string; message?: string;
      } | null>;
      downloadUpdate:      () => Promise<boolean | null>;
      installUpdate:       () => void;
      exportDiagnostics:   () => Promise<{ saved: boolean; path?: string; error?: string }>;
      onDiscoveryServerFound: (callback: (data: { host: string; port: number; labName: string; serverVersion: string }) => void) => void;
      onCctvCalibrationRequest: (callback: (data: unknown) => void) => void;
      onUpdaterStatus:     (callback: (data: {
        stage: string; channel?: string; version?: string; percent?: number; message?: string;
      }) => void) => void;
      removeAllListeners:  (channel: string) => void;
    };
  }
}
