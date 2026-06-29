// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json();
    const { action } = body;
    const DEVICE_STALE_MS = 120 * 1000;
    const isDeviceHeartbeatStale = (device) => {
      if (!device || device.online_status !== "online") return false;
      if (!device.last_seen) return true;
      const lastSeenMs = Date.parse(device.last_seen);
      return !Number.isFinite(lastSeenMs) || lastSeenMs < Date.now() - DEVICE_STALE_MS;
    };
    const withFreshOnlineStatus = (device) => {
      if (!isDeviceHeartbeatStale(device)) return device;
      return {
        ...device,
        online_status: "offline",
        offline_reason: "heartbeat_timeout",
      };
    };
    const normalizeDevices = async (devices) => {
      await Promise.all((devices || []).filter(isDeviceHeartbeatStale).map((device) =>
        base44.asServiceRole.entities.Device.update(device.id, {
          online_status: "offline",
          offline_reason: "heartbeat_timeout",
        }).catch(() => null)
      ));
      return (devices || []).map(withFreshOnlineStatus);
    };

    if (action === 'list-all') {
      const requestedLimit = Number(body?.limit || 100);
      const safeLimit = Math.max(1, Math.min(requestedLimit, 200));
      const accounts = await base44.asServiceRole.entities.Account.list('-created_date', 200);
      const accountMap = {};
      for (const account of accounts) {
        accountMap[account.id] = account;
      }
      const devices = await normalizeDevices(await base44.asServiceRole.entities.Device.list('-created_date', safeLimit));
      const enrichedDevices = devices.map((device) => {
        const account = accountMap[device.user_id];
        return {
          ...device,
          account_id: account?.account_id || "",
          account_username: account?.username || "",
          account_name: account?.full_name || "",
          account_email: account?.email || "",
          account_status: account?.status || "",
        };
      });
      return Response.json({ users: accounts, devices: enrichedDevices });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
