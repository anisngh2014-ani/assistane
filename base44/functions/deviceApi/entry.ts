// @ts-nocheck
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { hashSync, compareSync } from 'npm:bcryptjs@2.4.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    let path = url.pathname.replace(/^\//, "");
    
    // Parse body once (all requests are POST, method routing via endpoint in body)
    let bodyData = null;
    if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
      const text = await req.text();
      if (text) {
        try {
          bodyData = JSON.parse(text);
          if (bodyData?.endpoint) {
            path = bodyData.endpoint;
          }
        } catch (e) {
          // Body is not JSON, continue without parsing
        }
      }
    }
    
    // Helper to get body (already parsed from req.text)
    const getBody = async () => {
      return bodyData || {};
    };

    // Auth: validate Bearer token or registration_token from body/header
    const authHeader = req.headers.get("Authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    // Helper: find device by registration_token
    const getDeviceByToken = async (token) => {
      const devices = await base44.asServiceRole.entities.Device.filter({ registration_token: token });
      return devices[0] || null;
    };

    // Helper: require a valid registration_token and return the device
    const requireDeviceToken = async (body) => {
      const token = body?.registration_token || bearerToken;
      if (!token) return { error: "Missing registration_token", status: 401 };
      const device = await getDeviceByToken(token);
      if (!device) return { error: "Invalid registration_token", status: 401 };
      return { device };
    };

    const findAccount = async (id) => {
      if (!id) return null;
      const byAccountId = await base44.asServiceRole.entities.Account.filter({ account_id: id });
      if (byAccountId[0]) return byAccountId[0];
      const byUsername = await base44.asServiceRole.entities.Account.filter({ username: id });
      if (byUsername[0]) return byUsername[0];
      try { return await base44.asServiceRole.entities.Account.get(id); } catch (_) {}
      return null;
    };

    const getAccountStatus = (account) => String(account?.status || "active").toLowerCase();
    const isAccountActive = (account) => getAccountStatus(account) === "active";
    const isAccountRevoked = (account) => ["inactive", "suspended", "revoked", "deleted"].includes(getAccountStatus(account));
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
    const persistOfflineIfStale = async (device) => {
      if (!isDeviceHeartbeatStale(device)) return device;
      try {
        await base44.asServiceRole.entities.Device.update(device.id, {
          online_status: "offline",
          offline_reason: "heartbeat_timeout",
        });
      } catch (_) {}
      return withFreshOnlineStatus(device);
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

    const getAccountAccess = async (body) => {
      const accountId = body?.account_id || url.searchParams.get("account_id");
      if (!accountId) return { error: "Missing account_id", status: 400 };

      const account = await findAccount(accountId);
      if (!account) return { error: "Account not found", status: 404 };
      if (isAccountRevoked(account)) return { error: "Account suspended", status: 403 };

      const token = body?.account_token || url.searchParams.get("account_token");
      if (token && account.session_token && token === account.session_token) {
        return { account };
      }
      if (token && !account.session_token) {
        return { account, legacySession: true };
      }

      try {
        const user = await base44.auth.me();
        if (user?.role === "admin") return { account, admin: true };
      } catch (_) {}

      if (!token) return { error: "Missing account_token", status: 401 };
      return { error: "Invalid account session. Please log in again.", status: 401 };
    };

    const createUniqueShortCode = async () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const shortCode = String(Math.floor(100000 + Math.random() * 900000));
        const existing = await base44.asServiceRole.entities.SupportCode.filter({ short_code: shortCode });
        if (existing.length === 0) return shortCode;
      }
      throw new Error("Failed to generate unique support code");
    };

    const getActiveSupportCodes = async (ownerId) => {
      const now = new Date();
      const codes = await base44.asServiceRole.entities.SupportCode.filter({ user_id: ownerId });
      return codes
        .filter((code) => !code.used && new Date(code.expires_at) > now)
        .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
    };

    const consumeOtherActiveCodes = async (ownerId) => {
      const active = await getActiveSupportCodes(ownerId);
      await Promise.all(active.map((code) => base44.asServiceRole.entities.SupportCode.update(code.id, { used: true })));
    };

    const enrichSessionsForOwner = async (sessions) => {
      const accounts = await base44.asServiceRole.entities.Account.list("-created_date", 200);
      const accountMap = {};
      for (const account of accounts) {
        accountMap[account.id] = account;
      }
      const enriched = [];

      for (const session of sessions) {
        let device = null;
        try { device = await base44.asServiceRole.entities.Device.get(session.device_id); } catch (_) {}
        const account = accountMap[session.user_id] || (device ? accountMap[device.user_id] : null);
        enriched.push({
          ...session,
          account_id: account?.account_id || "",
          account_username: account?.username || "",
          account_name: account?.full_name || "",
          account_email: account?.email || "",
          device_owner_id: device?.user_id || session.user_id || "",
        });
      }

      return enriched;
    };

    // ─── POST /register-device ───────────────────────────────────────────────
    // Agent sends the visible 6-digit support code.
    if (path === "register-device") {
      const body = await getBody();
      const { device_name, operating_system, device_uid, pairing_token, os_version, ram_gb, brand_name, storage_gb } = body;

      if (!device_name || !operating_system || !device_uid || !pairing_token) {
        return Response.json({ error: "Missing required fields: device_name, operating_system, device_uid, support_code" }, { status: 400 });
      }

      let ownerId = null;
      let supportCodeRecord = null;

      const supportMatches = await base44.asServiceRole.entities.SupportCode.filter({ short_code: pairing_token });
      supportCodeRecord = supportMatches[0] || null;
      if (supportCodeRecord) {
        if (supportCodeRecord.used) {
          return Response.json({ error: "Support code already used" }, { status: 410 });
        }
        if (new Date(supportCodeRecord.expires_at) < new Date()) {
          return Response.json({ error: "Support code expired. Ask your technician for a new one." }, { status: 410 });
        }
        ownerId = supportCodeRecord.user_id;
      }
      
      if (!ownerId) {
        return Response.json({ error: "Invalid or expired support code" }, { status: 401 });
      }

      // If this device_uid already exists for this owner, return its token (idempotent re-pair)
      const existing = await base44.asServiceRole.entities.Device.filter({ device_uid });
      if (existing.length > 0) {
        const dev = existing[0];
        if (dev.user_id !== ownerId) {
          return Response.json({ error: "Device with this device_uid is registered to another account" }, { status: 409 });
        }
        if (supportCodeRecord && !supportCodeRecord.used) {
          await base44.asServiceRole.entities.SupportCode.update(supportCodeRecord.id, { used: true });
        }
        return Response.json({ success: true, device: dev, registration_token: dev.registration_token }, { status: 200 });
      }

      // Generate a unique per-device registration token
      const registration_token = crypto.randomUUID().replace(/-/g, "");

      const device = await base44.asServiceRole.entities.Device.create({
        user_id: ownerId,
        device_name,
        operating_system,
        device_uid,
        registration_token,
        online_status: "offline",
        last_seen: new Date().toISOString(),
        os_version: os_version || "",
        ram_gb: ram_gb || 0,
        brand_name: brand_name || "",
        storage_gb: storage_gb || 0,
      });

      // Mark the support code as used now that the device has actually registered
      try {
        if (supportCodeRecord && !supportCodeRecord.used) {
          await base44.asServiceRole.entities.SupportCode.update(supportCodeRecord.id, { used: true });
        }
      } catch (_) {}

      return Response.json({ success: true, device, registration_token }, { status: 201 });
    }

    // ─── POST /heartbeat ─────────────────────────────────────────────────────
    if (path === "heartbeat") {
      const body = await getBody();
      const auth = await requireDeviceToken(body);
      if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

      const updated = await base44.asServiceRole.entities.Device.update(auth.device.id, {
        online_status: "online",
        last_seen: new Date().toISOString(),
        unattended_enabled: body?.unattended_enabled === true,
      });

      return Response.json({ success: true, device_id: auth.device.id, last_seen: updated.last_seen });
    }

    if (path === "device-offline") {
      const body = await getBody();
      const auth = await requireDeviceToken(body);
      if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

      await base44.asServiceRole.entities.Device.update(auth.device.id, {
        online_status: "offline",
        last_seen: new Date().toISOString(),
        offline_reason: body?.reason || "agent_offline",
      });

      return Response.json({ success: true, device_id: auth.device.id });
    }

    // ─── GET /devices ─────────────────────────────────────────────────────────
    if (path === "devices") {
      // Check for account-based access via account_id in body/header
      const body = await getBody();
      const accountId = body?.account_id || url.searchParams.get("account_id");
      
      if (accountId) {
        const access = await getAccountAccess(body);
        if (access.error) return Response.json({ error: access.error, success: false }, { status: access.status });
        const account = access.account;
        
        const devices = await normalizeDevices(await base44.asServiceRole.entities.Device.filter({ user_id: account.id }));
        
        devices.sort((a, b) => {
          if (a.online_status === "online" && b.online_status !== "online") return -1;
          if (a.online_status !== "online" && b.online_status === "online") return 1;
          return new Date(b.last_seen || 0) - new Date(a.last_seen || 0);
        });
        
        return Response.json({ success: true, count: devices.length, devices });
      } else {
        // User-based access (regular User Dashboard)
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: "Unauthorized", success: false }, { status: 401 });

        const devices = await normalizeDevices(await base44.asServiceRole.entities.Device.filter({ user_id: user.id }));

        devices.sort((a, b) => {
          if (a.online_status === "online" && b.online_status !== "online") return -1;
          if (a.online_status !== "online" && b.online_status === "online") return 1;
          return new Date(b.last_seen || 0) - new Date(a.last_seen || 0);
        });

        return Response.json({ success: true, count: devices.length, devices });
      }
    }

    // ─── GET /device-status ───────────────────────────────────────────────────
    if (path === "device-status") {
      const deviceUid = url.searchParams.get("device_uid");
      const regToken = url.searchParams.get("registration_token") || bearerToken;

      if (!deviceUid && !regToken) {
        return Response.json({ error: "Provide device_uid or registration_token as query param" }, { status: 400 });
      }

      let device = null;
      if (deviceUid) {
        const results = await base44.asServiceRole.entities.Device.filter({ device_uid: deviceUid });
        device = results[0] || null;
      } else {
        device = await getDeviceByToken(regToken);
      }

      if (!device) return Response.json({ error: "Device not found" }, { status: 404 });
      device = await persistOfflineIfStale(device);

      return Response.json({
        success: true,
        device_id: device.id,
        device_uid: device.device_uid,
        device_name: device.device_name,
        online_status: device.online_status,
        last_seen: device.last_seen,
        operating_system: device.operating_system,
      });
    }

    if (path === "sessions") {
      const body = await getBody();
      let ownerId = null;

      if (body?.account_id) {
        const access = await getAccountAccess(body);
        if (access.error) return Response.json({ error: access.error, success: false }, { status: access.status });
        ownerId = access.account.id;
      } else {
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: "Unauthorized", success: false }, { status: 401 });
        if (user.role === "admin" && body?.all === true) {
          const requestedLimit = Number(body?.limit || 100);
          const safeLimit = Math.max(1, Math.min(requestedLimit, 100));
          const sessions = await base44.asServiceRole.entities.Session.list("-session_start", safeLimit);
          return Response.json({ success: true, sessions: await enrichSessionsForOwner(sessions) });
        }
        ownerId = user.id;
      }

      const sessions = await base44.asServiceRole.entities.Session.filter({ user_id: ownerId });
      sessions.sort((a, b) => new Date(b.session_start || 0) - new Date(a.session_start || 0));
      return Response.json({ success: true, sessions });
    }

    // ─── DELETE /device ───────────────────────────────────────────────────────
    if (path === "device") {
      const body = await getBody();
      const deviceId = body?.id;
      
      if (deviceId) {
        const device = await base44.asServiceRole.entities.Device.get(deviceId);
        if (!device) return Response.json({ error: "Device not found", success: false }, { status: 404 });

        if (body?.account_id) {
          const access = await getAccountAccess(body);
          if (access.error) return Response.json({ error: access.error, success: false }, { status: access.status });
          if (device.user_id !== access.account.id) {
            return Response.json({ error: "Device does not belong to this account", success: false }, { status: 403 });
          }
        } else {
          const user = await base44.auth.me();
          if (!user || (user.role !== "admin" && user.id !== device.user_id)) {
            return Response.json({ error: "Unauthorized", success: false }, { status: 401 });
          }
        }
        
        await base44.asServiceRole.entities.Device.delete(deviceId);
        return Response.json({ success: true, message: `Device '${device.device_name}' deleted` });
      } else {
        // Registration token-based deletion (for agents)
        const auth = await requireDeviceToken(body);
        if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

        await base44.asServiceRole.entities.Device.delete(auth.device.id);
        return Response.json({ success: true, message: `Device '${auth.device.device_name}' deleted` });
      }
    }

    // ─── GET /webrtc-pending ──────────────────────────────────────────────────
    // Agent polls: "is there a pending screen-share request for me?"
    if (path === "webrtc-pending") {
      const body = await getBody();
      const regToken = url.searchParams.get("registration_token") || body?.registration_token || bearerToken;
      if (!regToken) return Response.json({ error: "Missing registration_token" }, { status: 401 });

      const device = await getDeviceByToken(regToken);
      if (!device) return Response.json({ error: "Invalid registration_token" }, { status: 401 });

      const signals = await base44.asServiceRole.entities.WebRTCSignal.filter({
        device_id: device.id,
        status: "pending",
      });

      if (signals.length === 0) return Response.json({ pending: false });

      // Return the newest pending signal
      const signal = signals.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
      return Response.json({
        pending: true,
        signal_id: signal.id,
        offer_sdp: signal.offer_sdp,
        unattended_password: signal.unattended_password || "",
      });
    }

    // ─── POST /black-screen ───────────────────────────────────────────────────
    // Admin enables/disables black screen on a target device
    if (path === "black-screen") {
      const body = await getBody();
      const { device_id, enabled, message } = body;
      if (!device_id) return Response.json({ error: "Missing device_id" }, { status: 400 });

      await base44.asServiceRole.entities.Device.update(device_id, {
        black_screen: enabled === true,
        black_screen_message: message || "",
      });

      return Response.json({ success: true });
    }

    // ─── GET /pending-command ─────────────────────────────────────────────────
    // Agent polls: "is there a pending command for me?"
    if (path === "pending-command") {
      const body = await getBody();
      const regToken = url.searchParams.get("registration_token") || body?.registration_token || bearerToken;
      if (!regToken) return Response.json({ error: "Missing registration_token" }, { status: 401 });

      const device = await getDeviceByToken(regToken);
      if (!device) return Response.json({ error: "Invalid registration_token" }, { status: 401 });

      const command = device.pending_command || "";
      if (command) {
        // Clear command after reading so it only fires once
        await base44.asServiceRole.entities.Device.update(device.id, { pending_command: "" });
      }

      return Response.json({ command });
    }

    if (path === "agent-state") {
      const body = await getBody();
      const regToken = url.searchParams.get("registration_token") || body?.registration_token || bearerToken;
      if (!regToken) return Response.json({ error: "Missing registration_token" }, { status: 401 });

      const device = await getDeviceByToken(regToken);
      if (!device) return Response.json({ error: "Invalid registration_token" }, { status: 401 });

      const command = device.pending_command || "";
      if (command) {
        await base44.asServiceRole.entities.Device.update(device.id, { pending_command: "" });
      }

      return Response.json({
        success: true,
        command,
        black_screen: device.black_screen || false,
        message: device.black_screen_message || "",
        remote_input_disabled: device.remote_input_disabled === true,
        wallpaper_enabled: device.wallpaper_enabled !== false,
        video_quality: device.video_quality || "high",
      });
    }

    // ─── GET /black-screen-status ─────────────────────────────────────────────
    // Agent polls: "should I show black screen?"
    if (path === "black-screen-status") {
      const body = await getBody();
      const regToken = url.searchParams.get("registration_token") || body?.registration_token || bearerToken;
      if (!regToken) return Response.json({ error: "Missing registration_token" }, { status: 401 });

      const device = await getDeviceByToken(regToken);
      if (!device) return Response.json({ error: "Invalid registration_token" }, { status: 401 });

      return Response.json({
        black_screen: device.black_screen || false,
        message: device.black_screen_message || "",
        remote_input_disabled: device.remote_input_disabled === true,
        wallpaper_enabled: device.wallpaper_enabled !== false,
        video_quality: device.video_quality || "high",
      });
    }

    // ─── POST /webrtc-answer ──────────────────────────────────────────────────
    // Agent sends its answer SDP back to the browser
    if (path === "webrtc-answer") {
      const body = await getBody();
      const { registration_token, signal_id, answer_sdp } = body;

      const regToken = registration_token || bearerToken;
      if (!regToken || !signal_id || !answer_sdp) {
        return Response.json({ error: "Missing fields: registration_token, signal_id, answer_sdp" }, { status: 400 });
      }

      const device = await getDeviceByToken(regToken);
      if (!device) return Response.json({ error: "Invalid registration_token" }, { status: 401 });

      await base44.asServiceRole.entities.WebRTCSignal.update(signal_id, {
        answer_sdp,
        status: "answered",
      });

      return Response.json({ success: true });
    }

    // ─── POST /device-config ──────────────────────────────────
    // Updates device settings (quality, wallpaper, input, black_screen, etc)
    if (path === "device-config") {
      const body = await getBody();
      const { device_id, remote_input_disabled, wallpaper_enabled, video_quality, black_screen, black_screen_message } = body;
      if (!device_id) return Response.json({ error: "Missing device_id" }, { status: 400 });

      const updates = {};
      if (remote_input_disabled !== undefined) updates.remote_input_disabled = remote_input_disabled;
      if (wallpaper_enabled !== undefined) updates.wallpaper_enabled = wallpaper_enabled;
      if (video_quality !== undefined) updates.video_quality = video_quality;
      if (black_screen !== undefined) updates.black_screen = black_screen;
      if (black_screen_message !== undefined) updates.black_screen_message = black_screen_message;

      await base44.asServiceRole.entities.Device.update(device_id, updates);
      return Response.json({ success: true });
    }

    // ─── POST /set-screen-resolution ──────────────────────────
    // Changes screen resolution on target device
    if (path === "set-screen-resolution") {
      const body = await getBody();
      const { device_id, width, height } = body;
      if (!device_id || !width || !height) {
        return Response.json({ error: "Missing device_id, width, or height" }, { status: 400 });
      }

      const device = await base44.asServiceRole.entities.Device.get(device_id);
      if (!device) return Response.json({ error: "Device not found" }, { status: 404 });

      await base44.asServiceRole.entities.Device.update(device_id, {
        screen_width: width,
        screen_height: height,
        last_screen_update: new Date().toISOString(),
        pending_command: `set-resolution:${width}x${height}`,
      });

      return Response.json({ success: true });
    }

    // ─── POST /send-special-key ───────────────────────────────
    // Sends special key combinations (Ctrl+Alt+Del, etc)
    if (path === "send-special-key") {
      const body = await getBody();
      const { device_id, key } = body;
      if (!device_id || !key) return Response.json({ error: "Missing device_id or key" }, { status: 400 });

      const device = await base44.asServiceRole.entities.Device.get(device_id);
      if (!device) return Response.json({ error: "Device not found" }, { status: 404 });

      await base44.asServiceRole.entities.Device.update(device_id, {
        pending_command: `special-key:${key}`,
      });

      return Response.json({ success: true });
    }

    // ─── POST /reboot-device ─────────────────────────────────
    // Reboots the target device
    if (path === "reboot-device") {
      const body = await getBody();
      const { device_id, safe_mode } = body;
      if (!device_id) return Response.json({ error: "Missing device_id" }, { status: 400 });

      const device = await base44.asServiceRole.entities.Device.get(device_id);
      if (!device) return Response.json({ error: "Device not found" }, { status: 404 });

      await base44.asServiceRole.entities.Device.update(device_id, {
        pending_command: safe_mode ? "reboot-safe-mode" : "reboot",
      });

      return Response.json({ success: true });
    }

    // ─── POST /send-message ───────────────────────────────────
    // Send a message in the chat (works from viewer without auth)
    if (path === "send-message") {
      const body = await getBody();
      const { device_id, content, sender_type: senderTypeOverride } = body;
      if (!device_id || !content) {
        return Response.json({ error: "Missing device_id or content" }, { status: 400 });
      }

      // Try to get authenticated user for sender_type, fall back to "admin" (viewer sends messages)
      let senderType = senderTypeOverride || "admin";
      let userId = "viewer";
      try {
        const user = await base44.auth.me();
        if (user) { userId = user.id; senderType = user.role === "admin" ? "admin" : "user"; }
      } catch (_) {}

      const message = await base44.asServiceRole.entities.Message.create({
        device_id,
        user_id: userId,
        sender_type: senderType,
        content: content.trim(),
      });

      return Response.json({ success: true, message });
    }

    // ─── GET /messages ────────────────────────────────────────
    // Get all messages for a device (works from viewer without auth)
    if (path === "messages") {
      const deviceId = url.searchParams.get("device_id");
      if (!deviceId) return Response.json({ error: "Missing device_id" }, { status: 400 });

      const messages = await base44.asServiceRole.entities.Message.filter({ device_id: deviceId }, "created_date", 100);
      return Response.json({ success: true, messages });
    }

    if (path === "active-support-codes") {
      const body = await getBody();
      let ownerId = null;

      if (body?.account_id) {
        const access = await getAccountAccess(body);
        if (access.error) return Response.json({ error: access.error, success: false }, { status: access.status });
        ownerId = access.account.id;
      } else {
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: "Unauthorized", success: false }, { status: 401 });
        ownerId = user.id;
      }

      const codes = await getActiveSupportCodes(ownerId);
      return Response.json({ success: true, codes });
    }

    if (path === "generate-support-code") {
      const body = await getBody();
      const { label, expiry_hours = 24, account_id } = body;
      let ownerId = null;

      if (account_id) {
        const access = await getAccountAccess(body);
        if (access.error) return Response.json({ error: access.error, success: false }, { status: access.status });
        ownerId = access.account.id;
      } else {
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: "Unauthorized", success: false }, { status: 401 });
        ownerId = user.id;
      }

      await consumeOtherActiveCodes(ownerId);

      const short_code = await createUniqueShortCode();
      const pairing_token = crypto.randomUUID().replace(/-/g, "");
      const code = crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + Number(expiry_hours || 24));

      const supportCode = await base44.asServiceRole.entities.SupportCode.create({
        user_id: ownerId,
        code,
        short_code,
        pairing_token,
        expires_at: expiresAt.toISOString(),
        label: label || "",
        used: false,
      });

      return Response.json({
        success: true,
        code: supportCode,
        short_code,
        expires_at: expiresAt.toISOString(),
      });
    }

    if (path === "expire-support-code") {
      const body = await getBody();
      const { id, account_id } = body;
      if (!id) return Response.json({ error: "Missing support code id" }, { status: 400 });

      const code = await base44.asServiceRole.entities.SupportCode.get(id);
      if (!code) return Response.json({ error: "Support code not found" }, { status: 404 });

      if (account_id) {
        const access = await getAccountAccess(body);
        if (access.error) return Response.json({ error: access.error }, { status: access.status });
        if (access.account.id !== code.user_id) {
          return Response.json({ error: "Not allowed" }, { status: 403 });
        }
      } else {
        const user = await base44.auth.me();
        if (!user || (user.id !== code.user_id && user.role !== "admin")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
      }

      await base44.asServiceRole.entities.SupportCode.update(id, { used: true });
      return Response.json({ success: true });
    }

    // ─── POST /create-user ────────────────────────────────────
    // Owner creates a new customer account directly (no email invitation)
    if (path === "create-user") {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

      const body = await getBody();
      const { username, email, password, account_id, full_name, subscription_plan, subscription_expires, max_devices } = body;
      if (!username || !email || !password) {
        return Response.json({ error: "Missing username, email, or password" }, { status: 400 });
      }

      try {
        // Check if username already exists
        const existing = await base44.asServiceRole.entities.Account.filter({ username });
        if (existing.length > 0) {
          return Response.json({ error: "Username already taken" }, { status: 409 });
        }

        let accountId = account_id || "";
        if (!accountId) {
          for (let attempt = 0; attempt < 20; attempt++) {
            const candidate = String(Math.floor(Math.random() * 9000000) + 1000000);
            const existingId = await base44.asServiceRole.entities.Account.filter({ account_id: candidate });
            if (existingId.length === 0) {
              accountId = candidate;
              break;
            }
          }
        }
        if (!accountId) return Response.json({ error: "Failed to generate account ID" }, { status: 500 });

        // Hash password
        const password_hash = hashSync(password, 10);

        // Get owner workspace
        const owner = await base44.asServiceRole.entities.User.get(user.id);
        const workspace_id = owner.workspace_id || "default-workspace";

        // Create account
        const account = await base44.asServiceRole.entities.Account.create({
          account_id: accountId,
          username,
          email,
          password_hash,
          full_name: full_name || username,
          subscription_plan: subscription_plan || "basic",
          subscription_expires: subscription_expires || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          max_devices: max_devices || 5,
          workspace_id,
          created_by_id: user.id,
          status: "active",
          pairing_token: "",
        });

        return Response.json({ 
          success: true, 
          account_id: accountId,
          username, 
          email,
          note: "Account created. Customer can now log in with username and password."
        });
      } catch (err) {
        console.error("Create account error:", err);
        return Response.json({ error: err.message || "Failed to create account" }, { status: 400 });
      }
    }

    // ─── POST /account-login ──────────────────────────────────
    // Customer logs in with username and password
    if (path === "account-login") {
      const body = await getBody();
      const { username, password } = body;
      if (!username || !password) {
        return Response.json({ error: "Missing username or password" }, { status: 400 });
      }

      try {
        const accounts = await base44.asServiceRole.entities.Account.filter({ username });
        if (accounts.length === 0) {
          return Response.json({ error: "Invalid username or password" }, { status: 401 });
        }

        const account = accounts[0];
        if (isAccountRevoked(account)) {
          return Response.json({ error: "Account is not active" }, { status: 403 });
        }

        // Check password
        if (!compareSync(password, account.password_hash)) {
          return Response.json({ error: "Invalid username or password" }, { status: 401 });
        }

        const session_token = crypto.randomUUID();
        await base44.asServiceRole.entities.Account.update(account.id, {
          session_token,
          last_login_at: new Date().toISOString(),
        });

        return Response.json({ 
          success: true,
          account_id: account.account_id || account.id,
          account_db_id: account.id,
          username: account.username,
          email: account.email,
          full_name: account.full_name,
          session_token,
          workspace_id: account.workspace_id,
        });
      } catch (err) {
        console.error("Login error:", err);
        return Response.json({ error: err.message || "Login failed" }, { status: 400 });
      }
    }

    // ─── POST /regenerate-pairing-token ───────────────────────
    // Legacy endpoint disabled: device registration now uses support codes only.
    if (path === "regenerate-pairing-token") {
      return Response.json({ error: "Pairing tokens have been replaced by support codes." }, { status: 410 });
    }

    // ─── GET /accounts ────────────────────────────────────────
    // Admin lists all accounts (no filter)
    if (path === "accounts") {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

      try {
        const requestedLimit = Number(bodyData?.limit || 100);
        const safeLimit = Math.max(1, Math.min(requestedLimit, 100));
        const accounts = await base44.asServiceRole.entities.Account.list("-created_date", safeLimit);
        return Response.json({ success: true, accounts });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 400 });
      }
    }

    // ─── PUT /account ─────────────────────────────────────────
    // Admin updates account password
    const isMethodPut = req.method === "PUT" || bodyData?._method === "PUT";
    if (path === "account" && isMethodPut) {
      const user = await base44.auth.me();
      if (!user || user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

      const body = await getBody();
      const { id, password, subscription_plan, subscription_expires, max_devices, status } = body;
      if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

      try {
        const account = await findAccount(id);
        if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

        const updates = {};
        if (password) updates.password_hash = hashSync(password, 10);
        if (subscription_plan) updates.subscription_plan = subscription_plan;
        if (subscription_expires !== undefined) updates.subscription_expires = subscription_expires;
        if (max_devices !== undefined) updates.max_devices = Number(max_devices);
        if (status) updates.status = status;

        await base44.asServiceRole.entities.Account.update(account.id, updates);
        return Response.json({ success: true, message: "Account updated" });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 400 });
      }
    }

    // ─── DELETE /account ──────────────────────────────────────
    // Owner deletes a customer account
    const isMethodDelete = req.method === "DELETE" || bodyData?._method === "DELETE";
    if (path === "account" && isMethodDelete) {
      const user = await base44.auth.me();
      if (!user || user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

      const body = await getBody();
      const { id } = body;
      if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

      try {
        let account = null;
        
        // Try to find by account_id first
        const byAccountId = await base44.asServiceRole.entities.Account.filter({ account_id: id });
        if (byAccountId.length > 0) {
          account = byAccountId[0];
        }
        
        // Try to find by username if not found
        if (!account) {
          const byUsername = await base44.asServiceRole.entities.Account.filter({ username: id });
          if (byUsername.length > 0) {
            account = byUsername[0];
          }
        }
        
        // Try direct database id lookup
        if (!account) {
          account = await base44.asServiceRole.entities.Account.get(id);
        }
        
        if (!account) {
          return Response.json({ error: "Account not found" }, { status: 404 });
        }
        
        // Suspend the account instead of deleting — this immediately revokes access
        // and blocks re-login while preserving data. Owner can reactivate later.
        await base44.asServiceRole.entities.Account.update(account.id, { 
          status: "suspended",
          revoked_at: new Date().toISOString(),
        });
        return Response.json({ success: true, suspended: true });
      } catch (err) {
        console.error("Delete error:", err);
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // ─── POST /check-account-status ───────────────────────────
    // Customer dashboard polls this to detect suspension in real-time
    if (path === "check-account-status") {
      const body = await getBody();
      const accountId = body?.account_id;
      if (!accountId) return Response.json({ suspended: false });

      const account = await findAccount(accountId);
      if (!account) return Response.json({ suspended: true }); // account deleted = suspended

      const token = body?.account_token;
      const suspended = isAccountRevoked(account);
      const invalid_session = Boolean(token && account.session_token && token !== account.session_token);
      return Response.json({ suspended, invalid_session });
    }

    // ─── POST /permanent-delete-account ───────────────────────
    // Owner permanently deletes an account and all its data
    if (path === "permanent-delete-account") {
      const user = await base44.auth.me();
      if (!user || user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

      const body = await getBody();
      const { id } = body;
      if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

      let account = null;
      const byAccountId = await base44.asServiceRole.entities.Account.filter({ account_id: id });
      if (byAccountId.length > 0) account = byAccountId[0];
      if (!account) {
        try { account = await base44.asServiceRole.entities.Account.get(id); } catch(_) {}
      }
      if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

      // Delete all devices and their messages
      const accountDevices = await base44.asServiceRole.entities.Device.filter({ user_id: account.id });
      for (const device of accountDevices) {
        const msgs = await base44.asServiceRole.entities.Message.filter({ device_id: device.id });
        for (const msg of msgs) {
          await base44.asServiceRole.entities.Message.delete(msg.id);
        }
        await base44.asServiceRole.entities.Device.delete(device.id);
      }

      await base44.asServiceRole.entities.Account.delete(account.id);
      return Response.json({ success: true });
    }

    // ─── POST /reactivate-account ─────────────────────────────
    // Owner reactivates a suspended account
    if (path === "reactivate-account") {
      const user = await base44.auth.me();
      if (!user || user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

      const body = await getBody();
      const { id } = body;
      if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

      try {
        let account = null;
        const byAccountId = await base44.asServiceRole.entities.Account.filter({ account_id: id });
        if (byAccountId.length > 0) account = byAccountId[0];
        if (!account) account = await base44.asServiceRole.entities.Account.get(id);
        if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

        await base44.asServiceRole.entities.Account.update(account.id, { status: "active", revoked_at: null });
        return Response.json({ success: true });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // ─── DELETE /user ─────────────────────────────────────────
    // Owner deletes a user account
    if (path === "user") {
      const user = await base44.auth.me();
      if (!user || user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

      const body = await getBody();
      const { user_id } = body;
      if (!user_id) return Response.json({ error: "Missing user_id" }, { status: 400 });

      try {
        await base44.asServiceRole.entities.User.delete(user_id);
        // Also delete all their devices and messages
        const devices = await base44.asServiceRole.entities.Device.filter({ user_id });
        for (const device of devices) {
          await base44.asServiceRole.entities.Device.delete(device.id);
          await base44.asServiceRole.entities.Message.filter({ device_id: device.id }).then(msgs => {
            msgs.forEach(msg => base44.asServiceRole.entities.Message.delete(msg.id));
          });
        }
        return Response.json({ success: true });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 400 });
      }
    }

    // ─── POST /lock-screen ───────────────────────────────────────────────────
    // Lock the remote device screen
    if (path === "lock-screen") {
      const body = await getBody();
      const { device_id } = body;
      if (!device_id) return Response.json({ error: "Missing device_id" }, { status: 400 });

      await base44.asServiceRole.entities.Device.update(device_id, { pending_command: "lock" });
      return Response.json({ success: true });
    }

    // ─── POST /create-signal ──────────────────────────────────────────────────
    // Viewer app creates a WebRTC offer signal (works without auth)
    if (path === "create-signal") {
      const body = await getBody();
      const { device_id, offer_sdp, auth_token, unattended_password } = body;
      if (!device_id || !offer_sdp) return Response.json({ error: "Missing device_id or offer_sdp" }, { status: 400 });

      let userId = auth_token || "viewer";
      try {
        const user = await base44.auth.me();
        if (user) userId = user.id;
      } catch (_) {}

      let device = null;
      try { device = await base44.asServiceRole.entities.Device.get(device_id); } catch (_) {}
      if (!device) return Response.json({ error: "Device not found" }, { status: 404 });
      device = await persistOfflineIfStale(device);
      if (device.online_status !== "online") return Response.json({ error: "Device is offline" }, { status: 409 });

      const staleSignals = await base44.asServiceRole.entities.WebRTCSignal.filter({ device_id, status: "pending" });
      await Promise.all(staleSignals.map((s) => base44.asServiceRole.entities.WebRTCSignal.update(s.id, { status: "closed" })));

      let signal;
      try {
        signal = await base44.asServiceRole.entities.WebRTCSignal.create({
          device_id,
          user_id: userId,
          offer_sdp,
          status: "pending",
          unattended_password: unattended_password || "",
        });
      } catch (err) {
        return Response.json({ error: "Could not create WebRTC signal", detail: err.message }, { status: 500 });
      }

      return Response.json({ success: true, signal_id: signal.id });
    }

    // ─── GET /get-signal-answer ───────────────────────────────────────────────
    // Viewer polls for the agent's answer SDP
    if (path === "get-signal-answer") {
      const body = await getBody();
      const signalId = url.searchParams.get("signal_id") || body?.signal_id;
      if (!signalId) return Response.json({ error: "Missing signal_id" }, { status: 400 });

      const signal = await base44.asServiceRole.entities.WebRTCSignal.get(signalId);
      if (!signal) return Response.json({ error: "Signal not found" }, { status: 404 });

      if (signal.status === "answered" && signal.answer_sdp) {
        return Response.json({ answer_sdp: signal.answer_sdp });
      }
      return Response.json({ answer_sdp: null });
    }

    // ─── POST /close-signal ───────────────────────────────────────────────────
    // Viewer closes a signal on disconnect
    if (path === "close-signal") {
      const body = await getBody();
      const { signal_id } = body;
      if (!signal_id) return Response.json({ error: "Missing signal_id" }, { status: 400 });
      await base44.asServiceRole.entities.WebRTCSignal.update(signal_id, { status: "closed" });
      return Response.json({ success: true });
    }

    // ─── POST /create-session (from viewer app) ────────────────────────────
    if (path === "create-session") {
      const body = await getBody();
      const { device_id, device_name, auth_token } = body;
      if (!device_id) return Response.json({ error: "Missing device_id" }, { status: 400 });

      let userId = auth_token || "viewer";
      try { const u = await base44.auth.me(); if (u) userId = u.id; } catch (_) {}
      let device = null;
      try { device = await base44.asServiceRole.entities.Device.get(device_id); } catch (_) {}
      const deviceOwnerId = device?.user_id || userId;
      const requesterType = userId === deviceOwnerId ? "customer" : userId === "viewer" ? "viewer" : "owner";

      const session = await base44.asServiceRole.entities.Session.create({
        user_id: deviceOwnerId,
        requester_id: userId,
        requester_type: requesterType,
        device_id,
        device_name: device_name || "",
        session_start: new Date().toISOString(),
        status: "active",
      });
      return Response.json({ success: true, session_id: session.id });
    }

    // ─── POST /end-session (from viewer app) ──────────────────────────────
    if (path === "end-session") {
      const body = await getBody();
      const { session_id, duration_minutes } = body;
      if (!session_id) return Response.json({ error: "Missing session_id" }, { status: 400 });
      await base44.asServiceRole.entities.Session.update(session_id, {
        session_end: new Date().toISOString(),
        duration_minutes: duration_minutes || 0,
        status: "completed",
      });
      return Response.json({ success: true });
    }

    // ─── GET /viewer-connect-params ───────────────────────────────────────
    // Dashboard calls this to get the signed connect URL for the viewer app
    if (path === "viewer-connect-params") {
      const body = await getBody();
      const deviceId = url.searchParams.get("device_id") || body?.device_id;
      if (!deviceId) return Response.json({ error: "Missing device_id" }, { status: 400 });

      const device = await base44.asServiceRole.entities.Device.get(deviceId);
      if (!device) return Response.json({ error: "Device not found" }, { status: 404 });

      let requesterId = "viewer";
      if (body?.account_id) {
        const access = await getAccountAccess(body);
        if (access.error) return Response.json({ error: access.error }, { status: access.status });
        const account = access.account;
        if (device.user_id !== account.id) {
          return Response.json({ error: "Device does not belong to this account" }, { status: 403 });
        }
        requesterId = account.id;
      } else {
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        requesterId = user.id;
      }

      // Build the assistane:// deep link with device info
      const params = new URLSearchParams({
        device_id: device.id,
        device_name: device.device_name,
        os: device.operating_system || "Windows",
        ip: device.ip_address || "",
        auth_token: requesterId,
        os_version: device.os_version || "",
        ram_gb: device.ram_gb || 0,
        storage_gb: device.storage_gb || 0,
        brand_name: device.brand_name || "",
        unattended_enabled: device.unattended_enabled === true ? "1" : "0",
      });

      return Response.json({
        success: true,
        deep_link: `assistane://connect?${params.toString()}`,
        device_name: device.device_name,
      });
    }

    return Response.json({ error: "Not found", available_endpoints: [
      "POST /register-device",
      "POST /heartbeat",
      "GET /devices",
      "GET /device-status?device_uid=<uid>",
      "DELETE /device",
      "GET /webrtc-pending?registration_token=<token>",
      "POST /webrtc-answer",
    ]}, { status: 404 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
