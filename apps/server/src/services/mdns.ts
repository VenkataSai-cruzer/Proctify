// ============================================================
// SecureAssess — mDNS LAN Service Advertisement
// ============================================================

import Bonjour from "bonjour-service";
import { PORTS, MDNS_SERVICE } from "@secureassess/shared";
import { logger } from "../utils/logger";

let bonjour: InstanceType<typeof Bonjour> | null = null;

export function initMDNS(): void {
  try {
    bonjour = new Bonjour();
    const port = Number(process.env.PORT) || PORTS.SERVER;
    const labName = process.env.LAB_NAME ?? "SecureAssess Lab";

    bonjour.publish({
      name: labName,
      type: MDNS_SERVICE.NAME,
      port,
      txt: {
        version: "1.0.0",
        labName,
      },
    });

    logger.info(`mDNS: broadcasting as "${labName}" on port ${port}`);
  } catch (err) {
    logger.warn("mDNS unavailable (non-fatal)", { error: (err as Error).message });
  }
}

export function stopMDNS(): void {
  bonjour?.unpublishAll(() => {
    bonjour?.destroy();
    logger.info("mDNS stopped");
  });
}
