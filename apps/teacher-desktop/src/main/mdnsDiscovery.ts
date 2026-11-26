// ============================================================
// SecureAssess Teacher Desktop — mDNS LAN Server Discovery
//
// Returns a disposer: the browser socket keeps the event loop alive and
// firing into a closed window was one source of post-shutdown callbacks.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Bonjour = require("bonjour-service");

const MDNS_SERVICE_NAME = "secureassess-lab";

export interface DiscoveredServer {
  host: string;
  port: number;
  labName: string;
  serverVersion: string;
}

export function initMDNSDiscovery(
  onFound: (server: DiscoveredServer) => void
): (() => void) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bonjour = new (Bonjour.default ?? Bonjour)();
    const browser = bonjour.find({ type: MDNS_SERVICE_NAME });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browser.on("up", (service: any) => {
      onFound({
        host: service.host ?? `${service.name}.local`,
        port: service.port,
        labName: service.txt?.labName ?? service.name,
        serverVersion: service.txt?.version ?? "unknown",
      });
    });

    return () => {
      try {
        browser.stop();
        bonjour.destroy();
      } catch {
        /* already torn down */
      }
    };
  } catch {
    // mDNS unavailable on some networks — non-fatal
    return null;
  }
}
