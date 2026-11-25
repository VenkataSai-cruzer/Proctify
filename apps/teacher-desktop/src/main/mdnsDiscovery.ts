// ============================================================
// SecureAssess Teacher Desktop — mDNS LAN Server Discovery
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
): void {
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
  } catch {
    // mDNS unavailable on some networks — non-fatal
  }
}
