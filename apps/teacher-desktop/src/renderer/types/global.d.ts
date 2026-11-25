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
      checkForUpdates:     () => Promise<unknown>;
      downloadUpdate:      () => Promise<unknown>;
      installUpdate:       () => void;
      exportDiagnostics:   () => Promise<{ saved: boolean; path?: string; error?: string }>;
      onDiscoveryServerFound: (callback: (data: { host: string; port: number; labName: string; serverVersion: string }) => void) => void;
      onCctvCalibrationRequest: (callback: (data: unknown) => void) => void;
      onUpdaterStatus:     (callback: (data: { stage: string; version?: string; percent?: number; message?: string }) => void) => void;
      removeAllListeners:  (channel: string) => void;
    };
  }
}
