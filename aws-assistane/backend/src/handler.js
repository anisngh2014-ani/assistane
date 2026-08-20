/* eslint-disable */
"use strict";

const crypto = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLES = {
  accounts: process.env.ACCOUNTS_TABLE,
  devices: process.env.DEVICES_TABLE,
  supportCodes: process.env.SUPPORT_CODES_TABLE,
  sessions: process.env.SESSIONS_TABLE,
  messages: process.env.MESSAGES_TABLE,
  signals: process.env.SIGNALS_TABLE,
  workspaces: process.env.WORKSPACES_TABLE,
  supportConversations: process.env.SUPPORT_CONVERSATIONS_TABLE,
};

const OWNER_USER_ID = process.env.OWNER_USER_ID || "owner";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "admin@assistane.com";
const OWNER_PASSWORD_HASH = process.env.OWNER_PASSWORD_HASH || "";
const DEVICE_STALE_MS = 120 * 1000;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "*",
    },
    body: JSON.stringify(body),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body);
  } catch (_) {
    return {};
  }
}

function queryParams(event) {
  if (event.queryStringParameters && typeof event.queryStringParameters === "object") {
    return Object.fromEntries(
      Object.entries(event.queryStringParameters).filter(([, value]) => value !== undefined && value !== null)
    );
  }
  return {};
}

function getPath(event, body) {
  const raw = event.rawPath || event.path || "/";
  const path = raw.replace(/^\/+/, "").replace(/^prod\//, "");
  return body.endpoint || path || "health";
}

function numericCodeFrom(value) {
  const raw = String(value || "").trim();
  try {
    const parsed = new URL(raw);
    return parsed.searchParams.get("code") || raw;
  } catch (_) {
    return raw.replace(/\D/g, "").slice(0, 6);
  }
}

function makeSupportCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function makeToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [type, iterationsRaw, salt, expected] = String(stored || "").split("$");
  if (type !== "pbkdf2" || !iterationsRaw || !salt || !expected) return false;
  const hash = crypto.pbkdf2Sync(String(password), salt, Number(iterationsRaw), 32, "sha256").toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
  } catch (_) {
    return false;
  }
}

async function put(table, item) {
  const stamped = { ...item, created_date: item.created_date || nowIso(), updated_date: nowIso() };
  await dynamo.send(new PutCommand({ TableName: table, Item: stamped }));
  return stamped;
}

async function get(table, itemId) {
  const res = await dynamo.send(new GetCommand({ TableName: table, Key: { id: itemId } }));
  return res.Item || null;
}

async function remove(table, itemId) {
  await dynamo.send(new DeleteCommand({ TableName: table, Key: { id: itemId } }));
}

async function update(table, itemId, updates) {
  const keys = Object.keys(updates || {}).filter((key) => updates[key] !== undefined);
  if (!keys.length) return get(table, itemId);
  const names = {};
  const values = {};
  const parts = [];
  for (const key of keys) {
    names[`#${key}`] = key;
    values[`:${key}`] = updates[key];
    parts.push(`#${key} = :${key}`);
  }
  names["#updated_date"] = "updated_date";
  values[":updated_date"] = nowIso();
  parts.push("#updated_date = :updated_date");

  const res = await dynamo.send(new UpdateCommand({
    TableName: table,
    Key: { id: itemId },
    UpdateExpression: `SET ${parts.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: "ALL_NEW",
  }));
  return res.Attributes;
}

async function query(table, indexName, keyName, value) {
  if (value === undefined || value === null || value === "") return [];
  const res = await dynamo.send(new QueryCommand({
    TableName: table,
    IndexName: indexName,
    KeyConditionExpression: "#k = :v",
    ExpressionAttributeNames: { "#k": keyName },
    ExpressionAttributeValues: { ":v": value },
  }));
  return res.Items || [];
}

async function querySignal(deviceId, status) {
  const res = await dynamo.send(new QueryCommand({
    TableName: TABLES.signals,
    IndexName: "DeviceStatusIndex",
    KeyConditionExpression: "device_id = :d AND #s = :s",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":d": deviceId, ":s": status },
  }));
  return res.Items || [];
}

async function scan(table, limit = 100) {
  const res = await dynamo.send(new ScanCommand({ TableName: table, Limit: limit }));
  return res.Items || [];
}

function isDeviceHeartbeatStale(device) {
  if (!device || device.online_status !== "online") return false;
  if (!device.last_seen) return true;
  const lastSeenMs = Date.parse(device.last_seen);
  return !Number.isFinite(lastSeenMs) || lastSeenMs < Date.now() - DEVICE_STALE_MS;
}

async function persistOfflineIfStale(device) {
  if (!isDeviceHeartbeatStale(device)) return device;
  return update(TABLES.devices, device.id, {
    online_status: "offline",
    offline_reason: "heartbeat_timeout",
  });
}

async function normalizeDevices(devices) {
  const fixed = [];
  for (const device of devices || []) fixed.push(await persistOfflineIfStale(device));
  return fixed;
}

async function getDeviceByToken(token) {
  const devices = await query(TABLES.devices, "RegistrationTokenIndex", "registration_token", token);
  return devices[0] || null;
}

async function getAccountByToken(token) {
  const accounts = await query(TABLES.accounts, "SessionTokenIndex", "session_token", token);
  return accounts[0] || null;
}

function sanitizeAccount(account) {
  if (!account) return account;
  const { password_hash, session_token, ...safe } = account;
  return safe;
}

async function findAccount(value) {
  if (!value) return null;
  let account = await get(TABLES.accounts, value);
  if (account) return account;
  account = (await query(TABLES.accounts, "AccountIdIndex", "account_id", value))[0];
  if (account) return account;
  account = (await query(TABLES.accounts, "UsernameIndex", "username", value))[0];
  if (account) return account;
  const byEmail = (await scan(TABLES.accounts, 500)).find((item) => String(item.email || "").toLowerCase() === String(value).toLowerCase());
  return byEmail || null;
}

async function ensureOwnerAccount() {
  let owner = await get(TABLES.accounts, OWNER_USER_ID);
  if (owner) return owner;
  if (!OWNER_PASSWORD_HASH) return null;
  owner = await put(TABLES.accounts, {
    id: OWNER_USER_ID,
    account_id: "OWNER",
    username: OWNER_EMAIL.split("@")[0] || "admin",
    email: OWNER_EMAIL,
    full_name: "Assistane Owner",
    password_hash: OWNER_PASSWORD_HASH,
    role: "admin",
    status: "active",
    subscription_plan: "owner",
    max_devices: 999999,
  });
  return owner;
}

async function requireSession(headers) {
  const auth = headers.authorization || headers.Authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const token = headers["x-session-token"] || headers["X-Session-Token"] || bearer;
  if (!token) return { error: "Unauthorized", status: 401 };
  const account = await getAccountByToken(token);
  if (!account) return { error: "Invalid session", status: 401 };
  if (["inactive", "suspended", "revoked", "deleted"].includes(String(account.status || "active").toLowerCase())) {
    return { error: "Account suspended", status: 403 };
  }
  return { account };
}

async function requireDeviceToken(body, headers) {
  const auth = headers.authorization || headers.Authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const token = body.registration_token || bearer;
  if (!token) return { error: "Missing registration_token", status: 401 };
  const device = await getDeviceByToken(token);
  if (!device) return { error: "Invalid registration_token", status: 401 };
  return { device };
}

async function requireAdmin(headers) {
  const secret = headers["x-admin-secret"] || headers["X-Admin-Secret"];
  if (secret && process.env.OWNER_ADMIN_SECRET && secret === process.env.OWNER_ADMIN_SECRET) {
    return { user: { id: OWNER_USER_ID, role: "admin" } };
  }
  const session = await requireSession(headers);
  if (session.account && ["admin", "owner"].includes(String(session.account.role || "").toLowerCase())) {
    return { user: session.account };
  }
  return { error: "Admin only", status: 403 };
}

async function getAccountAccess(body, headers) {
  const accountId = body.account_id;
  const token = body.account_token || body.auth_token;
  if (!accountId) return { error: "Missing account_id", status: 400 };
  const account = await findAccount(accountId);
  if (!account) return { error: "Account not found", status: 404 };
  if (["inactive", "suspended", "revoked", "deleted"].includes(String(account.status || "active").toLowerCase())) {
    return { error: "Account suspended", status: 403 };
  }
  if (token && token === account.session_token) return { account };
  const admin = await requireAdmin(headers);
  if (admin.user) return { account, admin: true };
  return { error: "Invalid account_token", status: 401 };
}

async function resolveRequester(body, headers) {
  if (body.account_id) {
    const access = await getAccountAccess(body, headers);
    if (access.error) return access;
    return { userId: access.account.id, account: access.account, requesterType: "customer" };
  }
  const admin = await requireAdmin(headers);
  if (admin.user) return { userId: OWNER_USER_ID, requesterType: "owner" };
  const auth = headers.authorization || headers.Authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const account = await getAccountByToken(bearer);
  if (account) return { userId: account.id, account, requesterType: "customer" };
  return { error: "Unauthorized", status: 401 };
}

const ENTITY_TABLES = {
  Account: "accounts",
  User: "accounts",
  Device: "devices",
  Session: "sessions",
  SupportCode: "supportCodes",
  Message: "messages",
  WebRTCSignal: "signals",
  Workspace: "workspaces",
  SupportConversation: "supportConversations",
};

function sortItems(items, sort) {
  if (!sort) return items;
  const desc = String(sort).startsWith("-");
  const key = String(sort).replace(/^-/, "");
  return [...items].sort((a, b) => {
    const av = a?.[key] || "";
    const bv = b?.[key] || "";
    return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
  });
}

function filterItems(items, filter) {
  const entries = Object.entries(filter || {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return items;
  return items.filter((item) => entries.every(([key, value]) => item?.[key] === value));
}

function sanitizeEntity(entityName, item) {
  if (!item) return item;
  if (["Account", "User"].includes(entityName)) return sanitizeAccount(item);
  return item;
}

async function handleEntity(body, headers) {
  const entityName = body.entity;
  const action = body.action;
  const tableKey = ENTITY_TABLES[entityName];
  const table = TABLES[tableKey];
  if (!table) return json(400, { success: false, error: `Unsupported entity ${entityName}` });

  const session = await requireSession(headers);
  if (session.error) return json(session.status, { success: false, error: session.error });
  const isAdmin = ["admin", "owner"].includes(String(session.account.role || "").toLowerCase());

  if (action === "get") {
    const item = await get(table, body.id);
    if (!item) return json(404, { success: false, error: "Not found" });
    if (!isAdmin && item.user_id && item.user_id !== session.account.id && item.id !== session.account.id) return json(403, { success: false, error: "Forbidden" });
    return json(200, { success: true, item: sanitizeEntity(entityName, item) });
  }

  if (action === "list" || action === "filter") {
    let items = await scan(table, Number(body.limit || 500));
    if (!isAdmin) {
      items = items.filter((item) => !item.user_id || item.user_id === session.account.id || item.id === session.account.id || item.owner_id === session.account.id);
    }
    if (action === "filter") items = filterItems(items, body.filter || {});
    items = sortItems(items, body.sort || body.orderBy);
    if (body.limit) items = items.slice(0, Number(body.limit));
    return json(200, { success: true, items: items.map((item) => sanitizeEntity(entityName, item)) });
  }

  if (action === "create") {
    const data = { ...(body.data || {}) };
    if (!isAdmin && !data.user_id) data.user_id = session.account.id;
    const created = await put(table, { id: data.id || id(entityName.toLowerCase()), ...data });
    return json(200, { success: true, item: sanitizeEntity(entityName, created) });
  }

  if (action === "update") {
    const current = await get(table, body.id);
    if (!current) return json(404, { success: false, error: "Not found" });
    if (!isAdmin && current.user_id && current.user_id !== session.account.id && current.id !== session.account.id) return json(403, { success: false, error: "Forbidden" });
    const updated = await update(table, body.id, body.data || {});
    return json(200, { success: true, item: sanitizeEntity(entityName, updated) });
  }

  if (action === "delete") {
    const current = await get(table, body.id);
    if (!current) return json(404, { success: false, error: "Not found" });
    if (!isAdmin && current.user_id && current.user_id !== session.account.id && current.id !== session.account.id) return json(403, { success: false, error: "Forbidden" });
    await remove(table, body.id);
    return json(200, { success: true });
  }

  return json(400, { success: false, error: `Unsupported entity action ${action}` });
}
async function closeActiveSupportCodes(userId) {
  const codes = await query(TABLES.supportCodes, "UserIdIndex", "user_id", userId);
  await Promise.all(
    codes
      .filter((code) => code.used !== true && new Date(code.expires_at || 0).getTime() > Date.now())
      .map((code) => update(TABLES.supportCodes, code.id, { used: true }))
  );
}

async function handleAccountLogin(body) {
  const account = await findAccount(body.username);
  if (!account || !verifyPassword(body.password, account.password_hash)) {
    return json(401, { success: false, error: "Invalid username or password" });
  }
  if (["inactive", "suspended", "revoked", "deleted"].includes(String(account.status || "active").toLowerCase())) {
    return json(403, { success: false, error: "Account is not active" });
  }
  const sessionToken = makeToken();
  const updated = await update(TABLES.accounts, account.id, {
    session_token: sessionToken,
    last_login: nowIso(),
  });
  return json(200, {
    success: true,
    account: sanitizeAccount(updated),
    account_token: sessionToken,
    session_token: sessionToken,
    account_id: updated.account_id,
    account_db_id: updated.id,
    full_name: updated.full_name,
    email: updated.email,
  });
}

async function handleOwnerLogin(body) {
  await ensureOwnerAccount();
  const account = await findAccount(body.email || body.username);
  if (!account || !["admin", "owner"].includes(String(account.role || "").toLowerCase()) || !verifyPassword(body.password, account.password_hash)) {
    return json(401, { success: false, error: "Invalid owner email or password" });
  }
  if (["inactive", "suspended", "revoked", "deleted"].includes(String(account.status || "active").toLowerCase())) {
    return json(403, { success: false, error: "Owner account is not active" });
  }
  const sessionToken = makeToken();
  const updated = await update(TABLES.accounts, account.id, { session_token: sessionToken, last_login: nowIso() });
  return json(200, { success: true, token: sessionToken, user: sanitizeAccount(updated) });
}

async function handleAuthMe(headers) {
  await ensureOwnerAccount();
  const session = await requireSession(headers);
  if (session.error) return json(session.status, { success: false, error: session.error });
  return json(200, { success: true, user: sanitizeAccount(session.account) });
}

async function handleOwnerChangePassword(body, headers) {
  const session = await requireSession(headers);
  if (session.error) return json(session.status, { success: false, error: session.error });
  const account = session.account;
  if (!["admin", "owner"].includes(String(account.role || "").toLowerCase())) {
    return json(403, { success: false, error: "Owner only" });
  }
  if (!body.current_password || !body.new_password) {
    return json(400, { success: false, error: "Current password and new password are required" });
  }
  if (String(body.new_password).length < 8) {
    return json(400, { success: false, error: "New password must be at least 8 characters" });
  }
  if (!verifyPassword(body.current_password, account.password_hash)) {
    return json(401, { success: false, error: "Current password is incorrect" });
  }
  await update(TABLES.accounts, account.id, {
    password_hash: hashPassword(body.new_password),
    password_changed_at: nowIso(),
  });
  return json(200, { success: true, message: "Owner password updated" });
}

async function handleCreateUser(body, headers) {
  const admin = await requireAdmin(headers);
  if (admin.error) return json(admin.status, { success: false, error: admin.error });
  if (!body.username || !body.password) return json(400, { success: false, error: "Missing username or password" });
  const existing = await query(TABLES.accounts, "UsernameIndex", "username", body.username);
  if (existing[0]) return json(409, { success: false, error: "Username already exists" });

  let accountId = body.account_id;
  if (!accountId) {
    for (let i = 0; i < 10; i += 1) {
      const candidate = `AC-${makeSupportCode()}`;
      const matches = await query(TABLES.accounts, "AccountIdIndex", "account_id", candidate);
      if (!matches[0]) {
        accountId = candidate;
        break;
      }
    }
  }

  const account = await put(TABLES.accounts, {
    id: id("acct"),
    account_id: accountId,
    username: body.username,
    email: body.email || `${body.username}@assistane.local`,
    full_name: body.full_name || body.username,
    password_hash: hashPassword(body.password),
    status: "active",
    subscription_plan: body.subscription_plan || "business",
    max_devices: Number(body.max_devices || 100),
    created_by_id: OWNER_USER_ID,
  });
  return json(200, { success: true, account: sanitizeAccount(account) });
}

async function handleSupportCodeCreate(body, headers) {
  const requester = await resolveRequester(body, headers);
  if (requester.error) return json(requester.status, { success: false, error: requester.error });

  await closeActiveSupportCodes(requester.userId);
  let shortCode = "";
  for (let i = 0; i < 20; i += 1) {
    const candidate = makeSupportCode();
    const existing = await query(TABLES.supportCodes, "ShortCodeIndex", "short_code", candidate);
    if (!existing[0]) {
      shortCode = candidate;
      break;
    }
  }
  if (!shortCode) return json(500, { success: false, error: "Could not generate support code" });

  const code = await put(TABLES.supportCodes, {
    id: id("code"),
    user_id: requester.userId,
    short_code: shortCode,
    label: body.label || "",
    used: false,
    expires_at: new Date(Date.now() + Number(body.expiry_hours || 24) * 60 * 60 * 1000).toISOString(),
  });

  return json(200, {
    success: true,
    code,
    short_code: shortCode,
    support_link: `${process.env.APP_BASE_URL || "https://app.assistane.com"}/connect?code=${shortCode}`,
  });
}

async function handleSupportCodesList(body, headers) {
  const requester = await resolveRequester(body, headers);
  if (requester.error) return json(requester.status, { success: false, error: requester.error });
  const codes = await query(TABLES.supportCodes, "UserIdIndex", "user_id", requester.userId);
  const active = codes.filter((code) => code.used !== true && new Date(code.expires_at || 0).getTime() > Date.now());
  return json(200, { success: true, codes: active });
}

async function handleRegisterDevice(body) {
  const shortCode = numericCodeFrom(body.pairing_token || body.support_code || body.code);
  if (!shortCode) return json(400, { success: false, error: "Missing support code" });
  const supportCode = (await query(TABLES.supportCodes, "ShortCodeIndex", "short_code", shortCode))[0];
  if (!supportCode || supportCode.used === true || new Date(supportCode.expires_at || 0).getTime() < Date.now()) {
    return json(404, { success: false, error: "Invalid or expired support code" });
  }

  const registrationToken = makeToken();
  const device = await put(TABLES.devices, {
    id: id("dev"),
    user_id: supportCode.user_id,
    device_uid: body.device_uid || id("uid"),
    device_name: body.device_name || body.hostname || "Remote Device",
    operating_system: body.operating_system || body.os || "Unknown",
    os_version: body.os_version || "",
    ip_address: body.ip_address || body.ip || "",
    brand_name: body.brand_name || "",
    ram_gb: Number(body.ram_gb || 0),
    storage_gb: Number(body.storage_gb || 0),
    screen_width: Number(body.screen_width || 0),
    screen_height: Number(body.screen_height || 0),
    registration_token: registrationToken,
    online_status: "online",
    last_seen: nowIso(),
    offline_reason: "",
    pending_command: "",
    black_screen: false,
    black_screen_message: "",
    remote_input_disabled: false,
    wallpaper_enabled: true,
    video_quality: "high",
    unattended_enabled: body.unattended_enabled === true,
  });
  await update(TABLES.supportCodes, supportCode.id, { used: true, used_at: nowIso(), device_id: device.id });
  return json(200, {
    success: true,
    device_id: device.id,
    registration_token: registrationToken,
    device,
  });
}

async function handleDevices(body, headers) {
  let ownerId = OWNER_USER_ID;
  if (body.account_id) {
    const access = await getAccountAccess(body, headers);
    if (access.error) return json(access.status, { success: false, error: access.error });
    ownerId = access.account.id;
  } else {
    const requester = await resolveRequester(body, headers);
    if (requester.error) return json(requester.status, { success: false, error: requester.error });
    ownerId = requester.userId;
  }
  const devices = await normalizeDevices(await query(TABLES.devices, "UserIdIndex", "user_id", ownerId));
  devices.sort((a, b) => String(b.last_seen || "").localeCompare(String(a.last_seen || "")));
  return json(200, { success: true, count: devices.length, devices });
}

async function handleHeartbeat(body, headers) {
  const auth = await requireDeviceToken(body, headers);
  if (auth.error) return json(auth.status, { success: false, error: auth.error });
  const updated = await update(TABLES.devices, auth.device.id, {
    online_status: "online",
    last_seen: nowIso(),
    offline_reason: "",
    unattended_enabled: body.unattended_enabled === true,
  });
  return json(200, { success: true, device_id: updated.id, last_seen: updated.last_seen });
}

async function handleDeviceOffline(body, headers) {
  const auth = await requireDeviceToken(body, headers);
  if (auth.error) return json(auth.status, { success: false, error: auth.error });
  const updated = await update(TABLES.devices, auth.device.id, {
    online_status: "offline",
    last_seen: nowIso(),
    offline_reason: body.reason || "agent_offline",
  });
  return json(200, { success: true, device_id: updated.id });
}

async function handleViewerConnectParams(body, headers) {
  const device = await get(TABLES.devices, body.device_id);
  if (!device) return json(404, { success: false, error: "Device not found" });
  const fresh = await persistOfflineIfStale(device);
  if (fresh.online_status !== "online") return json(409, { success: false, error: "Device is offline" });

  if (body.account_id) {
    const access = await getAccountAccess(body, headers);
    if (access.error) return json(access.status, { success: false, error: access.error });
    if (fresh.user_id !== access.account.id) return json(403, { success: false, error: "Device does not belong to this account" });
  } else {
    const admin = await requireAdmin(headers);
    if (admin.error && fresh.user_id !== OWNER_USER_ID) return json(403, { success: false, error: "Admin only" });
  }

  const params = new URLSearchParams({
    device_id: fresh.id,
    device_name: fresh.device_name || "",
    os: fresh.operating_system || "Windows",
    ip: fresh.ip_address || "",
    auth_token: body.account_id || OWNER_USER_ID,
    os_version: fresh.os_version || "",
    ram_gb: String(fresh.ram_gb || 0),
    storage_gb: String(fresh.storage_gb || 0),
    brand_name: fresh.brand_name || "",
    unattended_enabled: fresh.unattended_enabled === true ? "1" : "0",
  });
  return json(200, { success: true, deep_link: `assistane://connect?${params.toString()}`, device_name: fresh.device_name });
}

async function handleCreateSignal(body, headers) {
  const requester = await resolveRequester(body, headers).catch(() => ({ userId: "viewer" }));
  if (!body.device_id || !body.offer_sdp) return json(400, { success: false, error: "Missing device_id or offer_sdp" });
  const device = await persistOfflineIfStale(await get(TABLES.devices, body.device_id));
  if (!device) return json(404, { success: false, error: "Device not found" });
  if (device.online_status !== "online") return json(409, { success: false, error: "Device is offline" });
  const pending = await querySignal(device.id, "pending");
  await Promise.all(pending.map((signal) => update(TABLES.signals, signal.id, { status: "closed" })));
  const signal = await put(TABLES.signals, {
    id: id("sig"),
    device_id: device.id,
    user_id: requester.userId || "viewer",
    offer_sdp: body.offer_sdp,
    answer_sdp: "",
    status: "pending",
    unattended_password: body.unattended_password || "",
  });
  return json(200, { success: true, signal_id: signal.id });
}

async function handleWebrtcPending(body, headers) {
  const auth = await requireDeviceToken(body, headers);
  if (auth.error) return json(auth.status, { success: false, error: auth.error });
  const pending = await querySignal(auth.device.id, "pending");
  pending.sort((a, b) => String(a.created_date || "").localeCompare(String(b.created_date || "")));
  const signal = pending[0];
  if (!signal) return json(200, { success: true, pending: false });
  return json(200, {
    success: true,
    pending: true,
    signal_id: signal.id,
    offer_sdp: signal.offer_sdp,
    unattended_password: signal.unattended_password || "",
  });
}

async function handleWebrtcAnswer(body, headers) {
  const auth = await requireDeviceToken(body, headers);
  if (auth.error) return json(auth.status, { success: false, error: auth.error });
  if (!body.signal_id || !body.answer_sdp) return json(400, { success: false, error: "Missing signal_id or answer_sdp" });
  const signal = await get(TABLES.signals, body.signal_id);
  if (!signal || signal.device_id !== auth.device.id) return json(404, { success: false, error: "Signal not found" });
  await update(TABLES.signals, signal.id, { answer_sdp: body.answer_sdp, status: "answered" });
  return json(200, { success: true });
}

async function handleSignalStatus(body) {
  const signal = await get(TABLES.signals, body.signal_id);
  if (!signal) return json(404, { success: false, error: "Signal not found" });
  return json(200, {
    success: true,
    status: signal.status,
    answer_sdp: signal.answer_sdp || "",
  });
}

async function handleDeviceConfig(body) {
  if (!body.device_id) return json(400, { success: false, error: "Missing device_id" });
  const updates = {};
  for (const key of ["remote_input_disabled", "wallpaper_enabled", "video_quality", "screen_width", "screen_height", "black_screen", "black_screen_message", "pending_command"]) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  const device = await update(TABLES.devices, body.device_id, updates);
  return json(200, { success: true, device });
}

async function handleAgentState(body, headers) {
  const auth = await requireDeviceToken(body, headers);
  if (auth.error) return json(auth.status, { success: false, error: auth.error });
  return json(200, { success: true, device: auth.device });
}

async function handlePendingCommand(body, headers) {
  const auth = await requireDeviceToken(body, headers);
  if (auth.error) return json(auth.status, { success: false, error: auth.error });
  const command = auth.device.pending_command || "";
  if (command) await update(TABLES.devices, auth.device.id, { pending_command: "" });
  return json(200, { success: true, command });
}

async function handleBlackScreenStatus(body, headers) {
  const auth = await requireDeviceToken(body, headers);
  if (auth.error) return json(auth.status, { success: false, error: auth.error });
  return json(200, {
    success: true,
    black_screen: auth.device.black_screen === true,
    message: auth.device.black_screen_message || "",
    remote_input_disabled: auth.device.remote_input_disabled === true,
    wallpaper_enabled: auth.device.wallpaper_enabled !== false,
    video_quality: auth.device.video_quality || "high",
  });
}

async function handleSessionStart(body, headers) {
  if (!body.device_id) return json(400, { success: false, error: "Missing device_id" });
  const device = await get(TABLES.devices, body.device_id);
  const requester = await resolveRequester(body, headers).catch(() => ({ userId: "viewer", requesterType: "viewer" }));
  const session = await put(TABLES.sessions, {
    id: id("sess"),
    device_id: body.device_id,
    device_name: device?.device_name || body.device_name || "",
    user_id: device?.user_id || requester.userId || "viewer",
    started_by: requester.userId || "viewer",
    requester_type: requester.requesterType || "viewer",
    session_start: nowIso(),
    status: "active",
  });
  return json(200, { success: true, session_id: session.id });
}

async function handleSessions(body, headers) {
  const requester = await resolveRequester(body, headers);
  if (requester.error) return json(requester.status, { success: false, error: requester.error });
  let sessions = [];
  if (body.all && requester.requesterType === "owner") {
    sessions = await scan(TABLES.sessions, Number(body.limit || 100));
  } else {
    sessions = await query(TABLES.sessions, "UserIdIndex", "user_id", requester.userId);
  }
  sessions.sort((a, b) => String(b.session_start || "").localeCompare(String(a.session_start || "")));
  return json(200, { success: true, sessions });
}

async function handleMessageCreate(body, headers) {
  if (!body.device_id || !body.content) return json(400, { success: false, error: "Missing device_id or content" });
  const requester = await resolveRequester(body, headers).catch(() => ({ requesterType: "admin" }));
  const message = await put(TABLES.messages, {
    id: id("msg"),
    device_id: body.device_id,
    content: body.content,
    sender_type: requester.requesterType === "customer" ? "admin" : "admin",
    created_date: nowIso(),
  });
  return json(200, { success: true, message });
}

async function route(event) {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const headers = event.headers || {};
  const body = { ...queryParams(event), ...parseBody(event) };
  const path = getPath(event, body);

  if (method === "OPTIONS") return json(200, { ok: true });
  if (path === "health") return json(200, { success: true, service: "assistane-aws", time: nowIso() });
  if (path === "owner-login") return handleOwnerLogin(body);
  if (path === "auth-me") return handleAuthMe(headers);
  if (path === "owner-change-password") return handleOwnerChangePassword(body, headers);
  if (path === "entity") return handleEntity(body, headers);

  if (path === "account-login") return handleAccountLogin(body);
  if (path === "create-user") return handleCreateUser(body, headers);
  if (path === "accounts") {
    const admin = await requireAdmin(headers);
    if (admin.error) return json(admin.status, { success: false, error: admin.error });
    const accounts = await scan(TABLES.accounts, Number(body.limit || 200));
    return json(200, { success: true, accounts: accounts.map(sanitizeAccount) });
  }
  if (path === "account-status") {
    const account = await findAccount(body.account_id || body.id);
    return json(200, { success: true, suspended: !account || account.status !== "active", account: sanitizeAccount(account) });
  }
  if (path === "account" && (body._method === "PUT" || method === "PUT")) {
    const admin = await requireAdmin(headers);
    if (admin.error) return json(admin.status, { success: false, error: admin.error });
    const account = await findAccount(body.id);
    if (!account) return json(404, { success: false, error: "Account not found" });
    const updates = {};
    for (const key of ["status", "subscription_plan", "subscription_expires", "max_devices"]) if (body[key] !== undefined) updates[key] = body[key];
    if (body.password) updates.password_hash = hashPassword(body.password);
    await update(TABLES.accounts, account.id, updates);
    return json(200, { success: true, message: "Account updated" });
  }
  if (path === "account" && (body._method === "DELETE" || method === "DELETE")) {
    const admin = await requireAdmin(headers);
    if (admin.error) return json(admin.status, { success: false, error: admin.error });
    const account = await findAccount(body.id);
    if (!account) return json(404, { success: false, error: "Account not found" });
    await update(TABLES.accounts, account.id, { status: "suspended", revoked_at: nowIso() });
    return json(200, { success: true });
  }
  if (path === "reactivate-account") {
    const admin = await requireAdmin(headers);
    if (admin.error) return json(admin.status, { success: false, error: admin.error });
    const account = await findAccount(body.id);
    if (!account) return json(404, { success: false, error: "Account not found" });
    await update(TABLES.accounts, account.id, { status: "active", revoked_at: "" });
    return json(200, { success: true });
  }
  if (path === "permanent-delete-account") {
    const admin = await requireAdmin(headers);
    if (admin.error) return json(admin.status, { success: false, error: admin.error });
    const account = await findAccount(body.id);
    if (!account) return json(404, { success: false, error: "Account not found" });
    const devices = await query(TABLES.devices, "UserIdIndex", "user_id", account.id);
    await Promise.all(devices.map((device) => remove(TABLES.devices, device.id)));
    await remove(TABLES.accounts, account.id);
    return json(200, { success: true });
  }

  if (["generate-support-code", "support-code"].includes(path)) return handleSupportCodeCreate(body, headers);
  if (path === "support-codes" || path === "active-support-codes") return handleSupportCodesList(body, headers);
  if (path === "resolve-support-code") {
    const code = (await query(TABLES.supportCodes, "ShortCodeIndex", "short_code", numericCodeFrom(body.code)))[0];
    return json(200, { success: !!code && code.used !== true, code });
  }
  if (path === "revoke-support-code" || path === "expire-support-code") {
    await update(TABLES.supportCodes, body.id, { used: true, used_at: nowIso() });
    return json(200, { success: true });
  }

  if (path === "register-device") return handleRegisterDevice(body);
  if (path === "heartbeat") return handleHeartbeat(body, headers);
  if (path === "device-offline") return handleDeviceOffline(body, headers);
  if (path === "devices") return handleDevices(body, headers);
  if (path === "device-status") {
    const device = body.registration_token ? await getDeviceByToken(body.registration_token) : (await query(TABLES.devices, "DeviceUidIndex", "device_uid", body.device_uid))[0];
    if (!device) return json(404, { success: false, error: "Device not found" });
    return json(200, { success: true, device: await persistOfflineIfStale(device) });
  }
  if (path === "device" && (body._method === "DELETE" || method === "DELETE")) {
    await remove(TABLES.devices, body.id || body.device_id);
    return json(200, { success: true });
  }

  if (path === "viewer-connect-params") return handleViewerConnectParams(body, headers);
  if (path === "create-signal") return handleCreateSignal(body, headers);
  if (path === "webrtc-pending") return handleWebrtcPending(body, headers);
  if (path === "webrtc-answer") return handleWebrtcAnswer(body, headers);
  if (path === "signal-status" || path === "get-signal-answer") return handleSignalStatus(body);
  if (path === "close-signal") {
    await update(TABLES.signals, body.signal_id, { status: "closed" });
    return json(200, { success: true });
  }

  if (path === "device-config") return handleDeviceConfig(body);
  if (path === "set-screen-resolution") return handleDeviceConfig({ ...body, screen_width: body.width, screen_height: body.height });
  if (path === "black-screen") return handleDeviceConfig({ ...body, black_screen: body.enabled === true, black_screen_message: body.message || "" });
  if (path === "black-screen-status") return handleBlackScreenStatus(body, headers);
  if (path === "pending-command") return handlePendingCommand(body, headers);
  if (path === "agent-state") return handleAgentState(body, headers);
  if (path === "lock-screen") return handleDeviceConfig({ ...body, pending_command: "lock" });
  if (path === "send-special-key") return handleDeviceConfig({ ...body, pending_command: `special-key:${body.key || ""}` });
  if (path === "reboot-device") return handleDeviceConfig({ ...body, pending_command: body.safe_mode ? "reboot-safe-mode" : "reboot" });

  if (path === "start-session" || path === "create-session") return handleSessionStart(body, headers);
  if (path === "end-session") {
    await update(TABLES.sessions, body.session_id, { session_end: nowIso(), duration_minutes: Number(body.duration_minutes || 0), status: "completed" });
    return json(200, { success: true });
  }
  if (path === "sessions") return handleSessions(body, headers);
  if (path === "send-message") return handleMessageCreate(body, headers);
  if (path === "messages") {
    const messages = await query(TABLES.messages, "DeviceIdIndex", "device_id", body.device_id);
    messages.sort((a, b) => String(a.created_date || "").localeCompare(String(b.created_date || "")));
    return json(200, { success: true, messages });
  }

  if (path === "mark-offline-stale") {
    const devices = await scan(TABLES.devices, 500);
    const stale = devices.filter(isDeviceHeartbeatStale);
    await Promise.all(stale.map((device) => update(TABLES.devices, device.id, { online_status: "offline", offline_reason: "heartbeat_timeout" })));
    return json(200, { success: true, marked_offline: stale.length });
  }

  if (path === "ownerAdmin" || path === "list-all") {
    const admin = await requireAdmin(headers);
    if (admin.error) return json(admin.status, { success: false, error: admin.error });
    return json(200, {
      success: true,
      users: (await scan(TABLES.accounts, Number(body.limit || 200))).map(sanitizeAccount),
      devices: await normalizeDevices(await scan(TABLES.devices, Number(body.limit || 200))),
    });
  }

  return json(404, { success: false, error: "Not found", path });
}

exports.handler = async (event) => {
  try {
    return await route(event);
  } catch (err) {
    console.error(err);
    return json(500, { success: false, error: err.message || "Internal server error" });
  }
};

