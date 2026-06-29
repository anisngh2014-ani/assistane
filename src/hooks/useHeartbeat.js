import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Simulates a device agent sending heartbeats every 10 seconds for all
 * online-capable devices belonging to the current user.
 * In production this would run on the actual remote machine — here it
 * keeps the demo data alive in the browser.
 */
export function useHeartbeat(devices) {
  useEffect(() => {
    if (!devices || devices.length === 0) return;

    const sendHeartbeats = async () => {
      const now = new Date().toISOString();
      await Promise.all(
        devices
          .filter((d) => d.id)
          .map((d) =>
            base44.entities.Device.update(d.id, {
              online_status: "online",
              last_seen: now,
            })
          )
      );
    };

    sendHeartbeats();
    const interval = setInterval(sendHeartbeats, 10000);
    return () => clearInterval(interval);
  }, [devices?.length]);
}