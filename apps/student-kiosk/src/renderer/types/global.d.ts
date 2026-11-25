export {};

declare global {
  interface Window {
    kioskAPI?: {
      getHardwareToken:  () => Promise<string>;
      getSystemNo:       () => Promise<string>;
      getServerUrl:      () => Promise<string>;
      getLockdownMode:   () => Promise<"KIOSK" | "WINDOWED">;
      setLockdownMode:   (mode: "KIOSK" | "WINDOWED") => Promise<void>;
      unlock:            (code: string) => Promise<boolean>;
      getEnvironmentCheck: () => Promise<{
        isVM: boolean; vmType: string | null;
        isRemoteDesktop: boolean; remoteTool: string | null;
        multiMonitor: boolean; displayCount: number;
      }>;
      onWindowBlur:      (cb: () => void) => void;
      onWindowFocus:     (cb: () => void) => void;
      removeAllListeners:(channel: string) => void;
    };
  }
}
