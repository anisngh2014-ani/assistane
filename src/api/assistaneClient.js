const DEFAULT_API_BASE_URL = "https://api.assistane.com";
const OWNER_TOKEN_KEY = "assistaneOwnerToken";

function apiBaseUrl() {
  return (import.meta.env.VITE_ASSISTANE_API_BASE_URL || localStorage.getItem("assistaneApiBaseUrl") || DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

function ownerToken() {
  return localStorage.getItem(OWNER_TOKEN_KEY) || "";
}

async function request(endpoint, body = {}, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  const token = options.token !== undefined ? options.token : ownerToken();
  if (token) headers["x-session-token"] = token;

  const res = await fetch(`${apiBaseUrl()}/${endpoint}`, {
    method: options.method || "POST",
    headers,
    body: options.method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Request failed with status code ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function entityClient(entity) {
  const call = async (action, payload = {}) => {
    const data = await request("entity", { entity, action, ...payload });
    if (action === "list" || action === "filter") return data.items || [];
    return data.item || data;
  };
  return {
    list: (sort, limit) => call("list", { sort, limit }),
    filter: (filter, sort, limit) => call("filter", { filter, sort, limit }),
    get: (id) => call("get", { id }),
    create: (data) => call("create", { data }),
    update: (id, data) => call("update", { id, data }),
    delete: (id) => call("delete", { id }),
    subscribe: () => () => {},
  };
}

const assistaneClient = {
  functions: {
    async invoke(functionName, payload = {}) {
      const endpoint = payload.endpoint || functionName;
      const data = await request(endpoint, payload);
      return { data };
    },
  },
  entities: {
    Account: entityClient("Account"),
    User: entityClient("User"),
    Device: entityClient("Device"),
    Session: entityClient("Session"),
    SupportCode: entityClient("SupportCode"),
    Message: entityClient("Message"),
    WebRTCSignal: entityClient("WebRTCSignal"),
    Workspace: entityClient("Workspace"),
    SupportConversation: entityClient("SupportConversation"),
  },
  auth: {
    async loginViaEmailPassword(email, password) {
      const data = await request("owner-login", { email, password }, { token: "" });
      localStorage.setItem(OWNER_TOKEN_KEY, data.token);
      return data.user;
    },
    async me() {
      const data = await request("auth-me", {});
      return data.user;
    },
    logout(redirectUrl) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      if (redirectUrl) window.location.href = "/login";
    },
    redirectToLogin() {
      window.location.href = "/login";
    },
    async updateMe(data) {
      const me = await this.me();
      return assistaneClient.entities.User.update(me.id, data);
    },
    async resetPasswordRequest() {
      throw new Error("Password reset is not configured yet. Ask the owner to reset the password from the Owner Dashboard.");
    },
    async resetPassword() {
      throw new Error("Password reset is not configured yet. Ask the owner to reset the password from the Owner Dashboard.");
    },
    async register() {
      throw new Error("Self-registration is disabled. Create accounts from the Owner Dashboard.");
    },
    async verifyOtp() {
      throw new Error("OTP registration is disabled.");
    },
    async resendOtp() {
      throw new Error("OTP registration is disabled.");
    },
    loginWithProvider() {
      throw new Error("Social login is disabled for the AWS migration.");
    },
    setToken(token) {
      localStorage.setItem(OWNER_TOKEN_KEY, token);
    },
  },
};
assistaneClient.asServiceRole = { entities: assistaneClient.entities };
assistaneClient.integrations = {
  Core: {
    async InvokeLLM({ prompt }) {
      const preview = String(prompt || "").slice(0, 400);
      return `Assistane AWS support assistant is not connected to an LLM provider yet. Request received: ${preview}`;
    },
  },
};

export const assistane = assistaneClient;